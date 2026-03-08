import { access } from "node:fs/promises";

import {
  createEmptyDerivedAssetSet,
  type DerivedAsset,
  type DerivedAssetType,
  type MediaItem
} from "@clawcut/domain";
import type {
  ImportMediaPathsInput,
  ImportMediaPathsResult,
  ProjectWorkspaceSnapshot,
  RelinkMediaItemInput,
  RelinkMediaItemResult,
  RetryJobInput
} from "@clawcut/ipc";

import {
  PROXY_PRESET_KEY,
  THUMBNAIL_PRESET_KEY,
  WAVEFORM_PRESET_KEY,
  createCacheManager,
  type CacheManager
} from "./cache-manager";
import { buildQuickFingerprint, createMediaItemId } from "./fingerprint";
import { discoverImportPaths } from "./import-discovery";
import { isSupportedMediaPath } from "./media-support";
import { normalizeProbeToLibraryData } from "./normalize-media";
import { resolveProjectPaths } from "./paths";
import { probeAsset } from "./probe";
import {
  createJobRecord,
  getProjectSnapshot,
  getStoredJobRecord,
  loadAndMaybeMigrateProject,
  markMediaItemDerivedFailure,
  refreshMediaHealth,
  updateDerivedAssetForMediaItem,
  updateJobRecord,
  updateMediaItem
} from "./project-repository";
import { generateProxyAsset } from "./proxy";
import { evaluateRelinkCandidate } from "./relink";
import { generateThumbnailAsset } from "./thumbnail";
import { updateTranscriptionRunRecord } from "./transcription-repository";
import { scheduleTranscriptionJob } from "./caption-session";
import type {
  PersistedDerivedJobPayload,
  PersistedIngestJobPayload,
  PersistedTranscriptionJobPayload
} from "./job-payloads";
import { nowIso, normalizeFileSystemPath, WorkerError } from "./utils";
import { generateWaveformAsset } from "./waveform";

const jobQueue: Array<{ directory: string; jobId: string }> = [];
const scheduledJobKeys = new Set<string>();
let jobPumpPromise: Promise<void> | null = null;

