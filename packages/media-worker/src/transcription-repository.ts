import { createEmptyRecoveryInfo, type TranscriptionRun } from "@clawcut/domain";

import { openProjectDatabase } from "./sqlite";
import { WorkerError, nowIso } from "./utils";

interface TranscriptionRunRow {
  id: string;
  job_id: string;
  transcript_id: string | null;
  project_directory: string;
  request_json: string;
  status: TranscriptionRun["status"];
  raw_artifact_path: string | null;
  diagnostics_json: string;
  error_json: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  retry_of_run_id: string | null;
  recovery_json?: string;
}

function rowToTranscriptionRun(row: TranscriptionRunRow): TranscriptionRun {
  return {
    id: row.id,
    jobId: row.job_id,
    transcriptId: row.transcript_id,
    projectDirectory: row.project_directory,
    request: JSON.parse(row.request_json) as TranscriptionRun["request"],
    status: row.status,
    rawArtifactPath: row.raw_artifact_path,
    diagnostics: JSON.parse(row.diagnostics_json) as TranscriptionRun["diagnostics"],
    error: row.error_json ? (JSON.parse(row.error_json) as TranscriptionRun["error"]) : null,
    recovery: row.recovery_json
      ? (JSON.parse(row.recovery_json) as TranscriptionRun["recovery"])
      : createEmptyRecoveryInfo(),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    retryOfRunId: row.retry_of_run_id
  };
}

export function getTranscriptionRun(
  databasePath: string,
  transcriptionRunId: string
): TranscriptionRun | null {
  const { database, close } = openProjectDatabase(databasePath);

  try {
    const row = database
      .prepare(`
        SELECT
          id,
          job_id,
          transcript_id,
          project_directory,
          request_json,
          status,
          raw_artifact_path,
          diagnostics_json,
          error_json,
          created_at,
          updated_at,
          started_at,
          completed_at,
          retry_of_run_id,
          recovery_json
        FROM transcription_runs
        WHERE id = ?
      `)
      .get(transcriptionRunId) as TranscriptionRunRow | undefined;

    return row ? rowToTranscriptionRun(row) : null;
  } finally {
    close();
  }
}

export function listTranscriptionRuns(databasePath: string): TranscriptionRun[] {
  const { database, close } = openProjectDatabase(databasePath);

  try {
    const rows = database
      .prepare(`
        SELECT
          id,
          job_id,
          transcript_id,
          project_directory,
          request_json,
          status,
          raw_artifact_path,
          diagnostics_json,
          error_json,
          created_at,
          updated_at,
          started_at,
          completed_at,
          retry_of_run_id,
          recovery_json
        FROM transcription_runs
        ORDER BY created_at DESC
      `)
      .all() as TranscriptionRunRow[];

    return rows.map(rowToTranscriptionRun);
  } finally {
    close();
  }
}

export function createTranscriptionRunRecord(
  databasePath: string,
  run: TranscriptionRun
): void {
  const { database, close } = openProjectDatabase(databasePath);

  try {
    database
      .prepare(`
        INSERT INTO transcription_runs (
          id,
          job_id,
          transcript_id,
          project_directory,
          request_json,
          status,
          raw_artifact_path,
          diagnostics_json,
          error_json,
          created_at,
          updated_at,
          started_at,
          completed_at,
          retry_of_run_id,
          recovery_json
        ) VALUES (
          @id,
          @job_id,
          @transcript_id,
          @project_directory,
          @request_json,
          @status,
          @raw_artifact_path,
          @diagnostics_json,
          @error_json,
          @created_at,
          @updated_at,
          @started_at,
          @completed_at,
          @retry_of_run_id,
          @recovery_json
        )
      `)
      .run({
        id: run.id,
        job_id: run.jobId,
        transcript_id: run.transcriptId,
        project_directory: run.projectDirectory,
        request_json: JSON.stringify(run.request),
        status: run.status,
        raw_artifact_path: run.rawArtifactPath,
        diagnostics_json: JSON.stringify(run.diagnostics),
        error_json: run.error ? JSON.stringify(run.error) : null,
        created_at: run.createdAt,
        updated_at: run.updatedAt,
        started_at: run.startedAt,
        completed_at: run.completedAt,
        retry_of_run_id: run.retryOfRunId,
        recovery_json: JSON.stringify(run.recovery)
      });
  } finally {
    close();
  }
}

export function updateTranscriptionRunRecord(
  databasePath: string,
  transcriptionRunId: string,
  updates: Partial<TranscriptionRun>
): TranscriptionRun {
  const existing = getTranscriptionRun(databasePath, transcriptionRunId);

  if (!existing) {
    throw new WorkerError(
      "TRANSCRIPTION_RUN_NOT_FOUND",
      `Transcription run ${transcriptionRunId} could not be found.`
    );
  }

  const nextRun: TranscriptionRun = {
    ...existing,
    transcriptId: updates.transcriptId === undefined ? existing.transcriptId : updates.transcriptId,
    request: updates.request ?? existing.request,
    status: updates.status ?? existing.status,
    rawArtifactPath:
      updates.rawArtifactPath === undefined ? existing.rawArtifactPath : updates.rawArtifactPath,
    diagnostics: updates.diagnostics ?? existing.diagnostics,
    error: updates.error === undefined ? existing.error : updates.error,
    recovery: updates.recovery ?? existing.recovery,
    updatedAt: nowIso(),
    startedAt: updates.startedAt === undefined ? existing.startedAt : updates.startedAt,
    completedAt: updates.completedAt === undefined ? existing.completedAt : updates.completedAt,
    retryOfRunId: updates.retryOfRunId === undefined ? existing.retryOfRunId : updates.retryOfRunId
  };

  const { database, close } = openProjectDatabase(databasePath);

  try {
    database
      .prepare(`
        UPDATE transcription_runs
        SET
          transcript_id = @transcript_id,
          request_json = @request_json,
          status = @status,
          raw_artifact_path = @raw_artifact_path,
          diagnostics_json = @diagnostics_json,
          error_json = @error_json,
          updated_at = @updated_at,
          started_at = @started_at,
          completed_at = @completed_at,
          retry_of_run_id = @retry_of_run_id,
          recovery_json = @recovery_json
        WHERE id = @id
      `)
      .run({
        id: nextRun.id,
        transcript_id: nextRun.transcriptId,
        request_json: JSON.stringify(nextRun.request),
        status: nextRun.status,
        raw_artifact_path: nextRun.rawArtifactPath,
        diagnostics_json: JSON.stringify(nextRun.diagnostics),
        error_json: nextRun.error ? JSON.stringify(nextRun.error) : null,
        updated_at: nextRun.updatedAt,
        started_at: nextRun.startedAt,
        completed_at: nextRun.completedAt,
        retry_of_run_id: nextRun.retryOfRunId,
        recovery_json: JSON.stringify(nextRun.recovery)
      });
  } finally {
    close();
  }

  return nextRun;
}
