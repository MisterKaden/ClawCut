import {
  createEmptyRecoveryInfo,
  createRecoverableRecoveryInfo,
  markRecoveryDismissed,
  markRecoveryHandled,
  type RecoveryAction,
  type RecoveryInfo
} from "@clawcut/domain";
import type {
  DiagnosticsFailureRecord,
  DiagnosticsRecoverableItem,
  DiagnosticsSessionSnapshot,
  ExecuteDiagnosticsActionInput,
  ExecuteDiagnosticsActionResult,
  GetDiagnosticsSessionSnapshotInput
} from "@clawcut/ipc";

import {
  getWorkerDiagnosticLogPath,
  readRecentWorkerDiagnostics,
  appendWorkerDiagnostic
} from "./diagnostics-logger";
import { executeExportCommand } from "./export-session";
import { listExportRuns, updateExportRunRecord } from "./export-repository";
import { retryJob } from "./ingest-service";
import {
  getStoredJobRecord,
  listJobs,
  loadAndMaybeMigrateProject,
  updateJobRecord
} from "./project-repository";
import { resolveProjectPaths } from "./paths";
import { listSmartAnalysisRuns, updateSmartAnalysisRunRecord } from "./smart-repository";
import { retrySmartAnalysisRun } from "./smart-session";
import { listTranscriptionRuns, updateTranscriptionRunRecord } from "./transcription-repository";
import { nowIso } from "./utils";
import { executeWorkflowCommand } from "./workflow-session";
import { listWorkflowRuns, updateWorkflowRunRecord } from "./workflow-repository";

const recoveredDirectories = new Set<string>();
const migrationStateByDirectory = new Map<
  string,
  DiagnosticsSessionSnapshot["migration"]
>();

function isRecoverableRecovery(recovery: RecoveryInfo): boolean {
  return recovery.state === "recoverable";
}

function createRecoverableItem(input: {
  id: string;
  kind: DiagnosticsRecoverableItem["kind"];
  title: string;
  status: string;
  recommendedAction: "retry" | "resume";
  reason: string;
  interruptedAt: string;
  jobId?: string | null;
  logPath?: string | null;
  artifactPath?: string | null;
}): DiagnosticsRecoverableItem {
  return {
    id: input.id,
    kind: input.kind,
    jobId: input.jobId ?? null,
    title: input.title,
    status: input.status,
    recommendedAction: input.recommendedAction,
    reason: input.reason,
    interruptedAt: input.interruptedAt,
    logPath: input.logPath ?? null,
    artifactPath: input.artifactPath ?? null
  };
}

async function logRecoveryEvent(
  record: Omit<DiagnosticsFailureRecord, "id"> & {
    id?: string;
  }
): Promise<void> {
  await appendWorkerDiagnostic({
    id: record.id ?? `${record.subsystem}:${record.runId ?? record.jobId ?? record.occurredAt}`,
    subsystem: record.subsystem,
    severity: record.severity,
    code: record.code,
    message: record.message,
    details: record.details,
    occurredAt: record.occurredAt,
    requestId: record.requestId,
    jobId: record.jobId,
    runId: record.runId,
    logPath: record.logPath,
    artifactPath: record.artifactPath
  });
}

function createInterruptedRecovery(reason: string, action: RecoveryAction): RecoveryInfo {
  return createRecoverableRecoveryInfo({
    interruptedAt: nowIso(),
    reason,
    recommendedAction: action
  });
}

async function recoverExportRuns(directory: string): Promise<void> {
  const paths = resolveProjectPaths(directory);

  for (const run of listExportRuns(paths.databasePath)) {
    if (
      !["queued", "preparing", "compiling", "rendering", "finalizing", "verifying"].includes(
        run.status
      ) ||
      isRecoverableRecovery(run.recovery)
    ) {
      continue;
    }

    const reason = "The export was interrupted before completion.";
    const recovery = createInterruptedRecovery(reason, "retry");
    updateExportRunRecord(paths.databasePath, run.id, {
      status: "failed",
      error: {
        code: "EXPORT_INTERRUPTED",
        message: reason
      },
      completedAt: nowIso(),
      recovery
    });
    updateJobRecord(paths.databasePath, run.jobId, {
      status: "failed",
      step: "Interrupted",
      errorMessage: reason,
      recovery
    });
    await logRecoveryEvent({
      subsystem: "export",
      severity: "warning",
      code: "EXPORT_INTERRUPTED",
      message: reason,
      occurredAt: recovery.interruptedAt ?? nowIso(),
      requestId: null,
      jobId: run.jobId,
      runId: run.id,
      logPath: run.diagnostics.ffmpegLogPath,
      artifactPath: run.artifactDirectory
    });
  }
}

