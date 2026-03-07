import { resolveActiveCaptionOverlays } from "./captions";
import type { MediaItem } from "./media";
import {
  createDefaultPreviewOverlayModel,
  type PreviewLoadTarget,
  type PreviewOverlayModel,
  type PreviewQualityMode,
  type PreviewSelectionState,
  type PreviewSourceMode,
  type PreviewSourceSelection,
  type PreviewTrackClipSummary,
  type TimelinePreviewComposition
} from "./preview";
import {
  getTimelineClipEndUs,
  getTimelineEndUs,
  getTrackClips,
  type Timeline,
  type TimelineClip,
  type TimelineTrack
} from "./timeline";
import { createTimelineMediaMap } from "./timeline-engine";

const DEFAULT_FRAME_RATE = 30;
const ACTIVE_MARKER_TOLERANCE_US = 50_000;

function normalizePath(input: string): string {
  return input.replace(/\\/gu, "/");
}

function toFileUrl(absolutePath: string): string {
  return encodeURI(`file://${normalizePath(absolutePath)}`);
}

function resolveCacheAbsolutePath(cacheRoot: string, relativePath: string): string {
  return normalizePath(`${cacheRoot}/${relativePath}`.replace(/\/+/gu, "/"));
}

function isClipActiveAtTime(clip: TimelineClip, playheadUs: number): boolean {
  return clip.enabled && clip.timelineStartUs <= playheadUs && playheadUs < getTimelineClipEndUs(clip);
}

function buildClipSummary(
  clip: TimelineClip,
  track: TimelineTrack,
  mediaItem: MediaItem
): PreviewTrackClipSummary {
  return {
    clipId: clip.id,
    mediaItemId: clip.mediaItemId,
    trackId: track.id,
    trackName: track.name,
    streamType: clip.streamType,
    displayName: mediaItem.displayName,
    timelineStartUs: clip.timelineStartUs,
    timelineEndUs: getTimelineClipEndUs(clip),
    sourceInUs: clip.sourceInUs,
    sourceOutUs: clip.sourceOutUs,
    frameRate: mediaItem.metadataSummary.frameRate
  };
}

function mapTimelineTimeToSourceUs(clip: TimelineClip, playheadUs: number): number {
  const clipOffsetUs = Math.max(0, playheadUs - clip.timelineStartUs);
  return clip.sourceInUs + Math.round(clipOffsetUs * clip.speed);
}

function resolveTrackActivity(
  timeline: Timeline,
  mediaItemsById: Record<string, MediaItem>,
  playheadUs: number,
  kind: TimelineTrack["kind"]
): {
  clip: TimelineClip | null;
  track: TimelineTrack | null;
  mediaItem: MediaItem | null;
} {
  const orderedTrackIds = [...timeline.trackOrder].reverse();

  for (const trackId of orderedTrackIds) {
    const track = timeline.tracksById[trackId];

    if (!track || track.kind !== kind) {
      continue;
    }

    if (kind === "video" && !track.visible) {
      continue;
    }

    if (kind === "audio" && track.muted) {
      continue;
    }

    for (const clip of getTrackClips(timeline, track.id)) {
      if (!isClipActiveAtTime(clip, playheadUs)) {
        continue;
      }

      const mediaItem = mediaItemsById[clip.mediaItemId];

      if (!mediaItem) {
        continue;
      }

      return {
        clip,
        track,
        mediaItem
      };
    }
  }

  return {
    clip: null,
    track: null,
    mediaItem: null
  };
}

function canUseProxyForPurpose(mediaItem: MediaItem, purpose: "video" | "audio"): boolean {
  const proxy = mediaItem.derivedAssets.proxy;

  if (!proxy || proxy.status !== "ready") {
    return false;
  }

  if (purpose === "video") {
    return proxy.videoCodec !== null;
  }

  return proxy.audioCodec !== null;
}

