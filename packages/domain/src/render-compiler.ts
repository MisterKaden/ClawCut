import type { MediaItem } from "./media";
import {
  DEFAULT_EXPORT_PRESET_ID,
  resolveExportPreset,
  type ExportBrandPackaging,
  type ExportCommandError,
  type ExportMode,
  type ExportPreset,
  type ExportRequest,
  type ExportRequestInput,
  type ExportTarget,
  type FfmpegExecutionSpec,
  type FfmpegSegmentAudioSource,
  type FfmpegSegmentSpec,
  type FfmpegSegmentVideoSource,
  type RenderAudioContribution,
  type RenderPlan,
  type RenderTimelineSpan,
  type RenderVideoContribution
} from "./render";
import {
  getTimelineClipEndUs,
  getTimelineEndUs,
  type Timeline,
  type TimelineClip,
  type TimelineTrack
} from "./timeline";

const DEFAULT_GAP_BEHAVIOR = {
  video: "black",
  audio: "silence"
} as const;

function normalizeBrandPackaging(
  input: ExportRequestInput["brandPackaging"]
): ExportBrandPackaging {
  return {
    introAsset: input?.introAsset
      ? {
          absolutePath: input.introAsset.absolutePath,
          label: input.introAsset.label ?? null
        }
      : null,
    outroAsset: input?.outroAsset
      ? {
          absolutePath: input.outroAsset.absolutePath,
          label: input.outroAsset.label ?? null
        }
      : null,
    watermarkAsset: input?.watermarkAsset
      ? {
          absolutePath: input.watermarkAsset.absolutePath,
          label: input.watermarkAsset.label ?? null,
          position: input.watermarkAsset.position,
          marginPx: input.watermarkAsset.marginPx,
          opacity: input.watermarkAsset.opacity
        }
      : null
  };
}

interface TimelineTrackWithIndex {
  track: TimelineTrack;
  orderIndex: number;
}

export interface ExportCompilationFailure {
  ok: false;
  error: ExportCommandError;
}

export interface ExportRequestSuccess {
  ok: true;
  request: ExportRequest;
  preset: ExportPreset;
}

export interface RenderPlanSuccess {
  ok: true;
  request: ExportRequest;
  preset: ExportPreset;
  renderPlan: RenderPlan;
}

export interface FfmpegSpecSuccess {
  ok: true;
  ffmpegSpec: FfmpegExecutionSpec;
}

export type ExportRequestResult = ExportRequestSuccess | ExportCompilationFailure;
export type RenderPlanCompilationResult = RenderPlanSuccess | ExportCompilationFailure;
export type FfmpegSpecCompilationResult = FfmpegSpecSuccess | ExportCompilationFailure;

function fail(
  code: ExportCommandError["code"],
  message: string,
  details?: string
): ExportCompilationFailure {
  return {
    ok: false,
    error: {
      code,
      message,
      details
    }
  };
}

function isIdentityTransform(clip: TimelineClip): boolean {
  return (
    clip.transform.positionX === 0 &&
    clip.transform.positionY === 0 &&
    clip.transform.scaleX === 1 &&
    clip.transform.scaleY === 1 &&
    clip.transform.rotationDeg === 0 &&
    clip.transform.opacity === 1
  );
}

function createTrackIndexMap(timeline: Timeline): Map<string, TimelineTrackWithIndex> {
  const result = new Map<string, TimelineTrackWithIndex>();

  timeline.trackOrder.forEach((trackId, index) => {
    const track = timeline.tracksById[trackId];

    if (track) {
      result.set(trackId, {
        track,
        orderIndex: index
      });
    }
  });

  return result;
}

function ensureClipSupported(clip: TimelineClip): ExportCompilationFailure | null {
  if (clip.speed !== 1) {
    return fail(
      "UNSUPPORTED_FEATURE",
      "Stage 5 export does not yet support clip speed changes.",
      `Clip ${clip.id} has speed ${clip.speed}.`
    );
  }

  if (!isIdentityTransform(clip)) {
    return fail(
      "UNSUPPORTED_FEATURE",
      "Stage 5 export only supports identity clip transforms.",
      `Clip ${clip.id} has non-default transform or opacity.`
    );
  }

  return null;
}

