import {
  summarizeWorkflowRun,
  type WorkflowApproval,
  type WorkflowArtifact,
  type WorkflowBatchItemRun,
  type WorkflowRun,
  type WorkflowStepRun
} from "@clawcut/domain";

import { openProjectDatabase } from "./sqlite";
import { WorkerError, nowIso } from "./utils";

interface WorkflowRunRow {
  id: string;
  job_id: string;
  project_directory: string;
  template_id: WorkflowRun["templateId"];
  template_version: number;
  status: WorkflowRun["status"];
  input_json: string;
  safety_profile_json: string;
  warnings_json: string;
  error_json: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
}

interface WorkflowStepRunRow {
  id: string;
  workflow_run_id: string;
  batch_item_run_id: string | null;
  definition_id: string;
  kind: WorkflowStepRun["kind"];
  name: string;
  status: WorkflowStepRun["status"];
  safety_class: WorkflowStepRun["safetyClass"];
  mutability: WorkflowStepRun["mutability"];
  execution: WorkflowStepRun["execution"];
  requires_approval: number;
  child_job_id: string | null;
  warnings_json: string;
  output_summary_json: string;
  error_json: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
}

interface WorkflowBatchItemRow {
  id: string;
  workflow_run_id: string;
  target_clip_id: string;
  label: string;
  status: WorkflowBatchItemRun["status"];
  warnings_json: string;
  output_summary_json: string;
  error_json: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
}

