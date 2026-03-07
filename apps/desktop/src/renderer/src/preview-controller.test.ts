import { describe, expect, test } from "vitest";

import {
  createDefaultClipTransform,
  createEmptyDerivedAssetSet,
  createEmptyMetadataSummary,
  createEmptyTimeline,
  createTimelineClip,
  createTimelineTrack,
  type PreviewFrameSnapshot,
  type MediaItem,
  type PreviewLoadTarget
} from "@clawcut/domain";

import type {
  PreviewBackendError,
  PreviewBackendState,
  PreviewAdapter
} from "./preview-backend";
import { PreviewController } from "./preview-controller";

class FakeScheduler {
  private now = 0;

  private nextHandle = 1;

  private callbacks = new Map<number, FrameRequestCallback>();

  nowMs(): number {
    return this.now;
  }

  requestFrame(callback: FrameRequestCallback): number {
    const handle = this.nextHandle;
    this.nextHandle += 1;
    this.callbacks.set(handle, callback);
    return handle;
  }

  cancelFrame(handle: number): void {
    this.callbacks.delete(handle);
  }

  async advance(ms: number): Promise<void> {
    this.now += ms;
    const callbacks = [...this.callbacks.values()];
    this.callbacks.clear();

    for (const callback of callbacks) {
      callback(this.now);
      await Promise.resolve();
    }
  }
}

class FakePreviewBackend implements PreviewAdapter {
  public lastState: PreviewBackendState | null = null;

  public videoClockSeconds: number | null = null;

  public audioClockSeconds: number | null = null;

  public snapshotResult: PreviewFrameSnapshot = {
    status: "available",
    timelineId: "timeline-preview",
    playheadUs: 0,
    clipId: "clip-video-1",
    sourceMode: "proxy",
    mimeType: "image/png",
    width: 320,
    height: 180,
    dataUrl: "data:image/png;base64,ZmFrZQ==",
    warning: null,
    error: null
  };

  private listeners = new Set<(error: PreviewBackendError) => void>();

  attachElements(): void {}

  async applyState(state: PreviewBackendState): Promise<void> {
    this.lastState = state;

    if (state.video.targetTimeSeconds !== null) {
      this.videoClockSeconds = state.video.targetTimeSeconds;
    }

    if (state.audio.targetTimeSeconds !== null) {
      this.audioClockSeconds = state.audio.targetTimeSeconds;
    }
  }

  getMediaClockSeconds(sourceKind: "video" | "audio"): number | null {
    return sourceKind === "video" ? this.videoClockSeconds : this.audioClockSeconds;
  }

  async pause(): Promise<void> {
    return undefined;
  }

  async captureFrameSnapshot(): Promise<PreviewFrameSnapshot> {
    return this.snapshotResult;
  }