async function recoverTranscriptionRuns(directory: string): Promise<void> {
  const paths = resolveProjectPaths(directory);

  for (const run of listTranscriptionRuns(paths.databasePath)) {
    if (!["queued", "running"].includes(run.status) || isRecoverableRecovery(run.recovery)) {
      continue;
    }

    const reason = "The transcription was interrupted before completion.";
    const recovery = createInterruptedRecovery(reason, "retry");
    updateTranscriptionRunRecord(paths.databasePath, run.id, {
      status: "failed",
      error: {
        code: "TRANSCRIPTION_INTERRUPTED",
        message: reason
      },
      completedAt: nowIso(),
      recovery
    });
    updateJobRecord(paths.databasePath, run.jobId, {
      status: "failed",
      step: "Interrupted",
      errorMessage: reason,
      recovery
    });
    await logRecoveryEvent({
      subsystem: "transcription",
      severity: "warning",
      code: "TRANSCRIPTION_INTERRUPTED",
      message: reason,
      occurredAt: recovery.interruptedAt ?? nowIso(),
      requestId: null,
      jobId: run.jobId,
      runId: run.id,
      logPath: run.diagnostics.logPath,
      artifactPath: run.diagnostics.artifactDirectory
    });
  }
}

async function recoverSmartRuns(directory: string): Promise<void> {
  const paths = resolveProjectPaths(directory);

  for (const run of listSmartAnalysisRuns(paths.databasePath)) {
    if (!["queued", "running"].includes(run.status) || isRecoverableRecovery(run.recovery)) {
      continue;
    }

    const reason = "The smart analysis run was interrupted before completion.";
    const recovery = createInterruptedRecovery(reason, "retry");
    updateSmartAnalysisRunRecord(paths.databasePath, run.id, {
      status: "failed",
      error: {
        code: "ANALYSIS_INTERRUPTED",
        message: reason
      },
      completedAt: nowIso(),
      recovery
    });
    updateJobRecord(paths.databasePath, run.jobId, {
      status: "failed",
      step: "Interrupted",
      errorMessage: reason,
      recovery
    });
    await logRecoveryEvent({
      subsystem: "smart",
      severity: "warning",
      code: "ANALYSIS_INTERRUPTED",
      message: reason,
      occurredAt: recovery.interruptedAt ?? nowIso(),
      requestId: null,
      jobId: run.jobId,
      runId: run.id,
      logPath: run.diagnostics.logPath,
      artifactPath: run.diagnostics.artifactDirectory ?? run.diagnostics.artifactPath
    });
  }
}

async function recoverWorkflowRuns(directory: string): Promise<void> {
  const paths = resolveProjectPaths(directory);

  for (const run of listWorkflowRuns(paths.databasePath)) {
    if (
      !["queued", "planning", "running"].includes(run.status) ||
      isRecoverableRecovery(run.recovery)
    ) {
      continue;
    }

    const reason = "The workflow run was interrupted before completion.";
    const recovery = createInterruptedRecovery(reason, "resume");
    updateWorkflowRunRecord(paths.databasePath, run.id, {
      status: "failed",
      error: {
        code: "WORKFLOW_FAILED",
        message: reason
      },
      completedAt: nowIso(),
      recovery
    });
    updateJobRecord(paths.databasePath, run.parentJobId, {
      status: "failed",
      step: "Interrupted",
      errorMessage: reason,
      recovery
    });
    await logRecoveryEvent({
      subsystem: "workflow",
      severity: "warning",
      code: "WORKFLOW_INTERRUPTED",
      message: reason,
      occurredAt: recovery.interruptedAt ?? nowIso(),
      requestId: null,
      jobId: run.parentJobId,
      runId: run.id,
      logPath: null,
      artifactPath: resolveProjectPaths(directory).exportArtifactsRoot
    });
  }
}

