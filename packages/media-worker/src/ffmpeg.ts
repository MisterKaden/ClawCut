import { spawn } from "node:child_process";
import type { ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";

import { detectToolchain } from "./toolchain";
import { WorkerError } from "./utils";

export interface RunFfmpegOptions {
  captureStdout?: boolean;
}

export interface RunFfmpegResult {
  stdout: Buffer;
  stderr: string;
}

export interface FfmpegProgress {
  frame: number | null;
  fps: number | null;
  bitrateKbps: number | null;
  outTimeMs: number | null;
  speed: number | null;
  progress: "continue" | "end";
}

export interface SpawnFfmpegOptions {
  onProgress?: (progress: FfmpegProgress) => void;
  onStderrLine?: (line: string) => void;
}

export interface SpawnFfmpegProcess {
  child: ChildProcessByStdio<null, Readable, Readable>;
  cancel(): void;
  completed: Promise<{ stderr: string; cancelled: boolean }>;
}

function parseFiniteNumber(value: string | undefined): number | null {
  if (value === undefined) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseProgressValue(
  buffer: string,
  onProgress?: (progress: FfmpegProgress) => void
): string {
  let remaining = buffer;
  const current = new Map<string, string>();

  while (remaining.includes("\n")) {
    const newlineIndex = remaining.indexOf("\n");
    const rawLine = remaining.slice(0, newlineIndex).trim();
    remaining = remaining.slice(newlineIndex + 1);

    if (!rawLine) {
      continue;
    }

    const separatorIndex = rawLine.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = rawLine.slice(0, separatorIndex);
    const value = rawLine.slice(separatorIndex + 1);
    current.set(key, value);

    if (key === "progress") {
      onProgress?.({
        frame: parseFiniteNumber(current.get("frame")),
        fps: parseFiniteNumber(current.get("fps")),
        bitrateKbps: current.has("bitrate")
          ? parseFiniteNumber(String(current.get("bitrate")).replace(/kbits\/s/gu, "").trim())
          : null,
        outTimeMs: parseFiniteNumber(current.get("out_time_ms")),
        speed: current.has("speed")
          ? parseFiniteNumber(String(current.get("speed")).replace(/x$/u, ""))
          : null,
        progress: value === "end" ? "end" : "continue"
      });
      current.clear();
    }
  }

  return remaining;
}

function resolveFfmpegPath(): string {
  const toolchain = detectToolchain();
  const ffmpegPath = toolchain.tools.ffmpeg.resolvedPath;

  if (!ffmpegPath || !toolchain.tools.ffmpeg.available) {
    throw new WorkerError(
      "FFMPEG_UNAVAILABLE",
      "ffmpeg is required for media derivation.",
      toolchain.tools.ffmpeg.remediationHint ?? undefined
    );
  }

  return ffmpegPath;
}

export function spawnFfmpegProcess(
  args: string[],
  options: SpawnFfmpegOptions = {}
): SpawnFfmpegProcess {
  const ffmpegPath = resolveFfmpegPath();
  let cancelled = false;
  let stderrBuffer = "";
  let progressBuffer = "";

  const child = spawn(ffmpegPath, args, {
    stdio: ["ignore", "pipe", "pipe"]
  });

  child.stdout.on("data", (chunk: Buffer) => {
    progressBuffer = parseProgressValue(
      `${progressBuffer}${chunk.toString("utf8")}`,
      options.onProgress
    );
  });

  child.stderr.on("data", (chunk: Buffer) => {
    const text = chunk.toString("utf8");
    stderrBuffer += text;

    for (const line of text.split(/\r?\n/gu)) {
      const trimmed = line.trim();

      if (trimmed) {
        options.onStderrLine?.(trimmed);
      }
    }
  });

  const completed = new Promise<{ stderr: string; cancelled: boolean }>((resolve, reject) => {
    child.on("error", (error) => {
      reject(
        new WorkerError("FFMPEG_FAILED", "ffmpeg execution failed to start.", error.message)
      );
    });

    child.on("close", (exitCode) => {
      const stderr = stderrBuffer.trim();

      if (cancelled) {
        resolve({
          stderr,
          cancelled: true
        });
        return;
      }

      if (exitCode !== 0) {
        reject(
          new WorkerError(
            "FFMPEG_FAILED",
            "ffmpeg command failed.",
            stderr || `Process exited with code ${exitCode ?? "unknown"}.`
          )
        );
        return;
      }

      resolve({
        stderr,
        cancelled: false
      });
    });
  });

  return {
    child,
    cancel() {
      if (!child.killed) {
        cancelled = true;
        child.kill("SIGTERM");
      }
    },
    completed
  };
}

export async function runFfmpeg(
  args: string[],
  options: RunFfmpegOptions = {}
): Promise<RunFfmpegResult> {
  const ffmpegPath = resolveFfmpegPath();

  return new Promise<RunFfmpegResult>((resolvePromise, rejectPromise) => {
    const child = spawn(ffmpegPath, args, {
      stdio: ["ignore", options.captureStdout ? "pipe" : "ignore", "pipe"]
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout?.on("data", (chunk: Buffer) => {
      stdoutChunks.push(chunk);
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });

    child.on("error", (error) => {
      rejectPromise(
        new WorkerError("FFMPEG_FAILED", "ffmpeg execution failed to start.", error.message)
      );
    });

    child.on("close", (exitCode) => {
      const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();

      if (exitCode !== 0) {
        rejectPromise(
          new WorkerError(
            "FFMPEG_FAILED",
            "ffmpeg command failed.",
            stderr || `Process exited with code ${exitCode ?? "unknown"}.`
          )
        );
        return;
      }

      resolvePromise({
        stdout: Buffer.concat(stdoutChunks),
        stderr
      });
    });
  });
}
