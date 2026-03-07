import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
  createEmptyDerivedAssetSet,
  createEmptyMetadataSummary,
  type MediaItem
} from "@clawcut/domain";

import { executeCaptionCommand, getCaptionSessionSnapshot } from "../src/caption-session";
import { executeEditorCommand, getEditorSessionSnapshot } from "../src/editor-session";
import { retryJob } from "../src/ingest-service";
import { probeAsset } from "../src/probe";
import { createProject, updateMediaItem } from "../src/project-repository";

const temporaryDirectories: string[] = [];
const originalAdapter = process.env.CLAWCUT_TRANSCRIPTION_ADAPTER;
const originalPythonBin = process.env.CLAWCUT_PYTHON_BIN;

function registerTempDirectory(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

async function createMediaItemFromFixture(
  id: string,
  displayName: string,
  sourcePath: string
): Promise<MediaItem> {
  const probe = await probeAsset(sourcePath);

  return {
    id,
    displayName,
    source: {
      sourceType: "import",
      originalPath: sourcePath,
      currentResolvedPath: sourcePath,
      normalizedOriginalPath: sourcePath,
      normalizedResolvedPath: sourcePath
    },
    importTimestamp: new Date().toISOString(),
    lastSeenTimestamp: new Date().toISOString(),
    fileSize: 42,
    fileModifiedTimeMs: 10,
    fingerprint: {
      strategy: "partial-sha256",
      quickHash: `${id}-hash`,
      fileSize: 42,
      modifiedTimeMs: 10,
      sampleSizeBytes: 42
    },
    sourceRevision: `${id}-revision`,
    metadataSummary: {
      ...createEmptyMetadataSummary(),
      kind: probe.width ? "video" : "audio",
      container: probe.container,
      durationMs: probe.durationMs,
      bitRate: probe.bitRate,
      hasVideo: probe.streams.some((stream) => stream.codecType === "video"),
      hasAudio: probe.streams.some((stream) => stream.codecType === "audio"),
      width: probe.width,
      height: probe.height,
      frameRate: probe.frameRate,
      pixelFormat: probe.pixelFormat,
      rotation: probe.rotation,
      videoCodec: probe.videoCodec,
      audioCodec: probe.audioCodec,
      audioSampleRate: probe.audioSampleRate,
      channelCount: probe.channelCount,
      streamSignature: probe.streamSignature
    },
    streams: [],
    ingestStatus: "ready",
    relinkStatus: "linked",
    errorState: null,
    derivedAssets: createEmptyDerivedAssetSet()
  };
}

async function seedVideoTimeline(directory: string, mediaItem: MediaItem): Promise<{
  timelineId: string;
  clipId: string;
}> {
  await updateMediaItem(directory, mediaItem);
  const initialSession = await getEditorSessionSnapshot(directory);
  const timelineResult = await executeEditorCommand({
    directory,
    command: {
      type: "CreateTimeline",
      timelineId: initialSession.timeline.id
    }
  });

  if (!timelineResult.result.ok || timelineResult.result.commandType !== "CreateTimeline") {
    throw new Error("Could not create the default timeline.");
  }

  const [videoTrackId, audioTrackId] = timelineResult.result.createdTrackIds;

  if (!videoTrackId || !audioTrackId) {
    throw new Error("Default timeline did not create V1 and A1.");
  }

  const insertResult = await executeEditorCommand({
    directory,
    command: {
      type: "InsertLinkedMedia",
      timelineId: timelineResult.snapshot.timeline.id,
      mediaItemId: mediaItem.id,
      videoTrackId,
      audioTrackId,
      timelineStartUs: 0
    }
  });

  if (!insertResult.result.ok) {
    throw new Error("Could not insert the fixture media.");
  }

  const videoClipId = Object.values(insertResult.snapshot.timeline.clipsById).find(
    (clip) => clip.streamType === "video"
  )?.id;

  if (!videoClipId) {
    throw new Error("Inserted timeline did not expose a video clip.");
  }

  return {
    timelineId: insertResult.snapshot.timeline.id,
    clipId: videoClipId
  };
}

async function waitForTranscriptionTerminalState(
  directory: string,
  runId: string,
  timeoutMs = 20_000
) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const snapshot = await getCaptionSessionSnapshot({ directory });
    const run = snapshot.transcriptionRuns.find((entry) => entry.id === runId);

    if (run && ["completed", "failed", "cancelled"].includes(run.status)) {
      return run;
    }

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }

  throw new Error(`Timed out waiting for transcription run ${runId}.`);
}

