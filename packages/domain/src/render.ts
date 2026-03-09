import type { CaptionTemplateId, SubtitleFormat } from "./captions";
import type { JobError, RecoveryInfo } from "./jobs";

export const RENDER_PLAN_VERSION = 1;
export const FFMPEG_EXECUTION_SPEC_VERSION = 1;

export const EXPORT_MODES = ["video", "audio", "frame"] as const;
export const EXPORT_OVERWRITE_POLICIES = ["increment", "replace"] as const;
export const EXPORT_TARGET_KINDS = ["timeline", "range", "region"] as const;
export const EXPORT_RUN_STATUSES = [
  "queued",
  "preparing",
  "compiling",
  "rendering",
  "finalizing",
  "verifying",
  "completed",
  "failed",
  "cancelled"
] as const;
export const EXPORT_VERIFICATION_STATUSES = ["pending", "passed", "failed"] as const;

export type ExportMode = (typeof EXPORT_MODES)[number];
export type ExportOverwritePolicy = (typeof EXPORT_OVERWRITE_POLICIES)[number];
export type ExportTargetKind = (typeof EXPORT_TARGET_KINDS)[number];
export type ExportRunStatus = (typeof EXPORT_RUN_STATUSES)[number];
export type ExportVerificationStatus = (typeof EXPORT_VERIFICATION_STATUSES)[number];

export type ExportPresetId =
  | "video-master-1080p"
  | "video-share-720p"
  | "audio-podcast-aac";

export interface ExportVideoSettings {
  codec: "libx264";
  width: number;
  height: number;
  frameRate: number;
  pixelFormat: "yuv420p";
  bitrateKbps: number;
}

export interface ExportAudioSettings {
  codec: "aac";
  sampleRate: number;
  channelCount: 2;
  bitrateKbps: number;
}

export type ExportWatermarkPosition =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export interface ExportBrandingAssetRef {
  absolutePath: string;
  label: string | null;
}

export interface ExportBrandingWatermarkRef extends ExportBrandingAssetRef {
  position: ExportWatermarkPosition;
  marginPx: number;
  opacity: number;
}

export interface ExportBrandPackagingInput {
  introAsset?: ExportBrandingAssetRef | null;
  outroAsset?: ExportBrandingAssetRef | null;
  watermarkAsset?: ExportBrandingWatermarkRef | null;
}

export interface ExportBrandPackaging {
  introAsset: ExportBrandingAssetRef | null;
  outroAsset: ExportBrandingAssetRef | null;
  watermarkAsset: ExportBrandingWatermarkRef | null;
}

export interface ExportPreset {
  id: ExportPresetId;
  name: string;
  description: string;
  mode: ExportMode;
  container: "mp4" | "m4a";
  extension: "mp4" | "m4a";
  video: ExportVideoSettings | null;
  audio: ExportAudioSettings | null;
}

export const BUILT_IN_EXPORT_PRESETS: ExportPreset[] = [
  {
    id: "video-master-1080p",
    name: "Master 1080p",
    description: "High-quality H.264 MP4 for final delivery and review.",
    mode: "video",
    container: "mp4",
    extension: "mp4",
    video: {
      codec: "libx264",
      width: 1920,
      height: 1080,
      frameRate: 30,
      pixelFormat: "yuv420p",
      bitrateKbps: 12_000
    },
    audio: {
      codec: "aac",
      sampleRate: 48_000,
      channelCount: 2,
      bitrateKbps: 256
    }
  },
  {
    id: "video-share-720p",
    name: "Share 720p",
    description: "Lightweight H.264 MP4 for fast review and sharing.",
    mode: "video",
    container: "mp4",
    extension: "mp4",
    video: {
      codec: "libx264",
      width: 1280,
      height: 720,
      frameRate: 30,
      pixelFormat: "yuv420p",
      bitrateKbps: 4_500
    },
    audio: {
      codec: "aac",
      sampleRate: 48_000,
      channelCount: 2,
      bitrateKbps: 160
    }
  },
  {
    id: "audio-podcast-aac",
    name: "Podcast AAC",
    description: "Stereo AAC audio-only export for podcast and voice workflows.",
    mode: "audio",
    container: "m4a",
    extension: "m4a",
    video: null,
    audio: {
      codec: "aac",
      sampleRate: 48_000,
      channelCount: 2,
      bitrateKbps: 160
    }
  }
];

