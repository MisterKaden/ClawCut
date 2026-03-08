import { randomUUID } from "node:crypto";
import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";

import {
  createEmptyProjectDocument,
  setCaptionExportDefaults,
  setDefaultBrandKitId,
  type CaptionExportDefaults,
  type CaptionTrack,
  type DerivedAsset,
  type DerivedAssetType,
  type MediaItem,
  type Job,
  type JobState,
  type MediaRelinkStatus,
  migrateProjectDocument,
  type Transcript,
  type ProjectDocumentV3,
  serializeProjectDocument,
  touchProjectDocument,
  upsertCaptionTrack,
  upsertTranscript,
  upsertMediaItem
} from "@clawcut/domain";
import type {
  ProjectWorkspaceSnapshot
} from "@clawcut/ipc";

import { resolveProjectPaths, type ProjectPaths } from "./paths";
import { openProjectDatabase } from "./sqlite";
import { WorkerError, nowIso } from "./utils";
import type {
  PersistedExportJobPayload,
  PersistedDerivedJobPayload,
  PersistedIngestJobPayload,
  PersistedJobPayload,
  PersistedSmartAnalysisJobPayload,
  PersistedTranscriptionJobPayload,
  PersistedWorkflowJobPayload,
  StoredJobRecord
} from "./job-payloads";

interface ProjectLoadResult {
  document: ProjectDocumentV3;
  migrated: boolean;
}

function sortMediaItems(items: MediaItem[]): MediaItem[] {
  return [...items].sort((left, right) =>
    right.importTimestamp.localeCompare(left.importTimestamp)
  );
}