function resolveRequestMode(
  preset: ExportPreset,
  requestedMode: ExportMode | undefined
): ExportMode | null {
  if (!requestedMode) {
    return preset.mode;
  }

  if (requestedMode === "frame") {
    return "frame";
  }

  return preset.mode === requestedMode ? requestedMode : null;
}

function createTimelineTarget(timeline: Timeline): ExportTarget {
  return {
    kind: "timeline",
    startUs: 0,
    endUs: getTimelineEndUs(timeline),
    label: "Full timeline"
  };
}

function resolveExportTarget(
  timeline: Timeline,
  input: ExportRequestInput["target"]
): ExportRequestSuccess | ExportCompilationFailure {
  const timelineEndUs = getTimelineEndUs(timeline);
  const timelineTarget = createTimelineTarget(timeline);

  if (!input || input.kind === "timeline") {
    return {
      ok: true,
      request: {
        timelineId: timeline.id,
        exportMode: "video",
        presetId: DEFAULT_EXPORT_PRESET_ID,
        outputPath: null,
        overwritePolicy: "increment",
        brandPackaging: normalizeBrandPackaging(null),
        captionBurnIn: {
          enabled: false,
          captionTrackId: null,
          subtitleFormat: "ass"
        },
        target: timelineTarget
      },
      preset: resolveExportPreset(DEFAULT_EXPORT_PRESET_ID)!
    };
  }

  if (input.kind === "region") {
    const region = timeline.regions.find((entry) => entry.id === input.regionId);

    if (!region) {
      return fail(
        "REGION_NOT_FOUND",
        `Timeline region ${input.regionId} could not be found for export.`
      );
    }

    if (region.endUs <= region.startUs) {
      return fail(
        "INVALID_EXPORT_RANGE",
        `Timeline region ${region.id} does not define a valid export range.`
      );
    }

    return {
      ok: true,
      request: {
        timelineId: timeline.id,
        exportMode: "video",
        presetId: DEFAULT_EXPORT_PRESET_ID,
        outputPath: null,
        overwritePolicy: "increment",
        brandPackaging: normalizeBrandPackaging(null),
        captionBurnIn: {
          enabled: false,
          captionTrackId: null,
          subtitleFormat: "ass"
        },
        target: {
          kind: "region",
          regionId: region.id,
          startUs: region.startUs,
          endUs: Math.min(region.endUs, timelineEndUs),
          label: region.label || "Timeline region"
        }
      },
      preset: resolveExportPreset(DEFAULT_EXPORT_PRESET_ID)!
    };
  }

  const startUs = Math.round(input.startUs);
  const endUs = Math.round(input.endUs);

  if (!Number.isFinite(startUs) || !Number.isFinite(endUs)) {
    return fail("INVALID_EXPORT_RANGE", "Export range start and end must be valid numbers.");
  }

  if (startUs < 0 || endUs <= startUs) {
    return fail("INVALID_EXPORT_RANGE", "Export range must be positive and non-empty.");
  }

  if (startUs > timelineEndUs || endUs > timelineEndUs) {
    return fail(
      "INVALID_EXPORT_RANGE",
      `Export range ${startUs}-${endUs} falls outside the current timeline.`
    );
  }

  return {
    ok: true,
      request: {
        timelineId: timeline.id,
        exportMode: "video",
        presetId: DEFAULT_EXPORT_PRESET_ID,
        outputPath: null,
        overwritePolicy: "increment",
        brandPackaging: normalizeBrandPackaging(null),
        captionBurnIn: {
          enabled: false,
          captionTrackId: null,
          subtitleFormat: "ass"
        },
        target: {
        kind: "range",
        startUs,
        endUs,
        label: input.label?.trim() || "Custom range"
      }
    },
    preset: resolveExportPreset(DEFAULT_EXPORT_PRESET_ID)!
  };
}

