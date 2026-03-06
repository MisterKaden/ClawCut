import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import type { ProjectWorkspaceSnapshot } from "@clawcut/ipc";

import {
  importMediaPaths,
  relinkMediaItem
} from "../src/ingest-service";
import {
  createProject,
  getProjectSnapshot,
  refreshMediaHealth
} from "../src/project-repository";

const temporaryDirectories: string[] = [];

function registerTempDirectory(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

function fixturePath(name: string): string {
  return resolve(process.cwd(), "fixtures/media", name);
}

async function waitForProjectToSettle(directory: string): Promise<ProjectWorkspaceSnapshot> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 25_000) {
    const snapshot = await getProjectSnapshot(directory);
    const hasActiveJobs = snapshot.jobs.some(
      (job) => job.status === "queued" || job.status === "running"
    );
    const hasActiveItems = snapshot.libraryItems.some(
      (item) => item.ingestStatus === "indexing" || item.ingestStatus === "deriving"
    );

    if (!hasActiveJobs && !hasActiveItems) {
      return snapshot;
    }

    await new Promise((resolvePromise) => {
      setTimeout(resolvePromise, 150);
    });
  }

  throw new Error(`Timed out waiting for project ${directory} to settle.`);
}

describe.sequential("ingest service", () => {
  afterEach(() => {
    while (temporaryDirectories.length > 0) {
      const directory = temporaryDirectories.pop();

      if (directory) {
        rmSync(directory, { recursive: true, force: true });
      }
    }
  });

  test("imports video and audio, generates derived assets, and records failed ingest cleanly", async () => {
    const projectDirectory = registerTempDirectory("clawcut-stage2-project-");
    const importDirectory = registerTempDirectory("clawcut-stage2-imports-");
    const nestedDirectory = join(importDirectory, "nested");

    await createProject(projectDirectory, "Stage 2 Integration");
    mkdirSync(nestedDirectory, { recursive: true });
    copyFileSync(fixturePath("talking-head-sample.mp4"), join(importDirectory, "talking-head-sample.mp4"));
    writeFileSync(join(importDirectory, "notes.txt"), "not media");
    copyFileSync(fixturePath("podcast-tone.wav"), join(nestedDirectory, "podcast-tone.wav"));

    await importMediaPaths({
      directory: projectDirectory,
      paths: [importDirectory]
    });

    const snapshot = await waitForProjectToSettle(projectDirectory);
    const videoItem = snapshot.libraryItems.find((item) => item.displayName.endsWith(".mp4"));
    const audioItem = snapshot.libraryItems.find((item) => item.displayName.endsWith(".wav"));
    const derivedJobCount = snapshot.jobs.filter((job) => job.kind !== "ingest").length;

    expect(snapshot.libraryItems).toHaveLength(2);
    expect(videoItem?.derivedAssets.thumbnail?.status).toBe("ready");
    expect(videoItem?.derivedAssets.proxy?.status).toBe("ready");
    expect(videoItem?.derivedAssets.waveform?.status).toBe("ready");
    expect(audioItem?.derivedAssets.waveform?.status).toBe("ready");
    expect(audioItem?.derivedAssets.thumbnail).toBeNull();
    expect(audioItem?.derivedAssets.proxy).toBeNull();
    expect(audioItem?.derivedAssets.waveform?.previewPeaks.length).toBeGreaterThan(0);
    expect(snapshot.jobs.some((job) => job.status === "failed" && job.errorMessage === "Unsupported media type.")).toBe(true);

    await importMediaPaths({
      directory: projectDirectory,
      paths: [join(importDirectory, "talking-head-sample.mp4")]
    });

    const dedupedSnapshot = await waitForProjectToSettle(projectDirectory);
    const nextDerivedJobCount = dedupedSnapshot.jobs.filter((job) => job.kind !== "ingest").length;

    expect(dedupedSnapshot.libraryItems).toHaveLength(2);
    expect(nextDerivedJobCount).toBe(derivedJobCount);
  });

  test("does not repoint an existing media item when an exact duplicate file is imported from a second path", async () => {
    const projectDirectory = registerTempDirectory("clawcut-stage2-duplicate-project-");
    const importDirectory = registerTempDirectory("clawcut-stage2-duplicate-imports-");
    const originalPath = join(importDirectory, "talking-head-sample.mp4");
    const duplicatePath = join(importDirectory, "talking-head-sample-copy.mp4");

    await createProject(projectDirectory, "Duplicate Import Project");
    copyFileSync(fixturePath("talking-head-sample.mp4"), originalPath);
    copyFileSync(fixturePath("talking-head-sample.mp4"), duplicatePath);

    await importMediaPaths({
      directory: projectDirectory,
      paths: [originalPath]
    });

    const firstSnapshot = await waitForProjectToSettle(projectDirectory);
    const originalItem = firstSnapshot.libraryItems[0];

    await importMediaPaths({
      directory: projectDirectory,
      paths: [duplicatePath]
    });

    const secondSnapshot = await waitForProjectToSettle(projectDirectory);
    const dedupedItem = secondSnapshot.libraryItems[0];

    expect(secondSnapshot.libraryItems).toHaveLength(1);
    expect(dedupedItem?.id).toBe(originalItem?.id);
    expect(dedupedItem?.source.currentResolvedPath).toBe(originalPath);
  });

  test("detects missing media and safely relinks it", async () => {
    const projectDirectory = registerTempDirectory("clawcut-stage2-missing-project-");
    const importDirectory = registerTempDirectory("clawcut-stage2-missing-imports-");
    const originalPath = join(importDirectory, "talking-head-sample.mp4");
    const relinkedPath = join(importDirectory, "talking-head-sample-relinked.mp4");

    await createProject(projectDirectory, "Relink Project");
    copyFileSync(fixturePath("talking-head-sample.mp4"), originalPath);

    await importMediaPaths({
      directory: projectDirectory,
      paths: [originalPath]
    });

    const importedSnapshot = await waitForProjectToSettle(projectDirectory);
    const mediaItem = importedSnapshot.libraryItems[0];

    expect(mediaItem).toBeDefined();
    expect(mediaItem?.relinkStatus).toBe("linked");

    renameSync(originalPath, relinkedPath);

    const missingSnapshot = await refreshMediaHealth(projectDirectory);
    const missingItem = missingSnapshot.libraryItems[0];

    expect(missingItem?.ingestStatus).toBe("missing");
    expect(missingItem?.relinkStatus).toBe("missing");

    const relinked = await relinkMediaItem({
      directory: projectDirectory,
      mediaItemId: missingItem!.id,
      candidatePath: relinkedPath
    });

    const relinkedItem = relinked.snapshot.libraryItems[0];

    expect(relinked.result.accepted).toBe(true);
    expect(relinked.result.confidence).toBe("exact");
    expect(relinkedItem?.source.currentResolvedPath).toBe(relinkedPath);
    expect(relinkedItem?.relinkStatus).not.toBe("missing");
    expect(relinkedItem?.derivedAssets.thumbnail?.status).toBe("ready");
  });
});