function sortJobs(jobs: Job[]): Job[] {
  return [...jobs].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

async function fileExists(path: string | null): Promise<boolean> {
  if (!path) {
    return false;
  }

  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function computeRequiredDerivedTypes(item: MediaItem): DerivedAssetType[] {
  const required: DerivedAssetType[] = [];

  if (item.metadataSummary.hasVideo) {
    required.push("thumbnail", "proxy");
  }

  if (item.metadataSummary.hasAudio) {
    required.push("waveform");
  }

  return required;
}

function computeMediaStatus(item: MediaItem): MediaItem["ingestStatus"] {
  if (item.relinkStatus === "missing") {
    return "missing";
  }

  const required = computeRequiredDerivedTypes(item);

  if (required.length === 0) {
    return item.errorState ? "warning" : "ready";
  }

  const assets = required.map((type) => item.derivedAssets[type]);

  if (assets.some((asset) => asset === null || asset.status === "pending")) {
    return "deriving";
  }

  if (assets.some((asset) => asset?.status === "failed")) {
    return "warning";
  }

  return item.errorState ? "warning" : "ready";
}

function clearErrorStateWhenHealthy(item: MediaItem): MediaItem {
  if (item.errorState?.code === "SOURCE_MISSING") {
    return {
      ...item,
      errorState: null
    };
  }

  return item;
}

async function loadProjectDocument(paths: ProjectPaths): Promise<ProjectLoadResult> {
  const rawContents = await readFile(paths.projectFilePath, "utf8");
  const rawInput = JSON.parse(rawContents) as { schemaVersion?: number };
  const document = migrateProjectDocument(JSON.parse(rawContents));

  return {
    document,
    migrated: rawInput.schemaVersion !== document.schemaVersion
  };
}

export async function saveProjectDocument(
  paths: ProjectPaths,
  document: ProjectDocumentV3
): Promise<void> {
  await mkdir(paths.directory, { recursive: true });
  const temporaryProjectPath = `${paths.projectFilePath}.${process.pid}.tmp`;

  await writeFile(temporaryProjectPath, serializeProjectDocument(document), "utf8");
  await rename(temporaryProjectPath, paths.projectFilePath);
}

function rowToMediaJob(row: {
  id: string;
  project_directory: string;
  media_item_id: string | null;
  kind: "ingest" | DerivedAssetType | "export" | "transcription" | "analysis" | "workflow";
  status: JobState;
  progress: number;
  step: string;
  attempt_count: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  payload_json: string;
}): Job {
  const payload = JSON.parse(row.payload_json) as PersistedJobPayload;

  if (row.kind === "ingest") {
    return {
      id: row.id,
      kind: "ingest",
      projectDirectory: row.project_directory,
      mediaItemId: row.media_item_id,
      progress: row.progress,
      step: row.step,
      status: row.status,
      attemptCount: row.attempt_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      errorMessage: row.error_message,
      sourcePath: (payload as PersistedIngestJobPayload).sourcePath
    };
  }

  if (row.kind === "export") {
    const payload = JSON.parse(row.payload_json) as PersistedExportJobPayload;

    return {
      id: row.id,
      kind: "export",
      projectDirectory: row.project_directory,
      mediaItemId: row.media_item_id,
      progress: row.progress,
      step: row.step,
      status: row.status,
      attemptCount: row.attempt_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      errorMessage: row.error_message,
      exportRunId: payload.exportRunId,
      exportMode: payload.exportMode,
      presetId: payload.presetId,
      outputPath: payload.outputPath
    };
  }

  if (row.kind === "transcription") {
    const payload = JSON.parse(row.payload_json) as PersistedTranscriptionJobPayload;

    return {
      id: row.id,
      kind: "transcription",
      projectDirectory: row.project_directory,
      mediaItemId: row.media_item_id,
      progress: row.progress,
      step: row.step,
      status: row.status,
      attemptCount: row.attempt_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      errorMessage: row.error_message,
      transcriptionRunId: payload.transcriptionRunId,
      transcriptId: payload.transcriptId,
      sourceClipId: payload.clipId,
      subtitleFormat: payload.subtitleFormat
    };
  }

  if (row.kind === "analysis") {
    const payload = JSON.parse(row.payload_json) as PersistedSmartAnalysisJobPayload;

    return {
      id: row.id,
      kind: "analysis",
      projectDirectory: row.project_directory,
      mediaItemId: row.media_item_id,
      progress: row.progress,
      step: row.step,
      status: row.status,
      attemptCount: row.attempt_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      errorMessage: row.error_message,
      analysisRunId: payload.analysisRunId,
      analysisType: payload.analysisType,
      suggestionSetId: payload.suggestionSetId
    };
  }

  if (row.kind === "workflow") {
    const payload = JSON.parse(row.payload_json) as PersistedWorkflowJobPayload;

    return {
      id: row.id,
      kind: "workflow",
      projectDirectory: row.project_directory,
      mediaItemId: row.media_item_id,
      progress: row.progress,
      step: row.step,
      status: row.status,
      attemptCount: row.attempt_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      errorMessage: row.error_message,
      workflowRunId: payload.workflowRunId,
      templateId: payload.templateId,
      childJobIds: payload.childJobIds
    };
  }

  return {
    id: row.id,
    kind: row.kind,
    projectDirectory: row.project_directory,
    mediaItemId: row.media_item_id,
    progress: row.progress,
    step: row.step,
    status: row.status,
    attemptCount: row.attempt_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    errorMessage: row.error_message,
    sourceRevision: (payload as PersistedDerivedJobPayload).sourceRevision,
    presetKey: (payload as PersistedDerivedJobPayload).presetKey
  };
}

export function listJobs(databasePath: string): Job[] {
  const { database, close } = openProjectDatabase(databasePath);

  try {
    const rows = database
      .prepare(`
        SELECT
          id,
          project_directory,
          media_item_id,
          kind,
          status,
          progress,
          step,
          attempt_count,
          error_message,
          created_at,
          updated_at,
          payload_json
        FROM job_runs
        ORDER BY updated_at DESC
      `)
      .all() as Array<{
      id: string;
      project_directory: string;
      media_item_id: string | null;
      kind: "ingest" | DerivedAssetType | "export" | "transcription" | "analysis" | "workflow";
      status: JobState;
      progress: number;
      step: string;
      attempt_count: number;
      error_message: string | null;
      created_at: string;
      updated_at: string;
      payload_json: string;
    }>;

    return rows.map(rowToMediaJob);
  } finally {
    close();
  }
}

export function getStoredJobRecord(databasePath: string, jobId: string): StoredJobRecord | null {
  const { database, close } = openProjectDatabase(databasePath);

  try {
    const row = database
      .prepare(`
        SELECT
          id,
          project_directory,
          media_item_id,
          kind,
          status,
          progress,
          step,
          attempt_count,
          error_message,
          created_at,
          updated_at,
          payload_json
        FROM job_runs
        WHERE id = ?
      `)
      .get(jobId) as
      | {
          id: string;
          project_directory: string;
          media_item_id: string | null;
          kind: "ingest" | DerivedAssetType | "export" | "transcription" | "analysis" | "workflow";
          status: JobState;
          progress: number;
          step: string;
          attempt_count: number;
          error_message: string | null;
          created_at: string;
          updated_at: string;
          payload_json: string;
        }
      | undefined;

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      projectDirectory: row.project_directory,
      mediaItemId: row.media_item_id,
      kind: row.kind,
      status: row.status,
      progress: row.progress,
      step: row.step,
      attemptCount: row.attempt_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      errorMessage: row.error_message,
      payload: JSON.parse(row.payload_json) as PersistedJobPayload
    };
  } finally {
    close();
  }
}

export function createJobRecord(
  databasePath: string,
  input: {
    kind: "ingest" | DerivedAssetType | "export" | "transcription" | "analysis" | "workflow";
    projectDirectory: string;
    mediaItemId?: string | null;
    payload: PersistedJobPayload;
    status?: JobState;
    progress?: number;
    step?: string;
    errorMessage?: string | null;
  }
): string {
  const { database, close } = openProjectDatabase(databasePath);
  const timestamp = nowIso();
  const jobId = randomUUID();

  try {
    database
      .prepare(`
        INSERT INTO job_runs (
          id,
          project_directory,
          media_item_id,
          kind,
          status,
          progress,
          step,
          attempt_count,
          error_message,
          created_at,
          updated_at,
          payload_json
        )
        VALUES (
          @id,
          @project_directory,
          @media_item_id,
          @kind,
          @status,
          @progress,
          @step,
          @attempt_count,
          @error_message,
          @created_at,
          @updated_at,
          @payload_json
        )
      `)
      .run({
        id: jobId,
        project_directory: input.projectDirectory,
        media_item_id: input.mediaItemId ?? null,
        kind: input.kind,
        status: input.status ?? "queued",
        progress: input.progress ?? 0,
        step: input.step ?? "Queued",
        attempt_count: 0,
        error_message: input.errorMessage ?? null,
        created_at: timestamp,
        updated_at: timestamp,
        payload_json: JSON.stringify(input.payload)
      });

    return jobId;
  } finally {
    close();
  }
}

export function updateJobRecord(
  databasePath: string,
  jobId: string,
  updates: Partial<Omit<StoredJobRecord, "id" | "projectDirectory" | "payload">> & {
    payload?: PersistedJobPayload;
  }
): void {
  const existing = getStoredJobRecord(databasePath, jobId);

  if (!existing) {
    throw new WorkerError("JOB_NOT_FOUND", `Job ${jobId} could not be found.`);
  }

  const { database, close } = openProjectDatabase(databasePath);

  try {
    const resolvedProgress =
      typeof updates.progress === "number" && Number.isFinite(updates.progress)
        ? updates.progress
        : existing.progress;

    database
      .prepare(`
        UPDATE job_runs
        SET
          media_item_id = @media_item_id,
          status = @status,
          progress = @progress,
          step = @step,
          attempt_count = @attempt_count,
          error_message = @error_message,
          updated_at = @updated_at,
          payload_json = @payload_json
        WHERE id = @id
      `)
      .run({
        id: jobId,
        media_item_id: updates.mediaItemId ?? existing.mediaItemId,
        status: updates.status ?? existing.status,
        progress: resolvedProgress,
        step: updates.step ?? existing.step,
        attempt_count: updates.attemptCount ?? existing.attemptCount,
        error_message:
          updates.errorMessage === undefined ? existing.errorMessage : updates.errorMessage,
        updated_at: nowIso(),
        payload_json: JSON.stringify(updates.payload ?? existing.payload)
      });
  } finally {
    close();
  }
}

export function upsertDerivedAssetManifest(
  databasePath: string,
  mediaItemId: string,
  asset: DerivedAsset
): void {
  const { database, close } = openProjectDatabase(databasePath);

  try {
    database
      .prepare(`
        INSERT INTO derived_assets (
          id,
          media_item_id,
          type,
          status,
          relative_path,
          source_revision,
          preset_key,
          generated_at,
          file_size,
          error_message,
          metadata_json,
          updated_at
        )
        VALUES (
          @id,
          @media_item_id,
          @type,
          @status,
          @relative_path,
          @source_revision,
          @preset_key,
          @generated_at,
          @file_size,
          @error_message,
          @metadata_json,
          @updated_at
        )
        ON CONFLICT(id) DO UPDATE SET
          status = excluded.status,
          relative_path = excluded.relative_path,
          source_revision = excluded.source_revision,
          preset_key = excluded.preset_key,
          generated_at = excluded.generated_at,
          file_size = excluded.file_size,
          error_message = excluded.error_message,
          metadata_json = excluded.metadata_json,
          updated_at = excluded.updated_at
      `)
      .run({
        id: asset.id,
        media_item_id: mediaItemId,
        type: asset.type,
        status: asset.status,
        relative_path: asset.relativePath,
        source_revision: asset.sourceRevision,
        preset_key: asset.presetKey,
        generated_at: asset.generatedAt,
        file_size: asset.fileSize,
        error_message: asset.errorMessage,
        metadata_json: JSON.stringify(asset),
        updated_at: nowIso()
      });
  } finally {
    close();
  }
}

export async function createProject(
  directory: string,
  name?: string
): Promise<ProjectWorkspaceSnapshot> {
  const paths = resolveProjectPaths(directory);

  await mkdir(paths.directory, { recursive: true });
  await mkdir(paths.cacheRoot, { recursive: true });

  if (await fileExists(paths.projectFilePath)) {
    throw new WorkerError(
      "PROJECT_EXISTS",
      `A Clawcut project already exists at ${paths.projectFilePath}.`
    );
  }

  const document = createEmptyProjectDocument(name?.trim() || "Clawcut Session");
  await saveProjectDocument(paths, document);
  openProjectDatabase(paths.databasePath).close();

  return getProjectSnapshot(directory);
}

export async function loadAndMaybeMigrateProject(
  directory: string
): Promise<{ paths: ProjectPaths; document: ProjectDocumentV3 }> {
  const paths = resolveProjectPaths(directory);

  if (!(await fileExists(paths.projectFilePath))) {
    throw new WorkerError(
      "PROJECT_NOT_FOUND",
      `No Clawcut project was found in ${paths.directory}.`,
      `Expected ${paths.projectFilePath}.`
    );
  }

  const loadResult = await loadProjectDocument(paths);

  if (loadResult.migrated) {
    await saveProjectDocument(paths, loadResult.document);
  }

  openProjectDatabase(paths.databasePath).close();

  return {
    paths,
    document: loadResult.document
  };
}

export async function setProjectDocument(
  directory: string,
  document: ProjectDocumentV3
): Promise<ProjectDocumentV3> {
  const paths = resolveProjectPaths(directory);
  await saveProjectDocument(paths, document);
  return document;
}

export async function getProjectSnapshot(
  directory: string
): Promise<ProjectWorkspaceSnapshot> {
  const { paths, document } = await loadAndMaybeMigrateProject(directory);

  return {
    directory: paths.directory,
    projectFilePath: paths.projectFilePath,
    databasePath: paths.databasePath,
    cacheRoot: paths.cacheRoot,
    document,
    libraryItems: sortMediaItems(document.library.items),
    jobs: sortJobs(listJobs(paths.databasePath))
  };
}

export async function openProject(
  directory: string
): Promise<ProjectWorkspaceSnapshot> {
  return refreshMediaHealth(directory);
}

export async function refreshMediaHealth(
  directory: string
): Promise<ProjectWorkspaceSnapshot> {
  const { paths, document } = await loadAndMaybeMigrateProject(directory);
  const timestamp = nowIso();

  let changed = false;
  const nextItems: MediaItem[] = [];

  for (const item of document.library.items) {
    const sourceExists = await fileExists(item.source.currentResolvedPath);

    if (!sourceExists) {
      const nextRelinkStatus: MediaRelinkStatus = "missing";
      const nextItem: MediaItem = {
        ...item,
        ingestStatus: "missing",
        relinkStatus: nextRelinkStatus,
        errorState: {
          code: "SOURCE_MISSING",
          message: "The original source media could not be found.",
          updatedAt: timestamp
        }
      };

      if (JSON.stringify(nextItem) !== JSON.stringify(item)) {
        changed = true;
      }

      nextItems.push(nextItem);
      continue;
    }

    const recoveredItem = clearErrorStateWhenHealthy({
      ...item,
      lastSeenTimestamp: timestamp,
      relinkStatus: item.relinkStatus === "missing" ? "relinked" : item.relinkStatus
    });
    const nextItem = {
      ...recoveredItem,
      ingestStatus: computeMediaStatus(recoveredItem)
    };

    if (JSON.stringify(nextItem) !== JSON.stringify(item)) {
      changed = true;
    }

    nextItems.push(nextItem);
  }

  if (changed) {
    const nextDocument = touchProjectDocument({
      ...document,
      library: {
        items: nextItems
      }
    });

    await saveProjectDocument(paths, nextDocument);
  }

  return getProjectSnapshot(directory);
}

export async function updateMediaItem(
  directory: string,
  mediaItem: MediaItem
): Promise<ProjectDocumentV3> {
  const { paths, document } = await loadAndMaybeMigrateProject(directory);
  const nextDocument = upsertMediaItem(document, mediaItem);

  await saveProjectDocument(paths, nextDocument);

  return nextDocument;
}

export async function updateDerivedAssetForMediaItem(
  directory: string,
  mediaItemId: string,
  asset: DerivedAsset
): Promise<ProjectDocumentV3> {
  const { paths, document } = await loadAndMaybeMigrateProject(directory);
  const existingItem = document.library.items.find((entry) => entry.id === mediaItemId);

  if (!existingItem) {
    throw new WorkerError("MEDIA_ITEM_NOT_FOUND", `Media item ${mediaItemId} does not exist.`);
  }

  const nextItem: MediaItem = {
    ...existingItem,
    derivedAssets: {
      ...existingItem.derivedAssets,
      [asset.type]: asset
    },
    ingestStatus: computeMediaStatus({
      ...existingItem,
      derivedAssets: {
        ...existingItem.derivedAssets,
        [asset.type]: asset
      }
    })
  };

  const nextDocument = upsertMediaItem(document, nextItem);
  await saveProjectDocument(paths, nextDocument);
  upsertDerivedAssetManifest(paths.databasePath, mediaItemId, asset);

  return nextDocument;
}

export async function markMediaItemDerivedFailure(
  directory: string,
  mediaItemId: string,
  assetType: DerivedAssetType,
  relativePath: string,
  sourceRevision: string,
  presetKey: string,
  message: string
): Promise<ProjectDocumentV3> {
  const { paths, document } = await loadAndMaybeMigrateProject(directory);
  const existingItem = document.library.items.find((entry) => entry.id === mediaItemId);

  if (!existingItem) {
    throw new WorkerError("MEDIA_ITEM_NOT_FOUND", `Media item ${mediaItemId} does not exist.`);
  }

  const failedAsset: DerivedAsset =
    assetType === "thumbnail"
      ? {
          id: `${mediaItemId}:thumbnail`,
          type: "thumbnail",
          status: "failed",
          relativePath,
          sourceRevision,
          presetKey,
          generatedAt: null,
          fileSize: null,
          errorMessage: message,
          width: null,
          height: null
        }
      : assetType === "waveform"
        ? {
            id: `${mediaItemId}:waveform`,
            type: "waveform",
            status: "failed",
            relativePath,
            sourceRevision,
            presetKey,
            generatedAt: null,
            fileSize: null,
            errorMessage: message,
            bucketCount: 0,
            durationMs: existingItem.metadataSummary.durationMs,
            previewPeaks: []
          }
        : {
            id: `${mediaItemId}:proxy`,
            type: "proxy",
            status: "failed",
            relativePath,
            sourceRevision,
            presetKey,
            generatedAt: null,
            fileSize: null,
            errorMessage: message,
            width: null,
            height: null,
            durationMs: existingItem.metadataSummary.durationMs,
            container: "mp4",
            videoCodec: null,
            audioCodec: null
          };

  const nextItem: MediaItem = {
    ...existingItem,
    errorState: {
      code: "DERIVED_ASSET_FAILED",
      message,
      updatedAt: nowIso()
    },
    derivedAssets: {
      ...existingItem.derivedAssets,
      [assetType]: failedAsset
    },
    ingestStatus: "warning"
  };
  const nextDocument = upsertMediaItem(document, nextItem);

  await saveProjectDocument(paths, nextDocument);
  upsertDerivedAssetManifest(paths.databasePath, mediaItemId, failedAsset);

  return nextDocument;
}

export async function updateTranscript(
  directory: string,
  transcript: Transcript
): Promise<ProjectDocumentV3> {
  const { paths, document } = await loadAndMaybeMigrateProject(directory);
  const nextDocument = upsertTranscript(document, transcript);
  await saveProjectDocument(paths, nextDocument);
  return nextDocument;
}

export async function updateCaptionTrack(
  directory: string,
  captionTrack: CaptionTrack
): Promise<ProjectDocumentV3> {
  const { paths, document } = await loadAndMaybeMigrateProject(directory);
  const nextDocument = upsertCaptionTrack(document, captionTrack);
  await saveProjectDocument(paths, nextDocument);
  return nextDocument;
}

export async function updateCaptionExportDefaults(
  directory: string,
  exportDefaults: Partial<CaptionExportDefaults>
): Promise<ProjectDocumentV3> {
  const { paths, document } = await loadAndMaybeMigrateProject(directory);
  const nextDocument = setCaptionExportDefaults(document, exportDefaults);
  await saveProjectDocument(paths, nextDocument);
  return nextDocument;
}

export async function updateDefaultBrandKitId(
  directory: string,
  brandKitId: string | null
): Promise<ProjectDocumentV3> {
  const { paths, document } = await loadAndMaybeMigrateProject(directory);
  const nextDocument = setDefaultBrandKitId(document, brandKitId);
  await saveProjectDocument(paths, nextDocument);
  return nextDocument;
}