interface WorkflowApprovalRow {
  id: string;
  workflow_run_id: string;
  step_run_id: string;
  batch_item_run_id: string | null;
  status: WorkflowApproval["status"];
  reason: string;
  summary: string;
  proposed_effects_json: string;
  artifact_ids_json: string;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

interface WorkflowArtifactRow {
  id: string;
  workflow_run_id: string;
  step_run_id: string | null;
  batch_item_run_id: string | null;
  kind: WorkflowArtifact["kind"];
  label: string;
  path: string | null;
  metadata_json: string;
  created_at: string;
}

function rowToWorkflowStepRun(row: WorkflowStepRunRow): WorkflowStepRun {
  return {
    id: row.id,
    workflowRunId: row.workflow_run_id,
    batchItemRunId: row.batch_item_run_id,
    definitionId: row.definition_id,
    kind: row.kind,
    name: row.name,
    status: row.status,
    safetyClass: row.safety_class,
    mutability: row.mutability,
    execution: row.execution,
    requiresApproval: row.requires_approval === 1,
    childJobId: row.child_job_id,
    warnings: JSON.parse(row.warnings_json) as WorkflowStepRun["warnings"],
    outputSummary: JSON.parse(row.output_summary_json) as WorkflowStepRun["outputSummary"],
    error: row.error_json ? (JSON.parse(row.error_json) as WorkflowStepRun["error"]) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    completedAt: row.completed_at
  };
}

function rowToWorkflowBatchItem(row: WorkflowBatchItemRow): WorkflowBatchItemRun {
  return {
    id: row.id,
    workflowRunId: row.workflow_run_id,
    targetClipId: row.target_clip_id,
    label: row.label,
    status: row.status,
    warnings: JSON.parse(row.warnings_json) as WorkflowBatchItemRun["warnings"],
    outputSummary: JSON.parse(row.output_summary_json) as WorkflowBatchItemRun["outputSummary"],
    error: row.error_json ? (JSON.parse(row.error_json) as WorkflowBatchItemRun["error"]) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    completedAt: row.completed_at
  };
}

function rowToWorkflowApproval(row: WorkflowApprovalRow): WorkflowApproval {
  return {
    id: row.id,
    workflowRunId: row.workflow_run_id,
    stepRunId: row.step_run_id,
    batchItemRunId: row.batch_item_run_id,
    status: row.status,
    reason: row.reason,
    summary: row.summary,
    proposedEffects: JSON.parse(row.proposed_effects_json) as WorkflowApproval["proposedEffects"],
    artifactIds: JSON.parse(row.artifact_ids_json) as WorkflowApproval["artifactIds"],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at
  };
}

function rowToWorkflowArtifact(row: WorkflowArtifactRow): WorkflowArtifact {
  return {
    id: row.id,
    workflowRunId: row.workflow_run_id,
    stepRunId: row.step_run_id,
    batchItemRunId: row.batch_item_run_id,
    kind: row.kind,
    label: row.label,
    path: row.path,
    metadata: JSON.parse(row.metadata_json) as WorkflowArtifact["metadata"],
    createdAt: row.created_at
  };
}

function getWorkflowRunRows(databasePath: string): WorkflowRunRow[] {
  const { database, close } = openProjectDatabase(databasePath);

  try {
    return database
      .prepare(
        `
        SELECT
          id,
          job_id,
          project_directory,
          template_id,
          template_version,
          status,
          input_json,
          safety_profile_json,
          warnings_json,
          error_json,
          created_at,
          updated_at,
          started_at,
          completed_at
        FROM workflow_runs
        ORDER BY created_at DESC
      `
      )
      .all() as WorkflowRunRow[];
  } finally {
    close();
  }
}

function listWorkflowStepRuns(databasePath: string): WorkflowStepRun[] {
  const { database, close } = openProjectDatabase(databasePath);

  try {
    return (
      database
        .prepare(
          `
          SELECT
            id,
            workflow_run_id,
            batch_item_run_id,
            definition_id,
            kind,
            name,
            status,
            safety_class,
            mutability,
            execution,
            requires_approval,
            child_job_id,
            warnings_json,
            output_summary_json,
            error_json,
            created_at,
            updated_at,
            started_at,
            completed_at
          FROM workflow_step_runs
          ORDER BY created_at ASC
        `
        )
        .all() as WorkflowStepRunRow[]
    ).map(rowToWorkflowStepRun);
  } finally {
    close();
  }
}

function listWorkflowBatchItems(databasePath: string): WorkflowBatchItemRun[] {
  const { database, close } = openProjectDatabase(databasePath);

  try {
    return (
      database
        .prepare(
          `
          SELECT
            id,
            workflow_run_id,
            target_clip_id,
            label,
            status,
            warnings_json,
            output_summary_json,
            error_json,
            created_at,
            updated_at,
            started_at,
            completed_at
          FROM workflow_batch_items
          ORDER BY created_at ASC
        `
        )
        .all() as WorkflowBatchItemRow[]
    ).map(rowToWorkflowBatchItem);
  } finally {
    close();
  }
}

function listWorkflowApprovalsInternal(databasePath: string): WorkflowApproval[] {
  const { database, close } = openProjectDatabase(databasePath);

  try {
    return (
      database
        .prepare(
          `
          SELECT
            id,
            workflow_run_id,
            step_run_id,
            batch_item_run_id,
            status,
            reason,
            summary,
            proposed_effects_json,
            artifact_ids_json,
            created_at,
            updated_at,
            resolved_at
          FROM workflow_approvals
          ORDER BY created_at ASC
        `
        )
        .all() as WorkflowApprovalRow[]
    ).map(rowToWorkflowApproval);
  } finally {
    close();
  }
}

function listWorkflowArtifactsInternal(databasePath: string): WorkflowArtifact[] {
  const { database, close } = openProjectDatabase(databasePath);

  try {
    return (
      database
        .prepare(
          `
          SELECT
            id,
            workflow_run_id,
            step_run_id,
            batch_item_run_id,
            kind,
            label,
            path,
            metadata_json,
            created_at
          FROM workflow_artifacts
          ORDER BY created_at ASC
        `
        )
        .all() as WorkflowArtifactRow[]
    ).map(rowToWorkflowArtifact);
  } finally {
    close();
  }
}

function assembleWorkflowRuns(databasePath: string): WorkflowRun[] {
  const stepRuns = listWorkflowStepRuns(databasePath);
  const batchItems = listWorkflowBatchItems(databasePath);
  const approvals = listWorkflowApprovalsInternal(databasePath);
  const artifacts = listWorkflowArtifactsInternal(databasePath);

  return getWorkflowRunRows(databasePath).map((row) => {
    const run: WorkflowRun = {
      id: row.id,
      templateId: row.template_id,
      templateVersion: row.template_version,
      projectDirectory: row.project_directory,
      status: row.status,
      parentJobId: row.job_id,
      input: JSON.parse(row.input_json) as WorkflowRun["input"],
      safetyProfile: JSON.parse(row.safety_profile_json) as WorkflowRun["safetyProfile"],
      warnings: JSON.parse(row.warnings_json) as WorkflowRun["warnings"],
      error: row.error_json ? (JSON.parse(row.error_json) as WorkflowRun["error"]) : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      steps: stepRuns.filter((stepRun) => stepRun.workflowRunId === row.id),
      batchItems: batchItems.filter((item) => item.workflowRunId === row.id),
      approvals: approvals.filter((approval) => approval.workflowRunId === row.id),
      artifacts: artifacts.filter((artifact) => artifact.workflowRunId === row.id),
      summary: {
        completedStepCount: 0,
        totalStepCount: 0,
        completedBatchItemCount: 0,
        totalBatchItemCount: 0,
        failedBatchItemCount: 0,
        waitingApprovalCount: 0
      }
    };

    return {
      ...run,
      summary: summarizeWorkflowRun(run)
    };
  });
}

export function listWorkflowRuns(databasePath: string): WorkflowRun[] {
  return assembleWorkflowRuns(databasePath);
}

export function getWorkflowRun(databasePath: string, workflowRunId: string): WorkflowRun | null {
  return assembleWorkflowRuns(databasePath).find((run) => run.id === workflowRunId) ?? null;
}

export function listPendingWorkflowApprovals(databasePath: string): WorkflowApproval[] {
  return listWorkflowApprovalsInternal(databasePath).filter((approval) => approval.status === "pending");
}

export function listWorkflowArtifacts(
  databasePath: string,
  workflowRunId: string
): WorkflowArtifact[] {
  return listWorkflowArtifactsInternal(databasePath).filter(
    (artifact) => artifact.workflowRunId === workflowRunId
  );
}

export function createWorkflowRunRecord(databasePath: string, run: WorkflowRun): void {
  const { database, close } = openProjectDatabase(databasePath);

  try {
    database
      .prepare(
        `
        INSERT INTO workflow_runs (
          id,
          job_id,
          project_directory,
          template_id,
          template_version,
          status,
          input_json,
          safety_profile_json,
          warnings_json,
          error_json,
          created_at,
          updated_at,
          started_at,
          completed_at
        ) VALUES (
          @id,
          @job_id,
          @project_directory,
          @template_id,
          @template_version,
          @status,
          @input_json,
          @safety_profile_json,
          @warnings_json,
          @error_json,
          @created_at,
          @updated_at,
          @started_at,
          @completed_at
        )
      `
      )
      .run({
        id: run.id,
        job_id: run.parentJobId,
        project_directory: run.projectDirectory,
        template_id: run.templateId,
        template_version: run.templateVersion,
        status: run.status,
        input_json: JSON.stringify(run.input),
        safety_profile_json: JSON.stringify(run.safetyProfile),
        warnings_json: JSON.stringify(run.warnings),
        error_json: run.error ? JSON.stringify(run.error) : null,
        created_at: run.createdAt,
        updated_at: run.updatedAt,
        started_at: run.startedAt,
        completed_at: run.completedAt
      });
  } finally {
    close();
  }
}

export function updateWorkflowRunRecord(
  databasePath: string,
  workflowRunId: string,
  updates: Partial<WorkflowRun>
): WorkflowRun {
  const existing = getWorkflowRun(databasePath, workflowRunId);

  if (!existing) {
    throw new WorkerError(
      "WORKFLOW_RUN_NOT_FOUND",
      `Workflow run ${workflowRunId} could not be found.`
    );
  }

  const nextRun: WorkflowRun = {
    ...existing,
    status: updates.status ?? existing.status,
    input: updates.input ?? existing.input,
    safetyProfile: updates.safetyProfile ?? existing.safetyProfile,
    warnings: updates.warnings ?? existing.warnings,
    error: updates.error === undefined ? existing.error : updates.error,
    updatedAt: nowIso(),
    startedAt: updates.startedAt === undefined ? existing.startedAt : updates.startedAt,
    completedAt: updates.completedAt === undefined ? existing.completedAt : updates.completedAt,
    steps: existing.steps,
    batchItems: existing.batchItems,
    approvals: existing.approvals,
    artifacts: existing.artifacts,
    summary: existing.summary
  };

  const { database, close } = openProjectDatabase(databasePath);

  try {
    database
      .prepare(
        `
        UPDATE workflow_runs
        SET
          status = @status,
          input_json = @input_json,
          safety_profile_json = @safety_profile_json,
          warnings_json = @warnings_json,
          error_json = @error_json,
          updated_at = @updated_at,
          started_at = @started_at,
          completed_at = @completed_at
        WHERE id = @id
      `
      )
      .run({
        id: workflowRunId,
        status: nextRun.status,
        input_json: JSON.stringify(nextRun.input),
        safety_profile_json: JSON.stringify(nextRun.safetyProfile),
        warnings_json: JSON.stringify(nextRun.warnings),
        error_json: nextRun.error ? JSON.stringify(nextRun.error) : null,
        updated_at: nextRun.updatedAt,
        started_at: nextRun.startedAt,
        completed_at: nextRun.completedAt
      });
  } finally {
    close();
  }

  return getWorkflowRun(databasePath, workflowRunId) ?? nextRun;
}

function upsertRecord(
  databasePath: string,
  tableName: string,
  columns: string[],
  values: Record<string, unknown>,
  updateAssignments: string
): void {
  const { database, close } = openProjectDatabase(databasePath);

  try {
    database
      .prepare(
        `
        INSERT INTO ${tableName} (${columns.join(", ")})
        VALUES (${columns.map((column) => `@${column}`).join(", ")})
        ON CONFLICT(id) DO UPDATE SET ${updateAssignments}
      `
      )
      .run(values);
  } finally {
    close();
  }
}

export function upsertWorkflowStepRunRecord(
  databasePath: string,
  stepRun: WorkflowStepRun
): WorkflowStepRun {
  upsertRecord(
    databasePath,
    "workflow_step_runs",
    [
      "id",
      "workflow_run_id",
      "batch_item_run_id",
      "definition_id",
      "kind",
      "name",
      "status",
      "safety_class",
      "mutability",
      "execution",
      "requires_approval",
      "child_job_id",
      "warnings_json",
      "output_summary_json",
      "error_json",
      "created_at",
      "updated_at",
      "started_at",
      "completed_at"
    ],
    {
      id: stepRun.id,
      workflow_run_id: stepRun.workflowRunId,
      batch_item_run_id: stepRun.batchItemRunId,
      definition_id: stepRun.definitionId,
      kind: stepRun.kind,
      name: stepRun.name,
      status: stepRun.status,
      safety_class: stepRun.safetyClass,
      mutability: stepRun.mutability,
      execution: stepRun.execution,
      requires_approval: stepRun.requiresApproval ? 1 : 0,
      child_job_id: stepRun.childJobId,
      warnings_json: JSON.stringify(stepRun.warnings),
      output_summary_json: JSON.stringify(stepRun.outputSummary),
      error_json: stepRun.error ? JSON.stringify(stepRun.error) : null,
      created_at: stepRun.createdAt,
      updated_at: stepRun.updatedAt,
      started_at: stepRun.startedAt,
      completed_at: stepRun.completedAt
    },
    `
      batch_item_run_id = excluded.batch_item_run_id,
      status = excluded.status,
      child_job_id = excluded.child_job_id,
      warnings_json = excluded.warnings_json,
      output_summary_json = excluded.output_summary_json,
      error_json = excluded.error_json,
      updated_at = excluded.updated_at,
      started_at = excluded.started_at,
      completed_at = excluded.completed_at
    `
  );

  return rowToWorkflowStepRun({
    id: stepRun.id,
    workflow_run_id: stepRun.workflowRunId,
    batch_item_run_id: stepRun.batchItemRunId,
    definition_id: stepRun.definitionId,
    kind: stepRun.kind,
    name: stepRun.name,
    status: stepRun.status,
    safety_class: stepRun.safetyClass,
    mutability: stepRun.mutability,
    execution: stepRun.execution,
    requires_approval: stepRun.requiresApproval ? 1 : 0,
    child_job_id: stepRun.childJobId,
    warnings_json: JSON.stringify(stepRun.warnings),
    output_summary_json: JSON.stringify(stepRun.outputSummary),
    error_json: stepRun.error ? JSON.stringify(stepRun.error) : null,
    created_at: stepRun.createdAt,
    updated_at: stepRun.updatedAt,
    started_at: stepRun.startedAt,
    completed_at: stepRun.completedAt
  });
}

export function upsertWorkflowBatchItemRecord(
  databasePath: string,
  batchItem: WorkflowBatchItemRun
): WorkflowBatchItemRun {
  upsertRecord(
    databasePath,
    "workflow_batch_items",
    [
      "id",
      "workflow_run_id",
      "target_clip_id",
      "label",
      "status",
      "warnings_json",
      "output_summary_json",
      "error_json",
      "created_at",
      "updated_at",
      "started_at",
      "completed_at"
    ],
    {
      id: batchItem.id,
      workflow_run_id: batchItem.workflowRunId,
      target_clip_id: batchItem.targetClipId,
      label: batchItem.label,
      status: batchItem.status,
      warnings_json: JSON.stringify(batchItem.warnings),
      output_summary_json: JSON.stringify(batchItem.outputSummary),
      error_json: batchItem.error ? JSON.stringify(batchItem.error) : null,
      created_at: batchItem.createdAt,
      updated_at: batchItem.updatedAt,
      started_at: batchItem.startedAt,
      completed_at: batchItem.completedAt
    },
    `
      label = excluded.label,
      status = excluded.status,
      warnings_json = excluded.warnings_json,
      output_summary_json = excluded.output_summary_json,
      error_json = excluded.error_json,
      updated_at = excluded.updated_at,
      started_at = excluded.started_at,
      completed_at = excluded.completed_at
    `
  );

  return batchItem;
}

export function upsertWorkflowApprovalRecord(
  databasePath: string,
  approval: WorkflowApproval
): WorkflowApproval {
  upsertRecord(
    databasePath,
    "workflow_approvals",
    [
      "id",
      "workflow_run_id",
      "step_run_id",
      "batch_item_run_id",
      "status",
      "reason",
      "summary",
      "proposed_effects_json",
      "artifact_ids_json",
      "created_at",
      "updated_at",
      "resolved_at"
    ],
    {
      id: approval.id,
      workflow_run_id: approval.workflowRunId,
      step_run_id: approval.stepRunId,
      batch_item_run_id: approval.batchItemRunId,
      status: approval.status,
      reason: approval.reason,
      summary: approval.summary,
      proposed_effects_json: JSON.stringify(approval.proposedEffects),
      artifact_ids_json: JSON.stringify(approval.artifactIds),
      created_at: approval.createdAt,
      updated_at: approval.updatedAt,
      resolved_at: approval.resolvedAt
    },
    `
      batch_item_run_id = excluded.batch_item_run_id,
      status = excluded.status,
      reason = excluded.reason,
      summary = excluded.summary,
      proposed_effects_json = excluded.proposed_effects_json,
      artifact_ids_json = excluded.artifact_ids_json,
      updated_at = excluded.updated_at,
      resolved_at = excluded.resolved_at
    `
  );

  return approval;
}

export function upsertWorkflowArtifactRecord(
  databasePath: string,
  artifact: WorkflowArtifact
): WorkflowArtifact {
  upsertRecord(
    databasePath,
    "workflow_artifacts",
    [
      "id",
      "workflow_run_id",
      "step_run_id",
      "batch_item_run_id",
      "kind",
      "label",
      "path",
      "metadata_json",
      "created_at"
    ],
    {
      id: artifact.id,
      workflow_run_id: artifact.workflowRunId,
      step_run_id: artifact.stepRunId,
      batch_item_run_id: artifact.batchItemRunId,
      kind: artifact.kind,
      label: artifact.label,
      path: artifact.path,
      metadata_json: JSON.stringify(artifact.metadata),
      created_at: artifact.createdAt
    },
    `
      step_run_id = excluded.step_run_id,
      batch_item_run_id = excluded.batch_item_run_id,
      label = excluded.label,
      path = excluded.path,
      metadata_json = excluded.metadata_json
    `
  );

  return artifact;
}