async function sourcePathExists(path: string | null): Promise<boolean> {
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

function queueKey(directory: string, jobId: string): string {
  return `${directory}:${jobId}`;
}

function getPresetKeyForAssetType(type: DerivedAssetType): string {
  switch (type) {
    case "thumbnail":
      return THUMBNAIL_PRESET_KEY;
    case "waveform":
      return WAVEFORM_PRESET_KEY;
    case "proxy":
      return PROXY_PRESET_KEY;
  }
}

function getRequiredDerivedTypes(mediaItem: MediaItem): DerivedAssetType[] {
  const required: DerivedAssetType[] = [];

  if (mediaItem.metadataSummary.hasVideo) {
    required.push("thumbnail", "proxy");
  }

  if (mediaItem.metadataSummary.hasAudio) {
    required.push("waveform");
  }

  return required;
}

function deriveItemStatus(mediaItem: MediaItem): MediaItem["ingestStatus"] {
  if (mediaItem.relinkStatus === "missing") {
    return "missing";
  }

  const required = getRequiredDerivedTypes(mediaItem);

  if (required.length === 0) {
    return mediaItem.errorState ? "warning" : "ready";
  }

  const assets = required.map((type) => mediaItem.derivedAssets[type]);

  if (assets.some((asset) => asset === null || asset.status === "pending")) {
    return "deriving";
  }

  if (assets.some((asset) => asset?.status === "failed")) {
    return "warning";
  }

  return mediaItem.errorState ? "warning" : "ready";
}

function createPendingDerivedAsset(
  cacheManager: CacheManager,
  mediaItemId: string,
  sourceRevision: string,
  type: DerivedAssetType
): DerivedAsset {
  const relativePath =
    type === "thumbnail"
      ? cacheManager.resolveThumbnailPath(mediaItemId, sourceRevision).relativePath
      : type === "waveform"
        ? cacheManager.resolveWaveformPath(mediaItemId, sourceRevision).relativePath
        : cacheManager.resolveProxyPath(mediaItemId, sourceRevision).relativePath;

  if (type === "thumbnail") {
    return {
      id: `${mediaItemId}:thumbnail`,
      type,
      status: "pending",
      relativePath,
      sourceRevision,
      presetKey: THUMBNAIL_PRESET_KEY,
      generatedAt: null,
      fileSize: null,
      errorMessage: null,
      width: null,
      height: null
    };
  }

  if (type === "waveform") {
    return {
      id: `${mediaItemId}:waveform`,
      type,
      status: "pending",
      relativePath,
      sourceRevision,
      presetKey: WAVEFORM_PRESET_KEY,
      generatedAt: null,
      fileSize: null,
      errorMessage: null,
      bucketCount: 0,
      durationMs: null,
      previewPeaks: []
    };
  }

  return {
    id: `${mediaItemId}:proxy`,
    type,
    status: "pending",
    relativePath,
    sourceRevision,
    presetKey: PROXY_PRESET_KEY,
    generatedAt: null,
    fileSize: null,
    errorMessage: null,
    width: null,
    height: null,
    durationMs: null,
    container: "mp4",
    videoCodec: null,
    audioCodec: null
  };
}

function scheduleJob(directory: string, jobId: string): void {
  const key = queueKey(directory, jobId);

  if (scheduledJobKeys.has(key)) {
    return;
  }

  scheduledJobKeys.add(key);
  jobQueue.push({ directory, jobId });

  if (!jobPumpPromise) {
    jobPumpPromise = pumpJobQueue().finally(() => {
      jobPumpPromise = null;
    });
  }
}

function getIngestPayload(storedJob: NonNullable<ReturnType<typeof getStoredJobRecord>>): PersistedIngestJobPayload {
  return storedJob.payload as PersistedIngestJobPayload;
}

function getDerivedPayload(
  storedJob: NonNullable<ReturnType<typeof getStoredJobRecord>>
): PersistedDerivedJobPayload {
  return storedJob.payload as PersistedDerivedJobPayload;
}

async function enqueueDerivedJobsForItem(
  directory: string,
  mediaItem: MediaItem
): Promise<{ queuedJobIds: string[]; mediaItem: MediaItem }> {
  const paths = resolveProjectPaths(directory);
  const cacheManager = createCacheManager(paths);
  const derivedTypes = getRequiredDerivedTypes(mediaItem);
  const queuedJobIds: string[] = [];
  let nextItem = mediaItem;

  for (const derivedType of derivedTypes) {
    const existingAsset = mediaItem.derivedAssets[derivedType];
    const validation = await cacheManager.validateDerivedAsset(mediaItem, existingAsset);

    if (!validation.needsRegeneration) {
      continue;
    }

    const pendingAsset = createPendingDerivedAsset(
      cacheManager,
      mediaItem.id,
      mediaItem.sourceRevision,
      derivedType
    );

    nextItem = {
      ...nextItem,
      derivedAssets: {
        ...nextItem.derivedAssets,
        [derivedType]: pendingAsset
      }
    };

    const jobId = createJobRecord(paths.databasePath, {
      kind: derivedType,
      projectDirectory: directory,
      mediaItemId: mediaItem.id,
      payload: {
        mediaItemId: mediaItem.id,
        sourceRevision: mediaItem.sourceRevision,
        presetKey: getPresetKeyForAssetType(derivedType)
      }
    });

    queuedJobIds.push(jobId);
  }

  if (queuedJobIds.length > 0) {
    nextItem = {
      ...nextItem,
      ingestStatus: "deriving"
    };
    await updateMediaItem(directory, nextItem);
  }

  for (const jobId of queuedJobIds) {
    scheduleJob(directory, jobId);
  }

  return {
    queuedJobIds,
    mediaItem: nextItem
  };
}

async function runIngestJob(directory: string, jobId: string): Promise<void> {
  const paths = resolveProjectPaths(directory);
  const storedJob = getStoredJobRecord(paths.databasePath, jobId);

  if (!storedJob || storedJob.kind !== "ingest") {
    return;
  }

  const sourcePath = getIngestPayload(storedJob).sourcePath;
  updateJobRecord(paths.databasePath, jobId, {
    status: "running",
    progress: 0.1,
    step: "Fingerprinting source",
    attemptCount: storedJob.attemptCount + 1,
    errorMessage: null
  });

  if (!isSupportedMediaPath(sourcePath)) {
    updateJobRecord(paths.databasePath, jobId, {
      status: "failed",
      progress: 1,
      step: "Unsupported media",
      errorMessage: "Unsupported media type."
    });
    return;
  }

  const fingerprintResult = await buildQuickFingerprint(sourcePath);
  updateJobRecord(paths.databasePath, jobId, {
    progress: 0.35,
    step: "Probing media"
  });

  const probe = await probeAsset(sourcePath);
  const normalized = normalizeProbeToLibraryData(probe);
  const loadResult = await loadAndMaybeMigrateProject(directory);
  const normalizedSourcePath = normalizeFileSystemPath(sourcePath);
  const existingItem =
    loadResult.document.library.items.find(
      (item) =>
        item.fingerprint.quickHash &&
        fingerprintResult.fingerprint.quickHash &&
        item.fingerprint.quickHash === fingerprintResult.fingerprint.quickHash
    ) ??
    loadResult.document.library.items.find(
      (item) => item.source.normalizedResolvedPath === normalizedSourcePath
    );
  const preserveExistingSource =
    Boolean(existingItem) &&
    existingItem?.source.normalizedResolvedPath !== normalizedSourcePath &&
    (await sourcePathExists(existingItem?.source.currentResolvedPath ?? null));
  const source = preserveExistingSource && existingItem
    ? existingItem.source
    : {
        sourceType: "import" as const,
        originalPath: existingItem?.source.originalPath ?? sourcePath,
        currentResolvedPath: sourcePath,
        normalizedOriginalPath: existingItem?.source.normalizedOriginalPath ?? normalizedSourcePath,
        normalizedResolvedPath: normalizedSourcePath
      };

  const nextItem: MediaItem = {
    id: existingItem?.id ?? createMediaItemId(),
    displayName: preserveExistingSource && existingItem ? existingItem.displayName : probe.displayName,
    source,
    importTimestamp: existingItem?.importTimestamp ?? nowIso(),
    lastSeenTimestamp: nowIso(),
    fileSize: preserveExistingSource && existingItem ? existingItem.fileSize : fingerprintResult.fileSize,
    fileModifiedTimeMs:
      preserveExistingSource && existingItem
        ? existingItem.fileModifiedTimeMs
        : fingerprintResult.fileModifiedTimeMs,
    fingerprint:
      preserveExistingSource && existingItem ? existingItem.fingerprint : fingerprintResult.fingerprint,
    sourceRevision:
      preserveExistingSource && existingItem ? existingItem.sourceRevision : fingerprintResult.sourceRevision,
    metadataSummary: normalized.metadataSummary,
    streams: normalized.streams,
    ingestStatus: "indexing",
    relinkStatus: preserveExistingSource && existingItem ? existingItem.relinkStatus : "linked",
    errorState: null,
    derivedAssets:
      existingItem?.sourceRevision ===
      (preserveExistingSource && existingItem ? existingItem.sourceRevision : fingerprintResult.sourceRevision)
        ? existingItem.derivedAssets
        : createEmptyDerivedAssetSet()
  };

  const derivedScheduling = await enqueueDerivedJobsForItem(
    directory,
    {
      ...nextItem,
      ingestStatus: "deriving"
    }
  );

  const updatedItem =
    derivedScheduling.queuedJobIds.length === 0
      ? {
          ...nextItem,
          ingestStatus: "ready" as const
        }
      : derivedScheduling.mediaItem;

  await updateMediaItem(directory, updatedItem);
  updateJobRecord(paths.databasePath, jobId, {
    mediaItemId: updatedItem.id,
    status: "completed",
    progress: 1,
    step: preserveExistingSource
      ? "Matched existing media"
      : derivedScheduling.queuedJobIds.length > 0
        ? "Queued derived assets"
        : "Completed"
  });
}

async function runDerivedJob(directory: string, jobId: string): Promise<void> {
  const paths = resolveProjectPaths(directory);
  const storedJob = getStoredJobRecord(paths.databasePath, jobId);

  if (
    !storedJob ||
    storedJob.kind === "ingest" ||
    storedJob.kind === "export" ||
    storedJob.kind === "transcription" ||
    storedJob.kind === "analysis"
  ) {
    return;
  }

  const loadResult = await loadAndMaybeMigrateProject(directory);
  const mediaItem = loadResult.document.library.items.find(
    (item) => item.id === storedJob.mediaItemId
  );

  if (!mediaItem) {
    updateJobRecord(paths.databasePath, jobId, {
      status: "failed",
      progress: 1,
      step: "Media item missing",
      errorMessage: "Media item could not be found for derived asset generation."
    });
    return;
  }

  if (mediaItem.sourceRevision !== getDerivedPayload(storedJob).sourceRevision) {
    updateJobRecord(paths.databasePath, jobId, {
      status: "cancelled",
      progress: 1,
      step: "Superseded by newer source revision"
    });
    return;
  }

  if (!mediaItem.source.currentResolvedPath) {
    updateJobRecord(paths.databasePath, jobId, {
      status: "failed",
      progress: 1,
      step: "Missing source",
      errorMessage: "Media source path is unavailable."
    });
    return;
  }

  const cacheManager = createCacheManager(paths);
  updateJobRecord(paths.databasePath, jobId, {
    status: "running",
    progress: 0.15,
    step: "Generating derived asset",
    attemptCount: storedJob.attemptCount + 1,
    errorMessage: null
  });

  try {
    let asset: DerivedAsset;

    if (storedJob.kind === "thumbnail") {
      const probe = await probeAsset(mediaItem.source.currentResolvedPath);
      asset = await generateThumbnailAsset(
        cacheManager,
        mediaItem.id,
        mediaItem.sourceRevision,
        mediaItem.source.currentResolvedPath,
        probe
      );
    } else if (storedJob.kind === "waveform") {
      asset = await generateWaveformAsset(
        cacheManager,
        mediaItem.id,
        mediaItem.sourceRevision,
        mediaItem.source.currentResolvedPath,
        mediaItem.metadataSummary.durationMs
      );
    } else {
      const probe = await probeAsset(mediaItem.source.currentResolvedPath);
      asset = await generateProxyAsset(
        cacheManager,
        mediaItem.id,
        mediaItem.sourceRevision,
        mediaItem.source.currentResolvedPath,
        probe
      );
    }

    await updateDerivedAssetForMediaItem(directory, mediaItem.id, asset);
    updateJobRecord(paths.databasePath, jobId, {
      status: "completed",
      progress: 1,
      step: "Completed"
    });
  } catch (error) {
    const relativePath =
      storedJob.kind === "thumbnail"
        ? cacheManager.resolveThumbnailPath(mediaItem.id, mediaItem.sourceRevision).relativePath
        : storedJob.kind === "waveform"
          ? cacheManager.resolveWaveformPath(mediaItem.id, mediaItem.sourceRevision).relativePath
          : cacheManager.resolveProxyPath(mediaItem.id, mediaItem.sourceRevision).relativePath;

    await markMediaItemDerivedFailure(
      directory,
      mediaItem.id,
      storedJob.kind,
      relativePath,
      mediaItem.sourceRevision,
      getPresetKeyForAssetType(storedJob.kind),
      error instanceof Error ? error.message : "Derived asset generation failed."
    );

    updateJobRecord(paths.databasePath, jobId, {
      status: "failed",
      progress: 1,
      step: "Failed",
      errorMessage: error instanceof Error ? error.message : "Derived asset generation failed."
    });
  }
}

async function processQueuedJob(directory: string, jobId: string): Promise<void> {
  const paths = resolveProjectPaths(directory);
  const storedJob = getStoredJobRecord(paths.databasePath, jobId);

  if (!storedJob) {
    return;
  }

  if (storedJob.kind === "ingest") {
    await runIngestJob(directory, jobId);
    return;
  }

  if (storedJob.kind === "export" || storedJob.kind === "transcription") {
    return;
  }

  await runDerivedJob(directory, jobId);
}

async function pumpJobQueue(): Promise<void> {
  while (jobQueue.length > 0) {
    const nextEntry = jobQueue.shift();

    if (!nextEntry) {
      continue;
    }

    scheduledJobKeys.delete(queueKey(nextEntry.directory, nextEntry.jobId));

    try {
      await processQueuedJob(nextEntry.directory, nextEntry.jobId);
    } catch (error) {
      const paths = resolveProjectPaths(nextEntry.directory);
      updateJobRecord(paths.databasePath, nextEntry.jobId, {
        status: "failed",
        progress: 1,
        step: "Failed",
        errorMessage: error instanceof Error ? error.message : "Job execution failed."
      });
    }
  }
}

export async function importMediaPaths(
  input: ImportMediaPathsInput
): Promise<ImportMediaPathsResult> {
  await loadAndMaybeMigrateProject(input.directory);
  const paths = resolveProjectPaths(input.directory);
  const discovery = await discoverImportPaths(input.paths);
  const queuedJobIds: string[] = [];

  for (const acceptedPath of discovery.acceptedPaths) {
    const jobId = createJobRecord(paths.databasePath, {
      kind: "ingest",
      projectDirectory: input.directory,
      payload: {
        sourcePath: acceptedPath
      }
    });
    queuedJobIds.push(jobId);
    scheduleJob(input.directory, jobId);
  }

  for (const failure of discovery.failures) {
    createJobRecord(paths.databasePath, {
      kind: "ingest",
      projectDirectory: input.directory,
      payload: {
        sourcePath: failure.path
      },
      status: "failed",
      progress: 1,
      step: "Rejected",
      errorMessage: failure.reason
    });
  }

  return {
    snapshot: await getProjectSnapshot(input.directory),
    acceptedPaths: discovery.acceptedPaths,
    queuedJobIds
  };
}

export async function retryJob(
  input: RetryJobInput
): Promise<ProjectWorkspaceSnapshot> {
  const paths = resolveProjectPaths(input.directory);
  const storedJob = getStoredJobRecord(paths.databasePath, input.jobId);

  if (!storedJob) {
    throw new WorkerError("JOB_NOT_FOUND", `Job ${input.jobId} could not be found.`);
  }

  if (storedJob.status !== "failed" && storedJob.status !== "cancelled") {
    throw new WorkerError(
      "JOB_NOT_RETRYABLE",
      `Job ${input.jobId} is not in a retryable state.`
    );
  }

  updateJobRecord(paths.databasePath, input.jobId, {
    status: "queued",
    progress: 0,
    step: "Queued",
    errorMessage: null
  });

  if (storedJob.kind === "transcription") {
    const payload = storedJob.payload as PersistedTranscriptionJobPayload;
    updateTranscriptionRunRecord(paths.databasePath, payload.transcriptionRunId, {
      status: "queued",
      error: null,
      completedAt: null,
      startedAt: null
    });
    scheduleTranscriptionJob(input.directory);
    return getProjectSnapshot(input.directory);
  }

  scheduleJob(input.directory, input.jobId);

  return getProjectSnapshot(input.directory);
}

export async function relinkMediaItem(
  input: RelinkMediaItemInput
): Promise<RelinkMediaItemResult> {
  const loadResult = await loadAndMaybeMigrateProject(input.directory);
  const mediaItem = loadResult.document.library.items.find(
    (item) => item.id === input.mediaItemId
  );

  if (!mediaItem) {
    throw new WorkerError(
      "MEDIA_ITEM_NOT_FOUND",
      `Media item ${input.mediaItemId} could not be found.`
    );
  }

  const fingerprintResult = await buildQuickFingerprint(input.candidatePath);
  const candidateProbe = await probeAsset(input.candidatePath);
  const relinkResult = evaluateRelinkCandidate(
    mediaItem,
    input.candidatePath,
    fingerprintResult,
    candidateProbe
  );

  if (!relinkResult.accepted) {
    return {
      snapshot: await getProjectSnapshot(input.directory),
      result: relinkResult
    };
  }

  const normalized = normalizeProbeToLibraryData(candidateProbe);
  const nextItem: MediaItem = {
    ...mediaItem,
    source: {
      ...mediaItem.source,
      currentResolvedPath: input.candidatePath,
      normalizedResolvedPath: normalizeFileSystemPath(input.candidatePath)
    },
    lastSeenTimestamp: nowIso(),
    fileSize: fingerprintResult.fileSize,
    fileModifiedTimeMs: fingerprintResult.fileModifiedTimeMs,
    fingerprint: fingerprintResult.fingerprint,
    sourceRevision: fingerprintResult.sourceRevision,
    metadataSummary: normalized.metadataSummary,
    streams: normalized.streams,
    relinkStatus: "relinked",
    errorState: null,
    derivedAssets: relinkResult.requiresDerivedRefresh
      ? createEmptyDerivedAssetSet()
      : mediaItem.derivedAssets,
    ingestStatus: relinkResult.requiresDerivedRefresh ? "deriving" : deriveItemStatus({
      ...mediaItem,
      source: {
        ...mediaItem.source,
        currentResolvedPath: input.candidatePath,
        normalizedResolvedPath: normalizeFileSystemPath(input.candidatePath)
      },
      lastSeenTimestamp: nowIso(),
      fileSize: fingerprintResult.fileSize,
      fileModifiedTimeMs: fingerprintResult.fileModifiedTimeMs,
      fingerprint: fingerprintResult.fingerprint,
      sourceRevision: fingerprintResult.sourceRevision,
      metadataSummary: normalized.metadataSummary,
      streams: normalized.streams,
      relinkStatus: "relinked",
      errorState: null,
      derivedAssets: relinkResult.requiresDerivedRefresh
        ? createEmptyDerivedAssetSet()
        : mediaItem.derivedAssets
    })
  };

  await updateMediaItem(input.directory, nextItem);

  if (relinkResult.requiresDerivedRefresh) {
    const derivedScheduling = await enqueueDerivedJobsForItem(input.directory, nextItem);
    await updateMediaItem(input.directory, derivedScheduling.mediaItem);
  }

  return {
    snapshot: await refreshMediaHealth(input.directory),
    result: relinkResult
  };
}

export async function primeProjectJobs(directory: string): Promise<void> {
  const snapshot = await getProjectSnapshot(directory);

  for (const job of snapshot.jobs) {
    if (job.status === "queued") {
      scheduleJob(directory, job.id);
      continue;
    }

    if (job.status === "running") {
      const paths = resolveProjectPaths(directory);
      updateJobRecord(paths.databasePath, job.id, {
        status: "queued",
        progress: 0,
        step: "Resuming after restart"
      });
      scheduleJob(directory, job.id);
    }
  }
}