async function recoverGenericJobs(directory: string): Promise<void> {
  const paths = resolveProjectPaths(directory);

  for (const job of listJobs(paths.databasePath)) {
    if (!["queued", "running"].includes(job.status) || isRecoverableRecovery(job.recovery)) {
      continue;
    }

    if (["export", "transcription", "analysis", "workflow"].includes(job.kind)) {
      continue;
    }

    const reason = "The job was interrupted before completion.";
    const recovery = createInterruptedRecovery(reason, "retry");
    updateJobRecord(paths.databasePath, job.id, {
      status: "failed",
      step: "Interrupted",
      errorMessage: reason,
      recovery
    });
    await logRecoveryEvent({
      subsystem: "worker",
      severity: "warning",
      code: "JOB_INTERRUPTED",
      message: reason,
      occurredAt: recovery.interruptedAt ?? nowIso(),
      requestId: null,
      jobId: job.id,
      runId: null,
      logPath: null,
      artifactPath: null
    });
  }
}

export async function ensureProjectOperationalRecovery(directory: string): Promise<void> {
  const paths = resolveProjectPaths(directory);

  if (recoveredDirectories.has(paths.directory)) {
    return;
  }

  const loadResult = await loadAndMaybeMigrateProject(paths.directory);
  migrationStateByDirectory.set(paths.directory, {
    projectSchemaVersion: loadResult.document.schemaVersion,
    databaseSchemaVersion: loadResult.databaseSchemaVersion,
    projectDocumentMigrated: loadResult.projectDocumentMigrated,
    databaseMigrated: loadResult.databaseMigrated
  });

  await recoverExportRuns(paths.directory);
  await recoverTranscriptionRuns(paths.directory);
  await recoverSmartRuns(paths.directory);
  await recoverWorkflowRuns(paths.directory);
  await recoverGenericJobs(paths.directory);

  recoveredDirectories.add(paths.directory);
}

function createFailureRecord(input: {
  id: string;
  subsystem: DiagnosticsFailureRecord["subsystem"];
  code: string;
  message: string;
  details?: string;
  occurredAt: string;
  jobId?: string | null;
  runId?: string | null;
  logPath?: string | null;
  artifactPath?: string | null;
}): DiagnosticsFailureRecord {
  return {
    id: input.id,
    subsystem: input.subsystem,
    severity: "error",
    code: input.code,
    message: input.message,
    details: input.details,
    occurredAt: input.occurredAt,
    requestId: null,
    jobId: input.jobId ?? null,
    runId: input.runId ?? null,
    logPath: input.logPath ?? null,
    artifactPath: input.artifactPath ?? null
  };
}

function collectRecentFailures(directory: string): DiagnosticsFailureRecord[] {
  const paths = resolveProjectPaths(directory);
  const failures: DiagnosticsFailureRecord[] = [];

  for (const run of listExportRuns(paths.databasePath)) {
    if (!run.error) {
      continue;
    }

    failures.push(
      createFailureRecord({
        id: `export:${run.id}`,
        subsystem: "export",
        code: run.error.code,
        message: run.error.message,
        details: run.error.details,
        occurredAt: run.completedAt ?? run.updatedAt,
        jobId: run.jobId,
        runId: run.id,
        logPath: run.diagnostics.ffmpegLogPath,
        artifactPath: run.artifactDirectory
      })
    );
  }

  for (const run of listTranscriptionRuns(paths.databasePath)) {
    if (!run.error) {
      continue;
    }

    failures.push(
      createFailureRecord({
        id: `transcription:${run.id}`,
        subsystem: "transcription",
        code: run.error.code,
        message: run.error.message,
        details: run.error.details,
        occurredAt: run.completedAt ?? run.updatedAt,
        jobId: run.jobId,
        runId: run.id,
        logPath: run.diagnostics.logPath,
        artifactPath: run.diagnostics.artifactDirectory
      })
    );
  }

  for (const run of listSmartAnalysisRuns(paths.databasePath)) {
    if (!run.error) {
      continue;
    }

    failures.push(
      createFailureRecord({
        id: `smart:${run.id}`,
        subsystem: "smart",
        code: run.error.code,
        message: run.error.message,
        details: run.error.details,
        occurredAt: run.completedAt ?? run.updatedAt,
        jobId: run.jobId,
        runId: run.id,
        logPath: run.diagnostics.logPath,
        artifactPath: run.diagnostics.artifactDirectory ?? run.diagnostics.artifactPath
      })
    );
  }

  for (const run of listWorkflowRuns(paths.databasePath)) {
    if (!run.error) {
      continue;
    }

    failures.push(
      createFailureRecord({
        id: `workflow:${run.id}`,
        subsystem: "workflow",
        code: run.error.code,
        message: run.error.message,
        details: run.error.details,
        occurredAt: run.completedAt ?? run.updatedAt,
        jobId: run.parentJobId,
        runId: run.id,
        artifactPath: null
      })
    );
  }

  for (const job of listJobs(paths.databasePath)) {
    if (!job.errorMessage) {
      continue;
    }

    failures.push(
      createFailureRecord({
        id: `job:${job.id}`,
        subsystem: "worker",
        code: `${job.kind.toUpperCase()}_FAILED`,
        message: job.errorMessage,
        occurredAt: job.updatedAt,
        jobId: job.id
      })
    );
  }

  return failures
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
    .slice(0, 25);
}