export const EXPORT_PRESET_IDS = BUILT_IN_EXPORT_PRESETS.map(
  (preset) => preset.id
) as [ExportPresetId, ...ExportPresetId[]];
export const DEFAULT_EXPORT_PRESET_ID: ExportPresetId = "video-master-1080p";

export interface ExportRequestInput {
  timelineId: string;
  exportMode?: ExportMode;
  presetId?: ExportPresetId;
  outputPath?: string | null;
  overwritePolicy?: ExportOverwritePolicy;
  brandPackaging?: ExportBrandPackagingInput | null;
  captionBurnIn?: {
    enabled: boolean;
    captionTrackId: string | null;
    subtitleFormat?: SubtitleFormat;
  };
  target?:
    | {
        kind: "timeline";
      }
    | {
        kind: "range";
        startUs: number;
        endUs: number;
        label?: string | null;
      }
    | {
        kind: "region";
        regionId: string;
      };
}

export interface TimelineExportTarget {
  kind: "timeline";
  startUs: number;
  endUs: number;
  label: string;
}

export interface RangeExportTarget {
  kind: "range";
  startUs: number;
  endUs: number;
  label: string;
}

export interface RegionExportTarget {
  kind: "region";
  regionId: string;
  startUs: number;
  endUs: number;
  label: string;
}

export type ExportTarget = TimelineExportTarget | RangeExportTarget | RegionExportTarget;

export interface ExportRequest {
  timelineId: string;
  exportMode: ExportMode;
  presetId: ExportPresetId;
  outputPath: string | null;
  overwritePolicy: ExportOverwritePolicy;
  brandPackaging: ExportBrandPackaging;
  captionBurnIn: {
    enabled: boolean;
    captionTrackId: string | null;
    subtitleFormat: SubtitleFormat;
  };
  target: ExportTarget;
}

export interface RenderGapBehavior {
  video: "black";
  audio: "silence";
}

export interface RenderVideoContribution {
  trackId: string;
  clipId: string;
  mediaItemId: string;
  sourcePath: string;
  sourceStartUs: number;
  durationUs: number;
}

export interface RenderAudioContribution {
  trackId: string;
  clipId: string;
  mediaItemId: string;
  sourcePath: string;
  sourceStartUs: number;
  durationUs: number;
  gainDb: number;
}

export interface RenderTimelineSpan {
  id: string;
  startUs: number;
  endUs: number;
  durationUs: number;
  video: RenderVideoContribution | null;
  audio: RenderAudioContribution[];
  gapBehavior: RenderGapBehavior;
}

export interface RenderPlanDiagnostics {
  warnings: string[];
  notes: string[];
}

export interface RenderPlan {
  version: typeof RENDER_PLAN_VERSION;
  request: ExportRequest;
  preset: ExportPreset;
  timelineId: string;
  rangeStartUs: number;
  rangeEndUs: number;
  durationUs: number;
  sourceSelection: "original";
  gapBehavior: RenderGapBehavior;
  hasVideoOutput: boolean;
  hasAudioOutput: boolean;
  brandPackaging: ExportBrandPackaging;
  captionBurnIn:
    | {
        captionTrackId: string;
        subtitleFormat: SubtitleFormat;
        subtitleArtifactPath: string | null;
        templateIds: CaptionTemplateId[];
      }
    | null;
  spans: RenderTimelineSpan[];
  diagnostics: RenderPlanDiagnostics;
}

export interface FfmpegClipVideoSource {
  kind: "clip";
  clipId: string;
  mediaItemId: string;
  sourcePath: string;
  sourceStartUs: number;
  durationUs: number;
}

export interface FfmpegGapVideoSource {
  kind: "gap";
  durationUs: number;
}

export type FfmpegSegmentVideoSource = FfmpegClipVideoSource | FfmpegGapVideoSource;

export interface FfmpegClipAudioSource {
  kind: "clip";
  clipId: string;
  mediaItemId: string;
  sourcePath: string;
  sourceStartUs: number;
  durationUs: number;
  gainDb: number;
}

export interface FfmpegSilenceAudioSource {
  kind: "silence";
  durationUs: number;
}

export type FfmpegSegmentAudioSource =
  | FfmpegClipAudioSource
  | FfmpegSilenceAudioSource;

