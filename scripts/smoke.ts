import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { _electron as electron, type Page } from "playwright";

async function waitForLibraryToSettle(page: Page, projectDirectory: string): Promise<void> {
  await page.waitForFunction(
    async (directory) => {
      const snapshot = await window.clawcut.getProjectSnapshot({ directory });
      const hasActiveJobs = snapshot.jobs.some(
        (job) => job.status === "queued" || job.status === "running"
      );
      const hasActiveItems = snapshot.libraryItems.some(
        (item) => item.ingestStatus === "indexing" || item.ingestStatus === "deriving"
      );

      return !hasActiveJobs && !hasActiveItems && snapshot.libraryItems.length > 0;
    },
    projectDirectory,
    {
      timeout: 25_000
    }
  );
}

async function runSmoke(): Promise<void> {
  const require = createRequire(import.meta.url);
  const workspaceRoot = resolve(process.cwd());
  const appRoot = resolve(workspaceRoot, "apps/desktop");
  const electronBinary = require("electron") as string;
  const mainEntry = resolve(appRoot, "out/main/index.js");
  const projectDirectory = mkdtempSync(join(tmpdir(), "clawcut-stage3-smoke-project-"));
  const importDirectory = mkdtempSync(join(tmpdir(), "clawcut-stage3-smoke-import-"));
  const originalPath = join(importDirectory, "talking-head-sample.mp4");
  const screenshotDirectory = resolve(workspaceRoot, "output/playwright");

  copyFileSync(resolve(workspaceRoot, "fixtures/media/talking-head-sample.mp4"), originalPath);
  mkdirSync(screenshotDirectory, { recursive: true });

  const electronApp = await electron.launch({
    executablePath: electronBinary,
    args: [mainEntry],
    cwd: workspaceRoot,
    env: {
      ...process.env,
      CLAWCUT_WORKSPACE_ROOT: workspaceRoot
    }
  });

  try {
    const page = await electronApp.firstWindow();

    await page.getByTestId("project-directory-input").fill(projectDirectory);
    await page.getByTestId("project-name-input").fill("Stage 2 Smoke");
    await page.getByTestId("create-project-button").click();
    await page.waitForFunction(
      () => document.querySelector('[data-testid="workspace-header"]')?.textContent?.includes("Stage 2 Smoke") === true,
      undefined,
      {
        timeout: 10_000
      }
    );

    const projectHeading = await page.getByTestId("workspace-header").textContent();

    if (!projectHeading?.includes("Stage 2 Smoke")) {
      throw new Error(`Smoke project was not opened. Header text: ${projectHeading ?? "missing"}`);
    }

    await page.evaluate(async ({ directory, sourcePath }) => {
      await window.clawcut.importMediaPaths({
        directory,
        paths: [sourcePath]
      });
    }, {
      directory: projectDirectory,
      sourcePath: originalPath
    });

    await page.getByTestId("open-project-button").click();
    await waitForLibraryToSettle(page, projectDirectory);
    await page.getByTestId("metadata-panel").waitFor({ state: "visible" });
    await page.getByTestId("metadata-duration").waitFor({ state: "visible" });
    await page.getByTestId("metadata-dimensions").waitFor({ state: "visible" });
    await page.getByTestId("metadata-waveform").waitFor({ state: "visible" });

    await page.getByTestId("timeline-editor").waitFor({ state: "visible" });
    await page.getByTestId("create-timeline-button").click();
    await page.waitForFunction(
      async (directory) => {
        const snapshot = await window.clawcut.getEditorSessionSnapshot({ directory });
        return snapshot.timeline.trackOrder.length === 2;
      },
      projectDirectory,
      {
        timeout: 10_000
      }
    );

    await page.getByTestId("insert-linked-button").click();
    await page.waitForFunction(
      async (directory) => {
        const snapshot = await window.clawcut.getEditorSessionSnapshot({ directory });
        return Object.keys(snapshot.timeline.clipsById).length >= 2;
      },
      projectDirectory,
      {
        timeout: 10_000
      }
    );

    const stageThreeResult = await page.evaluate(async (directory) => {
      const initial = await window.clawcut.getEditorSessionSnapshot({ directory });
      const videoTrackId = initial.timeline.trackOrder.find(
        (trackId) => initial.timeline.tracksById[trackId]?.kind === "video"
      );
      const videoClipId = videoTrackId
        ? initial.timeline.tracksById[videoTrackId]?.clipIds[0]
        : null;

      if (!videoTrackId || !videoClipId) {
        throw new Error("Timeline did not create an initial video clip.");
      }

      const initialVideoClip = initial.timeline.clipsById[videoClipId];

      if (!initialVideoClip) {
        throw new Error("Video clip payload was missing from the timeline.");
      }

      await window.clawcut.executeEditorCommand({
        directory,
        command: {
          type: "MoveClip",
          timelineId: initial.timeline.id,
          clipId: videoClipId,
          newTimelineStartUs: 2_000_000
        }
      });

      const movedSnapshot = await window.clawcut.getEditorSessionSnapshot({ directory });
      const movedClip = movedSnapshot.timeline.clipsById[videoClipId];

      if (!movedClip) {
        throw new Error("MoveClip removed the expected clip.");
      }

      const splitTimeUs =
        movedClip.timelineStartUs +
        Math.round((movedClip.sourceOutUs - movedClip.sourceInUs) / 2);

      const split = await window.clawcut.executeEditorCommand({
        directory,
        command: {
          type: "SplitClip",
          timelineId: initial.timeline.id,
          clipId: videoClipId,
          splitTimeUs
        }
      });

      if (!split.result.ok || split.result.commandType !== "SplitClip") {
        throw new Error("SplitClip command failed during smoke.");
      }

      await window.clawcut.executeEditorCommand({
        directory,
        command: {
          type: "TrimClipEnd",
          timelineId: initial.timeline.id,
          clipId: split.result.leftClipId,
          newTimelineEndUs: 4_000_000
        }
      });

      await window.clawcut.executeEditorCommand({
        directory,
        command: {
          type: "RippleDeleteClip",
          timelineId: initial.timeline.id,
          clipId: split.result.leftClipId
        }
      });

      await window.clawcut.executeEditorCommand({
        directory,
        command: {
          type: "Undo",
          timelineId: initial.timeline.id
        }
      });

      await window.clawcut.executeEditorCommand({
        directory,
        command: {
          type: "Redo",
          timelineId: initial.timeline.id
        }
      });

      return window.clawcut.getEditorSessionSnapshot({ directory });
    }, projectDirectory);

    if (Object.keys(stageThreeResult.timeline.clipsById).length < 2) {
      throw new Error("Expected timeline edits to leave at least two clips in the project.");
    }

    await page.getByTestId("open-project-button").click();
    await page.waitForFunction(
      async (directory) => {
        const snapshot = await window.clawcut.getEditorSessionSnapshot({ directory });
        return Object.keys(snapshot.timeline.clipsById).length >= 2;
      },
      projectDirectory,
      {
        timeout: 10_000
      }
    );

    await page.screenshot({
      path: resolve(screenshotDirectory, "clawcut-stage3-smoke.png"),
      fullPage: true
    });
  } finally {
    await electronApp.close();
    rmSync(projectDirectory, { recursive: true, force: true });
    rmSync(importDirectory, { recursive: true, force: true });
  }
}

void runSmoke();
