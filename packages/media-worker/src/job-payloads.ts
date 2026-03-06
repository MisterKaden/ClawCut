import type { DerivedAssetType, MediaJobStatus } from "@clawcut/domain";

export interface PersistedIngestJobPayload {
  sourcePath: string;
}

export interface PersistedDerivedJobPayload {
  mediaItemId: string;
  sourceRevision: string;
  presetKey: string;
}

export type PersistedJobPayload = PersistedIngestJobPayload | PersistedDerivedJobPayload;

export interface StoredJobRecord {
  id: string;
  projectDirectory: string;
  mediaItemId: string | null;
  kind: "ingest" | DerivedAssetType;
  status: MediaJobStatus;
  progress: number;
  step: string;
  attemptCount: number;
  createdAt: string;
  updatedAt: string;
  errorMessage: string | null;
  payload: PersistedJobPayload;
}