function resolveSourceSelection(
  mediaItem: MediaItem,
  cacheRoot: string,
  qualityMode: PreviewQualityMode,
  purpose: "video" | "audio"
): {
  selection: Omit<PreviewSourceSelection, "clipId" | "timelineStartUs" | "timelineEndUs" | "sourceStartUs" | "sourceEndUs" | "frameRate"> | null;
  warning: string | null;
} {
  const originalPath = mediaItem.source.currentResolvedPath;
  const proxyAsset = mediaItem.derivedAssets.proxy;
  const proxyUsable = canUseProxyForPurpose(mediaItem, purpose);

  if (qualityMode === "fast") {
    if (proxyUsable && proxyAsset) {
      const absolutePath = resolveCacheAbsolutePath(cacheRoot, proxyAsset.relativePath);

      return {
        selection: {
          mediaItemId: mediaItem.id,
          sourceMode: "proxy",
          absolutePath,
          fileUrl: toFileUrl(absolutePath),
          displayName: `${mediaItem.displayName} (proxy)`,
          warning: null
        },
        warning: null
      };
    }

    if (originalPath) {
      return {
        selection: {
          mediaItemId: mediaItem.id,
          sourceMode: "original",
          absolutePath: normalizePath(originalPath),
          fileUrl: toFileUrl(originalPath),
          displayName: mediaItem.displayName,
          warning: "Proxy unavailable. Preview is using original media."
        },
        warning: "Proxy unavailable. Preview is using original media."
      };
    }
  }

  if (qualityMode === "standard") {
    if (originalPath) {
      return {
        selection: {
          mediaItemId: mediaItem.id,
          sourceMode: "original",
          absolutePath: normalizePath(originalPath),
          fileUrl: toFileUrl(originalPath),
          displayName: mediaItem.displayName,
          warning: null
        },
        warning: null
      };
    }

    if (proxyUsable && proxyAsset) {
      const absolutePath = resolveCacheAbsolutePath(cacheRoot, proxyAsset.relativePath);

      return {
        selection: {
          mediaItemId: mediaItem.id,
          sourceMode: "proxy",
          absolutePath,
          fileUrl: toFileUrl(absolutePath),
          displayName: `${mediaItem.displayName} (proxy fallback)`,
          warning: "Original media is unavailable. Preview is using the proxy fallback."
        },
        warning: "Original media is unavailable. Preview is using the proxy fallback."
      };
    }
  }

  if (qualityMode === "accurate" && originalPath) {
    return {
      selection: {
        mediaItemId: mediaItem.id,
        sourceMode: "original",
        absolutePath: normalizePath(originalPath),
        fileUrl: toFileUrl(originalPath),
        displayName: mediaItem.displayName,
        warning: null
      },
      warning: null
    };
  }

  return {
    selection: null,
    warning:
      qualityMode === "accurate"
        ? "Accurate preview requires original media."
        : "No preview source is currently available."
  };
}

function withClipTiming(
  selection: Omit<
    PreviewSourceSelection,
    "clipId" | "timelineStartUs" | "timelineEndUs" | "sourceStartUs" | "sourceEndUs" | "frameRate"
  > | null,
  clip: TimelineClip,
  mediaItem: MediaItem
): PreviewSourceSelection | null {
  if (!selection) {
    return null;
  }

  return {
    ...selection,
    clipId: clip.id,
    timelineStartUs: clip.timelineStartUs,
    timelineEndUs: getTimelineClipEndUs(clip),
    sourceStartUs: clip.sourceInUs,
    sourceEndUs: clip.sourceOutUs,
    frameRate: mediaItem.metadataSummary.frameRate
  };
}

function resolvePreviewSourceMode(
  videoSource: PreviewSourceSelection | null,
  audioSource: PreviewSourceSelection | null,
  hasActiveClip: boolean
): PreviewSourceMode {
  if (!hasActiveClip) {
    return "gap";
  }

  const sourceModes = [videoSource?.sourceMode, audioSource?.sourceMode].filter(
    (entry): entry is "proxy" | "original" => entry === "proxy" || entry === "original"
  );

  if (sourceModes.length === 0) {
    return "unavailable";
  }

  if (sourceModes.every((mode) => mode === "proxy")) {
    return "proxy";
  }

  if (sourceModes.every((mode) => mode === "original")) {
    return "original";
  }

  return "mixed";
}

