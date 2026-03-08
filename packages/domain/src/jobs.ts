import type { DerivedAssetType } from "./media";
import type { SubtitleFormat } from "./captions";
import type { SmartAnalysisType } from "./smart-editing";
import type {
  ExportMode,
  ExportVerificationResult
} from "./render";

export type JobState = "queued" | "running" | "completed" | "failed" | "cancelled";
export type RecoveryAction = "retry" | "resume";
export type RecoveryState = "none" | "recoverable" | "handled" | "dismissed";
export type JobType =
  | "ingest"
  | DerivedAssetType
  | "transcription"
  | "export"
  | "analysis"
  | "workflow"
  | "preview-cache";

export interface JobProgress {
  percent: number;
  step: string;
}

export interface JobError {
  code: string;
  message: string;
  details?: string;
}

export interface RecoveryInfo {
  state: RecoveryState;
  interruptedAt: string | null;
  reason: string | null;
  recommendedAction: RecoveryAction | null;
  handledAt: string | null;
  dismissedAt: string | null;
  replacementRunId: string | null;
}

export interface JobResult {
  summary?: string;
  outputPaths?: string[];
  verification?: ExportVerificationResult | null;
}

export interface JobBase {
  id: string;
  kind: JobType;
  status: JobState;
  projectDirectory: string;
  mediaItemId: string | null;
  progress: number;
  step: string;
  attemptCount: number;
  createdAt: string;
  updatedAt: string;
  errorMessage: string | null;
  recovery: RecoveryInfo;
}

export interface IngestJob extends JobBase {
  kind: "ingest";
  sourcePath: string;
}

export interface DerivedAssetJob extends JobBase {
  kind: DerivedAssetType;
  sourceRevision: string;
  presetKey: string;
}

export interface ExportJob extends JobBase {
  kind: "export";
  exportRunId: string;
  exportMode: ExportMode;
  presetId: string;
  outputPath: string | null;
}

export interface TranscriptionJob extends JobBase {
  kind: "transcription";
  transcriptionRunId: string;
  transcriptId: string | null;
  sourceClipId: string | null;
  subtitleFormat: SubtitleFormat | null;
}

export interface SmartAnalysisJob extends JobBase {
  kind: "analysis";
  analysisRunId: string;
  analysisType: SmartAnalysisType;
  suggestionSetId: string | null;
}

export interface WorkflowJob extends JobBase {
  kind: "workflow";
  workflowRunId: string;
  templateId: string;
  childJobIds: string[];
}

export type Job =
  | IngestJob
  | DerivedAssetJob
  | ExportJob
  | TranscriptionJob
  | SmartAnalysisJob
  | WorkflowJob;

export type MediaJobStatus = JobState;
export type MediaJobKind = "ingest" | DerivedAssetType;
export type MediaJobBase = JobBase;
export type MediaJob = Job;

export function createEmptyRecoveryInfo(): RecoveryInfo {
  return {
    state: "none",
    interruptedAt: null,
    reason: null,
    recommendedAction: null,
    handledAt: null,
    dismissedAt: null,
    replacementRunId: null
  };
}

export function createRecoverableRecoveryInfo(input: {
  interruptedAt: string;
  reason: string;
  recommendedAction: RecoveryAction;
}): RecoveryInfo {
  return {
    state: "recoverable",
    interruptedAt: input.interruptedAt,
    reason: input.reason,
    recommendedAction: input.recommendedAction,
    handledAt: null,
    dismissedAt: null,
    replacementRunId: null
  };
}

export function markRecoveryHandled(
  recovery: RecoveryInfo,
  input: {
    handledAt: string;
    replacementRunId?: string | null;
  }
): RecoveryInfo {
  return {
    ...recovery,
    state: "handled",
    handledAt: input.handledAt,
    replacementRunId: input.replacementRunId ?? null
  };
}

export function markRecoveryDismissed(
  recovery: RecoveryInfo,
  dismissedAt: string
): RecoveryInfo {
  return {
    ...recovery,
    state: "dismissed",
    dismissedAt
  };
}
