import { describe, expect, test } from "vitest";

import {
  compileFfmpegExecutionSpec,
  compileRenderPlan,
  createEmptyDerivedAssetSet,
  createEmptyMetadataSummary,
  createEmptyTimeline,
  createTimelineClip,
  createTimelineTrack,
  type MediaItem,
  type Timeline
} from "../src/index";

function createMediaItem(
  id: string,
  input: {
    path: string;
    durationMs: number;
    hasVideo: boolean;
    hasAudio: boolean;
  }
): MediaItem {
  return {
    id,
    displayName: id,
    source: {
      sourceType: "import",
      originalPath: input.path,
      currentResolvedPath: input.path,
      normalizedOriginalPath: input.path,
      normalizedResolvedPath: input.path
    },
    importTimestamp: new Date().toISOString(),
    lastSeenTimestamp: new Date().toISOString(),
    fileSize: 10,
    fileModifiedTimeMs: 10,
    fingerprint: {
      strategy: "partial-sha256",
      quickHash: `${id}-hash`,
      fileSize: 10,
      modifiedTimeMs: 10,
      sampleSizeBytes: 10
    },
    sourceRevision: `${id}-rev`,
    metadataSummary: {
      ...createEmptyMetadataSummary(),
      kind: input.hasVideo ? "video" : "audio",
      durationMs: input.durationMs,
      hasVideo: input.hasVideo,
      hasAudio: input.hasAudio,
      container: input.hasVideo ? "mp4" : "wav",
      streamSignature: `${id}-signature`
    },
    streams: [],
    ingestStatus: "ready",
    relinkStatus: "linked",
    errorState: null,
    derivedAssets: createEmptyDerivedAssetSet()
  };
}

function createTimelineFixture(): {
  timeline: Timeline;
  mediaItemsById: Record<string, MediaItem>;
  topClipId: string;
} {
  const timeline = createEmptyTimeline("timeline-1");
  const videoTrack = createTimelineTrack("video", "V1", "track-video-1");
  const audioTrack = createTimelineTrack("audio", "A1", "track-audio-1");
  const overlayTrack = createTimelineTrack("video", "V2", "track-video-2");

  timeline.trackOrder = [videoTrack.id, audioTrack.id, overlayTrack.id];
  timeline.tracksById = {
    [videoTrack.id]: videoTrack,
    [audioTrack.id]: audioTrack,
    [overlayTrack.id]: overlayTrack
  };

  const baseClip = createTimelineClip({
    id: "clip-video-base",
    trackId: videoTrack.id,
    mediaItemId: "media-a",
    streamType: "video",
    sourceInUs: 0,
    sourceOutUs: 2_000_000,
    timelineStartUs: 0
  });
  const overlayClip = createTimelineClip({
    id: "clip-video-top",
    trackId: overlayTrack.id,
    mediaItemId: "media-b",
    streamType: "video",
    sourceInUs: 0,
    sourceOutUs: 2_000_000,
    timelineStartUs: 0
  });
  const audioClip = createTimelineClip({
    id: "clip-audio-a",
    trackId: audioTrack.id,
    mediaItemId: "media-a",
    streamType: "audio",
    sourceInUs: 0,
    sourceOutUs: 2_000_000,
    timelineStartUs: 0
  });
  const trailingVideo = createTimelineClip({
    id: "clip-video-tail",
    trackId: videoTrack.id,
    mediaItemId: "media-a",
    streamType: "video",
    sourceInUs: 0,
    sourceOutUs: 2_000_000,
    timelineStartUs: 3_000_000
  });
  const trailingAudio = createTimelineClip({
    id: "clip-audio-tail",
    trackId: audioTrack.id,
    mediaItemId: "media-a",
    streamType: "audio",
    sourceInUs: 0,
    sourceOutUs: 2_000_000,
    timelineStartUs: 3_000_000
  });

  timeline.clipsById = {
    [baseClip.id]: baseClip,
    [overlayClip.id]: overlayClip,
    [audioClip.id]: audioClip,
    [trailingVideo.id]: trailingVideo,
    [trailingAudio.id]: trailingAudio
  };
  timeline.tracksById[videoTrack.id].clipIds = [baseClip.id, trailingVideo.id];
  timeline.tracksById[audioTrack.id].clipIds = [audioClip.id, trailingAudio.id];
  timeline.tracksById[overlayTrack.id].clipIds = [overlayClip.id];

  return {
    timeline,
    mediaItemsById: {
      "media-a": createMediaItem("media-a", {
        path: "/tmp/media-a.mp4",
        durationMs: 2_500,
        hasVideo: true,
        hasAudio: true
      }),
      "media-b": createMediaItem("media-b", {
        path: "/tmp/media-b.mp4",
        durationMs: 2_500,
        hasVideo: true,
        hasAudio: false
      })
    },
    topClipId: overlayClip.id
  };
}

