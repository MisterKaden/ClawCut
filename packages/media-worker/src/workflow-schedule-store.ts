import { z } from "zod";

import { workflowScheduleSchema, type WorkflowSchedule } from "@clawcut/domain";

import { WorkerError, nowIso } from "./utils";
import { readJsonStore, writeJsonStore } from "./user-data-store";

const WORKFLOW_SCHEDULE_COLLECTION_VERSION = 1 as const;
const WORKFLOW_SCHEDULES_FILE_NAME = "workflow-schedules.json";

const workflowScheduleCollectionSchema = z.object({
  version: z.literal(WORKFLOW_SCHEDULE_COLLECTION_VERSION),
  items: z.array(workflowScheduleSchema)
});

interface WorkflowScheduleCollection {
  version: typeof WORKFLOW_SCHEDULE_COLLECTION_VERSION;
  items: WorkflowSchedule[];
}

function createEmptyWorkflowScheduleCollection(): WorkflowScheduleCollection {
  return {
    version: WORKFLOW_SCHEDULE_COLLECTION_VERSION,
    items: []
  };
}

async function loadWorkflowScheduleCollection(): Promise<WorkflowScheduleCollection> {
  const raw = await readJsonStore<unknown>(
    WORKFLOW_SCHEDULES_FILE_NAME,
    createEmptyWorkflowScheduleCollection()
  );
  const parsed = workflowScheduleCollectionSchema.safeParse(raw);
  return parsed.success ? parsed.data : createEmptyWorkflowScheduleCollection();
}

async function saveWorkflowScheduleCollection(items: WorkflowSchedule[]): Promise<void> {
  await writeJsonStore(WORKFLOW_SCHEDULES_FILE_NAME, {
    version: WORKFLOW_SCHEDULE_COLLECTION_VERSION,
    items
  });
}

export function computeNextScheduleRunAt(
  schedule: WorkflowSchedule,
  baseTimestamp: string = nowIso()
): string {
  const base = new Date(baseTimestamp).getTime();
  return new Date(base + schedule.trigger.intervalMinutes * 60_000).toISOString();
}

export async function listWorkflowSchedules(): Promise<WorkflowSchedule[]> {
  return (await loadWorkflowScheduleCollection()).items;
}

export async function getWorkflowSchedule(scheduleId: string): Promise<WorkflowSchedule | null> {
  return (await listWorkflowSchedules()).find((schedule) => schedule.id === scheduleId) ?? null;
}

export async function createWorkflowSchedule(input: unknown): Promise<WorkflowSchedule> {
  const parsed = workflowScheduleSchema.parse(input);
  const collection = await loadWorkflowScheduleCollection();

  if (collection.items.some((schedule) => schedule.id === parsed.id)) {
    throw new WorkerError(
      "WORKFLOW_INVALID_INPUT",
      `Workflow schedule ${parsed.id} already exists.`
    );
  }

  const created: WorkflowSchedule = {
    ...parsed,
    nextRunAt:
      parsed.enabled && !parsed.nextRunAt ? computeNextScheduleRunAt(parsed, parsed.createdAt) : parsed.nextRunAt,
    updatedAt: nowIso()
  };
  await saveWorkflowScheduleCollection([...collection.items, created]);
  return created;
}

export async function updateWorkflowSchedule(
  scheduleId: string,
  input: unknown
): Promise<WorkflowSchedule> {
  const collection = await loadWorkflowScheduleCollection();
  const index = collection.items.findIndex((schedule) => schedule.id === scheduleId);

  if (index === -1) {
    throw new WorkerError(
      "WORKFLOW_SCHEDULE_NOT_FOUND",
      `Workflow schedule ${scheduleId} could not be found.`
    );
  }

  const current = collection.items[index];
  const partialInput =
    input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const parsed = workflowScheduleSchema.parse({
    ...partialInput,
    id: scheduleId,
    createdAt: current.createdAt,
    updatedAt: nowIso()
  });
  const next = [...collection.items];
  next[index] = parsed;
  await saveWorkflowScheduleCollection(next);
  return parsed;
}

export async function setWorkflowScheduleEnabled(
  scheduleId: string,
  enabled: boolean
): Promise<WorkflowSchedule> {
  const schedule = await getWorkflowSchedule(scheduleId);

  if (!schedule) {
    throw new WorkerError(
      "WORKFLOW_SCHEDULE_NOT_FOUND",
      `Workflow schedule ${scheduleId} could not be found.`
    );
  }

  return updateWorkflowSchedule(scheduleId, {
    ...schedule,
    enabled,
    nextRunAt: enabled ? computeNextScheduleRunAt(schedule) : null,
    updatedAt: nowIso()
  });
}

export async function deleteWorkflowSchedule(scheduleId: string): Promise<void> {
  const collection = await loadWorkflowScheduleCollection();

  if (!collection.items.some((schedule) => schedule.id === scheduleId)) {
    throw new WorkerError(
      "WORKFLOW_SCHEDULE_NOT_FOUND",
      `Workflow schedule ${scheduleId} could not be found.`
    );
  }

  await saveWorkflowScheduleCollection(
    collection.items.filter((schedule) => schedule.id !== scheduleId)
  );
}

export async function recordWorkflowScheduleRunResult(
  scheduleId: string,
  input: {
    status: WorkflowSchedule["lastRunStatus"];
    workflowRunId: string | null;
    error: WorkflowSchedule["lastError"];
    timestamp?: string;
  }
): Promise<WorkflowSchedule> {
  const schedule = await getWorkflowSchedule(scheduleId);

  if (!schedule) {
    throw new WorkerError(
      "WORKFLOW_SCHEDULE_NOT_FOUND",
      `Workflow schedule ${scheduleId} could not be found.`
    );
  }

  const timestamp = input.timestamp ?? nowIso();

  return updateWorkflowSchedule(scheduleId, {
    ...schedule,
    lastRunAt: timestamp,
    nextRunAt: schedule.enabled ? computeNextScheduleRunAt(schedule, timestamp) : null,
    lastRunStatus: input.status,
    lastWorkflowRunId: input.workflowRunId,
    lastError: input.error,
    updatedAt: nowIso()
  });
}
