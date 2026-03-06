import type { MediaItem } from "./media";
import type { Timeline, TimelineMarker, TimelineRegion } from "./timeline";

export const PREVIEW_QUALITY_MODES = ["fast", "standard", "accurate"] as const;
export const PROJECT_PREVIEW_DEFAULT_MODES = [
  "fast-proxy",
  "standard",
  "accurate"
] as const;
export const PREVIEW_PLAYBACK_STATUSES = [
  "idle",
  "paused",
  "playing",
  "buffering",
  "error"
] as const;
export const PREVIEW_SOURCE_MODES = [
  "none",
  "gap",
  "proxy",
  "original",
  "mixed",
  "unavailable"
] as const;

export type PreviewQualityMode = (typeof PREVIEW_QUALITY_MODES)[number];
export type ProjectPreviewDefaultMode = (typeof PROJECT_PREVIEW_DEFAULT_MODES)[number];
export type PreviewPlaybackStatus = (typeof PREVIEW_PLAYBACK_STATUSES)[number];
export type PreviewSourceMode = (typeof PREVIEW_SOURCE_MODES)[number];
export type PreviewFrameSnapshotStatus = "available" | "unavailable" | "error";

export type PreviewCommandType =
  | "LoadTimelinePreview"
  | "UnloadTimelinePreview"
  | "PlayPreview"
  | "PausePreview"
  | "SeekPreview"
  | "SeekPreviewToClip"
  | "StepPreviewFrameForward"
  | "StepPreviewFrameBackward"
  | "SetPreviewQuality";

export type PreviewErrorCode =
  | "PREVIEW_NOT_LOADED"
  | "PREVIEW_TIMELINE_NOT_FOUND"
  | "PREVIEW_CLIP_NOT_FOUND"
  | "PREVIEW_SOURCE_UNAVAILABLE"
  | "PREVIEW_BACKEND_UNAVAILABLE"
  | "PREVIEW_BACKEND_FAILED"
  | "INVALID_PREVIEW_TIME";

export interface PreviewError {
  code: PreviewErrorCode;
  message: string;
  details?: string;
  recoverable: boolean;
}

export interface PreviewTrackClipSummary {
  clipId: string;
  mediaItemId: string;
  trackId: string;
  trackName: string;
  streamType: "video" | "audio";
  displayName: string;
  timelineStartUs: number;
  timelineEndUs: number;
  sourceInUs: number;
  sourceOutUs: number;
  frameRate: number | null;
}

export interface PreviewSourceSelection {
  clipId: string;
  mediaItemId: string;
  sourceMode: "proxy" | "original";
  absolutePath: string;
  fileUrl: string;
  displayName: string;
  timelineStartUs: number;
  timelineEndUs: number;
  sourceStartUs: number;
  sourceEndUs: number;
  frameRate: number | null;
  warning: string | null;
}

export interface SafeZoneOverlay {
  type: "safe-zone";
  actionInsetRatio: number;
  titleInsetRatio: number;
}

export interface MarkerOverlay {
  type: "marker";
  markerId: string;
  label: string;
  positionUs: number;
  active: boolean;
}

export interface RegionOverlay {
  type: "region";
  regionId: string;
  label: string;
  startUs: number;
  endUs: number;
  active: boolean;
}

export interface SelectionOverlay {
  type: "selection";
  clipId: string;
  label: string;
  active: boolean;
}

export interface CaptionPlaceholderOverlay {
  type: "caption-placeholder";
  id: string;
  text: string;
  xPercent: number;
  yPercent: number;
  widthPercent: number;
  heightPercent: number;
}

export interface TransformGuideOverlay {
  type: "transform-guide";
  clipId: string;
  opacity: number;
}

export interface PreviewOverlayModel {
  safeZone: SafeZoneOverlay;
  markers: MarkerOverlay[];
  regions: RegionOverlay[];
  selection: SelectionOverlay | null;
  captions: CaptionPlaceholderOverlay[];
  transformGuides: TransformGuideOverlay[];
}

