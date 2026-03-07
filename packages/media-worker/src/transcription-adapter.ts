import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import type {
  NormalizedTranscriptionResult,
  TranscriptionModel,
  TranscriptionOptions,
  TranscriptionProvider
} from "@clawcut/domain";
import { composeTranscriptionPrompt } from "@clawcut/domain";

import { WorkerError, resolveSystemBinary } from "./utils";

export interface TranscriptionAdapterInput {
  audioPath: string;
  sourceDurationUs: number;
  options: TranscriptionOptions;
  artifactDirectory: string;
}

export interface TranscriptionAdapterOutput {
  result: NormalizedTranscriptionResult;
  rawArtifactPath: string | null;
  diagnostics: string[];
}

export interface TranscriptionRuntimeStatus {
  available: boolean;
  resolvedPath: string | null;
  version: string | null;
  remediationHint: string | null;
  provider: TranscriptionProvider | "fixture";
}

export interface TranscriptionAdapter {
  readonly provider: TranscriptionProvider | "fixture";
  getRuntimeStatus(): TranscriptionRuntimeStatus;
  transcribe(input: TranscriptionAdapterInput): Promise<TranscriptionAdapterOutput>;
}

interface FasterWhisperJsonWord {
  word: string;
  start: number | null;
  end: number | null;
  probability?: number | null;
}

interface FasterWhisperJsonSegment {
  start: number;
  end: number;
  text: string;
  avg_logprob?: number | null;
  words?: FasterWhisperJsonWord[];
}

interface FasterWhisperJsonOutput {
  language?: string | null;
  provider?: string;
  model?: TranscriptionModel;
  word_timestamps?: boolean;
  segments: FasterWhisperJsonSegment[];
}

function resolveWorkspaceRoot(): string {
  return process.env.CLAWCUT_WORKSPACE_ROOT ?? process.cwd();
}

function resolveFasterWhisperScriptPath(): string {
  return resolve(resolveWorkspaceRoot(), "scripts", "faster_whisper_transcribe.py");
}

function secondsToUs(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.round(value * 1_000_000));
}

function clampUs(value: number | null, fallbackUs: number): number | null {
  if (value === null) {
    return null;
  }

  return Math.max(0, Math.min(fallbackUs, value));
}

function normalizeFixtureText(lines: string[]): NormalizedTranscriptionResult {
  const joined = lines.join(" ").trim();
  const tokens = joined.split(/\s+/u).filter((token) => token.length > 0);
  const midpoint = Math.max(1, Math.floor(tokens.length / 2));
  const firstText = tokens.slice(0, midpoint).join(" ");
  const secondText = tokens.slice(midpoint).join(" ");

  return {
    language: "en",
    provider: "faster-whisper",
    model: "base",
    wordTimestamps: true,
    confidence: 0.92,
    warnings: ["Fixture transcription adapter generated deterministic sample text."],
    segments: [
      {
        startUs: 0,
        endUs: 900_000,
        text: firstText,
        confidence: 0.92,
        words: tokens.slice(0, midpoint).map((word, index) => ({
          text: word,
          startUs: index * 180_000,
          endUs: (index + 1) * 180_000,
          confidence: 0.92
        }))
      },
      {
        startUs: 950_000,
        endUs: 1_900_000,
        text: secondText,
        confidence: 0.9,
        words: tokens.slice(midpoint).map((word, index) => ({
          text: word,
          startUs: 950_000 + index * 180_000,
          endUs: 950_000 + (index + 1) * 180_000,
          confidence: 0.9
        }))
      }
    ]
  };
}

