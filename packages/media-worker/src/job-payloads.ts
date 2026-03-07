import type {
  DerivedAssetType,
  ExportMode,
  MediaJobStatus,
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

export type PersistedJobPayload =
  | PersistedIngestJobPayload
  | PersistedDerivedJobPayload
  | PersistedExportJobPayload
  | PersistedTranscriptionJobPayload;

export interface StoredJobRecord {
  id: string;
  projectDirectory: string;
  mediaItemId: string | null;
  kind: "ingest" | DerivedAssetType | "export" | "transcription";
  status: MediaJobStatus;
  progress: number;
  step: string;
  attemptCount: number;
  createdAt: string;
  updatedAt: string;
  errorMessage: string | null;
  payload: PersistedJobPayload;
}
