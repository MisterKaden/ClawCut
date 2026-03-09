import { z } from "zod";

import {
  resolveWorkflowTemplate,
  workflowProfileSchema,
  type WorkflowProfile
} from "@clawcut/domain";

import { WorkerError, nowIso } from "./utils";
import { readJsonStore, writeJsonStore } from "./user-data-store";

const WORKFLOW_PROFILE_COLLECTION_VERSION = 1 as const;
const WORKFLOW_PROFILES_FILE_NAME = "workflow-profiles.json";

const workflowProfileCollectionSchema = z.object({
  version: z.literal(WORKFLOW_PROFILE_COLLECTION_VERSION),
  items: z.array(workflowProfileSchema)
});

interface WorkflowProfileCollection {
  version: typeof WORKFLOW_PROFILE_COLLECTION_VERSION;
  items: WorkflowProfile[];
}

function createEmptyWorkflowProfileCollection(): WorkflowProfileCollection {
  return {
    version: WORKFLOW_PROFILE_COLLECTION_VERSION,
    items: []
  };
}

async function loadWorkflowProfileCollection(): Promise<WorkflowProfileCollection> {
  const raw = await readJsonStore<unknown>(
    WORKFLOW_PROFILES_FILE_NAME,
    createEmptyWorkflowProfileCollection()
  );
  const parsed = workflowProfileCollectionSchema.safeParse(raw);
  return parsed.success ? parsed.data : createEmptyWorkflowProfileCollection();
}

async function saveWorkflowProfileCollection(items: WorkflowProfile[]): Promise<void> {
  await writeJsonStore(WORKFLOW_PROFILES_FILE_NAME, {
    version: WORKFLOW_PROFILE_COLLECTION_VERSION,
    items
  });
}

function validateWorkflowProfileTemplate(profile: WorkflowProfile): void {
  const template = resolveWorkflowTemplate(profile.templateId);

  if (!template) {
    throw new WorkerError(
      "WORKFLOW_PROFILE_NOT_FOUND",
      `Workflow template ${profile.templateId} is not available for this profile.`
    );
  }

  if (profile.compatibility.templateId !== template.id) {
    throw new WorkerError(
      "WORKFLOW_INVALID_INPUT",
      "Workflow profile compatibility metadata does not match the selected template."
    );
  }
}

export async function listWorkflowProfiles(): Promise<WorkflowProfile[]> {
  return (await loadWorkflowProfileCollection()).items;
}

export async function getWorkflowProfile(profileId: string): Promise<WorkflowProfile | null> {
  return (await listWorkflowProfiles()).find((profile) => profile.id === profileId) ?? null;
}

export async function createWorkflowProfile(input: unknown): Promise<WorkflowProfile> {
  const parsed = workflowProfileSchema.parse(input);
  validateWorkflowProfileTemplate(parsed);
  const collection = await loadWorkflowProfileCollection();

  if (collection.items.some((profile) => profile.id === parsed.id)) {
    throw new WorkerError(
      "WORKFLOW_INVALID_INPUT",
      `Workflow profile ${parsed.id} already exists.`
    );
  }

  const created: WorkflowProfile = {
    ...parsed,
    createdAt: parsed.createdAt || nowIso(),
    updatedAt: nowIso()
  };
  await saveWorkflowProfileCollection([...collection.items, created]);
  return created;
}

export async function updateWorkflowProfile(
  profileId: string,
  input: unknown
): Promise<WorkflowProfile> {
  const collection = await loadWorkflowProfileCollection();
  const index = collection.items.findIndex((profile) => profile.id === profileId);

  if (index === -1) {
    throw new WorkerError(
      "WORKFLOW_PROFILE_NOT_FOUND",
      `Workflow profile ${profileId} could not be found.`
    );
  }

  const current = collection.items[index];
  const partialInput =
    input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const parsed = workflowProfileSchema.parse({
    ...partialInput,
    id: profileId,
    createdAt: current.createdAt,
    updatedAt: nowIso()
  });
  validateWorkflowProfileTemplate(parsed);
  const next = [...collection.items];
  next[index] = parsed;
  await saveWorkflowProfileCollection(next);
  return parsed;
}

export async function deleteWorkflowProfile(profileId: string): Promise<void> {
  const collection = await loadWorkflowProfileCollection();

  if (!collection.items.some((profile) => profile.id === profileId)) {
    throw new WorkerError(
      "WORKFLOW_PROFILE_NOT_FOUND",
      `Workflow profile ${profileId} could not be found.`
    );
  }

  await saveWorkflowProfileCollection(
    collection.items.filter((profile) => profile.id !== profileId)
  );
}