function normalizeEngineJson(
  raw: FasterWhisperJsonOutput,
  options: TranscriptionOptions,
  sourceDurationUs: number
): NormalizedTranscriptionResult {
  const segments = raw.segments.map((segment) => {
    const startUs = clampUs(secondsToUs(segment.start), sourceDurationUs) ?? 0;
    const endUs =
      clampUs(secondsToUs(segment.end), sourceDurationUs) ?? Math.max(startUs, sourceDurationUs);
    const words = (segment.words ?? []).map((word) => ({
      text: word.word,
      startUs: clampUs(secondsToUs(word.start), sourceDurationUs),
      endUs: clampUs(secondsToUs(word.end), sourceDurationUs),
      confidence:
        typeof word.probability === "number" && Number.isFinite(word.probability)
          ? word.probability
          : null
    }));

    return {
      startUs,
      endUs: Math.max(startUs, endUs),
      text: segment.text.trim(),
      confidence:
        typeof segment.avg_logprob === "number" && Number.isFinite(segment.avg_logprob)
          ? Math.max(0, Math.min(1, Math.exp(segment.avg_logprob)))
          : null,
      words
    };
  });

  return {
    language: raw.language ?? options.language ?? null,
    provider: "faster-whisper",
    model: raw.model ?? options.model,
    wordTimestamps: raw.word_timestamps ?? options.wordTimestamps,
    confidence:
      segments.length > 0
        ? segments.reduce((sum, segment) => sum + (segment.confidence ?? 0), 0) / segments.length
        : null,
    warnings: [],
    segments
  };
}

class FixtureTranscriptionAdapter implements TranscriptionAdapter {
  readonly provider = "fixture" as const;

  getRuntimeStatus(): TranscriptionRuntimeStatus {
    return {
      available: true,
      resolvedPath: "fixture://transcription",
      version: "fixture",
      remediationHint: null,
      provider: "fixture"
    };
  }

  async transcribe(input: TranscriptionAdapterInput): Promise<TranscriptionAdapterOutput> {
    const fixturePath =
      process.env.CLAWCUT_TRANSCRIPTION_FIXTURE_PATH ??
      resolve(resolveWorkspaceRoot(), "fixtures", "transcription", "sample-transcript.txt");
    const contents = await readFile(fixturePath, "utf8");
    const normalized = normalizeFixtureText(
      contents
        .split(/\r?\n/gu)
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
    );
    const scaledSegments = normalized.segments.map((segment) => {
      const scale = input.sourceDurationUs > 0 ? input.sourceDurationUs / 2_000_000 : 1;

      return {
        ...segment,
        startUs: Math.max(0, Math.round(segment.startUs * scale)),
        endUs: Math.min(input.sourceDurationUs, Math.round(segment.endUs * scale)),
        words: segment.words.map((word) => ({
          ...word,
          startUs: word.startUs === null ? null : Math.max(0, Math.round(word.startUs * scale)),
          endUs:
            word.endUs === null
              ? null
              : Math.min(input.sourceDurationUs, Math.round(word.endUs * scale))
        }))
      };
    });
    const rawArtifactPath = resolve(input.artifactDirectory, "fixture-transcription.json");
    const rawPayload = {
      provider: "fixture",
      generatedAt: new Date().toISOString(),
      options: input.options,
      segments: scaledSegments
    };
    await writeFile(rawArtifactPath, JSON.stringify(rawPayload, null, 2), "utf8");

    return {
      result: {
        ...normalized,
        segments: scaledSegments
      },
      rawArtifactPath,
      diagnostics: [
        "Used the deterministic fixture transcription adapter.",
        input.options.glossaryTerms.length > 0
          ? `Accepted ${input.options.glossaryTerms.length} glossary term${input.options.glossaryTerms.length === 1 ? "" : "s"} for transcription guidance.`
          : "No glossary terms were supplied.",
        composeTranscriptionPrompt(input.options)
          ? "Fixture run received prompt guidance."
          : "Fixture run received no prompt guidance."
      ]
    };
  }
}

class FasterWhisperTranscriptionAdapter implements TranscriptionAdapter {
  readonly provider = "faster-whisper" as const;