function collectRecoverableItems(directory: string): DiagnosticsRecoverableItem[] {
  const paths = resolveProjectPaths(directory);
  const items: DiagnosticsRecoverableItem[] = [];

  for (const run of listExportRuns(paths.databasePath)) {
    if (!isRecoverableRecovery(run.recovery) || !run.recovery.interruptedAt || !run.recovery.reason) {
      continue;
    }

    items.push(
      createRecoverableItem({
        id: run.id,
        kind: "export-run",
        jobId: run.jobId,
        title: `Retry export ${run.presetId}`,
        status: run.status,
        recommendedAction: "retry",
        reason: run.recovery.reason,
        interruptedAt: run.recovery.interruptedAt,
        logPath: run.diagnostics.ffmpegLogPath,
        artifactPath: run.artifactDirectory
      })
    );
  }

  for (const run of listTranscriptionRuns(paths.databasePath)) {
    if (!isRecoverableRecovery(run.recovery) || !run.recovery.interruptedAt || !run.recovery.reason) {
      continue;
    }

    items.push(
      createRecoverableItem({
        id: run.id,
        kind: "transcription-run",
        jobId: run.jobId,
        title: "Retry transcription",
        status: run.status,
        recommendedAction: "retry",
        reason: run.recovery.reason,
        interruptedAt: run.recovery.interruptedAt,
        logPath: run.diagnostics.logPath,
        artifactPath: run.diagnostics.artifactDirectory
      })
    );
  }

  for (const run of listSmartAnalysisRuns(paths.databasePath)) {
    if (!isRecoverableRecovery(run.recovery) || !run.recovery.interruptedAt || !run.recovery.reason) {
      continue;
    }

    items.push(
      createRecoverableItem({
        id: run.id,
        kind: "smart-analysis-run",
        jobId: run.jobId,
        title: "Retry smart analysis",
        status: run.status,
        recommendedAction: "retry",
        reason: run.recovery.reason,
        interruptedAt: run.recovery.interruptedAt,
        logPath: run.diagnostics.logPath,
        artifactPath: run.diagnostics.artifactDirectory ?? run.diagnostics.artifactPath
      })
    );
  }

  for (const run of listWorkflowRuns(paths.databasePath)) {
    if (!isRecoverableRecovery(run.recovery) || !run.recovery.interruptedAt || !run.recovery.reason) {
      continue;
    }

    items.push(
      createRecoverableItem({
        id: run.id,
        kind: "workflow-run",
        jobId: run.parentJobId,
        title: `Resume workflow ${run.templateId}`,
        status: run.status,
        recommendedAction: "resume",
        reason: run.recovery.reason,
        interruptedAt: run.recovery.interruptedAt
      })
    );
  }

  for (const job of listJobs(paths.databasePath)) {
    if (
      !isRecoverableRecovery(job.recovery) ||
      !job.recovery.interruptedAt ||
      !job.recovery.reason
    ) {
      continue;
    }

    if (["export", "transcription", "analysis", "workflow"].includes(job.kind)) {
      continue;
    }

    items.push(
      createRecoverableItem({
        id: job.id,
        kind: "job",
        jobId: job.id,
        title: `Retry ${job.kind} job`,
        status: job.status,
        recommendedAction: "retry",
        reason: job.recovery.reason,
        interruptedAt: job.recovery.interruptedAt
      })
    );
  }

  return items.sort((left, right) => right.interruptedAt.localeCompare(left.interruptedAt));
}

