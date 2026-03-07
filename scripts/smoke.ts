import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { _electron as electron, type Page } from "playwright";

interface LocalApiSmokeStatus {
  baseUrl: string;
  token: string;
  state: string;
}

async function waitForPreviewLoaded(page: Page, timelineId: string): Promise<void> {
  await page.waitForFunction(
    (expectedTimelineId) => {
      const state = window.clawcutPreview.getPreviewState();
      return state.loaded && state.timelineId === expectedTimelineId;
    },
    timelineId,
    {
      timeout: 15_000
    }
  );
}

async function waitForLocalApiReady(page: Page): Promise<LocalApiSmokeStatus> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 15_000) {
    const status = await page.evaluate(async () => {
      return window.clawcut.getLocalApiStatus();
    });

    if (status.enabled && status.state === "running" && status.baseUrl) {
      return {
        baseUrl: status.baseUrl,
        token: status.token,
        state: status.state
      };
    }

    await page.waitForTimeout(150);
  }

  throw new Error("Timed out waiting for the local API to become ready.");
}

async function requestLocalApi<TData>(
  localApi: LocalApiSmokeStatus,
  path: string,
  options?: {
    method?: "GET" | "POST";
    token?: string | null;
    body?: unknown;
  }
): Promise<{ status: number; body: TData }> {
  const response = await fetch(`${localApi.baseUrl}${path}`, {
    method: options?.method ?? "GET",
    headers: {
      ...(options?.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options?.body ? { "Content-Type": "application/json" } : {})
    },
    body: options?.body ? JSON.stringify(options.body) : undefined
  });

  return {
    status: response.status,
    body: (await response.json()) as TData
  };
}

async function waitForLibraryToSettleViaApi(
  localApi: LocalApiSmokeStatus,
  projectDirectory: string
): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 30_000) {
    const snapshot = await requestLocalApi<{
      ok: boolean;
      data: {
        libraryItems: Array<{ ingestStatus: string }>;
        jobs: Array<{ status: string }>;
      };
    }>(localApi, "/api/v1/query", {
      method: "POST",
      token: localApi.token,
      body: {
        name: "project.snapshot",
        input: {
          directory: projectDirectory
        }
      }
    });

    if (!snapshot.body.ok) {
      throw new Error("Local API project snapshot query failed during ingest settling.");
    }

    const hasActiveJobs = snapshot.body.data.jobs.some(
      (job) => job.status === "queued" || job.status === "running"
    );
    const hasActiveItems = snapshot.body.data.libraryItems.some(
      (item) => item.ingestStatus === "indexing" || item.ingestStatus === "deriving"
    );

    if (!hasActiveJobs && !hasActiveItems && snapshot.body.data.libraryItems.length > 0) {
      return;
    }

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 150));
  }

  throw new Error("Timed out waiting for API-driven media ingest to settle.");
}

async function waitForExportToFinishViaApi(
  localApi: LocalApiSmokeStatus,
  projectDirectory: string,
  jobId: string
): Promise<{
  id: string;
  status: string;
  outputPath: string | null;
  error: { message: string } | null;
}> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 60_000) {
    const details = await requestLocalApi<{
      ok: boolean;
      data: {
        job: { status: string } | null;
        exportRun: {
          id: string;
          status: string;
          outputPath: string | null;
          error: { message: string } | null;
        } | null;
      };
    }>(localApi, "/api/v1/query", {
      method: "POST",
      token: localApi.token,
      body: {
        name: "jobs.get",
        input: {
          directory: projectDirectory,
          jobId
        }
      }
    });

    if (!details.body.ok) {
      throw new Error("Local API job query failed while waiting for export completion.");
    }

    const run = details.body.data.exportRun;

    if (run && ["completed", "failed", "cancelled"].includes(run.status)) {
      return run;
    }

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 150));
  }

  throw new Error(`Timed out waiting for export job ${jobId} to finish through the local API.`);
}