  getRuntimeStatus(): TranscriptionRuntimeStatus {
    const pythonBinary = process.env.CLAWCUT_PYTHON_BIN ?? resolveSystemBinary("python3");
    const scriptPath = resolveFasterWhisperScriptPath();

    if (!pythonBinary) {
      return {
        available: false,
        resolvedPath: null,
        version: null,
        remediationHint: "Install python3 and the faster-whisper package, or set CLAWCUT_TRANSCRIPTION_ADAPTER=fixture for local testing.",
        provider: this.provider
      };
    }

    if (!existsSync(scriptPath)) {
      return {
        available: false,
        resolvedPath: pythonBinary,
        version: null,
        remediationHint: `Missing transcription helper script at ${scriptPath}.`,
        provider: this.provider
      };
    }

    const result = spawnSync(pythonBinary, [scriptPath, "--check"], {
      encoding: "utf8"
    });
    const version = result.status === 0 ? result.stdout.trim() || "faster-whisper" : null;

    return {
      available: result.status === 0,
      resolvedPath: pythonBinary,
      version,
      remediationHint:
        result.status === 0
          ? null
          : (result.stderr || result.stdout || "Install faster-whisper and its runtime dependencies.").trim(),
      provider: this.provider
    };
  }

  async transcribe(input: TranscriptionAdapterInput): Promise<TranscriptionAdapterOutput> {
    const runtime = this.getRuntimeStatus();

    if (!runtime.available || !runtime.resolvedPath) {
      throw new WorkerError(
        "TRANSCRIPTION_ENGINE_UNAVAILABLE",
        "Faster-Whisper is not available for transcription.",
        runtime.remediationHint ?? undefined
      );
    }

    const scriptPath = resolveFasterWhisperScriptPath();
    const rawArtifactPath = resolve(input.artifactDirectory, "faster-whisper.json");
    const logPath = resolve(input.artifactDirectory, "faster-whisper.log");
    const effectivePrompt = composeTranscriptionPrompt(input.options);
    const args = [
      scriptPath,
      "--input",
      input.audioPath,
      "--output",
      rawArtifactPath,
      "--model",
      input.options.model,
      "--word-timestamps",
      input.options.wordTimestamps ? "1" : "0",
      "--normalize-text",
      input.options.normalizeText ? "1" : "0"
    ];

    if (input.options.language) {
      args.push("--language", input.options.language);
    }

    if (effectivePrompt) {
      args.push("--initial-prompt", effectivePrompt);
    }

    await new Promise<void>((resolvePromise, rejectPromise) => {
      const child = spawn(runtime.resolvedPath!, args, {
        stdio: ["ignore", "pipe", "pipe"]
      });
      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });
      child.on("error", (error) => {
        rejectPromise(
          new WorkerError(
            "TRANSCRIPTION_FAILED",
            "Could not start the Faster-Whisper transcription process.",
            error.message
          )
        );
      });
      child.on("close", async (code) => {
        await writeFile(logPath, `${stdout}\n${stderr}`.trim(), "utf8");

        if (code !== 0) {
          rejectPromise(
            new WorkerError(
              "TRANSCRIPTION_FAILED",
              "Faster-Whisper transcription failed.",
              stderr.trim() || stdout.trim() || `Process exited with code ${code ?? "unknown"}.`
            )
          );
          return;
        }

        resolvePromise();
      });
    });

    const rawOutput = JSON.parse(await readFile(rawArtifactPath, "utf8")) as FasterWhisperJsonOutput;

    return {
      result: normalizeEngineJson(rawOutput, input.options, input.sourceDurationUs),
      rawArtifactPath,
      diagnostics: [
        `Used Faster-Whisper model ${input.options.model}.`,
        input.options.glossaryTerms.length > 0
          ? `Applied ${input.options.glossaryTerms.length} glossary term${input.options.glossaryTerms.length === 1 ? "" : "s"}.`
          : "No glossary terms were applied.",
        effectivePrompt ? "Transcription ran with prompt guidance." : "Transcription ran without prompt guidance.",
        `Log written to ${logPath}.`
      ]
    };
  }
}

export function createTranscriptionAdapter(): TranscriptionAdapter {
  const requestedMode = (process.env.CLAWCUT_TRANSCRIPTION_ADAPTER ?? "auto").trim();

  if (requestedMode === "fixture") {
    return new FixtureTranscriptionAdapter();
  }

  const fasterWhisper = new FasterWhisperTranscriptionAdapter();

  if (requestedMode === "faster-whisper") {
    return fasterWhisper;
  }

  if (process.env.NODE_ENV === "test" || process.env.CLAWCUT_SMOKE === "1") {
    return new FixtureTranscriptionAdapter();
  }

  return fasterWhisper;
}