export interface FfmpegSegmentSpec {
  id: string;
  segmentIndex: number;
  startUs: number;
  endUs: number;
  durationUs: number;
  outputFileName: string;
  mode: ExportMode;
  videoSource: FfmpegSegmentVideoSource | null;
  audioSources: FfmpegSegmentAudioSource[];
}

export interface FfmpegConcatSpec {
  concatListFileName: string;
  outputFileName: string;
  copyStreams: boolean;
}

export interface FfmpegExecutionSpec {
  version: typeof FFMPEG_EXECUTION_SPEC_VERSION;
  exportRunId: string;
  preset: ExportPreset;
  mode: ExportMode;
  hasVideoOutput: boolean;
  hasAudioOutput: boolean;
  segmentSpecs: FfmpegSegmentSpec[];
  concat: FfmpegConcatSpec;
  diagnostics: RenderPlanDiagnostics;
}

export interface ExportOutputSummary {
  path: string;
  container: string | null;
  durationMs: number | null;
  fileSize: number | null;
  hasVideo: boolean;
  hasAudio: boolean;
}

export interface ExportVerificationResult {
  status: ExportVerificationStatus;
  fileExists: boolean;
  fileSizeBytes: number | null;
  containerMatches: boolean;
  probeSucceeded: boolean;
  durationDeltaMs: number | null;
  notes: string[];
  output: ExportOutputSummary | null;
  errorMessage: string | null;
}

export interface ExportDiagnostics {
  warnings: string[];
  notes: string[];
  subtitleArtifactPaths: string[];
  renderPlanPath: string | null;
  ffmpegSpecPath: string | null;
  developmentManifestPath: string | null;
  concatListPath: string | null;
  ffmpegLogPath: string | null;
  ffmpegProgressPath: string | null;
  verificationPath: string | null;
  snapshotManifestPath: string | null;
}

export interface ExportFrameSnapshot {
  id: string;
  sourceKind: "export-run" | "timeline";
  exportRunId: string | null;
  timelineId: string;
  presetId: ExportPresetId | null;
  positionUs: number;
  outputPath: string;
  placeholderFrame: boolean;
  note: string | null;
  createdAt: string;
}

export interface ExportRun {
  id: string;
  jobId: string;
  projectDirectory: string;
  timelineId: string;
  status: ExportRunStatus;
  exportMode: ExportMode;
  presetId: ExportPresetId;
  outputPath: string | null;
  artifactDirectory: string | null;
  request: ExportRequest;
  renderPlan: RenderPlan | null;
  ffmpegSpec: FfmpegExecutionSpec | null;
  verification: ExportVerificationResult | null;
  diagnostics: ExportDiagnostics;
  error: JobError | null;
  recovery: RecoveryInfo;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  retryOfRunId: string | null;
  cancellationRequested: boolean;
}

export interface ExportSessionSnapshot {
  directory: string;
  projectName: string;
  outputRoot: string;
  defaultPresetId: ExportPresetId;
  presets: ExportPreset[];
  exportRuns: ExportRun[];
  activeExportRunId: string | null;
  lastError: JobError | null;
}

export type ExportCommandType =
  | "CreateExportRequest"
  | "CompileRenderPlan"
  | "StartExport"
  | "CaptureExportSnapshot"
  | "CancelExport"
  | "RetryExport"
  | "QueryExportStatus"
  | "ListExports";

export type ExportCommandErrorCode =
  | "TIMELINE_NOT_FOUND"
  | "TIMELINE_EMPTY"
  | "INVALID_PRESET"
  | "INVALID_EXPORT_MODE"
  | "INVALID_EXPORT_RANGE"
  | "UNSUPPORTED_EXPORT_MODE"
  | "REGION_NOT_FOUND"
  | "MISSING_SOURCE_MEDIA"
  | "CAPTION_TRACK_NOT_FOUND"
  | "CAPTION_TEMPLATE_NOT_FOUND"
  | "UNSUPPORTED_FEATURE"
  | "NO_AUDIO_CONTENT"
  | "INVALID_OUTPUT_PATH"
  | "EXPORT_NOT_FOUND"
  | "EXPORT_ALREADY_ACTIVE"
  | "NOTHING_TO_RETRY"
  | "EXPORT_ALREADY_COMPLETED"
  | "EXPORT_NOT_ACTIVE"
  | "SNAPSHOT_UNAVAILABLE"
  | "SNAPSHOT_CAPTURE_FAILED";