async function waitForTranscriptionToFinishViaApi(
  localApi: LocalApiSmokeStatus,
  projectDirectory: string,
  jobId: string
): Promise<{
  id: string;
  jobId: string;
  status: string;
  transcriptId: string | null;
  error: { message: string } | null;
}> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 30_000) {
    const details = await requestLocalApi<{
      ok: boolean;
      data: {
        job: { status: string } | null;
        transcriptionRun: {
          id: string;
          jobId: string;
          status: string;
          transcriptId: string | null;
          error: { message: string } | null;
        } | null;
      };
    }>(localApi, "/api/v1/query", {
      method: "POST",
      token: localApi.token,
      body: {
        name: "jobs.get",
        input: {
          directory: projectDirectory,
          jobId
        }
      }
    });

    if (!details.body.ok) {
      throw new Error("Local API job query failed while waiting for transcription.");
    }

    const run = details.body.data.transcriptionRun;

    if (run && ["completed", "failed", "cancelled"].includes(run.status)) {
      return run;
    }

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 150));
  }

  throw new Error(`Timed out waiting for transcription job ${jobId} through the local API.`);
}

async function runSmoke(): Promise<void> {
  const require = createRequire(import.meta.url);
  const workspaceRoot = resolve(process.cwd());
  const appRoot = resolve(workspaceRoot, "apps/desktop");
  const electronBinary = require("electron") as string;
  const mainEntry = resolve(appRoot, "out/main/index.js");
  const projectDirectory = mkdtempSync(join(tmpdir(), "clawcut-stage6-smoke-project-"));
  const importDirectory = mkdtempSync(join(tmpdir(), "clawcut-stage6-smoke-import-"));
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
      CLAWCUT_WORKSPACE_ROOT: workspaceRoot,
      CLAWCUT_SMOKE: "1",
      CLAWCUT_TRANSCRIPTION_ADAPTER: "fixture"
    }
  });

  try {
    const page = await electronApp.firstWindow();

    await page.getByTestId("project-directory-input").fill(projectDirectory);
    await page.getByTestId("project-name-input").fill("Stage 7 Smoke");
    await page.getByTestId("create-project-button").click();
    await page.waitForFunction(
      () => document.querySelector('[data-testid="workspace-header"]')?.textContent?.includes("Stage 7 Smoke") === true,
      undefined,
      {
        timeout: 10_000
      }
    );

    const projectHeading = await page.getByTestId("workspace-header").textContent();

    if (!projectHeading?.includes("Stage 7 Smoke")) {
      throw new Error(`Smoke project was not opened. Header text: ${projectHeading ?? "missing"}`);
    }

    const localApi = await waitForLocalApiReady(page);
    const health = await requestLocalApi<{ ok: boolean; data: { status: string } }>(
      localApi,
      "/api/v1/health"
    );
    const unauthorizedCapabilities = await requestLocalApi<{
      ok: false;
      error: { code: string };
    }>(localApi, "/api/v1/capabilities");
    const capabilities = await requestLocalApi<{
      ok: boolean;
      data: { apiVersion: string; features: { openClawTools: boolean } };
    }>(localApi, "/api/v1/capabilities", {
      token: localApi.token
    });
    const openClawTools = await requestLocalApi<{
      ok: boolean;
      data: Array<{ name: string }>;
    }>(localApi, "/api/v1/openclaw/tools", {
      token: localApi.token
    });

    if (health.status !== 200 || !health.body.ok) {
      throw new Error("Local API health endpoint did not return success.");
    }

    if (
      unauthorizedCapabilities.status !== 401 ||
      unauthorizedCapabilities.body.error.code !== "AUTH_REQUIRED"
    ) {
      throw new Error("Local API did not reject an unauthenticated capabilities request.");
    }

    if (
      capabilities.status !== 200 ||
      !capabilities.body.ok ||
      capabilities.body.data.apiVersion !== "v1" ||
      !capabilities.body.data.features.openClawTools
    ) {
      throw new Error("Local API capabilities did not describe the Stage 7 control surface.");
    }

    if (
      openClawTools.status !== 200 ||
      !openClawTools.body.ok ||
      !openClawTools.body.data.some((tool) => tool.name === "clawcut.open_project")
    ) {
      throw new Error("OpenClaw tool discovery was not exposed through the local API.");
    }

    const openedViaApi = await requestLocalApi<{ ok: boolean; data: { directory: string } }>(
      localApi,
      "/api/v1/command",
      {
        method: "POST",
        token: localApi.token,
        body: {
          name: "project.open",
          input: {
            directory: projectDirectory
          }
        }
      }
    );

    if (!openedViaApi.body.ok || openedViaApi.body.data.directory !== projectDirectory) {
      throw new Error("Opening the project through the local API failed.");
    }

    const importViaApi = await requestLocalApi<{
      ok: boolean;
      data: { acceptedPaths: string[] };
    }>(localApi, "/api/v1/command", {
      method: "POST",
      token: localApi.token,
      body: {
        name: "media.import",
        input: {
          directory: projectDirectory,
          paths: [originalPath]
        }
      }
    });

    if (!importViaApi.body.ok || !importViaApi.body.data.acceptedPaths.includes(originalPath)) {
      throw new Error("Importing media through the local API failed.");
    }

    await page.getByTestId("open-project-button").click();
    await waitForLibraryToSettleViaApi(localApi, projectDirectory);
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

    const stageFourResult = await page.evaluate(async (directory) => {
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

      const splitTimeUs =
        initialVideoClip.timelineStartUs +
        Math.round((initialVideoClip.sourceOutUs - initialVideoClip.sourceInUs) / 2);

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

      const move = await window.clawcut.executeEditorCommand({
        directory,
        command: {
          type: "MoveClip",
          timelineId: split.snapshot.timeline.id,
          clipId: split.result.rightClipId,
          newTimelineStartUs: splitTimeUs + 1_000_000,
          targetTrackId: videoTrackId
        }
      });

      if (!move.result.ok || move.result.commandType !== "MoveClip") {
        throw new Error("MoveClip command failed during smoke.");
      }

      await window.clawcutPreview.executeCommand({
        type: "LoadTimelinePreview",
        target: {
          directory: initial.directory,
          cacheRoot: initial.cacheRoot,
          timeline: move.snapshot.timeline,
          libraryItems: move.snapshot.libraryItems,
          captionTracks: move.snapshot.document.captions.tracks,
          captionTemplates: [],
          defaultQualityMode: "fast"
        },
        preservePlayhead: false
      });
      await window.clawcutPreview.executeCommand({
        type: "SetPreviewQuality",
        qualityMode: "fast"
      });

      const fastState = window.clawcutPreview.getPreviewState();

      if (fastState.sourceMode !== "proxy") {
        throw new Error(`Expected fast preview to prefer proxies, got ${fastState.sourceMode}.`);
      }

      await window.clawcutPreview.executeCommand({
        type: "SetPreviewQuality",
        qualityMode: "standard"
      });

      const standardState = window.clawcutPreview.getPreviewState();

      if (standardState.sourceMode !== "original") {
        throw new Error(
          `Expected standard preview to use originals, got ${standardState.sourceMode}.`
        );
      }

      await window.clawcutPreview.executeCommand({
        type: "SeekPreview",
        positionUs: splitTimeUs + 1_250_000
      });

      const secondClipState = window.clawcutPreview.getPreviewState();

      if (secondClipState.activeVideoClipId !== split.result.rightClipId) {
        throw new Error("Preview did not resolve onto the second sequential clip.");
      }

      await window.clawcutPreview.executeCommand({
        type: "SeekPreview",
        positionUs: 200_000
      });
      await window.clawcutPreview.executeCommand({
        type: "PlayPreview"
      });

      return {
        timelineId: move.snapshot.timeline.id,
        rightClipId: split.result.rightClipId
      };
    }, projectDirectory);

    await waitForPreviewLoaded(page, stageFourResult.timelineId);
    await page.getByTestId("preview-panel").waitFor({ state: "visible" });
    await page.getByTestId("preview-play-toggle").waitFor({ state: "visible" });
    await page.waitForFunction(() => {
      return window.clawcutPreview.getPreviewState().playbackStatus === "playing";
    });
    await page.waitForTimeout(700);

    const pausedPreviewPlayheadUs = await page.evaluate(async () => {
      await window.clawcutPreview.executeCommand({
        type: "PausePreview"
      });

      return window.clawcutPreview.getPreviewState().playheadUs;
    });

    if (pausedPreviewPlayheadUs <= 200_000) {
      throw new Error("Preview playhead did not advance during playback.");
    }

    await page.evaluate(async () => {
      await window.clawcutPreview.executeCommand({
        type: "StepPreviewFrameForward"
      });
    });

    const stageThreeResult = await page.evaluate(async (directory) => {
      const stateAfterPreview = window.clawcutPreview.getPreviewState();

      if (stateAfterPreview.playheadUs <= 0) {
        throw new Error("Preview frame stepping did not leave a usable playhead position.");
      }

      await window.clawcut.executeEditorCommand({
        directory,
        command: {
          type: "Undo",
          timelineId: (await window.clawcut.getEditorSessionSnapshot({ directory })).timeline.id
        }
      });

      await window.clawcut.executeEditorCommand({
        directory,
        command: {
          type: "Redo",
          timelineId: (await window.clawcut.getEditorSessionSnapshot({ directory })).timeline.id
        }
      });

      return window.clawcut.getEditorSessionSnapshot({ directory });
    }, projectDirectory);

    if (Object.keys(stageThreeResult.timeline.clipsById).length < 2) {
      throw new Error("Expected timeline edits to leave at least two clips in the project.");
    }

    await page.getByTestId("caption-panel").waitFor({ state: "visible" });
    const timelineSessionViaApi = await requestLocalApi<{
      ok: boolean;
      data: {
        timeline: {
          id: string;
          trackOrder: string[];
          tracksById: Record<string, { kind: string; clipIds: string[] }>;
        };
      };
    }>(localApi, "/api/v1/query", {
      method: "POST",
      token: localApi.token,
      body: {
        name: "timeline.session",
        input: {
          directory: projectDirectory
        }
      }
    });

    if (!timelineSessionViaApi.body.ok) {
      throw new Error("Timeline session query failed through the local API.");
    }

    const videoTrackId = timelineSessionViaApi.body.data.timeline.trackOrder.find((trackId) => {
      return timelineSessionViaApi.body.data.timeline.tracksById[trackId]?.kind === "video";
    });
    const videoClipId = videoTrackId
      ? timelineSessionViaApi.body.data.timeline.tracksById[videoTrackId]?.clipIds[0]
      : null;

    if (!videoTrackId || !videoClipId) {
      throw new Error("The Stage 7 API smoke could not resolve a video clip for transcription.");
    }

    const transcribeViaApi = await requestLocalApi<{
      ok: boolean;
      data: {
        result: {
          ok: boolean;
          commandType: string;
          run: { id: string; jobId: string };
        };
      };
    }>(localApi, "/api/v1/command", {
      method: "POST",
      token: localApi.token,
      body: {
        name: "captions.execute",
        input: {
          directory: projectDirectory,
          command: {
            type: "TranscribeClip",
            timelineId: timelineSessionViaApi.body.data.timeline.id,
            clipId: videoClipId,
            options: {
              initialPrompt: "Prefer the ClawCut, OpenClaw, and KPStudio names.",
              glossaryTerms: ["ClawCut", "OpenClaw", "KPStudio"]
            }
          }
        }
      }
    });

    if (
      !transcribeViaApi.body.ok ||
      !transcribeViaApi.body.data.result.ok ||
      transcribeViaApi.body.data.result.commandType !== "TranscribeClip"
    ) {
      throw new Error("Transcribing through the local API failed.");
    }

    const initialTranscriptionJob = await requestLocalApi<{
      ok: boolean;
      data: {
        job: { kind: string; status: string } | null;
        transcriptionRun: { id: string } | null;
      };
    }>(localApi, "/api/v1/query", {
      method: "POST",
      token: localApi.token,
      body: {
        name: "jobs.get",
        input: {
          directory: projectDirectory,
          jobId: transcribeViaApi.body.data.result.run.jobId
        }
      }
    });

    if (
      !initialTranscriptionJob.body.ok ||
      initialTranscriptionJob.body.data.job?.kind !== "transcription" ||
      !initialTranscriptionJob.body.data.transcriptionRun
    ) {
      throw new Error("The local API did not expose transcription job details.");
    }

    const completedTranscription = await waitForTranscriptionToFinishViaApi(
      localApi,
      projectDirectory,
      transcribeViaApi.body.data.result.run.jobId
    );

    if (completedTranscription.status !== "completed" || !completedTranscription.transcriptId) {
      throw new Error(
        `Transcription did not complete successfully: ${completedTranscription.error?.message ?? completedTranscription.status}`
      );
    }

    await page.getByTestId("transcript-segment-list").waitFor({ state: "visible" });
    await page.getByTestId("transcript-summary").waitFor({ state: "visible" });
    const generatedCaptionTrack = await requestLocalApi<{
      ok: boolean;
      data: {
        result: {
          ok: boolean;
          commandType: string;
          captionTrack: { id: string };
        };
      };
    }>(localApi, "/api/v1/command", {
      method: "POST",
      token: localApi.token,
      body: {
        name: "captions.execute",
        input: {
          directory: projectDirectory,
          command: {
            type: "GenerateCaptionTrack",
            timelineId: timelineSessionViaApi.body.data.timeline.id,
            transcriptId: completedTranscription.transcriptId,
            templateId: "bottom-center-clean"
          }
        }
      }
    });

    if (
      !generatedCaptionTrack.body.ok ||
      !generatedCaptionTrack.body.data.result.ok ||
      generatedCaptionTrack.body.data.result.commandType !== "GenerateCaptionTrack"
    ) {
      throw new Error("Generating a caption track through the local API failed.");
    }

    await page.getByTestId("caption-segment-list").waitFor({ state: "visible" });

    const captionSessionViaApi = await requestLocalApi<{
      ok: boolean;
      data: {
        transcriptSummaries: Array<{ wordTimingCoverageRatio: number }>;
        transcriptionRuns: Array<{ request: { options: { glossaryTerms?: string[] } } }>;
        captionTracks: Array<{ id: string }>;
      };
    }>(localApi, "/api/v1/query", {
      method: "POST",
      token: localApi.token,
      body: {
        name: "captions.session",
        input: {
          directory: projectDirectory
        }
      }
    });

    if (!captionSessionViaApi.body.ok || !captionSessionViaApi.body.data.transcriptSummaries[0]) {
      throw new Error("Transcript summary was not exposed for automation callers.");
    }

    if ((captionSessionViaApi.body.data.transcriptSummaries[0]?.wordTimingCoverageRatio ?? 0) <= 0) {
      throw new Error("Transcript summary did not report word timing coverage.");
    }

    if (
      !captionSessionViaApi.body.data.transcriptionRuns[0]?.request.options.glossaryTerms?.includes(
        "OpenClaw"
      )
    ) {
      throw new Error("Transcription glossary terms were not preserved on the run request.");
    }

    const previewLoadViaApi = await requestLocalApi<{ ok: boolean }>(localApi, "/api/v1/command", {
      method: "POST",
      token: localApi.token,
      body: {
        name: "preview.load-project-timeline",
        input: {
          directory: projectDirectory,
          initialPlayheadUs: 350_000,
          preservePlayhead: false
        }
      }
    });
    const previewSeekViaApi = await requestLocalApi<{ ok: boolean }>(localApi, "/api/v1/command", {
      method: "POST",
      token: localApi.token,
      body: {
        name: "preview.execute",
        input: {
          command: {
            type: "SeekPreview",
            positionUs: 350_000
          }
        }
      }
    });

    if (!previewLoadViaApi.body.ok || !previewSeekViaApi.body.ok) {
      throw new Error("Preview control through the local API failed.");
    }

    await page.getByTestId("preview-caption-overlay").waitFor({ state: "visible" });

    const captionTrackId = captionSessionViaApi.body.data.captionTracks[0]?.id;

    if (!captionTrackId) {
      throw new Error("Caption track was not generated.");
    }

    const subtitleExport = await requestLocalApi<{
      ok: boolean;
      data: {
        result: {
          ok: boolean;
          commandType: string;
          artifact: { outputPath: string };
        };
      };
    }>(localApi, "/api/v1/command", {
      method: "POST",
      token: localApi.token,
      body: {
        name: "captions.execute",
        input: {
          directory: projectDirectory,
          command: {
            type: "ExportSubtitleFile",
            captionTrackId,
            format: "srt"
          }
        }
      }
    });

    if (
      !subtitleExport.body.ok ||
      !subtitleExport.body.data.result.ok ||
      subtitleExport.body.data.result.commandType !== "ExportSubtitleFile"
    ) {
      throw new Error("Could not export the subtitle sidecar through the local API.");
    }

    const burnInEnable = await requestLocalApi<{
      ok: boolean;
      data: { result: { ok: boolean; commandType: string } };
    }>(localApi, "/api/v1/command", {
      method: "POST",
      token: localApi.token,
      body: {
        name: "captions.execute",
        input: {
          directory: projectDirectory,
          command: {
            type: "EnableBurnInCaptionsForExport",
            timelineId: timelineSessionViaApi.body.data.timeline.id,
            captionTrackId,
            enabled: true
          }
        }
      }
    });

    if (
      !burnInEnable.body.ok ||
      !burnInEnable.body.data.result.ok ||
      burnInEnable.body.data.result.commandType !== "EnableBurnInCaptionsForExport"
    ) {
      throw new Error("Could not enable burn-in captions through the local API.");
    }

    if (!existsSync(subtitleExport.body.data.result.artifact.outputPath)) {
      throw new Error("Subtitle export did not create an output file.");
    }

    if (!readFileSync(subtitleExport.body.data.result.artifact.outputPath, "utf8").includes("-->")) {
      throw new Error("Subtitle export did not produce a valid SRT payload.");
    }

    const videoRangeStartUs = 250_000;
    const videoRangeEndUs = 1_750_000;
    const videoExportStart = await requestLocalApi<{
      ok: boolean;
      data: {
        result: {
          ok: boolean;
          commandType: string;
          exportRun: { id: string; jobId: string };
        };
      };
    }>(localApi, "/api/v1/command", {
      method: "POST",
      token: localApi.token,
      body: {
        name: "export.execute",
        input: {
          directory: projectDirectory,
          command: {
            type: "StartExport",
            request: {
              timelineId: timelineSessionViaApi.body.data.timeline.id,
              presetId: "video-share-720p",
              target: {
                kind: "range",
                startUs: videoRangeStartUs,
                endUs: videoRangeEndUs,
                label: "Smoke range"
              }
            }
          }
        }
      }
    });

    if (
      !videoExportStart.body.ok ||
      !videoExportStart.body.data.result.ok ||
      videoExportStart.body.data.result.commandType !== "StartExport"
    ) {
      throw new Error("Could not start the video export through the local API.");
    }

    const exportJobDetails = await requestLocalApi<{
      ok: boolean;
      data: {
        job: { kind: string; status: string } | null;
        exportRun: { id: string } | null;
      };
    }>(localApi, "/api/v1/query", {
      method: "POST",
      token: localApi.token,
      body: {
        name: "jobs.get",
        input: {
          directory: projectDirectory,
          jobId: videoExportStart.body.data.result.exportRun.jobId
        }
      }
    });

    if (
      !exportJobDetails.body.ok ||
      exportJobDetails.body.data.job?.kind !== "export" ||
      !exportJobDetails.body.data.exportRun
    ) {
      throw new Error("The local API did not expose export job details.");
    }

    const audioExportStart = await requestLocalApi<{
      ok: boolean;
      data: {
        result: {
          ok: boolean;
          commandType: string;
          exportRun: { id: string; jobId: string };
        };
      };
    }>(localApi, "/api/v1/command", {
      method: "POST",
      token: localApi.token,
      body: {
        name: "export.execute",
        input: {
          directory: projectDirectory,
          command: {
            type: "StartExport",
            request: {
              timelineId: timelineSessionViaApi.body.data.timeline.id,
              presetId: "audio-podcast-aac"
            }
          }
        }
      }
    });

    if (
      !audioExportStart.body.ok ||
      !audioExportStart.body.data.result.ok ||
      audioExportStart.body.data.result.commandType !== "StartExport"
    ) {
      throw new Error("Could not start the audio export through the local API.");
    }

    const completedVideo = await waitForExportToFinishViaApi(
      localApi,
      projectDirectory,
      videoExportStart.body.data.result.exportRun.jobId
    );

    if (!completedVideo || completedVideo.status !== "completed" || !completedVideo.outputPath) {
      throw new Error(
        `Video export did not complete successfully: ${completedVideo?.error?.message ?? completedVideo?.status ?? "missing run"}`
      );
    }

    const videoProbe = await page.evaluate(async (outputPath) => {
      return window.clawcut.probeAsset({ assetPath: outputPath });
    }, completedVideo.outputPath);
    const expectedVideoDurationMs = Math.round((videoRangeEndUs - videoRangeStartUs) / 1_000);

    if (
      videoProbe.durationMs !== null &&
      Math.abs(videoProbe.durationMs - expectedVideoDurationMs) > 1_200
    ) {
      throw new Error("Video export duration drifted beyond tolerance.");
    }

    const completedVideoRun = await requestLocalApi<{
      ok: boolean;
      data: {
        exportRuns: Array<{
          id: string;
          diagnostics: { subtitleArtifactPaths: string[] };
        }>;
      };
    }>(localApi, "/api/v1/query", {
      method: "POST",
      token: localApi.token,
      body: {
        name: "export.session",
        input: {
          directory: projectDirectory
        }
      }
    });

    const completedVideoRunDetails = completedVideoRun.body.ok
      ? completedVideoRun.body.data.exportRuns.find((entry) => entry.id === completedVideo.id) ?? null
      : null;

    if (!completedVideoRunDetails?.diagnostics.subtitleArtifactPaths.length) {
      throw new Error("Burn-in export did not record an ASS subtitle artifact.");
    }

    const exportSnapshotResult = await requestLocalApi<{
      ok: boolean;
      data: {
        result: {
          ok: boolean;
          commandType: string;
        };
      };
    }>(localApi, "/api/v1/command", {
      method: "POST",
      token: localApi.token,
      body: {
        name: "export.execute",
        input: {
          directory: projectDirectory,
          command: {
            type: "CaptureExportSnapshot",
            request: {
              sourceKind: "export-run",
              exportRunId: completedVideo.id
            }
          }
        }
      }
    });

    if (
      !exportSnapshotResult.body.ok ||
      !exportSnapshotResult.body.data.result.ok ||
      exportSnapshotResult.body.data.result.commandType !== "CaptureExportSnapshot"
    ) {
      throw new Error("Could not capture a still frame from the completed export.");
    }

    const completedAudio = await waitForExportToFinishViaApi(
      localApi,
      projectDirectory,
      audioExportStart.body.data.result.exportRun.jobId
    );

    if (!completedAudio || completedAudio.status !== "completed" || !completedAudio.outputPath) {
      throw new Error(
        `Audio export did not complete successfully: ${completedAudio?.error?.message ?? completedAudio?.status ?? "missing run"}`
      );
    }

    const audioProbe = await page.evaluate(async (outputPath) => {
      return window.clawcut.probeAsset({ assetPath: outputPath });
    }, completedAudio.outputPath);

    if (!audioProbe.streams.some((stream) => stream.codecType === "audio")) {
      throw new Error("Audio export output is missing an audio stream.");
    }

    const timelineSnapshotResult = await requestLocalApi<{
      ok: boolean;
      data: {
        result: {
          ok: boolean;
          commandType: string;
        };
      };
    }>(localApi, "/api/v1/command", {
      method: "POST",
      token: localApi.token,
      body: {
        name: "export.execute",
        input: {
          directory: projectDirectory,
          command: {
            type: "CaptureExportSnapshot",
            request: {
              sourceKind: "timeline",
              timelineId: stageThreeResult.timeline.id,
              positionUs: 600_000,
              presetId: "video-share-720p"
            }
          }
        }
      }
    });

    if (
      !timelineSnapshotResult.body.ok ||
      !timelineSnapshotResult.body.data.result.ok ||
      timelineSnapshotResult.body.data.result.commandType !== "CaptureExportSnapshot"
    ) {
      throw new Error("Could not capture a still frame from the timeline.");
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
      path: resolve(screenshotDirectory, "clawcut-stage7-smoke.png"),
      fullPage: true
    });
  } finally {
    await electronApp.close();
    rmSync(projectDirectory, { recursive: true, force: true });
    rmSync(importDirectory, { recursive: true, force: true });
  }
}

void runSmoke();
