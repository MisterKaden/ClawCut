import type { ExportRun } from "@clawcut/domain";

import { openProjectDatabase } from "./sqlite";
import { WorkerError, nowIso } from "./utils";

interface ExportRunRow {
  id: string;
  job_id: string;
  project_directory: string;
  timeline_id: string;
  status: ExportRun["status"];
  export_mode: ExportRun["exportMode"];
  preset_id: ExportRun["presetId"];
  output_path: string | null;
  artifact_directory: string | null;
  request_json: string;
  render_plan_json: string | null;
  ffmpeg_spec_json: string | null;
  verification_json: string | null;
  diagnostics_json: string;
  error_json: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  retry_of_run_id: string | null;
  cancellation_requested: number;
}

function rowToExportRun(row: ExportRunRow): ExportRun {
  return {
    id: row.id,
    jobId: row.job_id,
    projectDirectory: row.project_directory,
    timelineId: row.timeline_id,
    status: row.status,
    exportMode: row.export_mode,
    presetId: row.preset_id,
    outputPath: row.output_path,
    artifactDirectory: row.artifact_directory,
    request: JSON.parse(row.request_json) as ExportRun["request"],
    renderPlan: row.render_plan_json
      ? (JSON.parse(row.render_plan_json) as ExportRun["renderPlan"])
      : null,
    ffmpegSpec: row.ffmpeg_spec_json
      ? (JSON.parse(row.ffmpeg_spec_json) as ExportRun["ffmpegSpec"])
      : null,
    verification: row.verification_json
      ? (JSON.parse(row.verification_json) as ExportRun["verification"])
      : null,
    diagnostics: JSON.parse(row.diagnostics_json) as ExportRun["diagnostics"],
    error: row.error_json ? (JSON.parse(row.error_json) as ExportRun["error"]) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    retryOfRunId: row.retry_of_run_id,
    cancellationRequested: row.cancellation_requested === 1
  };
}

function getExportRunRow(databasePath: string, exportRunId: string): ExportRunRow | null {
  const { database, close } = openProjectDatabase(databasePath);

  try {
    const row = database
      .prepare(`
        SELECT
          id,
          job_id,
          project_directory,
          timeline_id,
          status,
          export_mode,
          preset_id,
          output_path,
          artifact_directory,
          request_json,
          render_plan_json,
          ffmpeg_spec_json,
          verification_json,
          diagnostics_json,
          error_json,
          created_at,
          updated_at,
          started_at,
          completed_at,
          retry_of_run_id,
          cancellation_requested
        FROM export_runs
        WHERE id = ?
      `)
      .get(exportRunId) as ExportRunRow | undefined;

    return row ?? null;
  } finally {
    close();
  }
}

export function getExportRun(databasePath: string, exportRunId: string): ExportRun | null {
  const row = getExportRunRow(databasePath, exportRunId);
  return row ? rowToExportRun(row) : null;
}

export function listExportRuns(databasePath: string): ExportRun[] {
  const { database, close } = openProjectDatabase(databasePath);

  try {
    const rows = database
      .prepare(`
        SELECT
          id,
          job_id,
          project_directory,
          timeline_id,
          status,
          export_mode,
          preset_id,
          output_path,
          artifact_directory,
          request_json,
          render_plan_json,
          ffmpeg_spec_json,
          verification_json,
          diagnostics_json,
          error_json,
          created_at,
          updated_at,
          started_at,
          completed_at,
          retry_of_run_id,
          cancellation_requested
        FROM export_runs
        ORDER BY created_at DESC
      `)
      .all() as ExportRunRow[];

    return rows.map(rowToExportRun);
  } finally {
    close();
  }
}

export function createExportRunRecord(databasePath: string, exportRun: ExportRun): void {
  const { database, close } = openProjectDatabase(databasePath);

  try {
    database
      .prepare(`
        INSERT INTO export_runs (
          id,
          job_id,
          project_directory,
          timeline_id,
          status,
          export_mode,
          preset_id,
          output_path,
          artifact_directory,
          request_json,
          render_plan_json,
          ffmpeg_spec_json,
          verification_json,
          diagnostics_json,
          error_json,
          created_at,
          updated_at,
          started_at,
          completed_at,
          retry_of_run_id,
          cancellation_requested
        ) VALUES (
          @id,
          @job_id,
          @project_directory,
          @timeline_id,
          @status,
          @export_mode,
          @preset_id,
          @output_path,
          @artifact_directory,
          @request_json,
          @render_plan_json,
          @ffmpeg_spec_json,
          @verification_json,
          @diagnostics_json,
          @error_json,
          @created_at,
          @updated_at,
          @started_at,
          @completed_at,
          @retry_of_run_id,
          @cancellation_requested
        )
      `)
      .run({
        id: exportRun.id,
        job_id: exportRun.jobId,
        project_directory: exportRun.projectDirectory,
        timeline_id: exportRun.timelineId,
        status: exportRun.status,
        export_mode: exportRun.exportMode,
        preset_id: exportRun.presetId,
        output_path: exportRun.outputPath,
        artifact_directory: exportRun.artifactDirectory,
        request_json: JSON.stringify(exportRun.request),
        render_plan_json: exportRun.renderPlan ? JSON.stringify(exportRun.renderPlan) : null,
        ffmpeg_spec_json: exportRun.ffmpegSpec ? JSON.stringify(exportRun.ffmpegSpec) : null,
        verification_json: exportRun.verification ? JSON.stringify(exportRun.verification) : null,
        diagnostics_json: JSON.stringify(exportRun.diagnostics),
        error_json: exportRun.error ? JSON.stringify(exportRun.error) : null,
        created_at: exportRun.createdAt,
        updated_at: exportRun.updatedAt,
        started_at: exportRun.startedAt,
        completed_at: exportRun.completedAt,
        retry_of_run_id: exportRun.retryOfRunId,
        cancellation_requested: exportRun.cancellationRequested ? 1 : 0
      });
  } finally {
    close();
  }
}