export async function getDiagnosticsSessionSnapshot(
  input: GetDiagnosticsSessionSnapshotInput
): Promise<DiagnosticsSessionSnapshot> {
  await ensureProjectOperationalRecovery(input.directory);
  const loadResult = await loadAndMaybeMigrateProject(input.directory);
  const rememberedMigration =
    migrationStateByDirectory.get(loadResult.paths.directory) ??
    {
      projectSchemaVersion: loadResult.document.schemaVersion,
      databaseSchemaVersion: loadResult.databaseSchemaVersion,
      projectDocumentMigrated: loadResult.projectDocumentMigrated,
      databaseMigrated: loadResult.databaseMigrated
    };
  const workerFailures = await readRecentWorkerDiagnostics(25);
  const currentFailures = collectRecentFailures(loadResult.paths.directory);
  const failureMap = new Map<string, DiagnosticsFailureRecord>();

  for (const record of [...workerFailures, ...currentFailures]) {
    if (!failureMap.has(record.id)) {
      failureMap.set(record.id, record);
    }
  }

  return {
    directory: loadResult.paths.directory,
    projectName: loadResult.document.project.name,
    sessionLogDirectory: process.env.CLAWCUT_SESSION_LOG_DIR ?? null,
    requestLogPath: null,
    workerLogPath: getWorkerDiagnosticLogPath(),
    recentFailures: [...failureMap.values()]
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
      .slice(0, 25),
    recoverableItems: collectRecoverableItems(loadResult.paths.directory),
    migration: rememberedMigration
  };
}