  subscribeToErrors(listener: (error: PreviewBackendError) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emitError(error: PreviewBackendError): void {
    for (const listener of this.listeners) {
      listener(error);
    }
  }

  dispose(): void {}
}

function createMediaItem(
  id: string,
  overrides: Partial<MediaItem> = {}
): MediaItem {
  const sourcePath = `/media/${id}.mp4`;

  return {
    id,
    displayName: `${id}.mp4`,
    source: {
      sourceType: "import",
      originalPath: sourcePath,
      currentResolvedPath: sourcePath,
      normalizedOriginalPath: sourcePath,
      normalizedResolvedPath: sourcePath
    },
    importTimestamp: new Date().toISOString(),
    lastSeenTimestamp: new Date().toISOString(),
    fileSize: 1_000,
    fileModifiedTimeMs: 1,
    fingerprint: {
      strategy: "partial-sha256",
      quickHash: `${id}-hash`,
      fileSize: 1_000,
      modifiedTimeMs: 1,
      sampleSizeBytes: 256
    },
    sourceRevision: `${id}-rev`,
    metadataSummary: {
      ...createEmptyMetadataSummary(),
      kind: "video",
      durationMs: 8_000,
      hasVideo: true,
      hasAudio: true,
      frameRate: 25,
      container: "mp4"
    },
    streams: [],
    ingestStatus: "ready",
    relinkStatus: "linked",
    errorState: null,
    derivedAssets: {
      ...createEmptyDerivedAssetSet(),
      proxy: {
        id: `${id}:proxy`,
        type: "proxy",
        status: "ready",
        relativePath: `media/${id}/proxy.mp4`,
        sourceRevision: `${id}-rev`,
        presetKey: "stage2-standard-proxy",
        generatedAt: new Date().toISOString(),
        fileSize: 512,
        errorMessage: null,
        width: 960,
        height: 540,
        durationMs: 8_000,
        container: "mp4",
        videoCodec: "h264",
        audioCodec: "aac"
      }
    },
    ...overrides
  };
}

function createLoadTarget(overrides: { mediaItem?: MediaItem } = {}): PreviewLoadTarget {
  const timeline = createEmptyTimeline("timeline-preview");
  const videoTrack = createTimelineTrack("video", "V1", "track-video");
  const audioTrack = createTimelineTrack("audio", "A1", "track-audio");
  const firstVideo = createTimelineClip({
    id: "clip-video-1",
    trackId: videoTrack.id,
    mediaItemId: "media-1",
    streamType: "video",
    sourceInUs: 0,
    sourceOutUs: 2_000_000,
    timelineStartUs: 0,
    transform: createDefaultClipTransform()
  });
  const firstAudio = createTimelineClip({
    id: "clip-audio-1",
    trackId: audioTrack.id,
    mediaItemId: "media-1",
    streamType: "audio",
    sourceInUs: 0,
    sourceOutUs: 2_000_000,
    timelineStartUs: 0,
    transform: createDefaultClipTransform()
  });
  const secondVideo = createTimelineClip({
    id: "clip-video-2",
    trackId: videoTrack.id,
    mediaItemId: "media-1",
    streamType: "video",
    sourceInUs: 2_000_000,
    sourceOutUs: 4_000_000,
    timelineStartUs: 2_000_000,
    transform: createDefaultClipTransform()
  });

  timeline.trackOrder = [videoTrack.id, audioTrack.id];
  timeline.tracksById = {
    [videoTrack.id]: {
      ...videoTrack,
      clipIds: [firstVideo.id, secondVideo.id]
    },
    [audioTrack.id]: {
      ...audioTrack,
      clipIds: [firstAudio.id]
    }
  };
  timeline.clipsById = {
    [firstVideo.id]: firstVideo,
    [firstAudio.id]: firstAudio,
    [secondVideo.id]: secondVideo
  };

  return {
    directory: "/project",
    cacheRoot: "/project/.clawcut/cache",
    timeline,
    libraryItems: [overrides.mediaItem ?? createMediaItem("media-1")],
    captionTracks: [],
    captionTemplates: [],
    defaultQualityMode: "fast"
  };
}

describe("PreviewController", () => {
  test("loads preview, seeks, plays, pauses, and frame-steps through commands", async () => {
    const scheduler = new FakeScheduler();
    const backend = new FakePreviewBackend();
    const controller = new PreviewController(scheduler);

    controller.attachBackend(backend);

    const loaded = await controller.executeCommand({
      type: "LoadTimelinePreview",
      target: createLoadTarget()
    });

    expect(loaded.ok).toBe(true);
    expect(controller.getPreviewState().sourceMode).toBe("proxy");

    const seeked = await controller.executeCommand({
      type: "SeekPreview",
      positionUs: 1_000_000
    });

    expect(seeked.ok).toBe(true);
    expect(controller.getPreviewState().playheadUs).toBe(1_000_000);

    await controller.executeCommand({
      type: "PlayPreview"
    });

    expect(controller.getPreviewState().playbackStatus).toBe("playing");
    expect(backend.lastState?.shouldPlay).toBe(true);

    backend.videoClockSeconds = 1.25;
    backend.audioClockSeconds = 1.25;
    await scheduler.advance(250);

    expect(controller.getPreviewState().playheadUs).toBe(1_250_000);

    await controller.executeCommand({
      type: "PausePreview"
    });

    expect(controller.getPreviewState().playbackStatus).toBe("paused");

    const stepped = await controller.executeCommand({
      type: "StepPreviewFrameForward"
    });

    expect(stepped.ok).toBe(true);
    expect(controller.getPreviewState().playheadUs).toBe(1_290_000);
  });

  test("switches quality modes and advances onto sequential clips", async () => {
    const scheduler = new FakeScheduler();
    const backend = new FakePreviewBackend();
    const controller = new PreviewController(scheduler);

    controller.attachBackend(backend);
    await controller.executeCommand({
      type: "LoadTimelinePreview",
      target: createLoadTarget()
    });

    await controller.executeCommand({
      type: "SetPreviewQuality",
      qualityMode: "standard"
    });

    expect(controller.getPreviewState().loadedMedia.video?.sourceMode).toBe("original");

    await controller.executeCommand({
      type: "SeekPreview",
      positionUs: 2_250_000
    });

    expect(controller.getPreviewState().activeVideoClipId).toBe("clip-video-2");
  });

  test("surfaces structured errors when accurate preview cannot resolve source media", async () => {
    const scheduler = new FakeScheduler();
    const backend = new FakePreviewBackend();
    const controller = new PreviewController(scheduler);

    controller.attachBackend(backend);

    await controller.executeCommand({
      type: "LoadTimelinePreview",
      target: createLoadTarget({
        mediaItem: createMediaItem("media-1", {
          source: {
            sourceType: "import",
            originalPath: "/media/missing.mp4",
            currentResolvedPath: null,
            normalizedOriginalPath: "/media/missing.mp4",
            normalizedResolvedPath: null
          },
          relinkStatus: "missing",
          derivedAssets: createEmptyDerivedAssetSet()
        })
      })
    });

    const result = await controller.executeCommand({
      type: "SetPreviewQuality",
      qualityMode: "accurate"
    });

    expect(result.ok).toBe(true);
    expect(controller.getPreviewState().playbackStatus).toBe("error");
    expect(controller.getPreviewState().error?.code).toBe("PREVIEW_SOURCE_UNAVAILABLE");
  });

  test("exposes programmatic preview frame snapshot capture", async () => {
    const scheduler = new FakeScheduler();
    const backend = new FakePreviewBackend();
    const controller = new PreviewController(scheduler);

    controller.attachBackend(backend);
    await controller.executeCommand({
      type: "LoadTimelinePreview",
      target: createLoadTarget()
    });

    const snapshot = await controller.captureFrameSnapshot({
      maxWidth: 320
    });

    expect(snapshot.status).toBe("available");
    expect(snapshot.dataUrl).toContain("data:image/png");
  });
});
