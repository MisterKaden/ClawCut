import type { DerivedAssetType } from "./media";

export type JobState = "queued" | "running" | "completed" | "failed" | "cancelled";
export type JobType =
  | "ingest"
  | DerivedAssetType
  | "transcription"
  | "export"
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

export interface JobResult {
  summary?: string;
  outputPaths?: string[];
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

export type Job = IngestJob | DerivedAssetJob;

export type MediaJobStatus = JobState;
export type MediaJobKind = "ingest" | DerivedAssetType;
export type MediaJobBase = JobBase;
export type MediaJob = Job;
