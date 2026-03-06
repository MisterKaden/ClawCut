import { mkdir, stat } from "node:fs/promises";

import type { ThumbnailAsset } from "@clawcut/domain";
import type { MediaProbeResult } from "@clawcut/ipc";

import { THUMBNAIL_PRESET_KEY } from "./cache-manager";
import type { CacheManager } from "./cache-manager";
import { runFfmpeg } from "./ffmpeg";
import { nowIso } from "./utils";

export async function generateThumbnailAsset(
  cacheManager: CacheManager,
  mediaItemId: string,
  sourceRevision: string,
  sourcePath: string,
  probe: MediaProbeResult
): Promise<ThumbnailAsset> {
  const descriptor = cacheManager.resolveThumbnailPath(mediaItemId, sourceRevision);
  const targetTimestampSeconds = Math.max(0, Math.floor((probe.durationMs ?? 0) / 2000));

  await mkdir(descriptor.absolutePath.replace(/\/[^/]+$/u, ""), { recursive: true });
  await runFfmpeg([
    "-y",
    "-ss",
    String(targetTimestampSeconds),
    "-i",
    sourcePath,
    "-frames:v",
    "1",
    "-q:v",
    "2",
    descriptor.absolutePath
  ]);

  const fileStats = await stat(descriptor.absolutePath);

  return {
    id: `${mediaItemId}:thumbnail`,
    type: "thumbnail",
    status: "ready",
    relativePath: descriptor.relativePath,
    sourceRevision,
    presetKey: THUMBNAIL_PRESET_KEY,
    generatedAt: nowIso(),
    fileSize: fileStats.size,
    errorMessage: null,
    width: probe.width,
    height: probe.height
  };
}