function buildOverlayModel(
  target: PreviewLoadTarget,
  selection: PreviewSelectionState,
  playheadUs: number
): PreviewOverlayModel {
  const overlayModel = createDefaultPreviewOverlayModel(
    target.timeline.markers,
    target.timeline.regions
  );

  overlayModel.markers = overlayModel.markers.map((marker) => ({
    ...marker,
    active: Math.abs(marker.positionUs - playheadUs) <= ACTIVE_MARKER_TOLERANCE_US
  }));
  overlayModel.regions = overlayModel.regions.map((region) => ({
    ...region,
    active: region.startUs <= playheadUs && playheadUs <= region.endUs
  }));
  overlayModel.captions = resolveActiveCaptionOverlays(
    target.captionTracks,
    target.captionTemplates,
    playheadUs
  );

  if (selection.selectedClipId) {
    overlayModel.selection = {
      type: "selection",
      clipId: selection.selectedClipId,
      label: "Selected clip",
      active: true
    };
    overlayModel.transformGuides = [
      {
        type: "transform-guide",
        clipId: selection.selectedClipId,
        opacity: 1
      }
    ];
  }

  return overlayModel;
}

export function clampPreviewPlayheadUs(
  target: PreviewLoadTarget,
  playheadUs: number
): number {
  return Math.max(0, Math.min(Math.round(playheadUs), getTimelineEndUs(target.timeline)));
}

export function resolveFrameStepUs(
  target: PreviewLoadTarget,
  playheadUs: number,
  selection: PreviewSelectionState
): number {
  const composition = resolveTimelinePreviewComposition(target, playheadUs, selection);
  const activeFrameRate =
    composition.activeVideoClip?.frameRate ??
    (() => {
      if (!selection.selectedClipId) {
        return null;
      }

      const selectedClip = target.timeline.clipsById[selection.selectedClipId];

      if (!selectedClip) {
        return null;
      }

      return (
        target.libraryItems.find((item) => item.id === selectedClip.mediaItemId)?.metadataSummary
          .frameRate ?? null
      );
    })() ??
    DEFAULT_FRAME_RATE;

  return Math.max(1, Math.round(1_000_000 / Math.max(1, activeFrameRate)));
}

export function createPreviewLoadSignature(target: PreviewLoadTarget): string {
  return JSON.stringify({
    directory: target.directory,
    cacheRoot: target.cacheRoot,
    defaultQualityMode: target.defaultQualityMode,
    timeline: target.timeline,
    libraryItems: target.libraryItems.map((item) => ({
      id: item.id,
      path: item.source.currentResolvedPath,
      revision: item.sourceRevision,
      durationMs: item.metadataSummary.durationMs,
      frameRate: item.metadataSummary.frameRate,
      relinkStatus: item.relinkStatus,
      ingestStatus: item.ingestStatus,
      proxy: item.derivedAssets.proxy
        ? {
            status: item.derivedAssets.proxy.status,
            relativePath: item.derivedAssets.proxy.relativePath,
            audioCodec: item.derivedAssets.proxy.audioCodec,
            videoCodec: item.derivedAssets.proxy.videoCodec
          }
        : null
    })),
    captionTracks: target.captionTracks,
    captionTemplates: target.captionTemplates
  });
}