describe("render compiler", () => {
  test("builds render spans with topmost video resolution, gaps, and silent audio padding", () => {
    const fixture = createTimelineFixture();

    const planResult = compileRenderPlan(
      fixture.timeline,
      fixture.mediaItemsById,
      "video-master-1080p",
      {
        timelineId: fixture.timeline.id,
        presetId: "video-master-1080p"
      }
    );

    expect(planResult.ok).toBe(true);

    if (!planResult.ok) {
      return;
    }

    expect(planResult.renderPlan.spans).toHaveLength(3);
    expect(planResult.renderPlan.spans[0]?.video?.clipId).toBe(fixture.topClipId);
    expect(planResult.renderPlan.spans[1]?.video).toBeNull();
    expect(planResult.renderPlan.spans[1]?.audio).toEqual([]);
    expect(planResult.renderPlan.hasAudioOutput).toBe(true);

    const ffmpegSpecResult = compileFfmpegExecutionSpec(planResult.renderPlan, "export-1");

    expect(ffmpegSpecResult.ok).toBe(true);

    if (!ffmpegSpecResult.ok) {
      return;
    }

    expect(ffmpegSpecResult.ffmpegSpec.segmentSpecs[1]?.videoSource?.kind).toBe("gap");
    expect(ffmpegSpecResult.ffmpegSpec.segmentSpecs[1]?.audioSources[0]?.kind).toBe("silence");
  });

  test("rejects audio export when no active audio content exists", () => {
    const timeline = createEmptyTimeline("timeline-audio-empty");
    const videoTrack = createTimelineTrack("video", "V1", "track-video");
    timeline.trackOrder = [videoTrack.id];
    timeline.tracksById[videoTrack.id] = videoTrack;
    const clip = createTimelineClip({
      id: "clip-video-only",
      trackId: videoTrack.id,
      mediaItemId: "media-video",
      streamType: "video",
      sourceInUs: 0,
      sourceOutUs: 1_000_000,
      timelineStartUs: 0
    });
    timeline.clipsById[clip.id] = clip;
    timeline.tracksById[videoTrack.id].clipIds = [clip.id];

    const result = compileRenderPlan(
      timeline,
      {
        "media-video": createMediaItem("media-video", {
          path: "/tmp/video.mp4",
          durationMs: 1_000,
          hasVideo: true,
          hasAudio: false
        })
      },
      "audio-podcast-aac",
      {
        timelineId: timeline.id,
        presetId: "audio-podcast-aac"
      }
    );

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error.code).toBe("NO_AUDIO_CONTENT");
    }
  });

  test("fails fast on unsupported transforms", () => {
    const fixture = createTimelineFixture();
    fixture.timeline.clipsById["clip-video-base"] = {
      ...fixture.timeline.clipsById["clip-video-base"]!,
      transform: {
        ...fixture.timeline.clipsById["clip-video-base"]!.transform,
        scaleX: 1.25
      }
    };

    const result = compileRenderPlan(
      fixture.timeline,
      fixture.mediaItemsById,
      "video-master-1080p",
      {
        timelineId: fixture.timeline.id,
        presetId: "video-master-1080p"
      }
    );

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error.code).toBe("UNSUPPORTED_FEATURE");
    }
  });

  test("compiles a custom export range against the intersecting spans only", () => {
    const fixture = createTimelineFixture();

    const result = compileRenderPlan(
      fixture.timeline,
      fixture.mediaItemsById,
      "video-share-720p",
      {
        timelineId: fixture.timeline.id,
        presetId: "video-share-720p",
        target: {
          kind: "range",
          startUs: 500_000,
          endUs: 1_500_000,
          label: "Middle beat"
        }
      }
    );

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.request.target.kind).toBe("range");
    expect(result.renderPlan.rangeStartUs).toBe(500_000);
    expect(result.renderPlan.rangeEndUs).toBe(1_500_000);
    expect(result.renderPlan.durationUs).toBe(1_000_000);
    expect(result.renderPlan.spans).toHaveLength(1);
    expect(result.renderPlan.spans[0]?.video?.clipId).toBe(fixture.topClipId);
  });

  test("resolves a region target into a bounded render plan", () => {
    const fixture = createTimelineFixture();
    fixture.timeline.regions.push({
      id: "region-hook",
      startUs: 3_000_000,
      endUs: 4_000_000,
      label: "Hook"
    });

    const result = compileRenderPlan(
      fixture.timeline,
      fixture.mediaItemsById,
      "video-share-720p",
      {
        timelineId: fixture.timeline.id,
        presetId: "video-share-720p",
        target: {
          kind: "region",
          regionId: "region-hook"
        }
      }
    );

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.request.target.kind).toBe("region");
    expect(result.request.target.label).toBe("Hook");
    expect(result.renderPlan.durationUs).toBe(1_000_000);
    expect(result.renderPlan.spans[0]?.video?.clipId).toBe("clip-video-tail");
  });

  test("preserves caption burn-in hooks in the render plan", () => {
    const fixture = createTimelineFixture();

    const result = compileRenderPlan(
      fixture.timeline,
      fixture.mediaItemsById,
      "video-share-720p",
      {
        timelineId: fixture.timeline.id,
        presetId: "video-share-720p",
        captionBurnIn: {
          enabled: true,
          captionTrackId: "caption-track-1",
          subtitleFormat: "ass"
        }
      }
    );

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.renderPlan.captionBurnIn).toMatchObject({
      captionTrackId: "caption-track-1",
      subtitleFormat: "ass",
      subtitleArtifactPath: null,
      templateIds: []
    });
  });

  test("preserves brand packaging hooks in the normalized export request and render plan", () => {
    const fixture = createTimelineFixture();

    const result = compileRenderPlan(
      fixture.timeline,
      fixture.mediaItemsById,
      "video-share-720p",
      {
        timelineId: fixture.timeline.id,
        presetId: "video-share-720p",
        brandPackaging: {
          introAsset: {
            absolutePath: "/tmp/intro.mp4",
            label: "Intro"
          },
          outroAsset: {
            absolutePath: "/tmp/outro.mp4",
            label: "Outro"
          },
          watermarkAsset: {
            absolutePath: "/tmp/watermark.png",
            label: "Logo",
            position: "top-right",
            marginPx: 32,
            opacity: 0.8
          }
        }
      }
    );

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.request.brandPackaging).toMatchObject({
      introAsset: {
        absolutePath: "/tmp/intro.mp4",
        label: "Intro"
      },
      outroAsset: {
        absolutePath: "/tmp/outro.mp4",
        label: "Outro"
      },
      watermarkAsset: {
        absolutePath: "/tmp/watermark.png",
        label: "Logo",
        position: "top-right",
        marginPx: 32,
        opacity: 0.8
      }
    });
    expect(result.renderPlan.brandPackaging).toEqual(result.request.brandPackaging);
  });
});
