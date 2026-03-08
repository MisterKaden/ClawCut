import { mkdtempSync, rmSync } from "node:fs";
import { performance } from "node:perf_hooks";
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
import { executeExportCommand } from "../src/export-session";
import { probeAsset } from "../src/probe";
import { createProject, openProject, updateMediaItem } from "../src/project-repository";
import { getWorkflowSessionSnapshot } from "../src/workflow-session";

const temporaryDirectories: string[] = [];
const originalAdapter = process.env.CLAWCUT_TRANSCRIPTION_ADAPTER;
const PERFORMANCE_BUDGET_MS = {
  projectOpen: 1_500,
  editorSnapshot: 500,
  exportCompile: 1_000,
  transcriptionFixture: 4_000,
  workflowSnapshot: 500
} as const;

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
    const captionSnapshot = await getCaptionSessionSnapshot({ directory });
    const run = captionSnapshot.transcriptionRuns.find((entry) => entry.id === runId);

    if (run && ["completed", "failed", "cancelled"].includes(run.status)) {
      return run;
    }

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }

  throw new Error(`Timed out waiting for transcription run ${runId}.`);
}

describe.sequential("performance budgets", () => {
  beforeEach(() => {
    process.env.CLAWCUT_TRANSCRIPTION_ADAPTER = "fixture";
  });

  afterEach(() => {
    process.env.CLAWCUT_TRANSCRIPTION_ADAPTER = originalAdapter;

    while (temporaryDirectories.length > 0) {
      const directory = temporaryDirectories.pop();

      if (directory) {
        rmSync(directory, { recursive: true, force: true });
      }
    }
  });

  test("keeps project/session/transcription/export/workflow paths within fixture budgets", async () => {
    const directory = registerTempDirectory("clawcut-stage10-budget-");
    const fixturePath = resolve(process.cwd(), "fixtures/media/talking-head-sample.mp4");

    await createProject(directory, "Stage 10 Budgets");
    const mediaItem = await createMediaItemFromFixture("media-video", "Talking Head", fixturePath);
    const seeded = await seedVideoTimeline(directory, mediaItem);

    const openStart = performance.now();
    await openProject(directory);
    const openDuration = performance.now() - openStart;

    const editorSnapshotStart = performance.now();
    await getEditorSessionSnapshot(directory);
    const editorSnapshotDuration = performance.now() - editorSnapshotStart;

    const exportCompileStart = performance.now();
    const compiled = await executeExportCommand({
      directory,
      command: {
        type: "CompileRenderPlan",
        request: {
          timelineId: seeded.timelineId,
          presetId: "video-share-720p"
        }
      }
    });
    const exportCompileDuration = performance.now() - exportCompileStart;

    if (!compiled.result.ok || compiled.result.commandType !== "CompileRenderPlan") {
      throw new Error("Failed to compile the render plan for the performance fixture.");
    }

    const transcriptionStart = performance.now();
    const transcribe = await executeCaptionCommand({
      directory,
      command: {
        type: "TranscribeClip",
        timelineId: seeded.timelineId,
        clipId: seeded.clipId,
        options: {}
      }
    });

    if (!transcribe.result.ok || transcribe.result.commandType !== "TranscribeClip") {
      throw new Error("Failed to start the transcription fixture run.");
    }

    await waitForTranscriptionTerminalState(directory, transcribe.result.run.id);
    const transcriptionDuration = performance.now() - transcriptionStart;

    const workflowSnapshotStart = performance.now();
    await getWorkflowSessionSnapshot({ directory });
    const workflowSnapshotDuration = performance.now() - workflowSnapshotStart;

    expect(openDuration).toBeLessThan(PERFORMANCE_BUDGET_MS.projectOpen);
    expect(editorSnapshotDuration).toBeLessThan(PERFORMANCE_BUDGET_MS.editorSnapshot);
    expect(exportCompileDuration).toBeLessThan(PERFORMANCE_BUDGET_MS.exportCompile);
    expect(transcriptionDuration).toBeLessThan(PERFORMANCE_BUDGET_MS.transcriptionFixture);
    expect(workflowSnapshotDuration).toBeLessThan(PERFORMANCE_BUDGET_MS.workflowSnapshot);
  });
});
