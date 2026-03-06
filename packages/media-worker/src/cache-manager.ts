import { mkdir, stat } from "node:fs/promises";

import type {
  DerivedAsset,
  DerivedAssetType,
  MediaItem
} from "@clawcut/domain";

import type { ProjectPaths } from "./paths";

import { resolveDerivedAssetPath, resolveMediaRevisionDirectory } from "./paths";

export const THUMBNAIL_PRESET_KEY = "stage2-poster-v1";
export const WAVEFORM_PRESET_KEY = "stage2-waveform-envelope-v1";
export const PROXY_PRESET_KEY = "stage2-standard-proxy";

export interface CacheValidationResult {
  exists: boolean;
  needsRegeneration: boolean;
}

export interface CacheManager {
  ensureMediaRevisionDirectory(mediaItemId: string, sourceRevision: string): Promise<void>;
  resolveThumbnailPath(mediaItemId: string, sourceRevision: string): ReturnType<typeof resolveDerivedAssetPath>;
  resolveWaveformPath(mediaItemId: string, sourceRevision: string): ReturnType<typeof resolveDerivedAssetPath>;
  resolveProxyPath(mediaItemId: string, sourceRevision: string): ReturnType<typeof resolveDerivedAssetPath>;
  validateDerivedAsset(mediaItem: MediaItem, asset: DerivedAsset | null): Promise<CacheValidationResult>;
}

function getExpectedPresetKey(type: DerivedAssetType): string {
  switch (type) {
    case "thumbnail":
      return THUMBNAIL_PRESET_KEY;
    case "waveform":
      return WAVEFORM_PRESET_KEY;
    case "proxy":
      return PROXY_PRESET_KEY;
  }
}

function getExpectedRelativePath(
  paths: ProjectPaths,
  type: DerivedAssetType,
  mediaItemId: string,
  sourceRevision: string
): string {
  switch (type) {
    case "thumbnail":
      return resolveDerivedAssetPath(paths, mediaItemId, sourceRevision, "poster.jpg").relativePath;
    case "waveform":
      return resolveDerivedAssetPath(paths, mediaItemId, sourceRevision, "waveform.json").relativePath;
    case "proxy":
      return resolveDerivedAssetPath(paths, mediaItemId, sourceRevision, "proxy.mp4").relativePath;
  }
}

export function createCacheManager(paths: ProjectPaths): CacheManager {
  return {
    async ensureMediaRevisionDirectory(mediaItemId, sourceRevision) {
      const descriptor = resolveMediaRevisionDirectory(paths, mediaItemId, sourceRevision);
      await mkdir(descriptor.absolutePath, { recursive: true });
    },
    resolveThumbnailPath(mediaItemId, sourceRevision) {
      return resolveDerivedAssetPath(paths, mediaItemId, sourceRevision, "poster.jpg");
    },
    resolveWaveformPath(mediaItemId, sourceRevision) {
      return resolveDerivedAssetPath(paths, mediaItemId, sourceRevision, "waveform.json");
    },
    resolveProxyPath(mediaItemId, sourceRevision) {
      return resolveDerivedAssetPath(paths, mediaItemId, sourceRevision, "proxy.mp4");
    },
    async validateDerivedAsset(mediaItem, asset) {
      if (
        !asset ||
        asset.status !== "ready" ||
        asset.sourceRevision !== mediaItem.sourceRevision ||
        asset.presetKey !== getExpectedPresetKey(asset.type) ||
        asset.relativePath !==
          getExpectedRelativePath(paths, asset.type, mediaItem.id, mediaItem.sourceRevision)
      ) {
        return {
          exists: false,
          needsRegeneration: true
        };
      }

      try {
        const assetPath = resolveAbsoluteDerivedAssetPath(paths, asset.type, mediaItem.id, mediaItem.sourceRevision);
        await stat(assetPath);

        return {
          exists: true,
          needsRegeneration: false
        };
      } catch {
        return {
          exists: false,
          needsRegeneration: true
        };
      }
    }
  };
}

export function resolveAbsoluteDerivedAssetPath(
  paths: ProjectPaths,
  derivedAssetType: DerivedAssetType,
  mediaItemId: string,
  sourceRevision: string
): string {
  switch (derivedAssetType) {
    case "thumbnail":
      return resolveDerivedAssetPath(paths, mediaItemId, sourceRevision, "poster.jpg").absolutePath;
    case "waveform":
      return resolveDerivedAssetPath(paths, mediaItemId, sourceRevision, "waveform.json").absolutePath;
    case "proxy":
      return resolveDerivedAssetPath(paths, mediaItemId, sourceRevision, "proxy.mp4").absolutePath;
  }
}

export interface CacheCleanupPlan {
  cacheRoot: string;
  implemented: false;
}

export function describeCacheCleanupPlan(paths: ProjectPaths): CacheCleanupPlan {
  return {
    cacheRoot: paths.cacheRoot,
    implemented: false
  };
}
