import { performance } from "node:perf_hooks";

import { describe, expect, test } from "vitest";

import {
  createDefaultClipTransform,
  createEmptyDerivedAssetSet,
  createEmptyMetadataSummary,
  createEmptyTimeline,
  createTimelineClip,
  createTimelineTrack,
  type MediaItem,
  type PreviewLoadTarget
} from "@clawcut/domain";

import type {
  PreviewAdapter,
  PreviewBackendError,
  PreviewBackendState
} from "./preview-backend";
import { PreviewController } from "./preview-controller";

const PREVIEW_SEEK_BUDGET_MS = 100;

class FakeScheduler {
  nowMs(): number {
    return 0;
  }

  requestFrame(callback: FrameRequestCallback): number {
    callback(0);
    return 1;
  }

  cancelFrame(): void {}
}

class FakePreviewBackend implements PreviewAdapter {
  attachElements(): void {}

  async applyState(state: PreviewBackendState): Promise<void> {
    void state;
  }

  getMediaClockSeconds(sourceKind: "video" | "audio"): number | null {
    void sourceKind;
    return 0;
  }

  async pause(): Promise<void> {}

  async captureFrameSnapshot(request: {
    timelineId: string | null;
    playheadUs: number;
    clipId: string | null;
    sourceMode: "none" | "gap" | "proxy" | "original" | "mixed" | "unavailable";
  }) {
    return {
      status: "unavailable" as const,
      timelineId: request.timelineId,
      playheadUs: request.playheadUs,
      clipId: request.clipId,
      sourceMode: request.sourceMode,
      mimeType: null,
      width: null,
      height: null,
      dataUrl: null,
      warning: null,
      error: null
    };
  }

  subscribeToErrors(listener: (error: PreviewBackendError) => void): () => void {
    void listener;
    return () => undefined;
  }

  dispose(): void {}
}

function createMediaItem(id: string): MediaItem {
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
    derivedAssets: createEmptyDerivedAssetSet()
  };
}

function createLoadTarget(): PreviewLoadTarget {
  const timeline = createEmptyTimeline("timeline-budget");
  const videoTrack = createTimelineTrack("video", "V1", "track-video");
  const audioTrack = createTimelineTrack("audio", "A1", "track-audio");
  const videoClip = createTimelineClip({
    id: "clip-video-1",
    trackId: videoTrack.id,
    mediaItemId: "media-1",
    streamType: "video",
    sourceInUs: 0,
    sourceOutUs: 3_000_000,
    timelineStartUs: 0,
    transform: createDefaultClipTransform()
  });
  const audioClip = createTimelineClip({
    id: "clip-audio-1",
    trackId: audioTrack.id,
    mediaItemId: "media-1",
    streamType: "audio",
    sourceInUs: 0,
    sourceOutUs: 3_000_000,
    timelineStartUs: 0,
    transform: createDefaultClipTransform()
  });

  timeline.trackOrder = [videoTrack.id, audioTrack.id];
  timeline.tracksById = {
    [videoTrack.id]: {
      ...videoTrack,
      clipIds: [videoClip.id]
    },
    [audioTrack.id]: {
      ...audioTrack,
      clipIds: [audioClip.id]
    }
  };
  timeline.clipsById = {
    [videoClip.id]: videoClip,
    [audioClip.id]: audioClip
  };

  return {
    directory: "/project",
    cacheRoot: "/project/.clawcut/cache",
    timeline,
    libraryItems: [createMediaItem("media-1")],
    captionTracks: [],
    captionTemplates: [],
    defaultQualityMode: "fast"
  };
}

describe("preview performance budgets", () => {
  test("keeps command-driven seek latency within the Stage 10 preview budget", async () => {
    const controller = new PreviewController(new FakeScheduler());

    controller.attachBackend(new FakePreviewBackend());
    await controller.executeCommand({
      type: "LoadTimelinePreview",
      target: createLoadTarget()
    });

    const startedAt = performance.now();
    const result = await controller.executeCommand({
      type: "SeekPreview",
      positionUs: 1_500_000
    });
    const duration = performance.now() - startedAt;

    expect(result.ok).toBe(true);
    expect(duration).toBeLessThan(PREVIEW_SEEK_BUDGET_MS);
  });
});
