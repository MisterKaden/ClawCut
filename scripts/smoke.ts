import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { _electron as electron, type Page } from "playwright";
import { ClawcutOpenClawClient } from "@clawcut/openclaw-plugin";

interface LocalApiSmokeStatus {
  baseUrl: string;
  token: string;
  state: string;
}

async function readEventStreamChunk(
  response: Response,
  expectedFragments: string[],
  timeoutMs = 4_000
): Promise<string> {
  if (!response.body) {
    throw new Error("Expected an SSE response body.");
  }

  const reader = response.body.getReader();
  const startedAt = Date.now();
  let output = "";

  try {
    while (Date.now() - startedAt < timeoutMs) {
      const { value, done } = await reader.read();

      if (done || !value) {
        break;
      }

      output += new TextDecoder().decode(value);

      if (expectedFragments.every((fragment) => output.includes(fragment))) {
        return output;
      }
    }

    throw new Error(`Event stream did not emit ${expectedFragments.join(", ")} within timeout.`);
  } finally {
    await reader.cancel().catch(() => undefined);
  }
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

async function waitForWorkflowRunStateViaApi(
  localApi: LocalApiSmokeStatus,
  projectDirectory: string,
  workflowRunId: string,
  statuses: string[],
  timeoutMs = 60_000
): Promise<{
  id: string;
  status: string;
  batchItems: Array<{ id: string; status: string }>;
  artifacts: Array<{ id: string; kind: string; path: string | null }>;
  approvals: Array<{ id: string; status: string }>;
  warnings: string[];
  error: { message: string } | null;
  steps: Array<{ id: string; kind: string; status: string; error: { message: string } | null }>;
}> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const details = await requestLocalApi<{
      ok: boolean;
      data: {
        id: string;
        status: string;
        batchItems: Array<{ id: string; status: string }>;
        artifacts: Array<{ id: string; kind: string; path: string | null }>;
        approvals: Array<{ id: string; status: string }>;
        warnings: string[];
        error: { message: string } | null;
        steps: Array<{ id: string; kind: string; status: string; error: { message: string } | null }>;
      } | null;
    }>(localApi, "/api/v1/query", {
      method: "POST",
      token: localApi.token,
      body: {
        name: "workflow.run",
        input: {
          directory: projectDirectory,
          workflowRunId
        }
      }
    });

    if (!details.body.ok) {
      throw new Error("Workflow run query failed while waiting for Stage 9 workflow completion.");
    }

    if (details.body.data && statuses.includes(details.body.data.status)) {
      return details.body.data;
    }

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 150));
  }

  throw new Error(
    `Timed out waiting for workflow run ${workflowRunId} to reach ${statuses.join(", ")}.`
  );
}

