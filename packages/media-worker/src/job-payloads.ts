import type {
  DerivedAssetType,
  ExportMode,
  MediaJobStatus,
  SmartAnalysisType,
  SubtitleFormat
} from "@clawcut/domain";

export interface PersistedIngestJobPayload {
  sourcePath: string;
}

export interface PersistedDerivedJobPayload {
  mediaItemId: string;
  sourceRevision: string;
  presetKey: string;
}

export interface PersistedExportJobPayload {
  exportRunId: string;
  timelineId: string;
  exportMode: ExportMode;
  presetId: string;
  outputPath: string | null;
}

export interface PersistedTranscriptionJobPayload {
  transcriptionRunId: string;
  transcriptId: string | null;
  timelineId: string | null;
  clipId: string | null;
  mediaItemId: string | null;
  subtitleFormat: SubtitleFormat | null;
}

export interface PersistedSmartAnalysisJobPayload {
  analysisRunId: string;
  suggestionSetId: string | null;
  analysisType: SmartAnalysisType;
  timelineId: string | null;
  clipId: string | null;
  transcriptId: string | null;
  mediaItemId: string | null;
}

export interface PersistedWorkflowJobPayload {
  workflowRunId: string;
  templateId: string;
  childJobIds: string[];
}

export type PersistedJobPayload =
  | PersistedIngestJobPayload
  | PersistedDerivedJobPayload
  | PersistedExportJobPayload
  | PersistedTranscriptionJobPayload
  | PersistedSmartAnalysisJobPayload
  | PersistedWorkflowJobPayload;

export interface StoredJobRecord {
  id: string;
  projectDirectory: string;
  mediaItemId: string | null;
  kind: "ingest" | DerivedAssetType | "export" | "transcription" | "analysis" | "workflow";
  status: MediaJobStatus;
  progress: number;
  step: string;
  attemptCount: number;
  createdAt: string;
  updatedAt: string;
  errorMessage: string | null;
  payload: PersistedJobPayload;
}
