import { join, relative, resolve } from "node:path";

import {
  PROJECT_CACHE_DIRECTORY,
  PROJECT_DATABASE_NAME,
  PROJECT_FILE_NAME
} from "@clawcut/domain";

import { ensureAbsoluteDirectory } from "./utils";

export interface ProjectPaths {
  directory: string;
  projectFilePath: string;
  databasePath: string;
  cacheRoot: string;
  exportArtifactsRoot: string;
  exportsRoot: string;
}

export interface CachePathDescriptor {
  absolutePath: string;
  relativePath: string;
}

export function resolveProjectPaths(directory: string): ProjectPaths {
  const normalizedDirectory = resolve(ensureAbsoluteDirectory(directory));
  const cacheRoot = join(normalizedDirectory, PROJECT_CACHE_DIRECTORY, "cache");

  return {
    directory: normalizedDirectory,
    projectFilePath: join(normalizedDirectory, PROJECT_FILE_NAME),
    databasePath: join(normalizedDirectory, PROJECT_CACHE_DIRECTORY, PROJECT_DATABASE_NAME),
    cacheRoot,
    exportArtifactsRoot: join(normalizedDirectory, PROJECT_CACHE_DIRECTORY, "exports"),
    exportsRoot: join(normalizedDirectory, "exports")
  };
}

export function resolveMediaRevisionDirectory(
  paths: ProjectPaths,
  mediaItemId: string,
  sourceRevision: string
): CachePathDescriptor {
  const absolutePath = join(
    paths.cacheRoot,
    "media",
    mediaItemId,
    sourceRevision
  );

  return {
    absolutePath,
    relativePath: relative(paths.cacheRoot, absolutePath).replace(/\\/gu, "/")
  };
}

export function resolveDerivedAssetPath(
  paths: ProjectPaths,
  mediaItemId: string,
  sourceRevision: string,
  fileName: string
): CachePathDescriptor {
  const revisionDirectory = resolveMediaRevisionDirectory(paths, mediaItemId, sourceRevision);
  const absolutePath = join(revisionDirectory.absolutePath, fileName);

  return {
    absolutePath,
    relativePath: relative(paths.cacheRoot, absolutePath).replace(/\\/gu, "/")
  };
}

export function resolveExportArtifactDirectory(
  paths: ProjectPaths,
  exportRunId: string
): CachePathDescriptor {
  const absolutePath = join(paths.exportArtifactsRoot, exportRunId);

  return {
    absolutePath,
    relativePath: relative(paths.directory, absolutePath).replace(/\\/gu, "/")
  };
}

export function resolveTranscriptionArtifactDirectory(
  paths: ProjectPaths,
  transcriptionRunId: string
): CachePathDescriptor {
  const absolutePath = join(paths.directory, PROJECT_CACHE_DIRECTORY, "transcription", transcriptionRunId);

  return {
    absolutePath,
    relativePath: relative(paths.directory, absolutePath).replace(/\\/gu, "/")
  };
}

export function resolveSmartArtifactDirectory(
  paths: ProjectPaths,
  analysisRunId: string
): CachePathDescriptor {
  const absolutePath = join(paths.directory, PROJECT_CACHE_DIRECTORY, "smart", analysisRunId);

  return {
    absolutePath,
    relativePath: relative(paths.directory, absolutePath).replace(/\\/gu, "/")
  };
}
