import { copyFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import {
  createTranscriptFromNormalizedResult,
  createEmptyDerivedAssetSet,
  createEmptyMetadataSummary,
  type MediaItem
} from "@clawcut/domain";

import { executeCaptionCommand } from "../src/caption-session";
import {
  executeExportCommand,
  getExportSessionSnapshot
} from "../src/export-session";
import { executeEditorCommand, getEditorSessionSnapshot } from "../src/editor-session";
import { probeAsset } from "../src/probe";
import { createProject, updateMediaItem } from "../src/project-repository";

const temporaryDirectories: string[] = [];

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

async function waitForExportTerminalState(
  directory: string,
  exportRunId: string,
  timeoutMs: number = 60_000
) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const snapshot = await getExportSessionSnapshot({ directory });
    const run = snapshot.exportRuns.find((entry) => entry.id === exportRunId);

    if (
      run &&
      ["completed", "failed", "cancelled"].includes(run.status)
    ) {
      return run;
    }

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 150));
  }

  throw new Error(`Timed out waiting for export run ${exportRunId} to finish.`);
}

async function waitForExportToStart(directory: string, exportRunId: string): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 20_000) {
    const snapshot = await getExportSessionSnapshot({ directory });
    const run = snapshot.exportRuns.find((entry) => entry.id === exportRunId);

    if (
      run &&
      ["preparing", "compiling", "rendering", "finalizing", "verifying"].includes(run.status)
    ) {
      return;
    }

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }

  throw new Error(`Timed out waiting for export run ${exportRunId} to start.`);
}

async function seedVideoTimeline(directory: string, mediaItem: MediaItem): Promise<string> {
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
    throw new Error("Could not create default timeline.");
  }

  const [videoTrackId, audioTrackId] = timelineResult.result.createdTrackIds;

  if (!videoTrackId || !audioTrackId) {
    throw new Error("CreateTimeline did not produce the default tracks.");
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
    throw new Error("Could not insert linked media into the timeline.");
  }

  return insertResult.snapshot.timeline.id;
}