export interface ExportCommandError {
  code: ExportCommandErrorCode;
  message: string;
  details?: string;
}

export interface ExportCommandFailure {
  ok: false;
  commandType: ExportCommandType;
  error: ExportCommandError;
}

export interface CreateExportRequestCommand {
  type: "CreateExportRequest";
  request: ExportRequestInput;
}

export interface CompileRenderPlanCommand {
  type: "CompileRenderPlan";
  request: ExportRequestInput;
}

export interface StartExportCommand {
  type: "StartExport";
  request: ExportRequestInput;
}

export interface CaptureExportSnapshotCommand {
  type: "CaptureExportSnapshot";
  request:
    | {
        sourceKind: "export-run";
        exportRunId: string;
        positionUs?: number | null;
      }
    | {
        sourceKind: "timeline";
        timelineId: string;
        positionUs: number;
        presetId?: ExportPresetId;
      };
}

export interface CancelExportCommand {
  type: "CancelExport";
  exportRunId: string;
}

export interface RetryExportCommand {
  type: "RetryExport";
  exportRunId: string;
}

export interface QueryExportStatusCommand {
  type: "QueryExportStatus";
  exportRunId: string;
}

export interface ListExportsCommand {
  type: "ListExports";
}

export type ExportCommand =
  | CreateExportRequestCommand
  | CompileRenderPlanCommand
  | StartExportCommand
  | CaptureExportSnapshotCommand
  | CancelExportCommand
  | RetryExportCommand
  | QueryExportStatusCommand
  | ListExportsCommand;

export interface CreateExportRequestResult {
  ok: true;
  commandType: "CreateExportRequest";
  request: ExportRequest;
}

export interface CompileRenderPlanResult {
  ok: true;
  commandType: "CompileRenderPlan";
  request: ExportRequest;
  renderPlan: RenderPlan;
  ffmpegSpec: FfmpegExecutionSpec;
}

export interface StartExportResult {
  ok: true;
  commandType: "StartExport";
  exportRun: ExportRun;
  queued: boolean;
}

export interface CaptureExportSnapshotResult {
  ok: true;
  commandType: "CaptureExportSnapshot";
  snapshot: ExportFrameSnapshot;
}

export interface CancelExportResult {
  ok: true;
  commandType: "CancelExport";
  exportRun: ExportRun;
}

export interface RetryExportResult {
  ok: true;
  commandType: "RetryExport";
  exportRun: ExportRun;
}

export interface QueryExportStatusResult {
  ok: true;
  commandType: "QueryExportStatus";
  exportRun: ExportRun | null;
}

export interface ListExportsResult {
  ok: true;
  commandType: "ListExports";
  exportRuns: ExportRun[];
}

export type ExportCommandSuccess =
  | CreateExportRequestResult
  | CompileRenderPlanResult
  | StartExportResult
  | CaptureExportSnapshotResult
  | CancelExportResult
  | RetryExportResult
  | QueryExportStatusResult
  | ListExportsResult;

export type ExportCommandResult = ExportCommandSuccess | ExportCommandFailure;

export function getBuiltInExportPresets(): ExportPreset[] {
  return BUILT_IN_EXPORT_PRESETS.map((preset) => ({ ...preset }));
}

export function resolveExportPreset(presetId: ExportPresetId): ExportPreset | null {
  const preset = BUILT_IN_EXPORT_PRESETS.find((entry) => entry.id === presetId);
  return preset ? { ...preset } : null;
}

export function createEmptyExportDiagnostics(): ExportDiagnostics {
  return {
    warnings: [],
    notes: [],
    subtitleArtifactPaths: [],
    renderPlanPath: null,
    ffmpegSpecPath: null,
    developmentManifestPath: null,
    concatListPath: null,
    ffmpegLogPath: null,
    ffmpegProgressPath: null,
    verificationPath: null,
    snapshotManifestPath: null
  };
}

export function createPendingVerificationResult(): ExportVerificationResult {
  return {
    status: "pending",
    fileExists: false,
    fileSizeBytes: null,
    containerMatches: false,
    probeSucceeded: false,
    durationDeltaMs: null,
    notes: [],
    output: null,
    errorMessage: null
  };
}