describe.sequential("caption session", () => {
  beforeEach(() => {
    process.env.CLAWCUT_TRANSCRIPTION_ADAPTER = "fixture";
    delete process.env.CLAWCUT_PYTHON_BIN;
  });

  afterEach(() => {
    process.env.CLAWCUT_TRANSCRIPTION_ADAPTER = originalAdapter;
    process.env.CLAWCUT_PYTHON_BIN = originalPythonBin;

    while (temporaryDirectories.length > 0) {
      const directory = temporaryDirectories.pop();

      if (directory) {
        rmSync(directory, { recursive: true, force: true });
      }
    }
  });

  test("transcribes a clip, persists the transcript, generates a caption track, and exports SRT", async () => {
    const directory = registerTempDirectory("clawcut-stage6-caption-");
    const fixturePath = resolve(process.cwd(), "fixtures/media/talking-head-sample.mp4");

    await createProject(directory, "Stage 6 Captions");
    const mediaItem = await createMediaItemFromFixture("media-video", "Talking Head", fixturePath);
    const seeded = await seedVideoTimeline(directory, mediaItem);

    const transcribe = await executeCaptionCommand({
      directory,
      command: {
        type: "TranscribeClip",
        timelineId: seeded.timelineId,
        clipId: seeded.clipId,
        options: {
          initialPrompt: "Prefer the ClawCut and OpenClaw product names.",
          glossaryTerms: ["ClawCut", "OpenClaw", "KPStudio"]
        }
      }
    });

    expect(transcribe.result.ok).toBe(true);

    if (!transcribe.result.ok || transcribe.result.commandType !== "TranscribeClip") {
      return;
    }

    const completedRun = await waitForTranscriptionTerminalState(
      directory,
      transcribe.result.run.id
    );
    expect(completedRun.status).toBe("completed");

    const completedSnapshot = await getCaptionSessionSnapshot({ directory });
    const transcript = completedSnapshot.transcripts[0];

    expect(transcript).toBeTruthy();
    expect(transcript?.segments.length).toBeGreaterThan(0);
    expect(transcript?.segments[0]?.words[0]?.startUs).not.toBeNull();
    expect(completedSnapshot.transcriptSummaries[0]?.wordTimingCoverageRatio).toBeGreaterThan(0);
    expect(transcribe.result.run.request.options.glossaryTerms).toEqual([
      "ClawCut",
      "OpenClaw",
      "KPStudio"
    ]);

    const updatedTranscript = await executeCaptionCommand({
      directory,
      command: {
        type: "UpdateTranscriptSegment",
        transcriptId: transcript!.id,
        segmentId: transcript!.segments[0]!.id,
        text: "Hello there, refined captions."
      }
    });

    expect(updatedTranscript.result.ok).toBe(true);

    const generated = await executeCaptionCommand({
      directory,
      command: {
        type: "GenerateCaptionTrack",
        timelineId: seeded.timelineId,
        transcriptId: transcript!.id,
        templateId: "karaoke-highlight"
      }
    });

    expect(generated.result.ok).toBe(true);

    if (!generated.result.ok || generated.result.commandType !== "GenerateCaptionTrack") {
      return;
    }

    const subtitleOutputPath = resolve(directory, "exports", "captions-stage6.srt");
    const exported = await executeCaptionCommand({
      directory,
      command: {
        type: "ExportSubtitleFile",
        captionTrackId: generated.result.captionTrack.id,
        format: "srt",
        outputPath: subtitleOutputPath
      }
    });

    expect(exported.result.ok).toBe(true);
    expect(existsSync(subtitleOutputPath)).toBe(true);
    expect(readFileSync(subtitleOutputPath, "utf8")).toContain("-->");

    const transcriptStatus = await executeCaptionCommand({
      directory,
      command: {
        type: "QueryTranscriptStatus",
        transcriptId: transcript!.id
      }
    });

    expect(transcriptStatus.result.ok).toBe(true);

    if (transcriptStatus.result.ok && transcriptStatus.result.commandType === "QueryTranscriptStatus") {
      expect(transcriptStatus.result.summary?.captionCoverage.trackCount).toBe(1);
      expect(transcriptStatus.result.summary?.captionCoverage.coverageRatio).toBe(1);
    }
  });

  test("fails clearly when a clip has no usable audio metadata", async () => {
    const directory = registerTempDirectory("clawcut-stage6-no-audio-");
    const fixturePath = resolve(process.cwd(), "fixtures/media/talking-head-sample.mp4");

    await createProject(directory, "Stage 6 Missing Audio");
    const mediaItem = await createMediaItemFromFixture("media-video", "Talking Head", fixturePath);
    mediaItem.metadataSummary = {
      ...mediaItem.metadataSummary,
      hasAudio: false
    };
    const seeded = await seedVideoTimeline(directory, mediaItem);

    const result = await executeCaptionCommand({
      directory,
      command: {
        type: "TranscribeClip",
        timelineId: seeded.timelineId,
        clipId: seeded.clipId
      }
    });

    expect(result.result.ok).toBe(false);

    if (!result.result.ok) {
      expect(result.result.error.code).toBe("NO_AUDIO_CONTENT");
    }
  });

  test("surfaces engine-unavailable failures and can retry to a fixture-backed success", async () => {
    const directory = registerTempDirectory("clawcut-stage6-retry-");
    const fixtureSourcePath = resolve(process.cwd(), "fixtures/media/talking-head-sample.mp4");
    const importPath = resolve(directory, "source.mp4");

    copyFileSync(fixtureSourcePath, importPath);
    await createProject(directory, "Stage 6 Retry");
    const mediaItem = await createMediaItemFromFixture("media-video", "Talking Head", importPath);
    const seeded = await seedVideoTimeline(directory, mediaItem);

    process.env.CLAWCUT_TRANSCRIPTION_ADAPTER = "faster-whisper";
    process.env.CLAWCUT_PYTHON_BIN = resolve(directory, "missing-python");

    const queued = await executeCaptionCommand({
      directory,
      command: {
        type: "TranscribeClip",
        timelineId: seeded.timelineId,
        clipId: seeded.clipId
      }
    });

    expect(queued.result.ok).toBe(true);

    if (!queued.result.ok || queued.result.commandType !== "TranscribeClip") {
      return;
    }

    const failedRun = await waitForTranscriptionTerminalState(directory, queued.result.run.id);
    expect(failedRun.status).toBe("failed");
    expect(failedRun.error?.code).toBe("TRANSCRIPTION_ENGINE_UNAVAILABLE");

    process.env.CLAWCUT_TRANSCRIPTION_ADAPTER = "fixture";
    delete process.env.CLAWCUT_PYTHON_BIN;

    await retryJob({
      directory,
      jobId: queued.result.run.jobId
    });

    const recoveredRun = await waitForTranscriptionTerminalState(directory, queued.result.run.id);
    expect(recoveredRun.status).toBe("completed");

    const snapshot = await getCaptionSessionSnapshot({ directory });
    expect(snapshot.transcripts).toHaveLength(1);
  });
});
