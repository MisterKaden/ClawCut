import { describe, expect, test } from "vitest";

import {
  createDefaultClipTransform,
  createEmptyDerivedAssetSet,
  createEmptyMetadataSummary,
  createEmptyTimeline,
  createTimelineClip,
  createTimelineTrack,
  mapTimelineClipToMediaSeconds,
  resolveFrameStepUs,
  resolveTimelinePreviewComposition,
  resolveTimelinePreviewCompositionForQuality,
  type MediaItem,
  type PreviewLoadTarget
} from "../src/index";

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
    fileModifiedTimeMs: 10,
    fingerprint: {
      strategy: "partial-sha256",
      quickHash: `${id}-hash`,
      fileSize: 1_000,
      modifiedTimeMs: 10,
      sampleSizeBytes: 256
    },
    sourceRevision: `${id}-rev`,
    metadataSummary: {
      ...createEmptyMetadataSummary(),
      kind: "video",
      durationMs: 12_000,
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
        durationMs: 12_000,
        container: "mp4",
        videoCodec: "h264",
        audioCodec: "aac"
      }
    },
    ...overrides
  };
}

function createLoadTarget(): PreviewLoadTarget {
  const timeline = createEmptyTimeline("timeline-preview");
  const videoTrack = createTimelineTrack("video", "V1", "track-video");
  const audioTrack = createTimelineTrack("audio", "A1", "track-audio");
  const firstClip = createTimelineClip({
    id: "clip-1",
    trackId: videoTrack.id,
    mediaItemId: "media-1",
    streamType: "video",
    sourceInUs: 1_000_000,
    sourceOutUs: 5_000_000,
    timelineStartUs: 0,
    transform: createDefaultClipTransform()
  });
  const firstAudioClip = createTimelineClip({
    id: "clip-1-audio",
    trackId: audioTrack.id,
    mediaItemId: "media-1",
    streamType: "audio",
    sourceInUs: 1_000_000,
    sourceOutUs: 5_000_000,
    timelineStartUs: 0,
    transform: createDefaultClipTransform()
  });
  const secondClip = createTimelineClip({
    id: "clip-2",
    trackId: videoTrack.id,
    mediaItemId: "media-2",
    streamType: "video",
    sourceInUs: 0,
    sourceOutUs: 3_000_000,
    timelineStartUs: 5_000_000,
    transform: createDefaultClipTransform()
  });

  timeline.trackOrder = [videoTrack.id, audioTrack.id];
  timeline.tracksById = {
    [videoTrack.id]: {
      ...videoTrack,
      clipIds: [firstClip.id, secondClip.id]
    },
    [audioTrack.id]: {
      ...audioTrack,
      clipIds: [firstAudioClip.id]
    }
  };
  timeline.clipsById = {
    [firstClip.id]: firstClip,
    [firstAudioClip.id]: firstAudioClip,
    [secondClip.id]: secondClip
  };
  timeline.markers = [
    {
      id: "marker-1",
      positionUs: 2_000_000,
      label: "Beat"
    }
  ];
  timeline.regions = [
    {
      id: "region-1",
      startUs: 0,
      endUs: 3_500_000,
      label: "Intro"
    }
  ];

  return {
    directory: "/project",
    cacheRoot: "/project/.clawcut/cache",
    timeline,
    libraryItems: [createMediaItem("media-1"), createMediaItem("media-2")],
    captionTracks: [],
    captionTemplates: [],
    defaultQualityMode: "fast"
  };
}

describe("preview composition", () => {
  test("uses proxies for fast preview and resolves active linked clips", () => {
    const target = createLoadTarget();
    const composition = resolveTimelinePreviewComposition(target, 2_000_000, {
      selectedClipId: "clip-1",
      selectedTrackId: "track-video"
    });

    expect(composition.sourceMode).toBe("proxy");
    expect(composition.activeVideoClip?.clipId).toBe("clip-1");
    expect(composition.activeAudioClip?.clipId).toBe("clip-1-audio");
    expect(composition.videoSource?.sourceMode).toBe("proxy");
    expect(composition.audioSource?.sourceMode).toBe("proxy");
    expect(composition.overlays.selection?.clipId).toBe("clip-1");
    expect(composition.overlays.markers[0]?.active).toBe(true);
    expect(composition.overlays.regions[0]?.active).toBe(true);
  });

  test("falls back to original media in standard mode and reports gaps", () => {
    const target = createLoadTarget();
    const gapComposition = resolveTimelinePreviewCompositionForQuality(
      target,
      4_500_000,
      {
        selectedClipId: null,
        selectedTrackId: null
      },
      "standard"
    );
    const secondComposition = resolveTimelinePreviewCompositionForQuality(
      target,
      5_500_000,
      {
        selectedClipId: null,
        selectedTrackId: null
      },
      "standard"
    );

    expect(gapComposition.sourceMode).toBe("gap");
    expect(gapComposition.activeVideoClip).toBeNull();
    expect(secondComposition.sourceMode).toBe("original");
    expect(secondComposition.activeVideoClip?.clipId).toBe("clip-2");
    expect(secondComposition.videoSource?.sourceMode).toBe("original");
  });

  test("maps trimmed clip preview positions back to source time", () => {
    const target = createLoadTarget();
    const clip = target.timeline.clipsById["clip-1"];

    expect(mapTimelineClipToMediaSeconds(clip, 0)).toBe(1);
    expect(mapTimelineClipToMediaSeconds(clip, 2_000_000)).toBe(3);
  });

  test("derives frame step from the active video frame rate", () => {
    const target = createLoadTarget();
    const frameStepUs = resolveFrameStepUs(target, 2_000_000, {
      selectedClipId: "clip-1",
      selectedTrackId: "track-video"
    });

    expect(frameStepUs).toBe(40_000);
  });
});