describe.sequential("export session", () => {
  afterEach(() => {
    while (temporaryDirectories.length > 0) {
      const directory = temporaryDirectories.pop();

      if (directory) {
        rmSync(directory, { recursive: true, force: true });
      }
    }
  });

  test("exports a simple video timeline and verifies the output", async () => {
    const directory = registerTempDirectory("clawcut-stage5-video-");
    const fixturePath = resolve(process.cwd(), "fixtures/media/talking-head-sample.mp4");

    await createProject(directory, "Stage 5 Video");
    const mediaItem = await createMediaItemFromFixture("media-video", "Talking Head", fixturePath);
    const timelineId = await seedVideoTimeline(directory, mediaItem);

    const started = await executeExportCommand({
      directory,
      command: {
        type: "StartExport",
        request: {
          timelineId,
          presetId: "video-share-720p"
        }
      }
    });

    expect(started.result.ok).toBe(true);

    if (!started.result.ok || started.result.commandType !== "StartExport") {
      return;
    }

    const completed = await waitForExportTerminalState(directory, started.result.exportRun.id);

    expect(completed.status).toBe("completed");
    expect(completed.verification?.status).toBe("passed");
    expect(completed.outputPath).toBeTruthy();
    expect(completed.diagnostics.concatListPath).toBeTruthy();
    expect(completed.diagnostics.developmentManifestPath).toBeTruthy();
    expect(existsSync(completed.diagnostics.concatListPath!)).toBe(true);
    expect(existsSync(completed.diagnostics.developmentManifestPath!)).toBe(true);
  });

  test("exports an audio-only timeline", async () => {
    const directory = registerTempDirectory("clawcut-stage5-audio-");
    const fixturePath = resolve(process.cwd(), "fixtures/media/podcast-tone.wav");

    await createProject(directory, "Stage 5 Audio");
    const mediaItem = await createMediaItemFromFixture("media-audio", "Podcast Tone", fixturePath);
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
      throw new Error("Could not create audio timeline.");
    }

    const audioTrackId = timelineResult.result.createdTrackIds[1];

    if (!audioTrackId) {
      throw new Error("Audio track missing from CreateTimeline result.");
    }

    const insertResult = await executeEditorCommand({
      directory,
      command: {
        type: "InsertClip",
        timelineId: timelineResult.snapshot.timeline.id,
        mediaItemId: mediaItem.id,
        streamType: "audio",
        trackId: audioTrackId,
        timelineStartUs: 0
      }
    });

    expect(insertResult.result.ok).toBe(true);

    const started = await executeExportCommand({
      directory,
      command: {
        type: "StartExport",
        request: {
          timelineId: timelineResult.snapshot.timeline.id,
          presetId: "audio-podcast-aac"
        }
      }
    });

    if (!started.result.ok || started.result.commandType !== "StartExport") {
      throw new Error("Could not start audio export.");
    }

    const completed = await waitForExportTerminalState(directory, started.result.exportRun.id);
    expect(completed.status).toBe("completed");
    expect(completed.verification?.status).toBe("passed");
  });

  test("fails cleanly when source media is missing", async () => {
    const directory = registerTempDirectory("clawcut-stage5-missing-");
    const fixturePath = resolve(process.cwd(), "fixtures/media/talking-head-sample.mp4");

    await createProject(directory, "Stage 5 Missing");
    const mediaItem = await createMediaItemFromFixture("media-video", "Talking Head", fixturePath);
    await seedVideoTimeline(directory, mediaItem);

    await updateMediaItem(directory, {
      ...mediaItem,
      source: {
        ...mediaItem.source,
        currentResolvedPath: resolve(directory, "missing.mp4"),
        normalizedResolvedPath: resolve(directory, "missing.mp4")
      },
      relinkStatus: "missing"
    });

    const snapshot = await getEditorSessionSnapshot(directory);
    const started = await executeExportCommand({
      directory,
      command: {
        type: "StartExport",
        request: {
          timelineId: snapshot.timeline.id,
          presetId: "video-share-720p"
        }
      }
    });

    if (!started.result.ok || started.result.commandType !== "StartExport") {
      throw new Error("Could not queue missing-media export.");
    }

    const completed = await waitForExportTerminalState(directory, started.result.exportRun.id);
    expect(completed.status).toBe("failed");
    expect(completed.error?.code).toBe("MISSING_SOURCE_MEDIA");
  });

  test("keeps queued exports queued while another export is already running", async () => {
    const directory = registerTempDirectory("clawcut-stage5-queued-");
    const fixturePath = resolve(process.cwd(), "fixtures/media/talking-head-sample.mp4");

    await createProject(directory, "Stage 5 Queue");
    const mediaItem = await createMediaItemFromFixture("media-video", "Talking Head", fixturePath);
    const timelineId = await seedVideoTimeline(directory, mediaItem);

    const videoStart = await executeExportCommand({
      directory,
      command: {
        type: "StartExport",
        request: {
          timelineId,
          presetId: "video-share-720p"
        }
      }
    });

    if (!videoStart.result.ok || videoStart.result.commandType !== "StartExport") {
      throw new Error("Could not start the primary queued-export test export.");
    }

    const audioStart = await executeExportCommand({
      directory,
      command: {
        type: "StartExport",
        request: {
          timelineId,
          presetId: "audio-podcast-aac"
        }
      }
    });

    if (!audioStart.result.ok || audioStart.result.commandType !== "StartExport") {
      throw new Error("Could not queue the secondary export.");
    }

    const videoRunId = videoStart.result.exportRun.id;
    const audioRunId = audioStart.result.exportRun.id;
    const snapshotWhileQueued = await getExportSessionSnapshot({ directory });
    const queuedAudioRun = snapshotWhileQueued.exportRuns.find(
      (run) => run.id === audioRunId
    );

    expect(queuedAudioRun?.status).toBe("queued");

    const completedVideo = await waitForExportTerminalState(directory, videoRunId);
    const completedAudio = await waitForExportTerminalState(directory, audioRunId);

    expect(completedVideo.status).toBe("completed");
    expect(completedAudio.status).toBe("completed");
  });

  test("exports a selected range and captures snapshots from both timeline and export output", async () => {
    const directory = registerTempDirectory("clawcut-stage5-range-");
    const fixturePath = resolve(process.cwd(), "fixtures/media/talking-head-sample.mp4");

    await createProject(directory, "Stage 5 Range");
    const mediaItem = await createMediaItemFromFixture("media-video", "Talking Head", fixturePath);
    const timelineId = await seedVideoTimeline(directory, mediaItem);
    const sourceDurationUs = Math.max(
      600_000,
      Math.round((mediaItem.metadataSummary.durationMs ?? 1_000) * 1_000)
    );
    const rangeStartUs = Math.round(sourceDurationUs * 0.2);
    const rangeEndUs = Math.round(sourceDurationUs * 0.8);

    const started = await executeExportCommand({
      directory,
      command: {
        type: "StartExport",
        request: {
          timelineId,
          presetId: "video-share-720p",
          target: {
            kind: "range",
            startUs: rangeStartUs,
            endUs: rangeEndUs,
            label: "Tight cut"
          }
        }
      }
    });

    if (!started.result.ok || started.result.commandType !== "StartExport") {
      throw new Error("Could not start range export.");
    }

    const completed = await waitForExportTerminalState(directory, started.result.exportRun.id);
    expect(completed.status).toBe("completed");
    expect(completed.verification?.output?.durationMs).not.toBeNull();
    expect(
      Math.abs((completed.verification?.output?.durationMs ?? 0) - Math.round((rangeEndUs - rangeStartUs) / 1_000))
    ).toBeLessThanOrEqual(700);

    const exportSnapshot = await executeExportCommand({
      directory,
      command: {
        type: "CaptureExportSnapshot",
        request: {
          sourceKind: "export-run",
          exportRunId: completed.id
        }
      }
    });

    expect(exportSnapshot.result.ok).toBe(true);

    if (!exportSnapshot.result.ok || exportSnapshot.result.commandType !== "CaptureExportSnapshot") {
      throw new Error("Could not capture still frame from completed export.");
    }

    expect(existsSync(exportSnapshot.result.snapshot.outputPath)).toBe(true);

    const timelineSnapshot = await executeExportCommand({
      directory,
      command: {
        type: "CaptureExportSnapshot",
        request: {
          sourceKind: "timeline",
          timelineId,
          positionUs: Math.round((rangeStartUs + rangeEndUs) / 2),
          presetId: "video-share-720p"
        }
      }
    });

    expect(timelineSnapshot.result.ok).toBe(true);

    if (!timelineSnapshot.result.ok || timelineSnapshot.result.commandType !== "CaptureExportSnapshot") {
      throw new Error("Could not capture still frame from timeline.");
    }

    expect(existsSync(timelineSnapshot.result.snapshot.outputPath)).toBe(true);
  });

  test("rejects invalid output destinations clearly", async () => {
    const directory = registerTempDirectory("clawcut-stage5-invalid-path-");
    const fixturePath = resolve(process.cwd(), "fixtures/media/talking-head-sample.mp4");

    await createProject(directory, "Stage 5 Invalid Path");
    const mediaItem = await createMediaItemFromFixture("media-video", "Talking Head", fixturePath);
    const timelineId = await seedVideoTimeline(directory, mediaItem);

    try {
      await executeExportCommand({
        directory,
        command: {
          type: "StartExport",
          request: {
            timelineId,
            presetId: "video-share-720p",
            outputPath: "/dev/null/export-preview"
          }
        }
      });
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("could not be created");
      return;
    }

    throw new Error("Expected invalid output path to fail.");
  });

  test("cancels an in-flight export and retries it successfully", async () => {
    const directory = registerTempDirectory("clawcut-stage5-cancel-");
    const sourceDirectory = registerTempDirectory("clawcut-stage5-cancel-fixture-");
    const fixturePath = join(sourceDirectory, "long-export-source.mp4");

    copyFileSync(resolve(process.cwd(), "fixtures/media/talking-head-sample.mp4"), fixturePath);
    await createProject(directory, "Stage 5 Cancel");
    const mediaItem = await createMediaItemFromFixture("media-video", "Talking Head", fixturePath);
    await updateMediaItem(directory, mediaItem);

    const editorSession = await getEditorSessionSnapshot(directory);
    const created = await executeEditorCommand({
      directory,
      command: {
        type: "CreateTimeline",
        timelineId: editorSession.timeline.id
      }
    });

    if (!created.result.ok || created.result.commandType !== "CreateTimeline") {
      throw new Error("Could not create timeline for cancellation test.");
    }

    const [videoTrackId, audioTrackId] = created.result.createdTrackIds;

    const clipDurationUs = Math.max(
      1_000_000,
      (mediaItem.metadataSummary.durationMs ?? 2_000) * 1_000
    );

    for (let index = 0; index < 12; index += 1) {
      const inserted = await executeEditorCommand({
        directory,
        command: {
          type: "InsertLinkedMedia",
          timelineId: created.snapshot.timeline.id,
          mediaItemId: mediaItem.id,
          videoTrackId: videoTrackId!,
          audioTrackId: audioTrackId!,
          timelineStartUs: index * clipDurationUs
        }
      });

      if (!inserted.result.ok) {
        throw new Error(`Could not build cancellation fixture timeline at clip ${index}.`);
      }
    }

    const latestEditorSession = await getEditorSessionSnapshot(directory);
    const started = await executeExportCommand({
      directory,
      command: {
        type: "StartExport",
        request: {
          timelineId: latestEditorSession.timeline.id,
          presetId: "video-master-1080p"
        }
      }
    });

    if (!started.result.ok || started.result.commandType !== "StartExport") {
      throw new Error("Could not start cancellation export.");
    }

    await waitForExportToStart(directory, started.result.exportRun.id);

    const cancelled = await executeExportCommand({
      directory,
      command: {
        type: "CancelExport",
        exportRunId: started.result.exportRun.id
      }
    });

    expect(cancelled.result.ok).toBe(true);

    const cancelledRun = await waitForExportTerminalState(directory, started.result.exportRun.id);
    expect(cancelledRun.status).toBe("cancelled");

    const retried = await executeExportCommand({
      directory,
      command: {
        type: "RetryExport",
        exportRunId: cancelledRun.id
      }
    });

    if (!retried.result.ok || retried.result.commandType !== "RetryExport") {
      throw new Error("Could not retry cancelled export.");
    }

    const retriedRun = await waitForExportTerminalState(directory, retried.result.exportRun.id);
    expect(retriedRun.status).toBe("completed");
    expect(retriedRun.verification?.status).toBe("passed");
  }, 30_000);

  test("exports video with burned-in captions when a caption track is enabled", async () => {
    const directory = registerTempDirectory("clawcut-stage6-burnin-");
    const fixturePath = resolve(process.cwd(), "fixtures/media/talking-head-sample.mp4");

    await createProject(directory, "Stage 6 Burn In");
    const mediaItem = await createMediaItemFromFixture("media-video", "Talking Head", fixturePath);
    const timelineId = await seedVideoTimeline(directory, mediaItem);
    const editorSnapshot = await getEditorSessionSnapshot(directory);
    const videoClip = Object.values(editorSnapshot.timeline.clipsById).find(
      (clip) => clip.streamType === "video"
    );

    if (!videoClip) {
      throw new Error("Expected a video clip for burn-in export.");
    }

    const transcript = createTranscriptFromNormalizedResult({
      id: "transcript-burnin",
      timelineId,
      source: {
        kind: "clip",
        timelineId,
        clipId: videoClip.id,
        mediaItemId: mediaItem.id,
        sourceStartUs: videoClip.sourceInUs,
        sourceEndUs: videoClip.sourceOutUs
      },
      createdAt: "2026-03-06T09:00:00.000Z",
      result: {
        language: "en",
        provider: "faster-whisper",
        model: "base",
        wordTimestamps: true,
        confidence: 0.93,
        warnings: [],
        segments: [
          {
            startUs: 0,
            endUs: 800_000,
            text: "Clawcut keeps burn-in exports structured.",
            confidence: 0.93,
            words: [
              { text: "Clawcut", startUs: 0, endUs: 180_000, confidence: 0.94 },
              { text: "keeps", startUs: 180_000, endUs: 320_000, confidence: 0.93 },
              { text: "burn-in", startUs: 320_000, endUs: 520_000, confidence: 0.92 },
              { text: "exports", startUs: 520_000, endUs: 680_000, confidence: 0.93 },
              { text: "structured.", startUs: 680_000, endUs: 800_000, confidence: 0.94 }
            ]
          }
        ]
      }
    });

    const createTranscript = await executeCaptionCommand({
      directory,
      command: {
        type: "CreateTranscript",
        transcript
      }
    });
    expect(createTranscript.result.ok).toBe(true);

    const generatedTrack = await executeCaptionCommand({
      directory,
      command: {
        type: "GenerateCaptionTrack",
        timelineId,
        transcriptId: transcript.id,
        templateId: "bottom-center-clean"
      }
    });

    expect(generatedTrack.result.ok).toBe(true);

    if (!generatedTrack.result.ok || generatedTrack.result.commandType !== "GenerateCaptionTrack") {
      return;
    }

    const burnIn = await executeCaptionCommand({
      directory,
      command: {
        type: "EnableBurnInCaptionsForExport",
        timelineId,
        captionTrackId: generatedTrack.result.captionTrack.id,
        enabled: true
      }
    });

    expect(burnIn.result.ok).toBe(true);

    const started = await executeExportCommand({
      directory,
      command: {
        type: "StartExport",
        request: {
          timelineId,
          presetId: "video-share-720p"
        }
      }
    });

    if (!started.result.ok || started.result.commandType !== "StartExport") {
      throw new Error("Could not start caption burn-in export.");
    }

    const completed = await waitForExportTerminalState(directory, started.result.exportRun.id);
    expect(completed.status).toBe("completed");
    expect(completed.verification?.status).toBe("passed");
    expect(completed.diagnostics.subtitleArtifactPaths.length).toBeGreaterThan(0);
    expect(existsSync(completed.diagnostics.subtitleArtifactPaths[0]!)).toBe(true);
  }, 30_000);
});
