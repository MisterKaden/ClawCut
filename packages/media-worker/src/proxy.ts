import { mkdir, stat } from "node:fs/promises";

import type { ProxyAsset } from "@clawcut/domain";
import type { MediaProbeResult } from "@clawcut/ipc";

import { PROXY_PRESET_KEY } from "./cache-manager";
import type { CacheManager } from "./cache-manager";
import { runFfmpeg } from "./ffmpeg";
import { nowIso } from "./utils";

function createScaleFilter(): string {
  return "scale=960:960:force_original_aspect_ratio=decrease";
}

export function calculateProxyDimensions(
  width: number | null,
  height: number | null,
  maxDimension = 960
): { width: number | null; height: number | null } {
  if (!width || !height) {
    return {
      width: null,
      height: null
    };
  }

  const scaleFactor = Math.min(1, maxDimension / Math.max(width, height));

  return {
    width: Math.max(1, Math.round(width * scaleFactor)),
    height: Math.max(1, Math.round(height * scaleFactor))
  };
}

export async function generateProxyAsset(
  cacheManager: CacheManager,
  mediaItemId: string,
  sourceRevision: string,
  sourcePath: string,
  probe: MediaProbeResult
): Promise<ProxyAsset> {
  const descriptor = cacheManager.resolveProxyPath(mediaItemId, sourceRevision);
  const proxyDimensions = calculateProxyDimensions(probe.width, probe.height);
  const args = [
    "-y",
    "-i",
    sourcePath,
    "-vf",
    createScaleFilter(),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-c:a",
    "aac",
    "-b:a",
    "128k"
  ];

  if ((probe.frameRate ?? 0) > 30) {
    args.push("-r", "30");
  }

  await mkdir(descriptor.absolutePath.replace(/\/[^/]+$/u, ""), { recursive: true });
  await runFfmpeg([...args, descriptor.absolutePath]);

  const fileStats = await stat(descriptor.absolutePath);

  return {
    id: `${mediaItemId}:proxy`,
    type: "proxy",
    status: "ready",
    relativePath: descriptor.relativePath,
    sourceRevision,
    presetKey: PROXY_PRESET_KEY,
    generatedAt: nowIso(),
    fileSize: fileStats.size,
    errorMessage: null,
    width: proxyDimensions.width,
    height: proxyDimensions.height,
    durationMs: probe.durationMs,
    container: "mp4",
    videoCodec: "h264",
    audioCodec: probe.audioCodec ? "aac" : null
  };
}