export interface TimelinePreviewComposition {
  timelineId: string;
  playheadUs: number;
  qualityMode: PreviewQualityMode;
  sourceMode: PreviewSourceMode;
  activeVideoClip: PreviewTrackClipSummary | null;
  activeAudioClip: PreviewTrackClipSummary | null;
  videoSource: PreviewSourceSelection | null;
  audioSource: PreviewSourceSelection | null;
  overlays: PreviewOverlayModel;
  warning: string | null;
}

export interface PreviewLoadTarget {
  directory: string;
  cacheRoot: string;
  timeline: Timeline;
  libraryItems: MediaItem[];
  defaultQualityMode: PreviewQualityMode;
}

export interface PreviewSelectionState {
  selectedClipId: string | null;
  selectedTrackId: string | null;
}

export interface PreviewLoadedMediaState {
  video: PreviewSourceSelection | null;
  audio: PreviewSourceSelection | null;
}

export interface PreviewState {
  loaded: boolean;
  timelineId: string | null;
  directory: string | null;
  playbackStatus: PreviewPlaybackStatus;
  playheadUs: number;
  timelineEndUs: number;
  qualityMode: PreviewQualityMode;
  sourceMode: PreviewSourceMode;
  playbackRate: number;
  activeVideoClipId: string | null;
  activeAudioClipId: string | null;
  selection: PreviewSelectionState;
  loadedMedia: PreviewLoadedMediaState;
  overlays: PreviewOverlayModel;
  warning: string | null;
  error: PreviewError | null;
}

export interface PreviewFrameSnapshotOptions {
  maxWidth?: number;
  mimeType?: "image/png" | "image/jpeg";
  quality?: number;
}

export interface PreviewFrameSnapshot {
  status: PreviewFrameSnapshotStatus;
  timelineId: string | null;
  playheadUs: number;
  clipId: string | null;
  sourceMode: PreviewSourceMode;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  dataUrl: string | null;
  warning: string | null;
  error: PreviewError | null;
}

export interface LoadTimelinePreviewCommand {
  type: "LoadTimelinePreview";
  target: PreviewLoadTarget;
  initialPlayheadUs?: number;
  preservePlayhead?: boolean;
}

export interface UnloadTimelinePreviewCommand {
  type: "UnloadTimelinePreview";
}

export interface PlayPreviewCommand {
  type: "PlayPreview";
}

export interface PausePreviewCommand {
  type: "PausePreview";
}

export interface SeekPreviewCommand {
  type: "SeekPreview";
  positionUs: number;
}

export interface SeekPreviewToClipCommand {
  type: "SeekPreviewToClip";
  clipId: string;
}

export interface StepPreviewFrameForwardCommand {
  type: "StepPreviewFrameForward";
}

export interface StepPreviewFrameBackwardCommand {
  type: "StepPreviewFrameBackward";
}

export interface SetPreviewQualityCommand {
  type: "SetPreviewQuality";
  qualityMode: PreviewQualityMode;
}

export type PreviewCommand =
  | LoadTimelinePreviewCommand
  | UnloadTimelinePreviewCommand
  | PlayPreviewCommand
  | PausePreviewCommand
  | SeekPreviewCommand
  | SeekPreviewToClipCommand
  | StepPreviewFrameForwardCommand
  | StepPreviewFrameBackwardCommand
  | SetPreviewQualityCommand;

interface PreviewCommandSuccessBase<Type extends PreviewCommandType> {
  ok: true;
  commandType: Type;
  changed: boolean;
  state: PreviewState;
}

export interface LoadTimelinePreviewResult
  extends PreviewCommandSuccessBase<"LoadTimelinePreview"> {
  timelineId: string;
}

export type UnloadTimelinePreviewResult =
  PreviewCommandSuccessBase<"UnloadTimelinePreview">;