export async function executeDiagnosticsAction(
  input: ExecuteDiagnosticsActionInput
): Promise<ExecuteDiagnosticsActionResult> {
  await ensureProjectOperationalRecovery(input.directory);
  const paths = resolveProjectPaths(input.directory);

  try {
    switch (input.action.type) {
      case "RetryRecoverableItem": {
        if (input.action.targetKind === "job") {
          const job = getStoredJobRecord(paths.databasePath, input.action.targetId);

          if (!job) {
            throw new Error(`Recoverable job ${input.action.targetId} could not be found.`);
          }

          updateJobRecord(paths.databasePath, job.id, {
            recovery: markRecoveryHandled(job.recovery, {
              handledAt: nowIso()
            })
          });
          await retryJob({
            directory: paths.directory,
            jobId: job.id
          });
          break;
        }

        if (input.action.targetKind === "export-run") {
          const run = listExportRuns(paths.databasePath).find((entry) => entry.id === input.action.targetId);

          if (!run) {
            throw new Error(`Recoverable export run ${input.action.targetId} could not be found.`);
          }

          const retryResult = await executeExportCommand({
            directory: paths.directory,
            command: {
              type: "RetryExport",
              exportRunId: run.id
            }
          });

          if (!retryResult.result.ok) {
            throw new Error(retryResult.result.error.message);
          }

          if (retryResult.result.commandType !== "RetryExport") {
            throw new Error("Retry export did not return the expected command result.");
          }

          updateExportRunRecord(paths.databasePath, run.id, {
            recovery: markRecoveryHandled(run.recovery, {
              handledAt: nowIso(),
              replacementRunId: retryResult.result.exportRun.id
            })
          });
          break;
        }

        if (input.action.targetKind === "transcription-run") {
          const run = listTranscriptionRuns(paths.databasePath).find(
            (entry) => entry.id === input.action.targetId
          );

          if (!run) {
            throw new Error(`Recoverable transcription run ${input.action.targetId} could not be found.`);
          }

          updateTranscriptionRunRecord(paths.databasePath, run.id, {
            status: "queued",
            error: null,
            completedAt: null,
            startedAt: null,
            recovery: createEmptyRecoveryInfo()
          });
          updateJobRecord(paths.databasePath, run.jobId, {
            status: "queued",
            progress: 0,
            step: "Queued",
            errorMessage: null,
            recovery: createEmptyRecoveryInfo()
          });
          await retryJob({
            directory: paths.directory,
            jobId: run.jobId
          });
          break;
        }

        if (input.action.targetKind === "smart-analysis-run") {
          await retrySmartAnalysisRun(paths.directory, input.action.targetId);
          break;
        }

        throw new Error(`Retry is not supported for ${input.action.targetKind}.`);
      }

      case "ResumeRecoverableItem": {
        if (input.action.targetKind !== "workflow-run") {
          throw new Error(`Resume is not supported for ${input.action.targetKind}.`);
        }

        const run = listWorkflowRuns(paths.databasePath).find((entry) => entry.id === input.action.targetId);

        if (!run) {
          throw new Error(`Recoverable workflow run ${input.action.targetId} could not be found.`);
        }

        const resumeResult = await executeWorkflowCommand({
          directory: paths.directory,
          command: {
            type: "ResumeWorkflowRun",
            workflowRunId: run.id
          }
        });

        if (!resumeResult.result.ok) {
          throw new Error(resumeResult.result.error.message);
        }

        updateWorkflowRunRecord(paths.databasePath, run.id, {
          recovery: createEmptyRecoveryInfo()
        });
        updateJobRecord(paths.databasePath, run.parentJobId, {
          recovery: createEmptyRecoveryInfo()
        });
        break;
      }

      case "DismissRecoverableItem": {
        if (input.action.targetKind === "job") {
          const job = getStoredJobRecord(paths.databasePath, input.action.targetId);

          if (!job) {
            throw new Error(`Recoverable job ${input.action.targetId} could not be found.`);
          }

          updateJobRecord(paths.databasePath, job.id, {
            recovery: markRecoveryDismissed(job.recovery, nowIso())
          });
        } else if (input.action.targetKind === "export-run") {
          const run = listExportRuns(paths.databasePath).find((entry) => entry.id === input.action.targetId);

          if (!run) {
            throw new Error(`Recoverable export run ${input.action.targetId} could not be found.`);
          }

          updateExportRunRecord(paths.databasePath, run.id, {
            recovery: markRecoveryDismissed(run.recovery, nowIso())
          });
        } else if (input.action.targetKind === "transcription-run") {
          const run = listTranscriptionRuns(paths.databasePath).find(
            (entry) => entry.id === input.action.targetId
          );

          if (!run) {
            throw new Error(`Recoverable transcription run ${input.action.targetId} could not be found.`);
          }

          updateTranscriptionRunRecord(paths.databasePath, run.id, {
            recovery: markRecoveryDismissed(run.recovery, nowIso())
          });
        } else if (input.action.targetKind === "smart-analysis-run") {
          const run = listSmartAnalysisRuns(paths.databasePath).find(
            (entry) => entry.id === input.action.targetId
          );

          if (!run) {
            throw new Error(`Recoverable smart-analysis run ${input.action.targetId} could not be found.`);
          }

          updateSmartAnalysisRunRecord(paths.databasePath, run.id, {
            recovery: markRecoveryDismissed(run.recovery, nowIso())
          });
        } else {
          const run = listWorkflowRuns(paths.databasePath).find((entry) => entry.id === input.action.targetId);

          if (!run) {
            throw new Error(`Recoverable workflow run ${input.action.targetId} could not be found.`);
          }

          updateWorkflowRunRecord(paths.databasePath, run.id, {
            recovery: markRecoveryDismissed(run.recovery, nowIso())
          });
        }

        break;
      }
    }

    return {
      snapshot: await getDiagnosticsSessionSnapshot({
        directory: paths.directory
      }),
      result: {
        ok: true,
        actionType: input.action.type,
        targetKind: input.action.targetKind,
        targetId: input.action.targetId
      }
    };
  } catch (error) {
    return {
      snapshot: await getDiagnosticsSessionSnapshot({
        directory: paths.directory
      }),
      result: {
        ok: false,
        actionType: input.action.type,
        error: {
          code: "DIAGNOSTICS_ACTION_FAILED",
          message: error instanceof Error ? error.message : "Diagnostics action failed."
        }
      }
    };
  }
}