export async function runSmoke(): Promise<void> {
  const require = createRequire(import.meta.url);
  const workspaceRoot = resolve(process.cwd());
  const appRoot = resolve(workspaceRoot, "apps/desktop");
  const packagedExecutable = process.env.CLAWCUT_SMOKE_EXECUTABLE?.trim() || null;
  const electronBinary = packagedExecutable || (require("electron") as string);
  const mainEntry = resolve(appRoot, "out/main/index.js");
  const projectDirectory = mkdtempSync(join(tmpdir(), "clawcut-stage8-smoke-project-"));
  const workflowProjectDirectory = mkdtempSync(
    join(tmpdir(), "clawcut-stage9-smoke-workflow-project-")
  );
  const importDirectory = mkdtempSync(join(tmpdir(), "clawcut-stage8-smoke-import-"));
  const originalPath = join(importDirectory, "talking-head-sample.mp4");
  const transcriptionFixturePath = join(importDirectory, "stage9-transcript.txt");
  const screenshotDirectory = resolve(workspaceRoot, "output/playwright");

  copyFileSync(resolve(workspaceRoot, "fixtures/media/talking-head-sample.mp4"), originalPath);
  writeFileSync(
    transcriptionFixturePath,
    [
      "Clawcut keeps transcripts editable and ready for deterministic captions.",
      "Um, you know, Clawcut keeps smart workflows reviewable instead of hidden.",
      "Like, OpenClaw can inspect preview, export, and caption state safely."
    ].join("\n"),
    "utf8"
  );
  mkdirSync(screenshotDirectory, { recursive: true });

  const electronApp = await electron.launch({
    executablePath: electronBinary,
    args: packagedExecutable ? [] : [mainEntry],
    cwd: workspaceRoot,
    env: {
      ...process.env,
      CLAWCUT_WORKSPACE_ROOT: workspaceRoot,
      CLAWCUT_SMOKE: "1",
      CLAWCUT_TRANSCRIPTION_ADAPTER: "fixture",
      CLAWCUT_TRANSCRIPTION_FIXTURE_PATH: transcriptionFixturePath
    }
  });

  try {
    const page = await electronApp.firstWindow();

    await page.getByTestId("project-directory-input").fill(projectDirectory);
    await page.getByTestId("project-name-input").fill("Stage 8 Smoke");
    await page.getByTestId("create-project-button").click();
    await page.waitForFunction(
      () => document.querySelector('[data-testid="workspace-header"]')?.textContent?.includes("Stage 8 Smoke") === true,
      undefined,
      {
        timeout: 10_000
      }
    );

    const projectHeading = await page.getByTestId("workspace-header").textContent();

    if (!projectHeading?.includes("Stage 8 Smoke")) {
      throw new Error(`Smoke project was not opened. Header text: ${projectHeading ?? "missing"}`);
    }

    const localApi = await waitForLocalApiReady(page);
    const openClawClient = new ClawcutOpenClawClient({
      baseUrl: localApi.baseUrl,
      token: localApi.token,
      enabledMutatingTools: [
        "clawcut.generate_captions",
        "clawcut.reject_suggestion",
        "clawcut.seek_preview_to_suggestion"
      ],
      enabledHighImpactTools: [
        "clawcut.approve_workflow_step",
        "clawcut.resume_workflow_run",
        "clawcut.start_batch_workflow",
        "clawcut.start_workflow",
        "clawcut.transcribe_clip",
        "clawcut.apply_suggestion",
        "clawcut.export_subtitles",
        "clawcut.start_export"
      ]
    });
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
      data: {
        apiVersion: string;
        protocolVersion: string;
        features: { openClawTools: boolean; openClawPlugin: boolean };
      };
    }>(localApi, "/api/v1/capabilities", {
      token: localApi.token
    });
    const openClawTools = await requestLocalApi<{
      ok: boolean;
      data: Array<{ name: string }>;
    }>(localApi, "/api/v1/openclaw/tools", {
      token: localApi.token
    });
    const openClawManifest = await requestLocalApi<{
      ok: boolean;
      data: {
        manifestVersion: string;
        protocolVersion: string;
        endpoints: { events: string; openClawManifest: string };
        capabilityAvailability: { eventStream: boolean; openClawPlugin: boolean };
      };
    }>(localApi, "/api/v1/openclaw/manifest", {
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
      capabilities.body.data.protocolVersion !== "1" ||
      !capabilities.body.data.features.openClawTools ||
      !capabilities.body.data.features.openClawPlugin
    ) {
      throw new Error("Local API capabilities did not describe the Stage 8 control surface.");
    }

    if (
      openClawTools.status !== 200 ||
      !openClawTools.body.ok ||
      !openClawTools.body.data.some((tool) => tool.name === "clawcut.open_project") ||
      !openClawTools.body.data.some((tool) => tool.name === "clawcut.capture_preview_frame")
    ) {
      throw new Error("OpenClaw tool discovery was not exposed through the local API.");
    }

    if (
      openClawManifest.status !== 200 ||
      !openClawManifest.body.ok ||
      openClawManifest.body.data.manifestVersion !== "1" ||
      openClawManifest.body.data.protocolVersion !== "1" ||
      !openClawManifest.body.data.capabilityAvailability.eventStream ||
      !openClawManifest.body.data.capabilityAvailability.openClawPlugin
    ) {
      throw new Error("OpenClaw manifest discovery was not exposed through the local API.");
    }

    const pluginManifest = await openClawClient.getManifest();

    if (
      !pluginManifest.ok ||
      !pluginManifest.data.tools.some((tool) => tool.name === "clawcut.start_export")
    ) {
      throw new Error("The OpenClaw plugin client could not resolve the tool manifest.");
    }

    const projectSummaryViaApi = await requestLocalApi<{
      ok: boolean;
      data: { directory: string; projectName: string };
    }>(localApi, "/api/v1/query", {
      method: "POST",
      token: localApi.token,
      body: {
        name: "project.summary",
        input: {
          directory: projectDirectory
        }
      }
    });

    if (
      !projectSummaryViaApi.body.ok ||
      projectSummaryViaApi.body.data.directory !== projectDirectory
    ) {
      throw new Error("Project summary lookup through the local API failed.");
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

    const eventStreamResponse = await fetch(
      `${localApi.baseUrl}${openClawManifest.body.data.endpoints.events}?directory=${encodeURIComponent(projectDirectory)}`,
      {
        headers: {
          Authorization: `Bearer ${localApi.token}`
        }
      }
    );

    if (eventStreamResponse.status !== 200) {
      throw new Error("The local event stream was not available.");
    }

    const eventChunk = await readEventStreamChunk(eventStreamResponse, [
      "event: ready",
      "event: jobs.snapshot"
    ]);

    if (!eventChunk.includes("event: ready") || !eventChunk.includes("event: jobs.snapshot")) {
      throw new Error("The local event stream did not emit the expected ready and jobs events.");
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

    const previewFrameReference = await requestLocalApi<{
      ok: boolean;
      data: {
        status: string;
        timelineId: string | null;
        clipId: string | null;
        hasImageData: boolean;
        error: { code?: string; message?: string } | null;
      };
    }>(localApi, "/api/v1/query", {
      method: "POST",
      token: localApi.token,
      body: {
        name: "preview.frame-reference",
        input: {
          options: {
            maxWidth: 320
          }
        }
      }
    });

    if (
      !previewFrameReference.body.ok ||
      !previewFrameReference.body.data.timelineId ||
      previewFrameReference.body.data.status === "error"
    ) {
      throw new Error("Preview frame inspection was not exposed through the local API.");
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
    const timelineSessionViaTool = await openClawClient.invokeTool<{
      timeline: {
        id: string;
        trackOrder: string[];
        tracksById: Record<string, { kind: string; clipIds: string[] }>;
      };
    }>("clawcut.get_timeline", {
      directory: projectDirectory
    });

    if (!timelineSessionViaTool.response.ok) {
      throw new Error("Timeline query failed through the OpenClaw plugin boundary.");
    }

    const timelineSessionViaApi = {
      body: {
        ok: timelineSessionViaTool.response.ok,
        data: timelineSessionViaTool.response.ok ? timelineSessionViaTool.response.data : null
      }
    };
    const timelineDetailsBeforeTranscription = await requestLocalApi<{
      ok: boolean;
      data: {
        timeline: {
          clipsById: Record<string, { sourceInUs: number; sourceOutUs: number }>;
        };
      };
    }>(localApi, "/api/v1/query", {
      method: "POST",
      token: localApi.token,
      body: {
        name: "timeline.get",
        input: {
          directory: projectDirectory
        }
      }
    });

    if (!timelineDetailsBeforeTranscription.body.ok) {
      throw new Error("The Stage 8 API smoke could not inspect timeline clip durations.");
    }

    const videoTrackId = timelineSessionViaApi.body.data.timeline.trackOrder.find((trackId) => {
      return timelineSessionViaApi.body.data.timeline.tracksById[trackId]?.kind === "video";
    });
    const videoClipId = videoTrackId
      ? [...timelineSessionViaApi.body.data.timeline.tracksById[videoTrackId].clipIds].sort(
          (left, right) => {
            const leftClip = timelineDetailsBeforeTranscription.body.data.timeline.clipsById[left];
            const rightClip = timelineDetailsBeforeTranscription.body.data.timeline.clipsById[right];
            const leftDuration = leftClip ? leftClip.sourceOutUs - leftClip.sourceInUs : 0;
            const rightDuration = rightClip ? rightClip.sourceOutUs - rightClip.sourceInUs : 0;
            return rightDuration - leftDuration;
          }
        )[0]
      : null;

    if (!videoTrackId || !videoClipId) {
      throw new Error("The Stage 8 API smoke could not resolve a video clip for transcription.");
    }

    const transcribeViaTool = await openClawClient.invokeTool<{
      snapshot: unknown;
      result: {
        ok: boolean;
        commandType: string;
        run: { id: string; jobId: string };
      };
    }>("clawcut.transcribe_clip", {
      directory: projectDirectory,
      timelineId: timelineSessionViaApi.body.data.timeline.id,
      clipId: videoClipId,
      options: {
        initialPrompt: "Prefer the ClawCut, OpenClaw, and KPStudio names.",
        glossaryTerms: ["ClawCut", "OpenClaw", "KPStudio"]
      }
    });

    if (
      !transcribeViaTool.response.ok ||
      !transcribeViaTool.response.data.result.ok ||
      transcribeViaTool.response.data.result.commandType !== "TranscribeClip"
    ) {
      throw new Error("Transcribing through the OpenClaw plugin boundary failed.");
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
          jobId: transcribeViaTool.response.data.result.run.jobId
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
      transcribeViaTool.response.data.result.run.jobId
    );

    if (completedTranscription.status !== "completed" || !completedTranscription.transcriptId) {
      throw new Error(
        `Transcription did not complete successfully: ${completedTranscription.error?.message ?? completedTranscription.status}`
      );
    }

    await page.getByTestId("transcript-segment-list").waitFor({ state: "visible" });
    await page.getByTestId("transcript-summary").waitFor({ state: "visible" });
    const generatedCaptionTrack = await openClawClient.invokeTool<{
      snapshot: unknown;
      result: {
        ok: boolean;
        commandType: string;
        captionTrack: { id: string };
      };
    }>("clawcut.generate_captions", {
      directory: projectDirectory,
      timelineId: timelineSessionViaApi.body.data.timeline.id,
      transcriptId: completedTranscription.transcriptId,
      templateId: "bottom-center-clean"
    });

    if (
      !generatedCaptionTrack.response.ok ||
      !generatedCaptionTrack.response.data.result.ok ||
      generatedCaptionTrack.response.data.result.commandType !== "GenerateCaptionTrack"
    ) {
      throw new Error("Generating a caption track through the OpenClaw plugin boundary failed.");
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

    const timelineBeforeSmart = await requestLocalApi<{
      ok: boolean;
      data: {
        timeline: {
          trackOrder: string[];
          tracksById: Record<string, { clipIds: string[] }>;
          clipsById: Record<string, { timelineStartUs: number; sourceInUs: number; sourceOutUs: number }>;
        };
      };
    }>(localApi, "/api/v1/query", {
      method: "POST",
      token: localApi.token,
      body: {
        name: "timeline.get",
        input: {
          directory: projectDirectory
        }
      }
    });

    if (!timelineBeforeSmart.body.ok) {
      throw new Error("Could not query the timeline before smart analysis.");
    }

    const timelineEndBeforeSmart = Object.values(timelineBeforeSmart.body.data.timeline.clipsById).reduce(
      (max, clip) =>
        Math.max(max, clip.timelineStartUs + (clip.sourceOutUs - clip.sourceInUs)),
      0
    );

    const silenceAnalysis = await openClawClient.invokeTool<{
      snapshot: unknown;
      result: {
        ok: boolean;
        commandType: string;
        suggestionSet: {
          id: string;
          items: Array<{
            id: string;
            target: { startUs: number; endUs: number };
          }>;
        };
      };
    }>("clawcut.analyze_silence", {
      directory: projectDirectory,
      timelineId: timelineSessionViaApi.body.data.timeline.id,
      clipId: videoClipId,
      options: {
        amplitudeThreshold: 0.05,
        peakThreshold: 0.09,
        minimumDurationUs: 180_000
      }
    });

    if (
      !silenceAnalysis.response.ok ||
      !silenceAnalysis.response.data.result.ok ||
      silenceAnalysis.response.data.result.commandType !== "AnalyzeSilence"
    ) {
      throw new Error("Silence analysis did not complete successfully.");
    }

    const fillerAnalysis = await openClawClient.invokeTool<{
      snapshot: unknown;
      result: {
        ok: boolean;
        commandType: string;
        suggestionSet: {
          id: string;
          items: Array<{
            id: string;
            target: { startUs: number; endUs: number };
          }>;
        };
      };
    }>("clawcut.find_filler_words", {
      directory: projectDirectory,
      transcriptId: completedTranscription.transcriptId,
      options: {
        vocabulary: ["Clawcut"],
        paddingUs: 30_000
      }
    });

    if (
      !fillerAnalysis.response.ok ||
      !fillerAnalysis.response.data.result.ok ||
      fillerAnalysis.response.data.result.commandType !== "FindFillerWords" ||
      !fillerAnalysis.response.data.result.suggestionSet.items.length
    ) {
      throw new Error("Filler-word analysis did not produce a reviewable suggestion set.");
    }

    const reviewSuggestionSet = silenceAnalysis.response.data.result.suggestionSet.items.length
      ? silenceAnalysis.response.data.result.suggestionSet
      : fillerAnalysis.response.data.result.suggestionSet;
    const reviewSuggestion = reviewSuggestionSet.items[0];

    const inspectedSuggestion = await openClawClient.invokeTool<{
      ok: boolean;
      commandType: string;
      suggestion: {
        id: string;
        target: { startUs: number; endUs: number };
      };
    }>("clawcut.preview_suggestion", {
      directory: projectDirectory,
      suggestionSetId: reviewSuggestionSet.id,
      suggestionId: reviewSuggestion.id
    });

    if (
      !inspectedSuggestion.response.ok ||
      !inspectedSuggestion.response.data.ok ||
      inspectedSuggestion.response.data.commandType !== "InspectSuggestion"
    ) {
      throw new Error("Suggestion inspection through the OpenClaw boundary failed.");
    }

    const suggestionMidpointUs =
      inspectedSuggestion.response.data.suggestion.target.startUs +
      Math.round(
        (inspectedSuggestion.response.data.suggestion.target.endUs -
          inspectedSuggestion.response.data.suggestion.target.startUs) / 2
      );

    const previewSuggestionSeek = await openClawClient.invokeTool<{
      suggestionSetId: string;
      suggestionId: string;
      positionUs: number;
      loadedTimeline: boolean;
      preview: { ok: boolean; commandType: string };
    }>("clawcut.seek_preview_to_suggestion", {
      directory: projectDirectory,
      suggestionSetId: reviewSuggestionSet.id,
      suggestionId: reviewSuggestion.id,
      anchor: "midpoint"
    });

    if (
      !previewSuggestionSeek.response.ok ||
      previewSuggestionSeek.response.data.suggestionId !== reviewSuggestion.id ||
      previewSuggestionSeek.response.data.positionUs !== suggestionMidpointUs ||
      previewSuggestionSeek.response.data.preview.commandType !== "SeekPreview"
    ) {
      throw new Error("Could not seek the preview to the smart suggestion range.");
    }

    const silencePlan = await openClawClient.invokeTool<{
      snapshot: unknown;
      result: {
        ok: boolean;
        commandType: string;
        plan: { id: string; steps: Array<{ id: string }> };
      };
    }>("clawcut.compile_edit_plan", {
      directory: projectDirectory,
      timelineId: timelineSessionViaApi.body.data.timeline.id,
      suggestionSetId: reviewSuggestionSet.id,
      suggestionIds: [reviewSuggestion.id]
    });

    if (
      !silencePlan.response.ok ||
      !silencePlan.response.data.result.ok ||
      silencePlan.response.data.result.commandType !== "CompileEditPlan" ||
      !silencePlan.response.data.result.plan.steps.length
    ) {
      throw new Error("Smart edit plan compilation did not produce an inspectable dry run.");
    }

    const appliedSuggestion = await openClawClient.invokeTool<{
      snapshot: unknown;
      result: {
        ok: boolean;
        commandType: string;
        appliedSuggestionIds: string[];
      };
    }>("clawcut.apply_suggestion", {
      directory: projectDirectory,
      timelineId: timelineSessionViaApi.body.data.timeline.id,
      suggestionSetId: reviewSuggestionSet.id,
      suggestionId: reviewSuggestion.id
    });

    if (
      !appliedSuggestion.response.ok ||
      !appliedSuggestion.response.data.result.ok ||
      appliedSuggestion.response.data.result.commandType !== "ApplySuggestion"
    ) {
      throw new Error("Applying a reviewed smart suggestion failed.");
    }

    const highlightAnalysis = await openClawClient.invokeTool<{
      snapshot: unknown;
      result: {
        ok: boolean;
        commandType: string;
        suggestionSet: {
          id: string;
          items: Array<{ id: string }>;
        };
      };
    }>("clawcut.generate_highlight_suggestions", {
      directory: projectDirectory,
      transcriptId: completedTranscription.transcriptId
    });

    if (
      !highlightAnalysis.response.ok ||
      !highlightAnalysis.response.data.result.ok ||
      highlightAnalysis.response.data.result.commandType !== "GenerateHighlightSuggestions" ||
      !highlightAnalysis.response.data.result.suggestionSet.items.length
    ) {
      throw new Error("Highlight analysis did not produce a suggestion set.");
    }

    const rejectedSuggestion = await openClawClient.invokeTool<{
      snapshot: unknown;
      result: {
        ok: boolean;
        commandType: string;
        suggestionId: string;
      };
    }>("clawcut.reject_suggestion", {
      directory: projectDirectory,
      suggestionSetId: highlightAnalysis.response.data.result.suggestionSet.id,
      suggestionId: highlightAnalysis.response.data.result.suggestionSet.items[0].id
    });

    if (
      !rejectedSuggestion.response.ok ||
      !rejectedSuggestion.response.data.result.ok ||
      rejectedSuggestion.response.data.result.commandType !== "RejectSuggestion"
    ) {
      throw new Error("Rejecting a smart suggestion did not update review state.");
    }

    const smartSessionViaApi = await requestLocalApi<{
      ok: boolean;
      data: {
        suggestionSets: Array<{
          id: string;
          items: Array<{ id: string; status: string }>;
        }>;
      };
    }>(localApi, "/api/v1/query", {
      method: "POST",
      token: localApi.token,
      body: {
        name: "smart.session",
        input: {
          directory: projectDirectory
        }
      }
    });

    if (!smartSessionViaApi.body.ok) {
      throw new Error("The smart session was not queryable through the local API.");
    }

    const rejectedSet = smartSessionViaApi.body.data.suggestionSets.find(
      (set) => set.id === highlightAnalysis.response.data.result.suggestionSet.id
    );

    if (
      !rejectedSet?.items.some(
        (item) =>
          item.id === highlightAnalysis.response.data.result.suggestionSet.items[0].id &&
          item.status === "rejected"
      )
    ) {
      throw new Error("Rejected smart suggestions were not persisted in the smart session.");
    }

    const timelineAfterSmartApply = await requestLocalApi<{
      ok: boolean;
      data: {
        timeline: {
          clipsById: Record<string, { timelineStartUs: number; sourceInUs: number; sourceOutUs: number }>;
        };
      };
    }>(localApi, "/api/v1/query", {
      method: "POST",
      token: localApi.token,
      body: {
        name: "timeline.get",
        input: {
          directory: projectDirectory
        }
      }
    });

    if (!timelineAfterSmartApply.body.ok) {
      throw new Error("Could not query the timeline after applying a smart suggestion.");
    }

    const timelineEndAfterSmartApply = Object.values(
      timelineAfterSmartApply.body.data.timeline.clipsById
    ).reduce(
      (max, clip) => Math.max(max, clip.timelineStartUs + (clip.sourceOutUs - clip.sourceInUs)),
      0
    );

    if (timelineEndAfterSmartApply >= timelineEndBeforeSmart) {
      throw new Error("Applying a smart suggestion did not shorten the timeline as expected.");
    }

    const undoSmartApply = await requestLocalApi<{ ok: boolean }>(localApi, "/api/v1/command", {
      method: "POST",
      token: localApi.token,
      body: {
        name: "timeline.undo",
        input: {
          directory: projectDirectory,
          timelineId: timelineSessionViaApi.body.data.timeline.id
        }
      }
    });

    if (!undoSmartApply.body.ok) {
      throw new Error("Undo after smart suggestion application failed.");
    }

    const timelineAfterUndo = await requestLocalApi<{
      ok: boolean;
      data: {
        timeline: {
          clipsById: Record<string, { timelineStartUs: number; sourceInUs: number; sourceOutUs: number }>;
        };
      };
    }>(localApi, "/api/v1/query", {
      method: "POST",
      token: localApi.token,
      body: {
        name: "timeline.get",
        input: {
          directory: projectDirectory
        }
      }
    });

    if (!timelineAfterUndo.body.ok) {
      throw new Error("Could not query the timeline after undoing a smart edit.");
    }

    const timelineEndAfterUndo = Object.values(timelineAfterUndo.body.data.timeline.clipsById).reduce(
      (max, clip) => Math.max(max, clip.timelineStartUs + (clip.sourceOutUs - clip.sourceInUs)),
      0
    );

    if (timelineEndAfterUndo !== timelineEndBeforeSmart) {
      throw new Error("Undo did not restore the timeline after applying a smart suggestion.");
    }

    const previewLoadViaApi = await requestLocalApi<{ ok: boolean }>(localApi, "/api/v1/command", {
      method: "POST",
      token: localApi.token,
      body: {
        name: "preview.loadTimeline",
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
        name: "preview.seek",
        input: {
          positionUs: 350_000
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

    const subtitleExport = await openClawClient.invokeTool<{
      snapshot: unknown;
      result: {
        ok: boolean;
        commandType: string;
        artifact: { outputPath: string };
      };
    }>("clawcut.export_subtitles", {
      directory: projectDirectory,
      captionTrackId,
      format: "srt"
    });

    if (
      !subtitleExport.response.ok ||
      !subtitleExport.response.data.result.ok ||
      subtitleExport.response.data.result.commandType !== "ExportSubtitleFile"
    ) {
      throw new Error("Could not export the subtitle sidecar through the OpenClaw plugin boundary.");
    }

    const burnInEnable = await requestLocalApi<{
      ok: boolean;
      data: { result: { ok: boolean; commandType: string } };
    }>(localApi, "/api/v1/command", {
      method: "POST",
      token: localApi.token,
      body: {
        name: "captions.setBurnIn",
        input: {
          directory: projectDirectory,
          timelineId: timelineSessionViaApi.body.data.timeline.id,
          captionTrackId,
          enabled: true
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

    if (!existsSync(subtitleExport.response.data.result.artifact.outputPath)) {
      throw new Error("Subtitle export did not create an output file.");
    }

    if (
      !readFileSync(subtitleExport.response.data.result.artifact.outputPath, "utf8").includes("-->")
    ) {
      throw new Error("Subtitle export did not produce a valid SRT payload.");
    }

    const videoRangeStartUs = 250_000;
    const videoRangeEndUs = 1_750_000;
    const videoExportStart = await openClawClient.invokeTool<{
      snapshot: unknown;
      result: {
        ok: boolean;
        commandType: string;
        exportRun: { id: string; jobId: string };
      };
    }>("clawcut.start_export", {
      directory: projectDirectory,
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
    });

    if (
      !videoExportStart.response.ok ||
      !videoExportStart.response.data.result.ok ||
      videoExportStart.response.data.result.commandType !== "StartExport"
    ) {
      throw new Error("Could not start the video export through the OpenClaw plugin boundary.");
    }

    const exportJobDetails = await openClawClient.invokeTool<{
      job: { kind: string; status: string } | null;
      exportRun: { id: string } | null;
    }>("clawcut.query_job", {
      directory: projectDirectory,
      jobId: videoExportStart.response.data.result.exportRun.jobId
    });

    if (
      !exportJobDetails.response.ok ||
      exportJobDetails.response.data.job?.kind !== "export" ||
      !exportJobDetails.response.data.exportRun
    ) {
      throw new Error("The OpenClaw plugin boundary did not expose export job details.");
    }

    const audioExportStart = await openClawClient.invokeTool<{
      snapshot: unknown;
      result: {
        ok: boolean;
        commandType: string;
        exportRun: { id: string; jobId: string };
      };
    }>("clawcut.start_export", {
      directory: projectDirectory,
      request: {
        timelineId: timelineSessionViaApi.body.data.timeline.id,
        presetId: "audio-podcast-aac"
      }
    });

    if (
      !audioExportStart.response.ok ||
      !audioExportStart.response.data.result.ok ||
      audioExportStart.response.data.result.commandType !== "StartExport"
    ) {
      throw new Error("Could not start the audio export through the OpenClaw plugin boundary.");
    }

    const completedVideo = await waitForExportToFinishViaApi(
      localApi,
      projectDirectory,
      videoExportStart.response.data.result.exportRun.jobId
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
        name: "export.captureSnapshot",
        input: {
          directory: projectDirectory,
          request: {
            sourceKind: "export-run",
            exportRunId: completedVideo.id
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
      audioExportStart.response.data.result.exportRun.jobId
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
        name: "export.captureSnapshot",
        input: {
          directory: projectDirectory,
          request: {
            sourceKind: "timeline",
            timelineId: stageThreeResult.timeline.id,
            positionUs: 600_000,
            presetId: "video-share-720p"
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

    await page.getByTestId("project-directory-input").fill(workflowProjectDirectory);
    await page.getByTestId("project-name-input").fill("Stage 9 Workflow Smoke");
    await page.getByTestId("create-project-button").click();
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="workspace-header"]')
          ?.textContent?.includes("Stage 9 Workflow Smoke") === true,
      undefined,
      {
        timeout: 10_000
      }
    );

    const workflowImport = await requestLocalApi<{
      ok: boolean;
      data: { acceptedPaths: string[] };
    }>(localApi, "/api/v1/command", {
      method: "POST",
      token: localApi.token,
      body: {
        name: "media.import",
        input: {
          directory: workflowProjectDirectory,
          paths: [originalPath]
        }
      }
    });

    if (!workflowImport.body.ok || !workflowImport.body.data.acceptedPaths.includes(originalPath)) {
      throw new Error("Stage 9 workflow smoke could not import media into the workflow project.");
    }

    await waitForLibraryToSettleViaApi(localApi, workflowProjectDirectory);

    const workflowProjectSnapshot = await requestLocalApi<{
      ok: boolean;
      data: {
        libraryItems: Array<{
          metadataSummary: {
            durationMs: number | null;
          };
          derivedAssets: {
            waveform: {
              relativePath: string;
            } | null;
          };
        }>;
      };
    }>(localApi, "/api/v1/query", {
      method: "POST",
      token: localApi.token,
      body: {
        name: "project.snapshot",
        input: {
          directory: workflowProjectDirectory
        }
      }
    });

    const workflowWaveformRelativePath =
      workflowProjectSnapshot.body.ok
        ? workflowProjectSnapshot.body.data.libraryItems[0]?.derivedAssets.waveform?.relativePath
        : null;

    if (!workflowWaveformRelativePath) {
      throw new Error("Workflow smoke project did not expose a waveform asset.");
    }

    writeFileSync(
      resolve(workflowProjectDirectory, ".clawcut/cache", workflowWaveformRelativePath),
      JSON.stringify({
        version: 1,
        bucketCount: 8,
        durationMs: workflowProjectSnapshot.body.data.libraryItems[0]?.metadataSummary.durationMs ?? 4_000,
        peaks: [0.24, 0.22, 0.01, 0.01, 0.01, 0.21, 0.18, 0.16],
        rms: [0.12, 0.11, 0.01, 0.01, 0.01, 0.09, 0.08, 0.07]
      }),
      "utf8"
    );

    const workflowTimelineSeed = await page.evaluate(async (directory) => {
      const initial = await window.clawcut.getEditorSessionSnapshot({ directory });
      const mediaItemId = initial.libraryItems[0]?.id;

      if (!mediaItemId) {
        throw new Error("Workflow smoke project did not expose an imported media item.");
      }

      const timeline = await window.clawcut.executeEditorCommand({
        directory,
        command: {
          type: "CreateTimeline",
          timelineId: initial.timeline.id
        }
      });

      if (!timeline.result.ok || timeline.result.commandType !== "CreateTimeline") {
        throw new Error("Workflow smoke could not create a timeline.");
      }

      const [videoTrackId, audioTrackId] = timeline.result.createdTrackIds;

      if (!videoTrackId || !audioTrackId) {
        throw new Error("Workflow smoke timeline did not create V1/A1 tracks.");
      }

      const inserted = await window.clawcut.executeEditorCommand({
        directory,
        command: {
          type: "InsertLinkedMedia",
          timelineId: timeline.snapshot.timeline.id,
          mediaItemId,
          videoTrackId,
          audioTrackId,
          timelineStartUs: 0
        }
      });

      if (!inserted.result.ok) {
        throw new Error("Workflow smoke could not insert linked media.");
      }

      const videoClipId = inserted.snapshot.timeline.tracksById[videoTrackId]?.clipIds[0];
      const videoClip = videoClipId ? inserted.snapshot.timeline.clipsById[videoClipId] : null;

      if (!videoClipId || !videoClip) {
        throw new Error("Workflow smoke could not resolve the inserted video clip.");
      }

      const splitTimeUs =
        videoClip.timelineStartUs +
        Math.round((videoClip.sourceOutUs - videoClip.sourceInUs) / 2);
      const split = await window.clawcut.executeEditorCommand({
        directory,
        command: {
          type: "SplitClip",
          timelineId: inserted.snapshot.timeline.id,
          clipId: videoClipId,
          splitTimeUs
        }
      });

      if (!split.result.ok || split.result.commandType !== "SplitClip") {
        throw new Error("Workflow smoke could not split the clip for batching.");
      }

      const snapshot = await window.clawcut.getEditorSessionSnapshot({ directory });
      const clipIds = [...(snapshot.timeline.tracksById[videoTrackId]?.clipIds ?? [])];

      return {
        timelineId: snapshot.timeline.id,
        clipIds
      };
    }, workflowProjectDirectory);

    if (workflowTimelineSeed.clipIds.length < 2) {
      throw new Error("Workflow smoke project did not create two video clips.");
    }

    const workflowCatalog = await openClawClient.invokeTool<Array<{ id: string }>>(
      "clawcut.list_workflows",
      {
        directory: workflowProjectDirectory
      }
    );

    if (
      !workflowCatalog.response.ok ||
      !workflowCatalog.response.data.some((workflow) => workflow.id === "captioned-export-v1")
    ) {
      throw new Error("Workflow discovery did not expose the built-in Stage 9 templates.");
    }

    const brandKitCatalog = await openClawClient.invokeTool<Array<{ id: string }>>(
      "clawcut.list_brand_kits",
      {
        directory: workflowProjectDirectory
      }
    );

    if (
      !brandKitCatalog.response.ok ||
      !brandKitCatalog.response.data.some((brandKit) => brandKit.id === "clawcut-clean")
    ) {
      throw new Error("Brand kit discovery did not expose the built-in kits.");
    }

    const timelineForWorkflows = await requestLocalApi<{
      ok: boolean;
      data: {
        timeline: {
          clipsById: Record<string, { timelineStartUs: number; sourceInUs: number; sourceOutUs: number }>;
        };
      };
    }>(localApi, "/api/v1/query", {
      method: "POST",
      token: localApi.token,
      body: {
        name: "timeline.get",
        input: {
          directory: workflowProjectDirectory
        }
      }
    });

    if (!timelineForWorkflows.body.ok) {
      throw new Error("Could not query the workflow smoke timeline.");
    }

    const timelineEndBeforeWorkflowCleanup = Object.values(
      timelineForWorkflows.body.data.timeline.clipsById
    ).reduce(
      (max, clip) => Math.max(max, clip.timelineStartUs + (clip.sourceOutUs - clip.sourceInUs)),
      0
    );

    const captionedWorkflowStart = await openClawClient.invokeTool<{
      snapshot: unknown;
      result: {
        ok: boolean;
        commandType: string;
        workflowRun: { id: string };
      };
    }>("clawcut.start_workflow", {
      directory: workflowProjectDirectory,
      templateId: "captioned-export-v1",
      input: {
        clipId: workflowTimelineSeed.clipIds[0],
        brandKitId: "clawcut-clean",
        exportPresetId: "video-share-720p",
        exportSubtitles: true,
        enableBurnIn: false,
        requireApprovalForExport: false
      }
    });

    if (
      !captionedWorkflowStart.response.ok ||
      !captionedWorkflowStart.response.data.result.ok ||
      captionedWorkflowStart.response.data.result.commandType !== "StartWorkflow"
    ) {
      throw new Error("Captioned export workflow did not start through the OpenClaw tool boundary.");
    }

    const captionedWorkflowCompleted = await waitForWorkflowRunStateViaApi(
      localApi,
      workflowProjectDirectory,
      captionedWorkflowStart.response.data.result.workflowRun.id,
      ["completed", "failed"]
    );

    if (
      captionedWorkflowCompleted.status !== "completed" ||
      !captionedWorkflowCompleted.artifacts.some((artifact) => artifact.kind === "subtitle") ||
      !captionedWorkflowCompleted.artifacts.some((artifact) => artifact.kind === "export")
    ) {
      throw new Error("Captioned export workflow did not produce the expected artifacts.");
    }

    const captionedWorkflowArtifacts = await openClawClient.invokeTool<
      Array<{ id: string; kind: string; path: string | null }>
    >("clawcut.list_workflow_artifacts", {
      directory: workflowProjectDirectory,
      workflowRunId: captionedWorkflowStart.response.data.result.workflowRun.id
    });

    if (
      !captionedWorkflowArtifacts.response.ok ||
      !captionedWorkflowArtifacts.response.data.some((artifact) => artifact.kind === "subtitle")
    ) {
      throw new Error("Workflow artifacts were not inspectable through the OpenClaw boundary.");
    }

    const resumableWorkflowStart = await openClawClient.invokeTool<{
      snapshot: unknown;
      result: {
        ok: boolean;
        commandType: string;
        workflowRun: { id: string };
      };
    }>("clawcut.start_workflow", {
      directory: workflowProjectDirectory,
      templateId: "smart-cleanup-v1",
      input: {
        clipId: workflowTimelineSeed.clipIds[0],
        primarySuggestionSource: "filler",
        requireApproval: true
      }
    });

    if (
      !resumableWorkflowStart.response.ok ||
      !resumableWorkflowStart.response.data.result.ok ||
      resumableWorkflowStart.response.data.result.commandType !== "StartWorkflow"
    ) {
      throw new Error("Smart cleanup workflow did not start through the OpenClaw boundary.");
    }

    await waitForWorkflowRunStateViaApi(
      localApi,
      workflowProjectDirectory,
      resumableWorkflowStart.response.data.result.workflowRun.id,
      ["waiting-approval"]
    );

    const resumedBeforeApproval = await requestLocalApi<{
      ok: boolean;
      data: { result: { ok: boolean; commandType: string } };
    }>(localApi, "/api/v1/command", {
      method: "POST",
      token: localApi.token,
      body: {
        name: "workflow.resumeRun",
        input: {
          directory: workflowProjectDirectory,
          workflowRunId: resumableWorkflowStart.response.data.result.workflowRun.id
        }
      }
    });

    if (
      !resumedBeforeApproval.body.ok ||
      !resumedBeforeApproval.body.data.result.ok ||
      resumedBeforeApproval.body.data.result.commandType !== "ResumeWorkflowRun"
    ) {
      throw new Error("Workflow resume did not respond cleanly through the integration boundary.");
    }

    await waitForWorkflowRunStateViaApi(
      localApi,
      workflowProjectDirectory,
      resumableWorkflowStart.response.data.result.workflowRun.id,
      ["waiting-approval"]
    );

    const smartCleanupWorkflowStart = await openClawClient.invokeTool<{
      snapshot: unknown;
      result: {
        ok: boolean;
        commandType: string;
        workflowRun: { id: string };
      };
    }>("clawcut.start_workflow", {
      directory: workflowProjectDirectory,
      templateId: "smart-cleanup-v1",
      input: {
        clipId: workflowTimelineSeed.clipIds[0],
        primarySuggestionSource: "filler",
        requireApproval: true
      }
    });

    if (
      !smartCleanupWorkflowStart.response.ok ||
      !smartCleanupWorkflowStart.response.data.result.ok ||
      smartCleanupWorkflowStart.response.data.result.commandType !== "StartWorkflow"
    ) {
      throw new Error("Approved smart cleanup workflow did not start through the OpenClaw boundary.");
    }

    await waitForWorkflowRunStateViaApi(
      localApi,
      workflowProjectDirectory,
      smartCleanupWorkflowStart.response.data.result.workflowRun.id,
      ["waiting-approval"]
    );

    const pendingApprovals = await openClawClient.invokeTool<
      Array<{ id: string; workflowRunId: string }>
    >("clawcut.list_pending_approvals", {
      directory: workflowProjectDirectory
    });

    const approvalsForRun = pendingApprovals.response.ok
      ? pendingApprovals.response.data.filter(
          (approval) =>
            approval.workflowRunId === smartCleanupWorkflowStart.response.data.result.workflowRun.id
        )
      : [];

    if (approvalsForRun.length === 0) {
      throw new Error("Smart cleanup workflow did not expose a pending approval.");
    }

    for (const approval of approvalsForRun) {
      const approvedWorkflow = await openClawClient.invokeTool<{
        snapshot: unknown;
        result: { ok: boolean; commandType: string };
      }>("clawcut.approve_workflow_step", {
        directory: workflowProjectDirectory,
        workflowRunId: smartCleanupWorkflowStart.response.data.result.workflowRun.id,
        approvalId: approval.id
      });

      if (
        !approvedWorkflow.response.ok ||
        !approvedWorkflow.response.data.result.ok ||
        approvedWorkflow.response.data.result.commandType !== "ApproveWorkflowStep"
      ) {
        throw new Error("Workflow approval did not resume the smart cleanup run.");
      }
    }

    const completedSmartWorkflow = await waitForWorkflowRunStateViaApi(
      localApi,
      workflowProjectDirectory,
      smartCleanupWorkflowStart.response.data.result.workflowRun.id,
      ["completed", "failed"]
    );

    if (completedSmartWorkflow.status !== "completed") {
      throw new Error(
        `Smart cleanup workflow did not complete after approval: ${completedSmartWorkflow.error?.message ?? completedSmartWorkflow.status} | steps=${completedSmartWorkflow.steps
          .map((step) => `${step.kind}:${step.status}${step.error ? `(${step.error.message})` : ""}`)
          .join(", ")}`
      );
    }

    const timelineAfterWorkflowCleanup = await requestLocalApi<{
      ok: boolean;
      data: {
        timeline: {
          clipsById: Record<string, { timelineStartUs: number; sourceInUs: number; sourceOutUs: number }>;
        };
      };
    }>(localApi, "/api/v1/query", {
      method: "POST",
      token: localApi.token,
      body: {
        name: "timeline.get",
        input: {
          directory: workflowProjectDirectory
        }
      }
    });

    const timelineEndAfterWorkflowCleanup = Object.values(
      timelineAfterWorkflowCleanup.body.data.timeline.clipsById
    ).reduce(
      (max, clip) => Math.max(max, clip.timelineStartUs + (clip.sourceOutUs - clip.sourceInUs)),
      0
    );

    if (timelineEndAfterWorkflowCleanup >= timelineEndBeforeWorkflowCleanup) {
      throw new Error("Approved smart cleanup workflow did not shorten the timeline.");
    }

    const undoWorkflowCleanup = await requestLocalApi<{ ok: boolean }>(localApi, "/api/v1/command", {
      method: "POST",
      token: localApi.token,
      body: {
        name: "timeline.undo",
        input: {
          directory: workflowProjectDirectory,
          timelineId: workflowTimelineSeed.timelineId
        }
      }
    });

    if (!undoWorkflowCleanup.body.ok) {
      throw new Error("Undo after workflow-applied smart cleanup failed.");
    }

    const batchWorkflowStart = await openClawClient.invokeTool<{
      snapshot: unknown;
      result: {
        ok: boolean;
        commandType: string;
        workflowRun: { id: string };
      };
    }>("clawcut.start_batch_workflow", {
      directory: workflowProjectDirectory,
      templateId: "batch-caption-export-v1",
      input: {
        clipIds: workflowTimelineSeed.clipIds.slice(0, 2),
        brandKitId: "clawcut-clean",
        exportSubtitles: true,
        exportVideo: false
      }
    });

    if (
      !batchWorkflowStart.response.ok ||
      !batchWorkflowStart.response.data.result.ok ||
      batchWorkflowStart.response.data.result.commandType !== "StartBatchWorkflow"
    ) {
      throw new Error("Batch caption workflow did not start through the OpenClaw boundary.");
    }

    const completedBatchWorkflow = await waitForWorkflowRunStateViaApi(
      localApi,
      workflowProjectDirectory,
      batchWorkflowStart.response.data.result.workflowRun.id,
      ["completed", "failed"]
    );

    if (
      completedBatchWorkflow.status !== "completed" ||
      completedBatchWorkflow.batchItems.length < 2 ||
      !completedBatchWorkflow.batchItems.every((item) => item.status === "completed")
    ) {
      throw new Error("Batch workflow did not complete successfully for multiple clips.");
    }

    await page.screenshot({
      path: resolve(screenshotDirectory, "clawcut-stage9-smoke.png"),
      fullPage: true
    });
  } finally {
    await electronApp.close();
    rmSync(projectDirectory, { recursive: true, force: true });
    rmSync(workflowProjectDirectory, { recursive: true, force: true });
    rmSync(importDirectory, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void runSmoke().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