export type PlayPreviewResult = PreviewCommandSuccessBase<"PlayPreview">;

export type PausePreviewResult = PreviewCommandSuccessBase<"PausePreview">;

export interface SeekPreviewResult extends PreviewCommandSuccessBase<"SeekPreview"> {
  playheadUs: number;
}

export interface SeekPreviewToClipResult
  extends PreviewCommandSuccessBase<"SeekPreviewToClip"> {
  clipId: string;
  playheadUs: number;
}

export interface StepPreviewFrameForwardResult
  extends PreviewCommandSuccessBase<"StepPreviewFrameForward"> {
  playheadUs: number;
  frameStepUs: number;
}

export interface StepPreviewFrameBackwardResult
  extends PreviewCommandSuccessBase<"StepPreviewFrameBackward"> {
  playheadUs: number;
  frameStepUs: number;
}

export interface SetPreviewQualityResult
  extends PreviewCommandSuccessBase<"SetPreviewQuality"> {
  qualityMode: PreviewQualityMode;
}

export type PreviewCommandSuccess =
  | LoadTimelinePreviewResult
  | UnloadTimelinePreviewResult
  | PlayPreviewResult
  | PausePreviewResult
  | SeekPreviewResult
  | SeekPreviewToClipResult
  | StepPreviewFrameForwardResult
  | StepPreviewFrameBackwardResult
  | SetPreviewQualityResult;

export interface PreviewCommandFailure {
  ok: false;
  commandType: PreviewCommandType;
  error: PreviewError;
  state: PreviewState;
}

export type PreviewCommandResult = PreviewCommandSuccess | PreviewCommandFailure;

export interface PreviewApi {
  executeCommand(command: PreviewCommand): Promise<PreviewCommandResult>;
  getPreviewState(): PreviewState;
  captureFrameSnapshot(
    options?: PreviewFrameSnapshotOptions
  ): Promise<PreviewFrameSnapshot>;
  subscribeToPreviewState(listener: (state: PreviewState) => void): () => void;
}

export type PreviewEngine = PreviewApi;

export function projectPreviewModeToQualityMode(
  mode: ProjectPreviewDefaultMode
): PreviewQualityMode {
  if (mode === "fast-proxy") {
    return "fast";
  }

  return mode;
}

export function qualityModeToProjectPreviewMode(
  mode: PreviewQualityMode
): ProjectPreviewDefaultMode {
  if (mode === "fast") {
    return "fast-proxy";
  }

  return mode;
}

export function createDefaultPreviewOverlayModel(
  markers: TimelineMarker[] = [],
  regions: TimelineRegion[] = []
): PreviewOverlayModel {
  return {
    safeZone: {
      type: "safe-zone",
      actionInsetRatio: 0.1,
      titleInsetRatio: 0.2
    },
    markers: markers.map((marker) => ({
      type: "marker",
      markerId: marker.id,
      label: marker.label,
      positionUs: marker.positionUs,
      active: false
    })),
    regions: regions.map((region) => ({
      type: "region",
      regionId: region.id,
      label: region.label,
      startUs: region.startUs,
      endUs: region.endUs,
      active: false
    })),
    selection: null,
    captions: [],
    transformGuides: []
  };
}

export function createInitialPreviewState(): PreviewState {
  return {
    loaded: false,
    timelineId: null,
    directory: null,
    playbackStatus: "idle",
    playheadUs: 0,
    timelineEndUs: 0,
    qualityMode: "standard",
    sourceMode: "none",
    playbackRate: 1,
    activeVideoClipId: null,
    activeAudioClipId: null,
    selection: {
      selectedClipId: null,
      selectedTrackId: null
    },
    loadedMedia: {
      video: null,
      audio: null
    },
    overlays: createDefaultPreviewOverlayModel(),
    warning: null,
    error: null
  };
}