export function createExportRequest(
  timeline: Timeline,
  defaultPresetId: string | undefined,
  input: ExportRequestInput
): ExportRequestResult {
  if (input.timelineId !== timeline.id) {
    return fail(
      "TIMELINE_NOT_FOUND",
      `Timeline ${input.timelineId} could not be found for export.`
    );
  }

  const presetId = (input.presetId ?? defaultPresetId ?? DEFAULT_EXPORT_PRESET_ID) as
    | typeof DEFAULT_EXPORT_PRESET_ID
    | undefined;
  const preset = presetId ? resolveExportPreset(presetId) : null;

  if (!preset) {
    return fail("INVALID_PRESET", `Export preset ${input.presetId ?? presetId ?? "unknown"} is not available.`);
  }

  const exportMode = resolveRequestMode(preset, input.exportMode);

  if (!exportMode) {
    return fail(
      "INVALID_EXPORT_MODE",
      `Preset ${preset.id} cannot be used for ${input.exportMode ?? "the requested"} export mode.`
    );
  }

  if (exportMode === "frame") {
    return fail(
      "UNSUPPORTED_EXPORT_MODE",
      "Frame export is reserved but not implemented in Stage 5."
    );
  }

  const targetResult = resolveExportTarget(timeline, input.target);

  if (!targetResult.ok) {
    return targetResult;
  }

  return {
    ok: true,
    preset,
    request: {
      timelineId: timeline.id,
      exportMode,
      presetId: preset.id,
      outputPath: input.outputPath ?? null,
      overwritePolicy: input.overwritePolicy ?? "increment",
      brandPackaging: normalizeBrandPackaging(input.brandPackaging),
      captionBurnIn: {
        enabled: input.captionBurnIn?.enabled ?? false,
        captionTrackId: input.captionBurnIn?.captionTrackId ?? null,
        subtitleFormat: input.captionBurnIn?.subtitleFormat ?? "ass"
      },
      target: targetResult.request.target
    }
  };
}

function buildSpanBoundaries(
  timeline: Timeline,
  rangeStartUs: number,
  rangeEndUs: number
): number[] {
  const boundaries = new Set<number>([rangeStartUs, rangeEndUs]);

  for (const clip of Object.values(timeline.clipsById)) {
    if (!clip.enabled) {
      continue;
    }

    const clipStartUs = clip.timelineStartUs;
    const clipEndUs = getTimelineClipEndUs(clip);

    if (clipEndUs <= rangeStartUs || clipStartUs >= rangeEndUs) {
      continue;
    }

    boundaries.add(Math.max(rangeStartUs, clipStartUs));
    boundaries.add(Math.min(rangeEndUs, clipEndUs));
  }

  return [...boundaries.values()]
    .filter((value) => value >= rangeStartUs && value <= rangeEndUs)
    .sort((left, right) => left - right);
}

function isClipActiveForSpan(clip: TimelineClip, spanStartUs: number, spanEndUs: number): boolean {
  return clip.timelineStartUs < spanEndUs && getTimelineClipEndUs(clip) > spanStartUs;
}

function resolveVideoContribution(
  spanStartUs: number,
  spanEndUs: number,
  clips: TimelineClip[],
  trackIndexMap: Map<string, TimelineTrackWithIndex>,
  mediaItemsById: Record<string, MediaItem>
): RenderVideoContribution | null {
  const activeVideoClips = clips.filter((clip) => {
    const trackInfo = trackIndexMap.get(clip.trackId);
    const mediaItem = mediaItemsById[clip.mediaItemId];

    return Boolean(
      trackInfo &&
        trackInfo.track.kind === "video" &&
        trackInfo.track.visible &&
        isClipActiveForSpan(clip, spanStartUs, spanEndUs) &&
        mediaItem?.source.currentResolvedPath
    );
  });

  if (activeVideoClips.length === 0) {
    return null;
  }

  const topClip = [...activeVideoClips].sort((left, right) => {
    const leftIndex = trackIndexMap.get(left.trackId)?.orderIndex ?? -1;
    const rightIndex = trackIndexMap.get(right.trackId)?.orderIndex ?? -1;
    return rightIndex - leftIndex;
  });

  const clip = topClip[0];

  if (!clip) {
    return null;
  }

  const mediaItem = mediaItemsById[clip.mediaItemId];
  const durationUs = spanEndUs - spanStartUs;

  if (!mediaItem?.source.currentResolvedPath) {
    return null;
  }

  return {
    trackId: clip.trackId,
    clipId: clip.id,
    mediaItemId: clip.mediaItemId,
    sourcePath: mediaItem.source.currentResolvedPath,
    sourceStartUs: clip.sourceInUs + Math.max(0, spanStartUs - clip.timelineStartUs),
    durationUs
  };
}