export function resolveTimelinePreviewComposition(
  target: PreviewLoadTarget,
  playheadUs: number,
  selection: PreviewSelectionState
): TimelinePreviewComposition {
  const clampedPlayheadUs = clampPreviewPlayheadUs(target, playheadUs);
  const mediaItemsById = createTimelineMediaMap(target.libraryItems);
  const videoActivity = resolveTrackActivity(
    target.timeline,
    mediaItemsById,
    clampedPlayheadUs,
    "video"
  );
  const audioActivity = resolveTrackActivity(
    target.timeline,
    mediaItemsById,
    clampedPlayheadUs,
    "audio"
  );
  const activeVideoClip =
    videoActivity.clip && videoActivity.track && videoActivity.mediaItem
      ? buildClipSummary(videoActivity.clip, videoActivity.track, videoActivity.mediaItem)
      : null;
  const activeAudioClip =
    audioActivity.clip && audioActivity.track && audioActivity.mediaItem
      ? buildClipSummary(audioActivity.clip, audioActivity.track, audioActivity.mediaItem)
      : null;
  const videoSourceResolution =
    videoActivity.clip && videoActivity.mediaItem
      ? resolveSourceSelection(
          videoActivity.mediaItem,
          target.cacheRoot,
          target.defaultQualityMode,
          "video"
        )
      : {
          selection: null,
          warning: null
        };
  const audioSourceResolution =
    audioActivity.clip && audioActivity.mediaItem
      ? resolveSourceSelection(
          audioActivity.mediaItem,
          target.cacheRoot,
          target.defaultQualityMode,
          "audio"
        )
      : {
          selection: null,
          warning: null
        };
  const videoSource =
    videoActivity.clip && videoActivity.mediaItem
      ? withClipTiming(videoSourceResolution.selection, videoActivity.clip, videoActivity.mediaItem)
      : null;
  const audioSource =
    audioActivity.clip && audioActivity.mediaItem
      ? withClipTiming(audioSourceResolution.selection, audioActivity.clip, audioActivity.mediaItem)
      : null;
  const warnings = [videoSourceResolution.warning, audioSourceResolution.warning].filter(
    (value): value is string => Boolean(value)
  );
  const hasActiveClip = activeVideoClip !== null || activeAudioClip !== null;

  return {
    timelineId: target.timeline.id,
    playheadUs: clampedPlayheadUs,
    qualityMode: target.defaultQualityMode,
    sourceMode: resolvePreviewSourceMode(videoSource, audioSource, hasActiveClip),
    activeVideoClip,
    activeAudioClip,
    videoSource,
    audioSource,
    overlays: buildOverlayModel(target, selection, clampedPlayheadUs),
    warning: warnings.length > 0 ? warnings.join(" ") : null
  };
}

export function resolveTimelinePreviewCompositionForQuality(
  target: PreviewLoadTarget,
  playheadUs: number,
  selection: PreviewSelectionState,
  qualityMode: PreviewQualityMode
): TimelinePreviewComposition {
  if (target.defaultQualityMode === qualityMode) {
    return resolveTimelinePreviewComposition(target, playheadUs, selection);
  }

  return resolveTimelinePreviewComposition(
    {
      ...target,
      defaultQualityMode: qualityMode
    },
    playheadUs,
    selection
  );
}

export function mapPlaybackClockToTimelineUs(
  clip: TimelineClip,
  mediaTimeSeconds: number
): number {
  const mediaTimeUs = Math.round(mediaTimeSeconds * 1_000_000);
  return clip.timelineStartUs + Math.round((mediaTimeUs - clip.sourceInUs) / clip.speed);
}

export function mapTimelineClipToMediaSeconds(
  clip: TimelineClip,
  playheadUs: number
): number {
  return mapTimelineTimeToSourceUs(clip, playheadUs) / 1_000_000;
}

export function buildTimelineClipSequenceKey(
  composition: TimelinePreviewComposition
): string {
  return [
    composition.timelineId,
    composition.activeVideoClip?.clipId ?? "none",
    composition.videoSource?.fileUrl ?? "video:none",
    composition.activeAudioClip?.clipId ?? "none",
    composition.audioSource?.fileUrl ?? "audio:none",
    composition.sourceMode
  ].join(":");
}

export function getTimelineGapState(
  target: PreviewLoadTarget,
  playheadUs: number
): {
  playheadUs: number;
  timelineEndUs: number;
  hasGap: boolean;
} {
  const timelineEndUs = getTimelineEndUs(target.timeline);

  return {
    playheadUs: clampPreviewPlayheadUs(target, playheadUs),
    timelineEndUs,
    hasGap:
      playheadUs < timelineEndUs &&
      resolveTimelinePreviewComposition(target, playheadUs, {
        selectedClipId: null,
        selectedTrackId: null
      }).sourceMode === "gap"
  };
}
