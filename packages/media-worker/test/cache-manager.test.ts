import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
  createCacheManager,
  describeCacheCleanupPlan
} from "../src/cache-manager";
import { resolveProjectPaths } from "../src/paths";
import { createEmptyDerivedAssetSet, createEmptyMetadataSummary, type MediaItem } from "@clawcut/domain";

function createMediaItem(): MediaItem {
  return {
    id: "media-1",
    displayName: "Fixture Clip",
    source: {
      sourceType: "import",
      originalPath: "/tmp/source.mp4",
      currentResolvedPath: "/tmp/source.mp4",
      normalizedOriginalPath: "/tmp/source.mp4",
      normalizedResolvedPath: "/tmp/source.mp4"
    },
    importTimestamp: new Date().toISOString(),
    lastSeenTimestamp: new Date().toISOString(),
    fileSize: 128,
    fileModifiedTimeMs: 1,
    fingerprint: {
      strategy: "partial-sha256",
      quickHash: "abc123",
      fileSize: 128,
      modifiedTimeMs: 1,
      sampleSizeBytes: 128
    },
    sourceRevision: "abc123rev",
    metadataSummary: {
      ...createEmptyMetadataSummary(),
      kind: "video",
      hasVideo: true
    },
    streams: [],
    ingestStatus: "deriving",
    relinkStatus: "linked",
    errorState: null,
    derivedAssets: createEmptyDerivedAssetSet()
  };
}

describe("cache manager", () => {
  test("resolves deterministic cache paths and validates existing assets", async () => {
    const directory = mkdtempSync(join(tmpdir(), "clawcut-cache-"));
    const paths = resolveProjectPaths(directory);
    const cacheManager = createCacheManager(paths);
    const mediaItem = createMediaItem();

    const thumbnailPath = cacheManager.resolveThumbnailPath(mediaItem.id, mediaItem.sourceRevision);

    expect(thumbnailPath.relativePath).toBe("media/media-1/abc123rev/poster.jpg");

    mkdirSync(join(directory, ".clawcut/cache/media/media-1/abc123rev"), { recursive: true });
    writeFileSync(join(directory, ".clawcut/cache", thumbnailPath.relativePath), "thumbnail");

    const validation = await cacheManager.validateDerivedAsset(mediaItem, {
      id: "media-1:thumbnail",
      type: "thumbnail",
      status: "ready",
      relativePath: thumbnailPath.relativePath,
      sourceRevision: mediaItem.sourceRevision,
      presetKey: "stage2-poster-v1",
      generatedAt: new Date().toISOString(),
      fileSize: 9,
      errorMessage: null,
      width: 320,
      height: 180
    });

    expect(validation.exists).toBe(true);
    expect(validation.needsRegeneration).toBe(false);
  });

  test("surfaces cleanup as an explicit future hook", () => {
    const directory = mkdtempSync(join(tmpdir(), "clawcut-cache-plan-"));
    const cleanupPlan = describeCacheCleanupPlan(resolveProjectPaths(directory));

    expect(cleanupPlan.cacheRoot.endsWith(".clawcut/cache")).toBe(true);
    expect(cleanupPlan.implemented).toBe(false);
  });

  test("forces regeneration for stale status or preset drift", async () => {
    const directory = mkdtempSync(join(tmpdir(), "clawcut-cache-stale-"));
    const paths = resolveProjectPaths(directory);
    const cacheManager = createCacheManager(paths);
    const mediaItem = createMediaItem();
    const thumbnailPath = cacheManager.resolveThumbnailPath(mediaItem.id, mediaItem.sourceRevision);

    mkdirSync(join(directory, ".clawcut/cache/media/media-1/abc123rev"), { recursive: true });
    writeFileSync(join(directory, ".clawcut/cache", thumbnailPath.relativePath), "thumbnail");

    const staleValidation = await cacheManager.validateDerivedAsset(mediaItem, {
      id: "media-1:thumbnail",
      type: "thumbnail",
      status: "stale",
      relativePath: thumbnailPath.relativePath,
      sourceRevision: mediaItem.sourceRevision,
      presetKey: "stage2-poster-v1",
      generatedAt: new Date().toISOString(),
      fileSize: 9,
      errorMessage: null,
      width: 320,
      height: 180
    });

    const presetMismatchValidation = await cacheManager.validateDerivedAsset(mediaItem, {
      id: "media-1:thumbnail",
      type: "thumbnail",
      status: "ready",
      relativePath: thumbnailPath.relativePath,
      sourceRevision: mediaItem.sourceRevision,
      presetKey: "old-preset",
      generatedAt: new Date().toISOString(),
      fileSize: 9,
      errorMessage: null,
      width: 320,
      height: 180
    });

    expect(staleValidation.needsRegeneration).toBe(true);
    expect(presetMismatchValidation.needsRegeneration).toBe(true);
  });
});
