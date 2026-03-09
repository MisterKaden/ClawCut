import {
  resolveWorkflowTemplate,
  type WorkflowProfileApprovalPolicy,
  type WorkflowSchedule,
  type WorkflowTemplate
} from "@clawcut/domain";
import {
  getWorkflowProfile,
  listWorkflowSchedules,
  recordWorkflowScheduleRunResult,
  type MediaWorkerClient
} from "@clawcut/media-worker";

interface WorkflowSchedulerOptions {
  worker: MediaWorkerClient;
  intervalMs?: number;
}

export interface WorkflowScheduler {
  start(): void;
  stop(): void;
}

function applyApprovalPolicy(
  template: WorkflowTemplate,
  approvalPolicy: WorkflowSchedule["approvalPolicy"] | WorkflowProfileApprovalPolicy,
  inputOverrides: Record<string, unknown>
): Record<string, unknown> {
  if (approvalPolicy !== "force-approval") {
    return inputOverrides;
  }

  const next = { ...inputOverrides };

  for (const field of template.inputSchema.fields) {
    if (field.id === "requireApproval" || field.id === "requireApprovalForExport") {
      next[field.id] = true;
    }
  }

  return next;
}

function applyTargetResolver(
  template: WorkflowTemplate,
  inputOverrides: Record<string, unknown>,
  clipIds: string[],
  resolver: WorkflowSchedule["targetResolver"]
): Record<string, unknown> {
  if (resolver.kind === "use-profile-defaults") {
    return inputOverrides;
  }

  const resolvedClipIds =
    resolver.kind === "static-clip-ids"
      ? resolver.clipIds ?? []
      : clipIds;
  const next = { ...inputOverrides };
  const primaryClipId = resolvedClipIds[0] ?? "";

  for (const field of template.inputSchema.fields) {
    if (field.type === "clip-id") {
      next[field.id] = primaryClipId;
    }

    if (field.type === "string-array") {
      next[field.id] = resolvedClipIds;
    }
  }

  return next;
}

async function collectVideoClipIds(
  worker: MediaWorkerClient,
  directory: string
): Promise<string[]> {
  const snapshot = await worker.getEditorSessionSnapshot({ directory });
  return Object.values(snapshot.timeline.clipsById)
    .filter((clip) => clip.streamType === "video")
    .map((clip) => clip.id);
}

function isActiveWorkflowStatus(status: string): boolean {
  return (
    status === "queued" ||
    status === "planning" ||
    status === "running" ||
    status === "waiting-approval"
  );
}

async function synchronizeScheduledRun(
  worker: MediaWorkerClient,
  schedule: WorkflowSchedule
): Promise<void> {
  if (schedule.lastRunStatus !== "scheduled" || !schedule.lastWorkflowRunId) {
    return;
  }

  const snapshot = await worker.getWorkflowSessionSnapshot({ directory: schedule.projectPath });
  const run = snapshot.workflowRuns.find((entry) => entry.id === schedule.lastWorkflowRunId);

  if (!run || isActiveWorkflowStatus(run.status)) {
    return;
  }

  await recordWorkflowScheduleRunResult(schedule.id, {
    status: run.status,
    workflowRunId: run.id,
    error: run.error
  });
}

async function processSchedule(
  worker: MediaWorkerClient,
  schedule: WorkflowSchedule
): Promise<void> {
  await synchronizeScheduledRun(worker, schedule);

  if (!schedule.enabled || !schedule.nextRunAt) {
    return;
  }

  if (new Date(schedule.nextRunAt).getTime() > Date.now()) {
    return;
  }

  const profile = await getWorkflowProfile(schedule.workflowProfileId);

  if (!profile) {
    await recordWorkflowScheduleRunResult(schedule.id, {
      status: "failed",
      workflowRunId: null,
      error: {
        code: "WORKFLOW_PROFILE_NOT_FOUND",
        message: `Workflow profile ${schedule.workflowProfileId} could not be found.`
      }
    });
    return;
  }

  const template = resolveWorkflowTemplate(profile.templateId);

  if (!template) {
    await recordWorkflowScheduleRunResult(schedule.id, {
      status: "failed",
      workflowRunId: null,
      error: {
        code: "WORKFLOW_NOT_FOUND",
        message: `Workflow template ${profile.templateId} could not be resolved.`
      }
    });
    return;
  }

  const workflowSnapshot = await worker.getWorkflowSessionSnapshot({
    directory: schedule.projectPath
  });
  const activeRun = workflowSnapshot.workflowRuns.find(
    (run) =>
      isActiveWorkflowStatus(run.status) &&
      (run.scheduleId === schedule.id || run.profileId === profile.id)
  );

  if (activeRun && schedule.concurrencyPolicy === "skip-if-running") {
    await recordWorkflowScheduleRunResult(schedule.id, {
      status: "skipped",
      workflowRunId: activeRun.id,
      error: null
    });
    return;
  }

  const clipIds = await collectVideoClipIds(worker, schedule.projectPath);
  let inputOverrides = applyTargetResolver(template, {}, clipIds, schedule.targetResolver);
  inputOverrides = applyApprovalPolicy(template, schedule.approvalPolicy, inputOverrides);

  const result = await worker.executeWorkflowCommand({
    directory: schedule.projectPath,
    command: {
      type: "RunWorkflowProfile",
      profileId: profile.id,
      inputOverrides,
      invocation: {
        kind: "schedule",
        scheduleId: schedule.id
      }
    }
  });

  if (!result.result.ok || result.result.commandType !== "RunWorkflowProfile") {
    await recordWorkflowScheduleRunResult(schedule.id, {
      status: "failed",
      workflowRunId: null,
      error: result.result.ok
        ? {
            code: "WORKFLOW_FAILED",
            message: "Scheduled workflow run did not return the expected result."
          }
        : result.result.error
    });
    return;
  }

  await recordWorkflowScheduleRunResult(schedule.id, {
    status: "scheduled",
    workflowRunId: result.result.workflowRun.id,
    error: null
  });
}

export function createWorkflowScheduler(
  options: WorkflowSchedulerOptions
): WorkflowScheduler {
  const intervalMs =
    options.intervalMs ??
    Math.max(250, Number(process.env.CLAWCUT_WORKFLOW_SCHEDULER_INTERVAL_MS ?? "15000") || 15_000);
  let timer: NodeJS.Timeout | null = null;
  let running = false;

  async function tick(): Promise<void> {
    if (running) {
      return;
    }

    running = true;

    try {
      const schedules = await listWorkflowSchedules();

      for (const schedule of schedules) {
        await processSchedule(options.worker, schedule);
      }
    } finally {
      running = false;
    }
  }

  return {
    start() {
      if (timer) {
        return;
      }

      timer = setInterval(() => {
        void tick();
      }, intervalMs);
      void tick();
    },
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    }
  };
}