export function updateExportRunRecord(
  databasePath: string,
  exportRunId: string,
  updates: Partial<ExportRun>
): ExportRun {
  const existing = getExportRun(databasePath, exportRunId);

  if (!existing) {
    throw new WorkerError("EXPORT_NOT_FOUND", `Export run ${exportRunId} could not be found.`);
  }

  const nextRun: ExportRun = {
    ...existing,
    jobId: updates.jobId ?? existing.jobId,
    projectDirectory: updates.projectDirectory ?? existing.projectDirectory,
    timelineId: updates.timelineId ?? existing.timelineId,
    status: updates.status ?? existing.status,
    exportMode: updates.exportMode ?? existing.exportMode,
    presetId: updates.presetId ?? existing.presetId,
    outputPath: updates.outputPath ?? existing.outputPath,
    artifactDirectory:
      updates.artifactDirectory === undefined
        ? existing.artifactDirectory
        : updates.artifactDirectory,
    request: updates.request ?? existing.request,
    renderPlan:
      updates.renderPlan === undefined ? existing.renderPlan : updates.renderPlan,
    ffmpegSpec:
      updates.ffmpegSpec === undefined ? existing.ffmpegSpec : updates.ffmpegSpec,
    verification:
      updates.verification === undefined ? existing.verification : updates.verification,
    diagnostics: updates.diagnostics ?? existing.diagnostics,
    error: updates.error === undefined ? existing.error : updates.error,
    createdAt: updates.createdAt ?? existing.createdAt,
    startedAt: updates.startedAt === undefined ? existing.startedAt : updates.startedAt,
    completedAt:
      updates.completedAt === undefined ? existing.completedAt : updates.completedAt,
    retryOfRunId:
      updates.retryOfRunId === undefined ? existing.retryOfRunId : updates.retryOfRunId,
    cancellationRequested:
      updates.cancellationRequested === undefined
        ? existing.cancellationRequested
        : updates.cancellationRequested,
    updatedAt: updates.updatedAt ?? nowIso()
  };

  const { database, close } = openProjectDatabase(databasePath);

  try {
    database
      .prepare(`
        UPDATE export_runs
        SET
          status = @status,
          output_path = @output_path,
          artifact_directory = @artifact_directory,
          request_json = @request_json,
          render_plan_json = @render_plan_json,
          ffmpeg_spec_json = @ffmpeg_spec_json,
          verification_json = @verification_json,
          diagnostics_json = @diagnostics_json,
          error_json = @error_json,
          updated_at = @updated_at,
          started_at = @started_at,
          completed_at = @completed_at,
          retry_of_run_id = @retry_of_run_id,
          cancellation_requested = @cancellation_requested
        WHERE id = @id
      `)
      .run({
        id: exportRunId,
        status: nextRun.status,
        output_path: nextRun.outputPath,
        artifact_directory: nextRun.artifactDirectory,
        request_json: JSON.stringify(nextRun.request),
        render_plan_json: nextRun.renderPlan ? JSON.stringify(nextRun.renderPlan) : null,
        ffmpeg_spec_json: nextRun.ffmpegSpec ? JSON.stringify(nextRun.ffmpegSpec) : null,
        verification_json: nextRun.verification ? JSON.stringify(nextRun.verification) : null,
        diagnostics_json: JSON.stringify(nextRun.diagnostics),
        error_json: nextRun.error ? JSON.stringify(nextRun.error) : null,
        updated_at: nextRun.updatedAt,
        started_at: nextRun.startedAt,
        completed_at: nextRun.completedAt,
        retry_of_run_id: nextRun.retryOfRunId,
        cancellation_requested: nextRun.cancellationRequested ? 1 : 0
      });
  } finally {
    close();
  }

  return nextRun;
}
