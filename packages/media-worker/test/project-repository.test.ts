import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, test } from "vitest";

import {
  createEmptyDerivedAssetSet,
  createEmptyMetadataSummary,
  type MediaItem
} from "@clawcut/domain";

import {
  createProject,
  openProject,
  updateDerivedAssetForMediaItem,
  updateMediaItem
} from "../src/project-repository";

function createLibraryItem(): MediaItem {
  const sourcePath = resolve(process.cwd(), "fixtures/media/talking-head-sample.mp4");

  return {
    id: "library-item-1",
    displayName: "Fixture Clip",
    source: {
      sourceType: "import",
      originalPath: sourcePath,
      currentResolvedPath: sourcePath,
      normalizedOriginalPath: sourcePath,
      normalizedResolvedPath: sourcePath
    },
    importTimestamp: new Date().toISOString(),
    lastSeenTimestamp: new Date().toISOString(),
    fileSize: 42,
    fileModifiedTimeMs: 10,
    fingerprint: {
      strategy: "partial-sha256",
      quickHash: "fixture-hash",
      fileSize: 42,
      modifiedTimeMs: 10,
      sampleSizeBytes: 42
    },
    sourceRevision: "fixture-revision",
    metadataSummary: {
      ...createEmptyMetadataSummary(),
      kind: "video",
      hasVideo: true,
      container: "mp4"
    },
    streams: [],
    ingestStatus: "deriving",
    relinkStatus: "linked",
    errorState: null,
    derivedAssets: createEmptyDerivedAssetSet()
  };
}

describe("project repository", () => {
  test("creates and reopens a project with a stage 2 snapshot shape", async () => {
    const directory = mkdtempSync(join(tmpdir(), "clawcut-project-"));
    const created = await createProject(directory, "Bootstrap Project");
    const reopened = await openProject(directory);

    expect(created.document.project.name).toBe("Bootstrap Project");
    expect(reopened.projectFilePath.endsWith("clawcut.project.json")).toBe(true);
    expect(reopened.libraryItems).toEqual([]);
    expect(reopened.jobs).toEqual([]);
  });

  test("persists derived asset registration on media items", async () => {
    const directory = mkdtempSync(join(tmpdir(), "clawcut-derived-"));

    await createProject(directory, "Derived Asset Project");
    await updateMediaItem(directory, createLibraryItem());
    await updateDerivedAssetForMediaItem(directory, "library-item-1", {
      id: "library-item-1:thumbnail",
      type: "thumbnail",
      status: "ready",
      relativePath: "media/library-item-1/fixture-revision/poster.jpg",
      sourceRevision: "fixture-revision",
      presetKey: "stage2-poster-v1",
      generatedAt: new Date().toISOString(),
      fileSize: 1_024,
      errorMessage: null,
      width: 320,
      height: 180
    });

    const snapshot = await openProject(directory);
    const item = snapshot.libraryItems[0];

    expect(item?.derivedAssets.thumbnail?.status).toBe("ready");
    expect(item?.ingestStatus).toBe("deriving");
  });
});
