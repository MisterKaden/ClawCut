import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import {
  createEmptyDerivedAssetSet,
  createEmptyMetadataSummary,
  type MediaItem
} from "@clawcut/domain";

import {
  executeEditorCommand,
  getEditorSessionSnapshot
} from "../src/editor-session";
import {
  createProject,
  loadAndMaybeMigrateProject,
  updateMediaItem
} from "../src/project-repository";

const temporaryDirectories: string[] = [];

function registerTempDirectory(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

function createLibraryItem(id: string, displayName: string): MediaItem {
  const sourcePath = resolve(process.cwd(), "fixtures/media/talking-head-sample.mp4");

  return {
    id,
    displayName,
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
      quickHash: `${id}-hash`,
      fileSize: 42,
      modifiedTimeMs: 10,
      sampleSizeBytes: 42
    },
    sourceRevision: `${id}-revision`,
    metadataSummary: {
      ...createEmptyMetadataSummary(),
      kind: "video",
      durationMs: 10_000,
      hasVideo: true,
      hasAudio: true,
      container: "mp4"
    },
    streams: [],
    ingestStatus: "ready",
    relinkStatus: "linked",
    errorState: null,
    derivedAssets: createEmptyDerivedAssetSet()
  };
}

describe.sequential("editor session", () => {
  afterEach(() => {
    while (temporaryDirectories.length > 0) {
      const directory = temporaryDirectories.pop();

      if (directory) {
        rmSync(directory, { recursive: true, force: true });
      }
    }
  });

  test("executes timeline commands, exposes history, and persists timeline state", async () => {
    const directory = registerTempDirectory("clawcut-stage3-editor-");

    await createProject(directory, "Stage 3 Editor");
    await updateMediaItem(directory, createLibraryItem("media-1", "Fixture Clip"));

    let executed = await executeEditorCommand({
      directory,
      command: {
        type: "CreateTimeline",
        timelineId: (await getEditorSessionSnapshot(directory)).timeline.id
      }
    });

    expect(executed.result.ok).toBe(true);

    const createdTrackIds = executed.result.ok && executed.result.commandType === "CreateTimeline"
      ? executed.result.createdTrackIds
      : [];

    executed = await executeEditorCommand({
      directory,
      command: {
        type: "InsertLinkedMedia",
        timelineId: executed.snapshot.timeline.id,
        mediaItemId: "media-1",
        videoTrackId: createdTrackIds[0],
        audioTrackId: createdTrackIds[1],
        timelineStartUs: 0
      }
    });

    expect(executed.result.ok).toBe(true);
    expect(executed.snapshot.timeline.trackOrder).toHaveLength(2);
    expect(executed.snapshot.history.canUndo).toBe(true);

    const sessionSnapshot = await getEditorSessionSnapshot(directory);
    const clipId =
      sessionSnapshot.timeline.tracksById[createdTrackIds[0]]?.clipIds[0] ?? null;

    expect(clipId).toBeTruthy();

    const split = await executeEditorCommand({
      directory,
      command: {
        type: "SplitClip",
        timelineId: sessionSnapshot.timeline.id,
        clipId: clipId!,
        splitTimeUs: 4_000_000
      }
    });

    expect(split.result.ok).toBe(true);

    const undone = await executeEditorCommand({
      directory,
      command: {
        type: "Undo",
        timelineId: sessionSnapshot.timeline.id
      }
    });

    expect(undone.result.ok).toBe(true);
    expect(undone.snapshot.history.canRedo).toBe(true);

    const redone = await executeEditorCommand({
      directory,
      command: {
        type: "Redo",
        timelineId: sessionSnapshot.timeline.id
      }
    });

    expect(redone.result.ok).toBe(true);
    expect(redone.snapshot.history.undoDepth).toBeGreaterThan(0);

    const reopened = await loadAndMaybeMigrateProject(directory);

    expect(Object.keys(reopened.document.timeline.clipsById)).toHaveLength(3);
  });
});