function resolveAudioContributions(
  spanStartUs: number,
  spanEndUs: number,
  clips: TimelineClip[],
  trackIndexMap: Map<string, TimelineTrackWithIndex>,
  mediaItemsById: Record<string, MediaItem>
): RenderAudioContribution[] {
  const durationUs = spanEndUs - spanStartUs;

  return clips
    .filter((clip) => {
      const trackInfo = trackIndexMap.get(clip.trackId);
      const mediaItem = mediaItemsById[clip.mediaItemId];

      return Boolean(
        trackInfo &&
          trackInfo.track.kind === "audio" &&
          !trackInfo.track.muted &&
          isClipActiveForSpan(clip, spanStartUs, spanEndUs) &&
          mediaItem?.source.currentResolvedPath
      );
    })
    .sort((left, right) => {
      const leftIndex = trackIndexMap.get(left.trackId)?.orderIndex ?? 0;
      const rightIndex = trackIndexMap.get(right.trackId)?.orderIndex ?? 0;
      return leftIndex - rightIndex;
    })
    .map((clip) => {
      const mediaItem = mediaItemsById[clip.mediaItemId]!;

      return {
        trackId: clip.trackId,
        clipId: clip.id,
        mediaItemId: clip.mediaItemId,
        sourcePath: mediaItem.source.currentResolvedPath!,
        sourceStartUs: clip.sourceInUs + Math.max(0, spanStartUs - clip.timelineStartUs),
        durationUs,
        gainDb: clip.gainDb
      };
    });
}

export function compileRenderPlan(
  timeline: Timeline,
  mediaItemsById: Record<string, MediaItem>,
  defaultPresetId: string | undefined,
  input: ExportRequestInput
): RenderPlanCompilationResult {
  const requestResult = createExportRequest(timeline, defaultPresetId, input);

  if (!requestResult.ok) {
    return requestResult;
  }

  const { request, preset } = requestResult;
  const rangeStartUs = request.target.startUs;
  const rangeEndUs = request.target.endUs;
  const activeAudioTrackClips = Object.values(timeline.clipsById).filter((clip) => {
    const trackInfo = timeline.tracksById[clip.trackId];
    return (
      clip.enabled &&
      trackInfo?.kind === "audio" &&
      !trackInfo.muted &&
      isClipActiveForSpan(clip, rangeStartUs, rangeEndUs)
    );
  });

  if (rangeEndUs <= rangeStartUs || Object.keys(timeline.clipsById).length === 0) {
    return fail("TIMELINE_EMPTY", "The timeline is empty and cannot be exported.");
  }

  const enabledClips = Object.values(timeline.clipsById).filter(
    (clip) => clip.enabled && isClipActiveForSpan(clip, rangeStartUs, rangeEndUs)
  );

  for (const clip of enabledClips) {
    const mediaItem = mediaItemsById[clip.mediaItemId];

    if (!mediaItem) {
      return fail(
        "MISSING_SOURCE_MEDIA",
        `Clip ${clip.id} references missing media item ${clip.mediaItemId}.`
      );
    }

    const supportError = ensureClipSupported(clip);

    if (supportError) {
      return supportError;
    }

    if (!mediaItem.source.currentResolvedPath) {
      return fail(
        "MISSING_SOURCE_MEDIA",
        `Media item ${mediaItem.id} is missing and cannot be exported.`
      );
    }

    const sourceDurationUs =
      mediaItem.metadataSummary.durationMs === null
        ? null
        : mediaItem.metadataSummary.durationMs * 1_000;

    if (sourceDurationUs !== null && clip.sourceOutUs > sourceDurationUs) {
      return fail(
        "UNSUPPORTED_FEATURE",
        "Clip trim exceeds the source duration.",
        `Clip ${clip.id} ends at ${clip.sourceOutUs} us but the source is ${sourceDurationUs} us.`
      );
    }
  }

  const trackIndexMap = createTrackIndexMap(timeline);
  const boundaries = buildSpanBoundaries(timeline, rangeStartUs, rangeEndUs);
  const spans: RenderTimelineSpan[] = [];

  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const spanStartUs = boundaries[index];
    const spanEndUs = boundaries[index + 1];

    if (spanStartUs === undefined || spanEndUs === undefined || spanEndUs <= spanStartUs) {
      continue;
    }

    const durationUs = spanEndUs - spanStartUs;
    const video = request.exportMode === "video"
      ? resolveVideoContribution(spanStartUs, spanEndUs, enabledClips, trackIndexMap, mediaItemsById)
      : null;
    const audio = resolveAudioContributions(spanStartUs, spanEndUs, enabledClips, trackIndexMap, mediaItemsById);

    spans.push({
      id: `span-${index + 1}`,
      startUs: spanStartUs,
      endUs: spanEndUs,
      durationUs,
      video,
      audio,
      gapBehavior: DEFAULT_GAP_BEHAVIOR
    });
  }

  const hasAudioOutput = activeAudioTrackClips.length > 0;

  if (request.exportMode === "audio" && !hasAudioOutput) {
    return fail(
      "NO_AUDIO_CONTENT",
      "Audio export requires at least one active audio clip on an unmuted audio track."
    );
  }

  return {
    ok: true,
    request,
    preset,
    renderPlan: {
      version: 1,
      request,
      preset,
      timelineId: timeline.id,
      rangeStartUs,
      rangeEndUs,
      durationUs: rangeEndUs - rangeStartUs,
      sourceSelection: "original",
      gapBehavior: DEFAULT_GAP_BEHAVIOR,
      hasVideoOutput: request.exportMode === "video",
      hasAudioOutput,
      brandPackaging: request.brandPackaging,
      captionBurnIn:
        request.captionBurnIn.enabled && request.captionBurnIn.captionTrackId
          ? {
              captionTrackId: request.captionBurnIn.captionTrackId,
              subtitleFormat: request.captionBurnIn.subtitleFormat,
              subtitleArtifactPath: null,
              templateIds: []
            }
          : null,
      spans,
      diagnostics: {
        warnings: [],
        notes: [
          "Stage 5 export resolves the highest ordered visible video track per span.",
          "Stage 5 export mixes active clips on unmuted audio tracks per span.",
          request.target.kind === "timeline"
            ? "Export target covers the full timeline."
            : `Export target resolves ${request.target.label} from ${request.target.startUs}us to ${request.target.endUs}us.`
        ]
      }
    }
  };
}

