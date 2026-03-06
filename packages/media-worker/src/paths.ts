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
    cacheRoot
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
