import { readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";

import { isSupportedMediaPath } from "./media-support";

export interface ImportDiscoveryFailure {
  path: string;
  reason: string;
}

export interface ImportDiscoveryResult {
  acceptedPaths: string[];
  failures: ImportDiscoveryFailure[];
}

async function scanDirectory(
  directoryPath: string,
  acceptedPaths: Set<string>,
  failures: ImportDiscoveryFailure[]
): Promise<void> {
  const entries = await readdir(directoryPath, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = resolve(directoryPath, entry.name);

    if (entry.isDirectory()) {
      await scanDirectory(absolutePath, acceptedPaths, failures);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (isSupportedMediaPath(absolutePath)) {
      acceptedPaths.add(absolutePath);
    } else {
      failures.push({
        path: absolutePath,
        reason: "Unsupported media type."
      });
    }
  }
}

export async function discoverImportPaths(paths: string[]): Promise<ImportDiscoveryResult> {
  const acceptedPaths = new Set<string>();
  const failures: ImportDiscoveryFailure[] = [];

  for (const rawPath of paths) {
    const absolutePath = resolve(rawPath);

    try {
      const fileStats = await stat(absolutePath);

      if (fileStats.isDirectory()) {
        await scanDirectory(absolutePath, acceptedPaths, failures);
        continue;
      }

      if (fileStats.isFile() && isSupportedMediaPath(absolutePath)) {
        acceptedPaths.add(absolutePath);
        continue;
      }

      failures.push({
        path: absolutePath,
        reason: "Unsupported media type."
      });
    } catch {
      failures.push({
        path: absolutePath,
        reason: "Path could not be resolved."
      });
    }
  }

  return {
    acceptedPaths: [...acceptedPaths],
    failures
  };
}