export function compileFfmpegExecutionSpec(
  renderPlan: RenderPlan,
  exportRunId: string
): FfmpegSpecCompilationResult {
  if (renderPlan.request.exportMode === "frame") {
    return fail(
      "UNSUPPORTED_EXPORT_MODE",
      "Frame export is reserved but not implemented in Stage 5."
    );
  }

  const segmentSpecs: FfmpegSegmentSpec[] = renderPlan.spans.map((span, index) => {
    const videoSource: FfmpegSegmentVideoSource | null =
      renderPlan.request.exportMode === "video"
        ? span.video
          ? {
              kind: "clip",
              clipId: span.video.clipId,
              mediaItemId: span.video.mediaItemId,
              sourcePath: span.video.sourcePath,
              sourceStartUs: span.video.sourceStartUs,
              durationUs: span.video.durationUs
            }
          : {
              kind: "gap",
              durationUs: span.durationUs
            }
        : null;

    const audioSources: FfmpegSegmentAudioSource[] =
      renderPlan.hasAudioOutput
        ? span.audio.length > 0
          ? span.audio.map((audio): FfmpegSegmentAudioSource => ({
              kind: "clip",
              clipId: audio.clipId,
              mediaItemId: audio.mediaItemId,
              sourcePath: audio.sourcePath,
              sourceStartUs: audio.sourceStartUs,
              durationUs: audio.durationUs,
              gainDb: audio.gainDb
            }))
          : [
              {
                kind: "silence",
                durationUs: span.durationUs
              }
            ]
        : [];

    return {
      id: span.id,
      segmentIndex: index,
      startUs: span.startUs,
      endUs: span.endUs,
      durationUs: span.durationUs,
      outputFileName: `segment-${String(index + 1).padStart(4, "0")}.${renderPlan.preset.extension}`,
      mode: renderPlan.request.exportMode,
      videoSource,
      audioSources
    };
  });

  return {
    ok: true,
    ffmpegSpec: {
      version: 1,
      exportRunId,
      preset: renderPlan.preset,
      mode: renderPlan.request.exportMode,
      hasVideoOutput: renderPlan.hasVideoOutput,
      hasAudioOutput: renderPlan.hasAudioOutput,
      segmentSpecs,
      concat: {
        concatListFileName: "segments.concat.txt",
        outputFileName: `assembled.${renderPlan.preset.extension}`,
        copyStreams: true
      },
      diagnostics: renderPlan.diagnostics
    }
  };
}
