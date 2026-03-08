import type {
  SmartAnalysisRun,
  SmartEditPlan,
  SmartSuggestionSet
} from "@clawcut/domain";

import { openProjectDatabase } from "./sqlite";
import { WorkerError, nowIso } from "./utils";

interface SmartAnalysisRunRow {
  id: string;
  job_id: string;
  suggestion_set_id: string | null;
  project_directory: string;
  request_json: string;
  status: SmartAnalysisRun["status"];
  diagnostics_json: string;
  error_json: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  retry_of_run_id: string | null;
}

interface SmartSuggestionSetRow {
  id: string;
  project_directory: string;
  analysis_type: SmartSuggestionSet["analysisType"];
  target_json: string;
  title: string;
  summary: string;
  warnings_json: string;
  items_json: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

interface SmartEditPlanRow {
  id: string;
  project_directory: string;
  timeline_id: string;
  suggestion_set_id: string | null;
  suggestion_ids_json: string;
  warnings_json: string;
  conflicts_json: string;
  steps_json: string;
  summary_json: string;
  status: SmartEditPlan["status"];
  created_at: string;
  updated_at: string;
  applied_at: string | null;
}

function rowToAnalysisRun(row: SmartAnalysisRunRow): SmartAnalysisRun {
  return {
    id: row.id,
    jobId: row.job_id,
    projectDirectory: row.project_directory,
    suggestionSetId: row.suggestion_set_id,
    request: JSON.parse(row.request_json) as SmartAnalysisRun["request"],
    status: row.status,
    diagnostics: JSON.parse(row.diagnostics_json) as SmartAnalysisRun["diagnostics"],
    error: row.error_json ? (JSON.parse(row.error_json) as SmartAnalysisRun["error"]) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    retryOfRunId: row.retry_of_run_id
  };
}

function rowToSuggestionSet(row: SmartSuggestionSetRow): SmartSuggestionSet {
  return {
    id: row.id,
    analysisType: row.analysis_type,
    target: JSON.parse(row.target_json) as SmartSuggestionSet["target"],
    title: row.title,
    summary: row.summary,
    warnings: JSON.parse(row.warnings_json) as SmartSuggestionSet["warnings"],
    items: JSON.parse(row.items_json) as SmartSuggestionSet["items"],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at
  };
}

function rowToEditPlan(row: SmartEditPlanRow): SmartEditPlan {
  return {
    id: row.id,
    timelineId: row.timeline_id,
    suggestionSetId: row.suggestion_set_id,
    suggestionIds: JSON.parse(row.suggestion_ids_json) as SmartEditPlan["suggestionIds"],
    warnings: JSON.parse(row.warnings_json) as SmartEditPlan["warnings"],
    conflicts: JSON.parse(row.conflicts_json) as SmartEditPlan["conflicts"],
    steps: JSON.parse(row.steps_json) as SmartEditPlan["steps"],
    summary: JSON.parse(row.summary_json) as SmartEditPlan["summary"],
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    appliedAt: row.applied_at
  };
}

export function listSmartAnalysisRuns(databasePath: string): SmartAnalysisRun[] {
  const { database, close } = openProjectDatabase(databasePath);

  try {
    const rows = database
      .prepare(
        `
        SELECT
          id,
          job_id,
          suggestion_set_id,
          project_directory,
          request_json,
          status,
          diagnostics_json,
          error_json,
          created_at,
          updated_at,
          started_at,
          completed_at,
          retry_of_run_id
        FROM smart_analysis_runs
        ORDER BY created_at DESC
      `
      )
      .all() as SmartAnalysisRunRow[];

    return rows.map(rowToAnalysisRun);
  } finally {
    close();
  }
}

export function getSmartAnalysisRun(
  databasePath: string,
  analysisRunId: string
): SmartAnalysisRun | null {
  const { database, close } = openProjectDatabase(databasePath);

  try {
    const row = database
      .prepare(
        `
        SELECT
          id,
          job_id,
          suggestion_set_id,
          project_directory,
          request_json,
          status,
          diagnostics_json,
          error_json,
          created_at,
          updated_at,
          started_at,
          completed_at,
          retry_of_run_id
        FROM smart_analysis_runs
        WHERE id = ?
      `
      )
      .get(analysisRunId) as SmartAnalysisRunRow | undefined;

    return row ? rowToAnalysisRun(row) : null;
  } finally {
    close();
  }
}

export function createSmartAnalysisRunRecord(
  databasePath: string,
  run: SmartAnalysisRun
): void {
  const { database, close } = openProjectDatabase(databasePath);

  try {
    database
      .prepare(
        `
        INSERT INTO smart_analysis_runs (
          id,
          job_id,
          suggestion_set_id,
          project_directory,
          request_json,
          status,
          diagnostics_json,
          error_json,
          created_at,
          updated_at,
          started_at,
          completed_at,
          retry_of_run_id
        ) VALUES (
          @id,
          @job_id,
          @suggestion_set_id,
          @project_directory,
          @request_json,
          @status,
          @diagnostics_json,
          @error_json,
          @created_at,
          @updated_at,
          @started_at,
          @completed_at,
          @retry_of_run_id
        )
      `
      )
      .run({
        id: run.id,
        job_id: run.jobId,
        suggestion_set_id: run.suggestionSetId,
        project_directory: run.projectDirectory,
        request_json: JSON.stringify(run.request),
        status: run.status,
        diagnostics_json: JSON.stringify(run.diagnostics),
        error_json: run.error ? JSON.stringify(run.error) : null,
        created_at: run.createdAt,
        updated_at: run.updatedAt,
        started_at: run.startedAt,
        completed_at: run.completedAt,
        retry_of_run_id: run.retryOfRunId
      });
  } finally {
    close();
  }
}

export function updateSmartAnalysisRunRecord(
  databasePath: string,
  analysisRunId: string,
  updates: Partial<SmartAnalysisRun>
): SmartAnalysisRun {
  const existing = getSmartAnalysisRun(databasePath, analysisRunId);

  if (!existing) {
    throw new WorkerError(
      "SMART_ANALYSIS_RUN_NOT_FOUND",
      `Smart analysis run ${analysisRunId} could not be found.`
    );
  }

  const nextRun: SmartAnalysisRun = {
    ...existing,
    suggestionSetId:
      updates.suggestionSetId === undefined
        ? existing.suggestionSetId
        : updates.suggestionSetId,
    request: updates.request ?? existing.request,
    status: updates.status ?? existing.status,
    diagnostics: updates.diagnostics ?? existing.diagnostics,
    error: updates.error === undefined ? existing.error : updates.error,
    updatedAt: nowIso(),
    startedAt: updates.startedAt === undefined ? existing.startedAt : updates.startedAt,
    completedAt: updates.completedAt === undefined ? existing.completedAt : updates.completedAt,
    retryOfRunId: updates.retryOfRunId === undefined ? existing.retryOfRunId : updates.retryOfRunId
  };

  const { database, close } = openProjectDatabase(databasePath);

  try {
    database
      .prepare(
        `
        UPDATE smart_analysis_runs
        SET
          suggestion_set_id = @suggestion_set_id,
          request_json = @request_json,
          status = @status,
          diagnostics_json = @diagnostics_json,
          error_json = @error_json,
          updated_at = @updated_at,
          started_at = @started_at,
          completed_at = @completed_at,
          retry_of_run_id = @retry_of_run_id
        WHERE id = @id
      `
      )
      .run({
        id: nextRun.id,
        suggestion_set_id: nextRun.suggestionSetId,
        request_json: JSON.stringify(nextRun.request),
        status: nextRun.status,
        diagnostics_json: JSON.stringify(nextRun.diagnostics),
        error_json: nextRun.error ? JSON.stringify(nextRun.error) : null,
        updated_at: nextRun.updatedAt,
        started_at: nextRun.startedAt,
        completed_at: nextRun.completedAt,
        retry_of_run_id: nextRun.retryOfRunId
      });
  } finally {
    close();
  }

  return nextRun;
}

export function listSuggestionSets(databasePath: string): SmartSuggestionSet[] {
  const { database, close } = openProjectDatabase(databasePath);

  try {
    const rows = database
      .prepare(
        `
        SELECT
          id,
          project_directory,
          analysis_type,
          target_json,
          title,
          summary,
          warnings_json,
          items_json,
          created_at,
          updated_at,
          completed_at
        FROM smart_suggestion_sets
        ORDER BY created_at DESC
      `
      )
      .all() as SmartSuggestionSetRow[];

    return rows.map(rowToSuggestionSet);
  } finally {
    close();
  }
}

export function getSuggestionSet(
  databasePath: string,
  suggestionSetId: string
): SmartSuggestionSet | null {
  const { database, close } = openProjectDatabase(databasePath);

  try {
    const row = database
      .prepare(
        `
        SELECT
          id,
          project_directory,
          analysis_type,
          target_json,
          title,
          summary,
          warnings_json,
          items_json,
          created_at,
          updated_at,
          completed_at
        FROM smart_suggestion_sets
        WHERE id = ?
      `
      )
      .get(suggestionSetId) as SmartSuggestionSetRow | undefined;

    return row ? rowToSuggestionSet(row) : null;
  } finally {
    close();
  }
}

export function upsertSuggestionSetRecord(
  databasePath: string,
  projectDirectory: string,
  suggestionSet: SmartSuggestionSet
): SmartSuggestionSet {
  const { database, close } = openProjectDatabase(databasePath);

  try {
    database
      .prepare(
        `
        INSERT INTO smart_suggestion_sets (
          id,
          project_directory,
          analysis_type,
          target_json,
          title,
          summary,
          warnings_json,
          items_json,
          created_at,
          updated_at,
          completed_at
        ) VALUES (
          @id,
          @project_directory,
          @analysis_type,
          @target_json,
          @title,
          @summary,
          @warnings_json,
          @items_json,
          @created_at,
          @updated_at,
          @completed_at
        )
        ON CONFLICT(id) DO UPDATE SET
          analysis_type = excluded.analysis_type,
          target_json = excluded.target_json,
          title = excluded.title,
          summary = excluded.summary,
          warnings_json = excluded.warnings_json,
          items_json = excluded.items_json,
          updated_at = excluded.updated_at,
          completed_at = excluded.completed_at
      `
      )
      .run({
        id: suggestionSet.id,
        project_directory: projectDirectory,
        analysis_type: suggestionSet.analysisType,
        target_json: JSON.stringify(suggestionSet.target),
        title: suggestionSet.title,
        summary: suggestionSet.summary,
        warnings_json: JSON.stringify(suggestionSet.warnings),
        items_json: JSON.stringify(suggestionSet.items),
        created_at: suggestionSet.createdAt,
        updated_at: suggestionSet.updatedAt,
        completed_at: suggestionSet.completedAt
      });
  } finally {
    close();
  }

  return suggestionSet;
}

export function listSmartEditPlans(databasePath: string): SmartEditPlan[] {
  const { database, close } = openProjectDatabase(databasePath);

  try {
    const rows = database
      .prepare(
        `
        SELECT
          id,
          project_directory,
          timeline_id,
          suggestion_set_id,
          suggestion_ids_json,
          warnings_json,
          conflicts_json,
          steps_json,
          summary_json,
          status,
          created_at,
          updated_at,
          applied_at
        FROM smart_edit_plans
        ORDER BY created_at DESC
      `
      )
      .all() as SmartEditPlanRow[];

    return rows.map(rowToEditPlan);
  } finally {
    close();
  }
}

export function getSmartEditPlan(
  databasePath: string,
  planId: string
): SmartEditPlan | null {
  const { database, close } = openProjectDatabase(databasePath);

  try {
    const row = database
      .prepare(
        `
        SELECT
          id,
          project_directory,
          timeline_id,
          suggestion_set_id,
          suggestion_ids_json,
          warnings_json,
          conflicts_json,
          steps_json,
          summary_json,
          status,
          created_at,
          updated_at,
          applied_at
        FROM smart_edit_plans
        WHERE id = ?
      `
      )
      .get(planId) as SmartEditPlanRow | undefined;

    return row ? rowToEditPlan(row) : null;
  } finally {
    close();
  }
}

export function upsertSmartEditPlanRecord(
  databasePath: string,
  projectDirectory: string,
  plan: SmartEditPlan
): SmartEditPlan {
  const { database, close } = openProjectDatabase(databasePath);

  try {
    database
      .prepare(
        `
        INSERT INTO smart_edit_plans (
          id,
          project_directory,
          timeline_id,
          suggestion_set_id,
          suggestion_ids_json,
          warnings_json,
          conflicts_json,
          steps_json,
          summary_json,
          status,
          created_at,
          updated_at,
          applied_at
        ) VALUES (
          @id,
          @project_directory,
          @timeline_id,
          @suggestion_set_id,
          @suggestion_ids_json,
          @warnings_json,
          @conflicts_json,
          @steps_json,
          @summary_json,
          @status,
          @created_at,
          @updated_at,
          @applied_at
        )
        ON CONFLICT(id) DO UPDATE SET
          suggestion_ids_json = excluded.suggestion_ids_json,
          warnings_json = excluded.warnings_json,
          conflicts_json = excluded.conflicts_json,
          steps_json = excluded.steps_json,
          summary_json = excluded.summary_json,
          status = excluded.status,
          updated_at = excluded.updated_at,
          applied_at = excluded.applied_at
      `
      )
      .run({
        id: plan.id,
        project_directory: projectDirectory,
        timeline_id: plan.timelineId,
        suggestion_set_id: plan.suggestionSetId,
        suggestion_ids_json: JSON.stringify(plan.suggestionIds),
        warnings_json: JSON.stringify(plan.warnings),
        conflicts_json: JSON.stringify(plan.conflicts),
        steps_json: JSON.stringify(plan.steps),
        summary_json: JSON.stringify(plan.summary),
        status: plan.status,
        created_at: plan.createdAt,
        updated_at: plan.updatedAt,
        applied_at: plan.appliedAt
      });
  } finally {
    close();
  }

  return plan;
}
