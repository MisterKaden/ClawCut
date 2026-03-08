import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  applyCaptionStyleOverridesToTrack,
  createEmptyRecoveryInfo,
  createWorkflowSessionSnapshot,
  getBuiltInWorkflowTemplates,
  offsetCaptionTrackTiming,
  resolveWorkflowTemplate,
  summarizeWorkflowRun,
  type BrandKit,
  type CaptionCommandFailure,
  type ExportCommandFailure,
  type ExportRequestInput,
  type JobError,
  type SmartCommandFailure,
  type WorkflowApproval,
  type WorkflowArtifact,
  type WorkflowBatchItemRun,
  type WorkflowCommand,
  type WorkflowCommandFailure,
  type WorkflowRun,
  type WorkflowSessionSnapshot,
  type WorkflowStepDefinition,
  type WorkflowStepRun,
  type WorkflowTemplate,
  type WorkflowTemplateId
} from "@clawcut/domain";
import type {
  ExecuteWorkflowCommandInput,
  ExecuteWorkflowCommandResult,
  GetWorkflowSessionSnapshotInput
} from "@clawcut/ipc";

import {
  createUserBrandKit,
  getBrandKit,
  listBrandKits,
  updateUserBrandKit
} from "./brand-kit-store";
import { executeCaptionCommand, getCaptionSessionSnapshot } from "./caption-session";
import { executeEditorCommand } from "./editor-session";
import { executeExportCommand, getExportSessionSnapshot } from "./export-session";
import type { PersistedWorkflowJobPayload } from "./job-payloads";
import { resolveProjectPaths, resolveWorkflowArtifactDirectory } from "./paths";
import {
  createJobRecord,
  getStoredJobRecord,
  loadAndMaybeMigrateProject,
  updateCaptionTrack,
  updateDefaultBrandKitId,
  updateJobRecord
} from "./project-repository";
import { getSuggestionSet } from "./smart-repository";
import { executeSmartCommand } from "./smart-session";
import {
  createWorkflowRunRecord,
  getWorkflowRun,
  listPendingWorkflowApprovals,
  listWorkflowRuns,
  updateWorkflowRunRecord,
  upsertWorkflowApprovalRecord,
  upsertWorkflowArtifactRecord,
  upsertWorkflowBatchItemRecord,
  upsertWorkflowStepRunRecord
} from "./workflow-repository";
import { nowIso, WorkerError } from "./utils";

type WorkflowFailureCode = WorkflowCommandFailure["error"]["code"];

const activeWorkflowRuns = new Map<string, string>();

function createFailure(
  command: WorkflowCommand,
  code: WorkflowFailureCode,
  message: string,
  details?: string
): WorkflowCommandFailure {
  return {
    ok: false,
    commandType: command.type,
    error: {
      code,
      message,
      details
    }
  };
}

function toJobError(
  error: WorkerError | Error,
  fallbackCode: string
): JobError {
  if (error instanceof WorkerError) {
    return {
      code: error.code,
      message: error.message,
      details: error.details
    };
  }

  return {
    code: fallbackCode,
    message: error.message
  };
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function writeWorkflowArtifactFile(
  directory: string,
  workflowRunId: string,
  fileName: string,
  payload: unknown
): Promise<string> {
  const paths = resolveProjectPaths(directory);
  const artifactDirectory = resolveWorkflowArtifactDirectory(paths, workflowRunId);
  await mkdir(artifactDirectory.absolutePath, { recursive: true });
  const artifactPath = join(artifactDirectory.absolutePath, fileName);
  await writeFile(artifactPath, JSON.stringify(payload, null, 2), "utf8");
  return artifactPath;
}

function buildWorkflowSession(
  directory: string,
  projectName: string,
  brandKits: BrandKit[]
): WorkflowSessionSnapshot {
  const paths = resolveProjectPaths(directory);
  const workflowRuns = listWorkflowRuns(paths.databasePath);

  return createWorkflowSessionSnapshot({
    directory: paths.directory,
    projectName,
    workflows: getBuiltInWorkflowTemplates(),
    brandKits,
    workflowRuns,
    pendingApprovals: listPendingWorkflowApprovals(paths.databasePath),
    activeWorkflowJobId:
      workflowRuns.find((run) =>
        run.status === "queued" ||
        run.status === "planning" ||
        run.status === "running" ||
        run.status === "waiting-approval"
      )?.parentJobId ?? null,
    lastError: workflowRuns.find((run) => run.error)?.error ?? null
  });
}

export async function getWorkflowSessionSnapshot(
  input: GetWorkflowSessionSnapshotInput
): Promise<WorkflowSessionSnapshot> {
  const { paths, document } = await loadAndMaybeMigrateProject(input.directory);
  return buildWorkflowSession(paths.directory, document.project.name, await listBrandKits());
}

function instantiateStepRun(
  workflowRunId: string,
  step: WorkflowStepDefinition,
  batchItemRunId: string | null = null
): WorkflowStepRun {
  const timestamp = nowIso();

  return {
    id: randomUUID(),
    workflowRunId,
    batchItemRunId,
    definitionId: step.id,
    kind: step.kind,
    name: step.name,
    status: "pending",
    safetyClass: step.safetyClass,
    mutability: step.mutability,
    execution: step.execution,
    requiresApproval: step.requiresApproval,
    childJobId: null,
    warnings: [],
    outputSummary: {},
    error: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    startedAt: null,
    completedAt: null
  };
}

function instantiateBatchItem(workflowRunId: string, targetClipId: string): WorkflowBatchItemRun {
  const timestamp = nowIso();

  return {
    id: randomUUID(),
    workflowRunId,
    targetClipId,
    label: targetClipId,
    status: "pending",
    warnings: [],
    outputSummary: {},
    error: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    startedAt: null,
    completedAt: null
  };
}

function createWorkflowRunTemplate(input: {
  directory: string;
  template: WorkflowTemplate;
  parentJobId: string;
  input: Record<string, unknown>;
}): WorkflowRun {
  const timestamp = nowIso();
  const runId = randomUUID();
  const resolvedBatchItems =
    input.template.batchMode === "clip-batch"
      ? ((input.input.clipIds as string[] | undefined) ?? []).map((clipId) =>
          instantiateBatchItem(runId, clipId)
        )
      : [];
  const stepRuns =
    input.template.batchMode === "clip-batch"
      ? resolvedBatchItems.flatMap((batchItem) =>
          input.template.steps.map((step) => instantiateStepRun(runId, step, batchItem.id))
        )
      : input.template.steps.map((step) => instantiateStepRun(runId, step));

  const run: WorkflowRun = {
    id: runId,
    templateId: input.template.id,
    templateVersion: input.template.version,
    projectDirectory: input.directory,
    status: "queued",
    parentJobId: input.parentJobId,
    input: input.input,
    safetyProfile: input.template.safetyProfile,
    warnings: [],
    error: null,
    recovery: createEmptyRecoveryInfo(),
    createdAt: timestamp,
    updatedAt: timestamp,
    startedAt: null,
    completedAt: null,
    steps: stepRuns,
    batchItems: resolvedBatchItems,
    approvals: [],
    artifacts: [],
    summary: {
      completedStepCount: 0,
      totalStepCount: stepRuns.length,
      completedBatchItemCount: 0,
      totalBatchItemCount: resolvedBatchItems.length,
      failedBatchItemCount: 0,
      waitingApprovalCount: 0
    }
  };

  return {
    ...run,
    summary: summarizeWorkflowRun(run)
  };
}

function evaluateRunIf(
  definition: WorkflowStepDefinition,
  input: Record<string, unknown>
): boolean {
  if (!definition.runIf) {
    return true;
  }

  const value = input[definition.runIf.inputKey];

  if (definition.runIf.truthy) {
    return Boolean(value);
  }

  if (definition.runIf.equals !== undefined) {
    return value === definition.runIf.equals;
  }

  return true;
}

function appendChildJobId(
  databasePath: string,
  parentJobId: string,
  childJobId: string | null
): void {
  if (!childJobId) {
    return;
  }

  const existing = getStoredJobRecord(databasePath, parentJobId);

  if (!existing || existing.kind !== "workflow") {
    return;
  }

  const payload = existing.payload as PersistedWorkflowJobPayload;
  const childJobIds = [...new Set([...payload.childJobIds, childJobId])];

  updateJobRecord(databasePath, parentJobId, {
    payload: {
      ...payload,
      childJobIds
    }
  });
}

async function waitForTranscriptionCompletion(
  directory: string,
  transcriptionRunId: string
): Promise<Awaited<ReturnType<typeof getCaptionSessionSnapshot>>> {
  for (;;) {
    const snapshot = await getCaptionSessionSnapshot({ directory });
    const run = snapshot.transcriptionRuns.find((entry) => entry.id === transcriptionRunId);

    if (!run) {
      throw new WorkerError(
        "WORKFLOW_FAILED",
        `Transcription run ${transcriptionRunId} could not be found.`
      );
    }

    if (run.status === "completed") {
      return snapshot;
    }

    if (run.status === "failed" || run.status === "cancelled") {
      throw new WorkerError(
        run.error?.code ?? "WORKFLOW_FAILED",
        run.error?.message ?? "The transcription failed during workflow execution."
      );
    }

    await delay(150);
  }
}

async function waitForExportCompletion(directory: string, exportRunId: string) {
  for (;;) {
    const snapshot = await getExportSessionSnapshot({ directory });
    const run = snapshot.exportRuns.find((entry) => entry.id === exportRunId);

    if (!run) {
      throw new WorkerError("WORKFLOW_FAILED", `Export run ${exportRunId} could not be found.`);
    }

    if (run.status === "completed") {
      return run;
    }

    if (run.status === "failed" || run.status === "cancelled") {
      throw new WorkerError(
        run.error?.code ?? "WORKFLOW_FAILED",
        run.error?.message ?? "The export failed during workflow execution."
      );
    }

    await delay(200);
  }
}

function getClipContext(run: WorkflowRun, clipId: string | null): {
  clipId: string | null;
  transcriptId: string | null;
  captionTrackId: string | null;
  silenceSuggestionSetId: string | null;
  fillerSuggestionSetId: string | null;
  highlightSuggestionSetId: string | null;
  planId: string | null;
} {
  const context = {
    clipId,
    transcriptId: null as string | null,
    captionTrackId: null as string | null,
    silenceSuggestionSetId: null as string | null,
    fillerSuggestionSetId: null as string | null,
    highlightSuggestionSetId: null as string | null,
    planId: null as string | null
  };

  for (const step of run.steps) {
    if (clipId && step.outputSummary.clipId && step.outputSummary.clipId !== clipId) {
      continue;
    }

    if (typeof step.outputSummary.transcriptId === "string") {
      context.transcriptId = step.outputSummary.transcriptId;
    }

    if (typeof step.outputSummary.captionTrackId === "string") {
      context.captionTrackId = step.outputSummary.captionTrackId;
    }

    if (typeof step.outputSummary.silenceSuggestionSetId === "string") {
      context.silenceSuggestionSetId = step.outputSummary.silenceSuggestionSetId;
    }

    if (typeof step.outputSummary.fillerSuggestionSetId === "string") {
      context.fillerSuggestionSetId = step.outputSummary.fillerSuggestionSetId;
    }

    if (typeof step.outputSummary.highlightSuggestionSetId === "string") {
      context.highlightSuggestionSetId = step.outputSummary.highlightSuggestionSetId;
    }

    if (typeof step.outputSummary.planId === "string") {
      context.planId = step.outputSummary.planId;
    }
  }

  return context;
}

async function createWorkflowArtifact(
  input: {
    databasePath: string;
    workflowRunId: string;
    stepRunId: string | null;
    batchItemRunId: string | null;
    kind: WorkflowArtifact["kind"];
    label: string;
    path?: string | null;
    metadata?: Record<string, unknown>;
  }
): Promise<WorkflowArtifact> {
  const artifact: WorkflowArtifact = {
    id: randomUUID(),
    workflowRunId: input.workflowRunId,
    stepRunId: input.stepRunId ?? null,
    batchItemRunId: input.batchItemRunId ?? null,
    kind: input.kind,
    label: input.label,
    path: input.path ?? null,
    metadata: input.metadata ?? {},
    createdAt: nowIso()
  };

  upsertWorkflowArtifactRecord(input.databasePath, artifact);
  return artifact;
}

function createApproval(
  input: {
    workflowRunId: string;
    stepRunId: string;
    batchItemRunId: string | null;
    reason: string;
    summary: string;
    proposedEffects: string[];
    artifactIds?: string[];
  }
): WorkflowApproval {
  const timestamp = nowIso();
  return {
    id: randomUUID(),
    workflowRunId: input.workflowRunId,
    stepRunId: input.stepRunId,
    batchItemRunId: input.batchItemRunId,
    status: "pending",
    reason: input.reason,
    summary: input.summary,
    proposedEffects: input.proposedEffects,
    artifactIds: input.artifactIds ?? [],
    createdAt: timestamp,
    updatedAt: timestamp,
    resolvedAt: null
  };
}

async function executeWorkflowStep(input: {
  directory: string;
  run: WorkflowRun;
  stepRun: WorkflowStepRun;
  clipId: string | null;
  document: Awaited<ReturnType<typeof loadAndMaybeMigrateProject>>["document"];
  template: WorkflowTemplate;
}): Promise<{ outputSummary: Record<string, unknown>; warnings?: string[] }> {
  const { directory, run, stepRun, clipId, document } = input;
  const clip = clipId ? document.timeline.clipsById[clipId] ?? null : null;
  const context = getClipContext(run, clipId);

  switch (stepRun.kind) {
    case "transcribeClip": {
      if (!clipId || !clip) {
        throw new WorkerError("CLIP_NOT_FOUND", "Workflow step requires a clip.");
      }

      const result = await executeCaptionCommand({
        directory,
        command: {
          type: "TranscribeClip",
          timelineId: document.timeline.id,
          clipId
        }
      });

      if (!result.result.ok) {
        const failure = result.result as CaptionCommandFailure;
        throw new WorkerError(failure.error.code, failure.error.message, failure.error.details);
      }

      if (result.result.commandType !== "TranscribeClip") {
        throw new WorkerError("WORKFLOW_FAILED", "Unexpected transcription workflow result.");
      }

      appendChildJobId(
        resolveProjectPaths(directory).databasePath,
        run.parentJobId,
        result.result.run.jobId
      );
      const snapshot = await waitForTranscriptionCompletion(directory, result.result.run.id);
      const transcriptId = result.result.run.transcriptId ?? null;
      const transcript = transcriptId
        ? snapshot.transcripts.find((entry) => entry.id === transcriptId) ?? null
        : snapshot.transcripts.find((entry) => entry.source.clipId === clipId) ?? null;

      if (!transcript) {
        throw new WorkerError("WORKFLOW_FAILED", "Workflow transcription did not produce a transcript.");
      }

      await createWorkflowArtifact({
        databasePath: resolveProjectPaths(directory).databasePath,
        workflowRunId: run.id,
        stepRunId: stepRun.id,
        batchItemRunId: stepRun.batchItemRunId,
        kind: "transcript",
        label: `Transcript for ${clipId}`,
        path: transcript.rawArtifactPath,
        metadata: {
          transcriptId: transcript.id,
          clipId
        }
      });

      return {
        outputSummary: {
          clipId,
          transcriptId: transcript.id,
          transcriptionRunId: result.result.run.id,
          childJobId: result.result.run.jobId
        }
      };
    }
    case "generateCaptionTrack": {
      if (!clipId || !clip) {
        throw new WorkerError("CLIP_NOT_FOUND", "Workflow step requires a clip.");
      }

      if (!context.transcriptId) {
        throw new WorkerError("WORKFLOW_FAILED", "No transcript is available for caption generation.");
      }

      const brandKitId =
        typeof run.input.brandKitId === "string"
          ? run.input.brandKitId
          : document.settings.branding.defaultBrandKitId;
      const brandKit = brandKitId ? await getBrandKit(brandKitId) : null;
      const templateId = brandKit?.captionTemplateId ?? document.settings.captions.defaultTemplate;
      const result = await executeCaptionCommand({
        directory,
        command: {
          type: "GenerateCaptionTrack",
          timelineId: document.timeline.id,
          transcriptId: context.transcriptId,
          templateId
        }
      });

      if (!result.result.ok) {
        const failure = result.result as CaptionCommandFailure;
        throw new WorkerError(failure.error.code, failure.error.message, failure.error.details);
      }

      if (result.result.commandType !== "GenerateCaptionTrack") {
        throw new WorkerError("WORKFLOW_FAILED", "Unexpected caption-generation workflow result.");
      }

      let captionTrack = result.result.captionTrack;

      if (clip.timelineStartUs > 0) {
        captionTrack = offsetCaptionTrackTiming(captionTrack, clip.timelineStartUs);
        await updateCaptionTrack(directory, captionTrack);
      }

      await createWorkflowArtifact({
        databasePath: resolveProjectPaths(directory).databasePath,
        workflowRunId: run.id,
        stepRunId: stepRun.id,
        batchItemRunId: stepRun.batchItemRunId,
        kind: "caption-track",
        label: captionTrack.name,
        metadata: {
          captionTrackId: captionTrack.id,
          clipId
        }
      });

      return {
        outputSummary: {
          clipId,
          transcriptId: context.transcriptId,
          captionTrackId: captionTrack.id
        }
      };
    }
    case "applyBrandKit": {
      if (!context.captionTrackId) {
        throw new WorkerError("WORKFLOW_FAILED", "No caption track is available for brand-kit application.");
      }

      const brandKitId =
        typeof run.input.brandKitId === "string"
          ? run.input.brandKitId
          : document.settings.branding.defaultBrandKitId;

      if (!brandKitId) {
        throw new WorkerError("BRAND_KIT_NOT_FOUND", "No brand kit was selected for this workflow.");
      }

      const brandKit = await getBrandKit(brandKitId);

      if (!brandKit) {
        throw new WorkerError("BRAND_KIT_NOT_FOUND", `Brand kit ${brandKitId} could not be found.`);
      }

      const captionSnapshot = await getCaptionSessionSnapshot({ directory });
      const track = captionSnapshot.captionTracks.find((entry) => entry.id === context.captionTrackId);

      if (!track) {
        throw new WorkerError(
          "CAPTION_TRACK_NOT_FOUND",
          `Caption track ${context.captionTrackId} could not be found.`
        );
      }

      const nextTrack = applyCaptionStyleOverridesToTrack(track, {
        brandKitId: brandKit.id,
        templateId: brandKit.captionTemplateId,
        styleOverrides: brandKit.captionStyleOverrides
      });
      await updateCaptionTrack(directory, nextTrack);

      return {
        outputSummary: {
          clipId,
          captionTrackId: nextTrack.id,
          brandKitId: brandKit.id
        }
      };
    }
    case "exportSubtitles": {
      if (!context.captionTrackId) {
        throw new WorkerError("WORKFLOW_FAILED", "No caption track is available for subtitle export.");
      }

      const result = await executeCaptionCommand({
        directory,
        command: {
          type: "ExportSubtitleFile",
          captionTrackId: context.captionTrackId,
          format: "srt"
        }
      });

      if (!result.result.ok) {
        const failure = result.result as CaptionCommandFailure;
        throw new WorkerError(failure.error.code, failure.error.message, failure.error.details);
      }

      if (result.result.commandType !== "ExportSubtitleFile") {
        throw new WorkerError("WORKFLOW_FAILED", "Unexpected subtitle export workflow result.");
      }

      await createWorkflowArtifact({
        databasePath: resolveProjectPaths(directory).databasePath,
        workflowRunId: run.id,
        stepRunId: stepRun.id,
        batchItemRunId: stepRun.batchItemRunId,
        kind: "subtitle",
        label: "Subtitle export",
        path: result.result.artifact.outputPath,
        metadata: {
          captionTrackId: result.result.artifact.captionTrackId,
          format: result.result.artifact.format
        }
      });

      return {
        outputSummary: {
          clipId,
          captionTrackId: context.captionTrackId,
          subtitlePath: result.result.artifact.outputPath
        }
      };
    }
    case "startExport": {
      if (!clipId || !clip) {
        throw new WorkerError("CLIP_NOT_FOUND", "Workflow export step requires a clip.");
      }

      const brandKitId =
        typeof run.input.brandKitId === "string"
          ? run.input.brandKitId
          : document.settings.branding.defaultBrandKitId;
      const brandKit = brandKitId ? await getBrandKit(brandKitId) : null;
      const presetId =
        (typeof run.input.exportPresetId === "string"
          ? (run.input.exportPresetId as ExportRequestInput["presetId"])
          : brandKit?.exportPresetId ?? document.settings.exports.defaultPreset) ??
        document.settings.exports.defaultPreset;
      const request: ExportRequestInput = {
        timelineId: document.timeline.id,
        presetId,
        target: {
          kind: "range",
          startUs: clip.timelineStartUs,
          endUs: clip.timelineStartUs + (clip.sourceOutUs - clip.sourceInUs),
          label: clipId
        },
        captionBurnIn: {
          enabled: Boolean(run.input.enableBurnIn ?? true) && Boolean(context.captionTrackId),
          captionTrackId: context.captionTrackId,
          subtitleFormat: "ass"
        }
      };
      const result = await executeExportCommand({
        directory,
        command: {
          type: "StartExport",
          request
        }
      });

      if (!result.result.ok) {
        const failure = result.result as ExportCommandFailure;
        throw new WorkerError(failure.error.code, failure.error.message, failure.error.details);
      }

      if (result.result.commandType !== "StartExport") {
        throw new WorkerError("WORKFLOW_FAILED", "Unexpected export workflow result.");
      }

      appendChildJobId(
        resolveProjectPaths(directory).databasePath,
        run.parentJobId,
        result.result.exportRun.jobId
      );
      const exportRun = await waitForExportCompletion(directory, result.result.exportRun.id);
      await createWorkflowArtifact({
        databasePath: resolveProjectPaths(directory).databasePath,
        workflowRunId: run.id,
        stepRunId: stepRun.id,
        batchItemRunId: stepRun.batchItemRunId,
        kind: "export",
        label: `Export ${clipId}`,
        path: exportRun.outputPath,
        metadata: {
          exportRunId: exportRun.id,
          presetId: exportRun.presetId
        }
      });

      return {
        outputSummary: {
          clipId,
          exportRunId: exportRun.id,
          childJobId: exportRun.jobId,
          outputPath: exportRun.outputPath
        }
      };
    }
    case "analyzeSilence": {
      if (!clipId) {
        throw new WorkerError("CLIP_NOT_FOUND", "Workflow silence analysis requires a clip.");
      }

      const result = await executeSmartCommand({
        directory,
        command: {
          type: "AnalyzeSilence",
          timelineId: document.timeline.id,
          clipId
        }
      });

      if (!result.result.ok) {
        const failure = result.result as SmartCommandFailure;
        throw new WorkerError(failure.error.code, failure.error.message, failure.error.details);
      }

      if (result.result.commandType !== "AnalyzeSilence") {
        throw new WorkerError("WORKFLOW_FAILED", "Unexpected silence-analysis workflow result.");
      }

      appendChildJobId(resolveProjectPaths(directory).databasePath, run.parentJobId, result.result.run.jobId);
      await createWorkflowArtifact({
        databasePath: resolveProjectPaths(directory).databasePath,
        workflowRunId: run.id,
        stepRunId: stepRun.id,
        batchItemRunId: stepRun.batchItemRunId,
        kind: "suggestion-set",
        label: "Silence suggestions",
        metadata: {
          suggestionSetId: result.result.suggestionSet.id,
          itemCount: result.result.suggestionSet.items.length
        }
      });

      return {
        outputSummary: {
          clipId,
          silenceSuggestionSetId: result.result.suggestionSet.id,
          childJobId: result.result.run.jobId
        }
      };
    }
    case "findFillerWords": {
      if (!context.transcriptId) {
        throw new WorkerError("TRANSCRIPT_NOT_FOUND", "No transcript is available for filler analysis.");
      }

      const result = await executeSmartCommand({
        directory,
        command: {
          type: "FindFillerWords",
          transcriptId: context.transcriptId
        }
      });

      if (!result.result.ok) {
        const failure = result.result as SmartCommandFailure;
        throw new WorkerError(failure.error.code, failure.error.message, failure.error.details);
      }

      if (result.result.commandType !== "FindFillerWords") {
        throw new WorkerError("WORKFLOW_FAILED", "Unexpected filler-analysis workflow result.");
      }

      appendChildJobId(resolveProjectPaths(directory).databasePath, run.parentJobId, result.result.run.jobId);
      await createWorkflowArtifact({
        databasePath: resolveProjectPaths(directory).databasePath,
        workflowRunId: run.id,
        stepRunId: stepRun.id,
        batchItemRunId: stepRun.batchItemRunId,
        kind: "suggestion-set",
        label: "Filler-word suggestions",
        metadata: {
          suggestionSetId: result.result.suggestionSet.id,
          itemCount: result.result.suggestionSet.items.length
        }
      });

      return {
        outputSummary: {
          clipId,
          fillerSuggestionSetId: result.result.suggestionSet.id,
          childJobId: result.result.run.jobId
        }
      };
    }
    case "generateHighlights": {
      if (!context.transcriptId) {
        throw new WorkerError("TRANSCRIPT_NOT_FOUND", "No transcript is available for highlight analysis.");
      }

      const result = await executeSmartCommand({
        directory,
        command: {
          type: "GenerateHighlightSuggestions",
          transcriptId: context.transcriptId
        }
      });

      if (!result.result.ok) {
        const failure = result.result as SmartCommandFailure;
        throw new WorkerError(failure.error.code, failure.error.message, failure.error.details);
      }

      if (result.result.commandType !== "GenerateHighlightSuggestions") {
        throw new WorkerError("WORKFLOW_FAILED", "Unexpected highlight-analysis workflow result.");
      }

      appendChildJobId(resolveProjectPaths(directory).databasePath, run.parentJobId, result.result.run.jobId);

      await createWorkflowArtifact({
        databasePath: resolveProjectPaths(directory).databasePath,
        workflowRunId: run.id,
        stepRunId: stepRun.id,
        batchItemRunId: stepRun.batchItemRunId,
        kind: "suggestion-set",
        label: "Highlight suggestions",
        metadata: {
          suggestionSetId: result.result.suggestionSet.id,
          itemCount: result.result.suggestionSet.items.length
        }
      });

      return {
        outputSummary: {
          clipId,
          highlightSuggestionSetId: result.result.suggestionSet.id,
          childJobId: result.result.run.jobId
        }
      };
    }
    case "compileSmartPlan": {
      const selectedSuggestionSetId =
        String(run.input.primarySuggestionSource ?? "silence") === "filler"
          ? context.fillerSuggestionSetId
          : context.silenceSuggestionSetId;

      if (!selectedSuggestionSetId) {
        throw new WorkerError("SUGGESTION_SET_NOT_FOUND", "No smart suggestion set is available for plan compilation.");
      }

      const result = await executeSmartCommand({
        directory,
        command: {
          type: "CompileEditPlan",
          timelineId: document.timeline.id,
          suggestionSetId: selectedSuggestionSetId
        }
      });

      if (!result.result.ok) {
        const failure = result.result as SmartCommandFailure;
        throw new WorkerError(failure.error.code, failure.error.message, failure.error.details);
      }

      if (result.result.commandType !== "CompileEditPlan") {
        throw new WorkerError("WORKFLOW_FAILED", "Unexpected plan-compilation workflow result.");
      }

      await createWorkflowArtifact({
        databasePath: resolveProjectPaths(directory).databasePath,
        workflowRunId: run.id,
        stepRunId: stepRun.id,
        batchItemRunId: stepRun.batchItemRunId,
        kind: "edit-plan",
        label: "Smart edit plan",
        metadata: {
          planId: result.result.plan.id,
          suggestionSetId: selectedSuggestionSetId
        }
      });

      return {
        outputSummary: {
          clipId,
          planId: result.result.plan.id,
          selectedSuggestionSetId
        }
      };
    }
    case "applySuggestionSet": {
      const selectedSuggestionSetId =
        (context.planId &&
          run.steps.find((entry) => entry.outputSummary.planId === context.planId)?.outputSummary
            .selectedSuggestionSetId) ||
        (String(run.input.primarySuggestionSource ?? "silence") === "filler"
          ? context.fillerSuggestionSetId
          : context.silenceSuggestionSetId);

      if (typeof selectedSuggestionSetId !== "string") {
        throw new WorkerError("SUGGESTION_SET_NOT_FOUND", "No suggestion set is available for application.");
      }

      const result = await executeSmartCommand({
        directory,
        command: {
          type: "ApplySuggestionSet",
          timelineId: document.timeline.id,
          suggestionSetId: selectedSuggestionSetId
        }
      });

      if (!result.result.ok) {
        const failure = result.result as SmartCommandFailure;
        throw new WorkerError(failure.error.code, failure.error.message, failure.error.details);
      }

      if (result.result.commandType !== "ApplySuggestionSet") {
        throw new WorkerError("WORKFLOW_FAILED", "Unexpected suggestion-application workflow result.");
      }

      return {
        outputSummary: {
          clipId,
          suggestionSetId: selectedSuggestionSetId,
          planId: result.result.plan.id
        }
      };
    }
    case "createRegionsFromSuggestions": {
      const suggestionSetId = context.highlightSuggestionSetId;

      if (!suggestionSetId) {
        throw new WorkerError("SUGGESTION_SET_NOT_FOUND", "No highlight suggestion set is available.");
      }

      const suggestionSet = getSuggestionSet(resolveProjectPaths(directory).databasePath, suggestionSetId);

      if (!suggestionSet) {
        throw new WorkerError("SUGGESTION_SET_NOT_FOUND", `Suggestion set ${suggestionSetId} could not be found.`);
      }

      const createdRegionIds: string[] = [];

      for (const suggestion of suggestionSet.items.slice(0, 5)) {
        const result = await executeEditorCommand({
          directory,
          command: {
            type: "AddRegion",
            timelineId: document.timeline.id,
            startUs: suggestion.target.startUs,
            endUs: suggestion.target.endUs,
            label: suggestion.label
          }
        });

        if (result.result.ok && result.result.commandType === "AddRegion") {
          createdRegionIds.push(result.result.region.id);
        }
      }

      await createWorkflowArtifact({
        databasePath: resolveProjectPaths(directory).databasePath,
        workflowRunId: run.id,
        stepRunId: stepRun.id,
        batchItemRunId: stepRun.batchItemRunId,
        kind: "regions",
        label: "Generated regions",
        metadata: {
          regionIds: createdRegionIds
        }
      });

      return {
        outputSummary: {
          clipId,
          regionIds: createdRegionIds
        }
      };
    }
    case "captureExportSnapshot": {
      const suggestionSetId = context.highlightSuggestionSetId;

      if (!suggestionSetId) {
        throw new WorkerError("SUGGESTION_SET_NOT_FOUND", "No highlight suggestion set is available.");
      }

      const suggestionSet = getSuggestionSet(resolveProjectPaths(directory).databasePath, suggestionSetId);

      if (!suggestionSet) {
        throw new WorkerError("SUGGESTION_SET_NOT_FOUND", `Suggestion set ${suggestionSetId} could not be found.`);
      }

      const captured = [];

      for (const suggestion of suggestionSet.items.slice(0, 3)) {
        const result = await executeExportCommand({
          directory,
          command: {
            type: "CaptureExportSnapshot",
            request: {
              sourceKind: "timeline",
              timelineId: document.timeline.id,
              positionUs: suggestion.target.startUs,
              presetId: document.settings.exports.defaultPreset
            }
          }
        });

        if (!result.result.ok) {
          const failure = result.result as ExportCommandFailure;
          throw new WorkerError(failure.error.code, failure.error.message, failure.error.details);
        }

        if (result.result.commandType !== "CaptureExportSnapshot") {
          throw new WorkerError("WORKFLOW_FAILED", "Unexpected snapshot workflow result.");
        }

        captured.push(result.result.snapshot.outputPath);
        await createWorkflowArtifact({
          databasePath: resolveProjectPaths(directory).databasePath,
          workflowRunId: run.id,
          stepRunId: stepRun.id,
          batchItemRunId: stepRun.batchItemRunId,
          kind: "snapshot",
          label: suggestion.label,
          path: result.result.snapshot.outputPath,
          metadata: {
            suggestionId: suggestion.id,
            positionUs: suggestion.target.startUs
          }
        });
      }

      return {
        outputSummary: {
          clipId,
          snapshotPaths: captured
        }
      };
    }
    case "approvalCheckpoint": {
      return {
        outputSummary: {
          clipId
        }
      };
    }
  }
}

function persistWorkflowRunStructure(databasePath: string, run: WorkflowRun): void {
  for (const batchItem of run.batchItems) {
    upsertWorkflowBatchItemRecord(databasePath, batchItem);
  }

  for (const stepRun of run.steps) {
    upsertWorkflowStepRunRecord(databasePath, stepRun);
  }

  for (const approval of run.approvals) {
    upsertWorkflowApprovalRecord(databasePath, approval);
  }

  for (const artifact of run.artifacts) {
    upsertWorkflowArtifactRecord(databasePath, artifact);
  }
}

function replaceStepRun(run: WorkflowRun, nextStepRun: WorkflowStepRun): WorkflowRun {
  const nextRun = {
    ...run,
    steps: run.steps.map((stepRun) => (stepRun.id === nextStepRun.id ? nextStepRun : stepRun)),
    updatedAt: nowIso()
  };

  return {
    ...nextRun,
    summary: summarizeWorkflowRun(nextRun)
  };
}

function appendApproval(run: WorkflowRun, approval: WorkflowApproval): WorkflowRun {
  const nextRun = {
    ...run,
    approvals: [...run.approvals, approval],
    updatedAt: nowIso()
  };

  return {
    ...nextRun,
    summary: summarizeWorkflowRun(nextRun)
  };
}

async function executeSingleWorkflowRun(directory: string, runId: string): Promise<void> {
  const { paths } = await loadAndMaybeMigrateProject(directory);
  const template = resolveWorkflowTemplate(
    (getWorkflowRun(paths.databasePath, runId)?.templateId as WorkflowTemplateId) ?? "captioned-export-v1"
  );

  if (!template) {
    throw new WorkerError("WORKFLOW_NOT_FOUND", `Workflow template for run ${runId} could not be found.`);
  }

  let run = getWorkflowRun(paths.databasePath, runId);

  if (!run) {
    throw new WorkerError("WORKFLOW_RUN_NOT_FOUND", `Workflow run ${runId} could not be found.`);
  }

  run = updateWorkflowRunRecord(paths.databasePath, run.id, {
    status: "running",
    startedAt: run.startedAt ?? nowIso(),
    completedAt: null,
    error: null
  });
  updateJobRecord(paths.databasePath, run.parentJobId, {
    status: "running",
    step: "Running workflow",
    progress: 0.1,
    errorMessage: null,
    attemptCount: (getStoredJobRecord(paths.databasePath, run.parentJobId)?.attemptCount ?? 0) + 1
  });

  const clipId = typeof run.input.clipId === "string" ? run.input.clipId : null;

  for (const definition of template.steps) {
    if (!evaluateRunIf(definition, run.input)) {
      const stepRun = run.steps.find(
        (entry) => entry.definitionId === definition.id && entry.batchItemRunId === null
      );

      if (stepRun && stepRun.status !== "completed" && stepRun.status !== "skipped") {
        run = replaceStepRun(run, {
          ...stepRun,
          status: "skipped",
          updatedAt: nowIso(),
          completedAt: nowIso()
        });
        upsertWorkflowStepRunRecord(paths.databasePath, run.steps.find((entry) => entry.id === stepRun.id)!);
      }
      continue;
    }

    const stepRun = run.steps.find(
      (entry) => entry.definitionId === definition.id && entry.batchItemRunId === null
    );

    if (!stepRun || stepRun.status === "completed" || stepRun.status === "skipped") {
      continue;
    }

    if (definition.requiresApproval) {
      const existingApproval = run.approvals.find((approval) => approval.stepRunId === stepRun.id);

      if (!existingApproval) {
        const approval = createApproval({
          workflowRunId: run.id,
          stepRunId: stepRun.id,
          batchItemRunId: null,
          reason: "High-impact workflow step requires approval.",
          summary: definition.name,
          proposedEffects: [definition.description]
        });
        run = appendApproval(run, approval);
        upsertWorkflowApprovalRecord(paths.databasePath, approval);
      }

      const approval = run.approvals.find((entry) => entry.stepRunId === stepRun.id);

      if (approval?.status !== "approved") {
        const waitingStep = {
          ...stepRun,
          status: "waiting-approval" as const,
          updatedAt: nowIso()
        };
        run = replaceStepRun(run, waitingStep);
        upsertWorkflowStepRunRecord(paths.databasePath, waitingStep);
        updateWorkflowRunRecord(paths.databasePath, run.id, {
          status: "waiting-approval"
        });
        updateJobRecord(paths.databasePath, run.parentJobId, {
          status: "running",
          step: `Waiting approval: ${definition.name}`,
          progress: 0.5
        });
        return;
      }
    }

    const runningStep = {
      ...stepRun,
      status: "running" as const,
      startedAt: stepRun.startedAt ?? nowIso(),
      updatedAt: nowIso(),
      error: null
    };
    run = replaceStepRun(run, runningStep);
    upsertWorkflowStepRunRecord(paths.databasePath, runningStep);

    try {
      const execution = await executeWorkflowStep({
        directory,
        run,
        stepRun: runningStep,
        clipId,
        document: (await loadAndMaybeMigrateProject(directory)).document,
        template
      });
      const completedStep = {
        ...runningStep,
        status: "completed" as const,
        outputSummary: execution.outputSummary,
        warnings: execution.warnings ?? [],
        updatedAt: nowIso(),
        completedAt: nowIso()
      };
      run = replaceStepRun(run, completedStep);
      upsertWorkflowStepRunRecord(paths.databasePath, completedStep);
    } catch (error) {
      const failedStep = {
        ...runningStep,
        status: "failed" as const,
        error: toJobError(error instanceof Error ? error : new Error("Workflow step failed."), "WORKFLOW_FAILED"),
        updatedAt: nowIso(),
        completedAt: nowIso()
      };
      run = replaceStepRun(run, failedStep);
      upsertWorkflowStepRunRecord(paths.databasePath, failedStep);
      updateWorkflowRunRecord(paths.databasePath, run.id, {
        status: "failed",
        error: failedStep.error,
        completedAt: nowIso()
      });
      updateJobRecord(paths.databasePath, run.parentJobId, {
        status: "failed",
        progress: 1,
        step: `Failed: ${definition.name}`,
        errorMessage: failedStep.error.message
      });
      return;
    }
  }

  updateWorkflowRunRecord(paths.databasePath, run.id, {
    status: "completed",
    completedAt: nowIso()
  });
  updateJobRecord(paths.databasePath, run.parentJobId, {
    status: "completed",
    progress: 1,
    step: "Completed"
  });
}

async function executeBatchWorkflowRun(directory: string, runId: string): Promise<void> {
  const { paths } = await loadAndMaybeMigrateProject(directory);
  const run = getWorkflowRun(paths.databasePath, runId);

  if (!run) {
    throw new WorkerError("WORKFLOW_RUN_NOT_FOUND", `Workflow run ${runId} could not be found.`);
  }

  const template = resolveWorkflowTemplate(run.templateId);

  if (!template) {
    throw new WorkerError("WORKFLOW_NOT_FOUND", `Workflow template ${run.templateId} could not be found.`);
  }

  updateWorkflowRunRecord(paths.databasePath, run.id, {
    status: "running",
    startedAt: run.startedAt ?? nowIso(),
    completedAt: null,
    error: null
  });
  updateJobRecord(paths.databasePath, run.parentJobId, {
    status: "running",
    step: "Running batch workflow",
    progress: 0.05,
    errorMessage: null,
    attemptCount: (getStoredJobRecord(paths.databasePath, run.parentJobId)?.attemptCount ?? 0) + 1
  });

  const mutableRun = getWorkflowRun(paths.databasePath, run.id);

  if (!mutableRun) {
    throw new WorkerError("WORKFLOW_RUN_NOT_FOUND", `Workflow run ${run.id} could not be found.`);
  }

  let failedItemCount = 0;

  for (const batchItem of mutableRun.batchItems) {
    let currentBatchItem: WorkflowBatchItemRun = {
      ...batchItem,
      status: "running" as const,
      startedAt: batchItem.startedAt ?? nowIso(),
      updatedAt: nowIso()
    };
    upsertWorkflowBatchItemRecord(paths.databasePath, currentBatchItem);

    let itemFailed = false;
    let currentRun = getWorkflowRun(paths.databasePath, run.id) ?? mutableRun;

    for (const definition of template.steps) {
      if (!evaluateRunIf(definition, currentRun.input)) {
        const skippedStep = currentRun.steps.find(
          (entry) =>
            entry.batchItemRunId === currentBatchItem.id && entry.definitionId === definition.id
        );

        if (skippedStep && skippedStep.status !== "completed") {
          upsertWorkflowStepRunRecord(paths.databasePath, {
            ...skippedStep,
            status: "skipped",
            updatedAt: nowIso(),
            completedAt: nowIso()
          });
        }
        continue;
      }

      const stepRun = (getWorkflowRun(paths.databasePath, run.id) ?? currentRun).steps.find(
        (entry) =>
          entry.batchItemRunId === currentBatchItem.id && entry.definitionId === definition.id
      );

      if (!stepRun || stepRun.status === "completed" || stepRun.status === "skipped") {
        continue;
      }

      const runningStep = {
        ...stepRun,
        status: "running" as const,
        startedAt: stepRun.startedAt ?? nowIso(),
        updatedAt: nowIso(),
        error: null
      };
      upsertWorkflowStepRunRecord(paths.databasePath, runningStep);

      try {
        const execution = await executeWorkflowStep({
          directory,
          run: getWorkflowRun(paths.databasePath, run.id) ?? currentRun,
          stepRun: runningStep,
          clipId: currentBatchItem.targetClipId,
          document: (await loadAndMaybeMigrateProject(directory)).document,
          template
        });
        upsertWorkflowStepRunRecord(paths.databasePath, {
          ...runningStep,
          status: "completed",
          outputSummary: execution.outputSummary,
          warnings: execution.warnings ?? [],
          updatedAt: nowIso(),
          completedAt: nowIso()
        });
        currentRun = getWorkflowRun(paths.databasePath, run.id) ?? currentRun;
      } catch (error) {
        const jobError = toJobError(
          error instanceof Error ? error : new Error("Workflow batch item step failed."),
          "WORKFLOW_FAILED"
        );
        upsertWorkflowStepRunRecord(paths.databasePath, {
          ...runningStep,
          status: "failed",
          error: jobError,
          updatedAt: nowIso(),
          completedAt: nowIso()
        });
        currentBatchItem = {
          ...currentBatchItem,
          status: "failed",
          error: jobError,
          updatedAt: nowIso(),
          completedAt: nowIso()
        };
        upsertWorkflowBatchItemRecord(paths.databasePath, currentBatchItem);
        itemFailed = true;
        failedItemCount += 1;
        break;
      }
    }

    if (!itemFailed) {
      currentBatchItem = {
        ...currentBatchItem,
        status: "completed",
        updatedAt: nowIso(),
        completedAt: nowIso()
      };
      upsertWorkflowBatchItemRecord(paths.databasePath, currentBatchItem);
    }
  }

  updateWorkflowRunRecord(paths.databasePath, run.id, {
    status: failedItemCount < mutableRun.batchItems.length ? "completed" : "failed",
    warnings:
      failedItemCount > 0 ? [`${failedItemCount} batch item(s) failed.`] : [],
    completedAt: nowIso()
  });
  updateJobRecord(paths.databasePath, run.parentJobId, {
    status: failedItemCount < mutableRun.batchItems.length ? "completed" : "failed",
    progress: 1,
    step: failedItemCount > 0 ? "Completed with partial failures" : "Completed",
    errorMessage: failedItemCount > 0 ? `${failedItemCount} batch item(s) failed.` : null
  });
}

async function processQueuedWorkflow(directory: string): Promise<void> {
  const paths = resolveProjectPaths(directory);

  if (activeWorkflowRuns.has(paths.directory)) {
    return;
  }

  const nextRun = listWorkflowRuns(paths.databasePath).find(
    (run) => run.status === "queued" || run.status === "planning" || run.status === "running"
  );

  if (!nextRun) {
    return;
  }

  activeWorkflowRuns.set(paths.directory, nextRun.id);

  try {
    const template = resolveWorkflowTemplate(nextRun.templateId);

    if (!template) {
      throw new WorkerError("WORKFLOW_NOT_FOUND", `Workflow template ${nextRun.templateId} could not be found.`);
    }

    if (template.batchMode === "clip-batch") {
      await executeBatchWorkflowRun(paths.directory, nextRun.id);
    } else {
      await executeSingleWorkflowRun(paths.directory, nextRun.id);
    }
  } catch (error) {
    updateWorkflowRunRecord(paths.databasePath, nextRun.id, {
      status: "failed",
      error: toJobError(error instanceof Error ? error : new Error("Workflow failed."), "WORKFLOW_FAILED"),
      completedAt: nowIso()
    });
    updateJobRecord(paths.databasePath, nextRun.parentJobId, {
      status: "failed",
      progress: 1,
      step: "Failed",
      errorMessage: error instanceof Error ? error.message : "Workflow failed."
    });
  } finally {
    activeWorkflowRuns.delete(paths.directory);
    void processQueuedWorkflow(paths.directory);
  }
}

function scheduleWorkflowRun(directory: string): void {
  void processQueuedWorkflow(directory);
}

function validateWorkflowInput(template: WorkflowTemplate, input: Record<string, unknown>): void {
  for (const field of template.inputSchema.fields) {
    if (!field.required) {
      continue;
    }

    const value = input[field.id];

    if (value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0)) {
      throw new WorkerError(
        "WORKFLOW_INVALID_INPUT",
        `Workflow input ${field.id} is required for ${template.name}.`
      );
    }
  }
}

async function createAndQueueWorkflowRun(
  directory: string,
  template: WorkflowTemplate,
  input: Record<string, unknown>
): Promise<WorkflowRun> {
  validateWorkflowInput(template, input);
  const paths = resolveProjectPaths(directory);
  const jobId = createJobRecord(paths.databasePath, {
    kind: "workflow",
    projectDirectory: paths.directory,
    payload: {
      workflowRunId: "pending",
      templateId: template.id,
      childJobIds: []
    },
    status: "queued",
    progress: 0,
    step: "Queued"
  });
  const run = createWorkflowRunTemplate({
    directory: paths.directory,
    template,
    parentJobId: jobId,
    input
  });

  createWorkflowRunRecord(paths.databasePath, run);
  persistWorkflowRunStructure(paths.databasePath, run);
  updateJobRecord(paths.databasePath, jobId, {
    payload: {
      workflowRunId: run.id,
      templateId: template.id,
      childJobIds: []
    }
  });
  await writeWorkflowArtifactFile(paths.directory, run.id, "workflow-run.json", {
    templateId: run.templateId,
    templateVersion: run.templateVersion,
    input: run.input
  });
  scheduleWorkflowRun(paths.directory);
  return getWorkflowRun(paths.databasePath, run.id) ?? run;
}

export async function executeWorkflowCommand(
  input: ExecuteWorkflowCommandInput
): Promise<ExecuteWorkflowCommandResult> {
  const { paths, document } = await loadAndMaybeMigrateProject(input.directory);
  const command = input.command;

  try {
    switch (command.type) {
      case "StartWorkflow": {
        const template = resolveWorkflowTemplate(command.templateId);

        if (!template) {
          return {
            snapshot: buildWorkflowSession(paths.directory, document.project.name, await listBrandKits()),
            result: createFailure(command, "WORKFLOW_NOT_FOUND", `Workflow ${command.templateId} could not be found.`)
          };
        }

        const workflowRun = await createAndQueueWorkflowRun(paths.directory, template, command.input);

        return {
          snapshot: buildWorkflowSession(paths.directory, document.project.name, await listBrandKits()),
          result: {
            ok: true,
            commandType: "StartWorkflow",
            workflowRun,
            queued: activeWorkflowRuns.has(paths.directory)
          }
        };
      }
      case "StartBatchWorkflow": {
        const template = resolveWorkflowTemplate(command.templateId);

        if (!template) {
          return {
            snapshot: buildWorkflowSession(paths.directory, document.project.name, await listBrandKits()),
            result: createFailure(command, "WORKFLOW_NOT_FOUND", `Workflow ${command.templateId} could not be found.`)
          };
        }

        const workflowRun = await createAndQueueWorkflowRun(paths.directory, template, command.input);

        return {
          snapshot: buildWorkflowSession(paths.directory, document.project.name, await listBrandKits()),
          result: {
            ok: true,
            commandType: "StartBatchWorkflow",
            workflowRun,
            queued: activeWorkflowRuns.has(paths.directory)
          }
        };
      }
      case "CancelWorkflowRun": {
        const run = getWorkflowRun(paths.databasePath, command.workflowRunId);

        if (!run) {
          return {
            snapshot: buildWorkflowSession(paths.directory, document.project.name, await listBrandKits()),
            result: createFailure(command, "WORKFLOW_RUN_NOT_FOUND", `Workflow run ${command.workflowRunId} could not be found.`)
          };
        }

        const nextRun = updateWorkflowRunRecord(paths.databasePath, run.id, {
          status: "cancelled",
          completedAt: nowIso(),
          error: null
        });
        updateJobRecord(paths.databasePath, run.parentJobId, {
          status: "cancelled",
          progress: 1,
          step: "Cancelled",
          errorMessage: null
        });

        return {
          snapshot: buildWorkflowSession(paths.directory, document.project.name, await listBrandKits()),
          result: {
            ok: true,
            commandType: "CancelWorkflowRun",
            workflowRun: nextRun
          }
        };
      }
      case "ResumeWorkflowRun": {
        const run = getWorkflowRun(paths.databasePath, command.workflowRunId);

        if (!run) {
          return {
            snapshot: buildWorkflowSession(paths.directory, document.project.name, await listBrandKits()),
            result: createFailure(command, "WORKFLOW_RUN_NOT_FOUND", `Workflow run ${command.workflowRunId} could not be found.`)
          };
        }

        const nextRun = updateWorkflowRunRecord(paths.databasePath, run.id, {
          status: "queued",
          error: null,
          completedAt: null
        });
        updateJobRecord(paths.databasePath, run.parentJobId, {
          status: "queued",
          progress: 0,
          step: "Queued",
          errorMessage: null
        });
        scheduleWorkflowRun(paths.directory);

        return {
          snapshot: buildWorkflowSession(paths.directory, document.project.name, await listBrandKits()),
          result: {
            ok: true,
            commandType: "ResumeWorkflowRun",
            workflowRun: nextRun
          }
        };
      }
      case "RetryWorkflowStep": {
        const run = getWorkflowRun(paths.databasePath, command.workflowRunId);
        const stepRun = run?.steps.find((entry) => entry.id === command.stepRunId) ?? null;

        if (!run || !stepRun) {
          return {
            snapshot: buildWorkflowSession(paths.directory, document.project.name, await listBrandKits()),
            result: createFailure(command, "WORKFLOW_STEP_NOT_FOUND", `Workflow step ${command.stepRunId} could not be found.`)
          };
        }

        upsertWorkflowStepRunRecord(paths.databasePath, {
          ...stepRun,
          status: "pending",
          error: null,
          warnings: [],
          outputSummary: {},
          updatedAt: nowIso(),
          startedAt: null,
          completedAt: null
        });
        const nextRun = updateWorkflowRunRecord(paths.databasePath, run.id, {
          status: "queued",
          error: null,
          completedAt: null
        });
        updateJobRecord(paths.databasePath, run.parentJobId, {
          status: "queued",
          progress: 0,
          step: "Queued",
          errorMessage: null
        });
        scheduleWorkflowRun(paths.directory);

        return {
          snapshot: buildWorkflowSession(paths.directory, document.project.name, await listBrandKits()),
          result: {
            ok: true,
            commandType: "RetryWorkflowStep",
            workflowRun: nextRun
          }
        };
      }
      case "ApproveWorkflowStep": {
        const run = getWorkflowRun(paths.databasePath, command.workflowRunId);
        const approval = run?.approvals.find((entry) => entry.id === command.approvalId) ?? null;

        if (!run || !approval) {
          return {
            snapshot: buildWorkflowSession(paths.directory, document.project.name, await listBrandKits()),
            result: createFailure(command, "WORKFLOW_APPROVAL_NOT_FOUND", `Workflow approval ${command.approvalId} could not be found.`)
          };
        }

        upsertWorkflowApprovalRecord(paths.databasePath, {
          ...approval,
          status: "approved",
          updatedAt: nowIso(),
          resolvedAt: nowIso()
        });
        const nextRun = updateWorkflowRunRecord(paths.databasePath, run.id, {
          status: "queued",
          error: null,
          completedAt: null
        });
        scheduleWorkflowRun(paths.directory);

        return {
          snapshot: buildWorkflowSession(paths.directory, document.project.name, await listBrandKits()),
          result: {
            ok: true,
            commandType: "ApproveWorkflowStep",
            workflowRun: nextRun
          }
        };
      }
      case "RejectWorkflowStep": {
        const run = getWorkflowRun(paths.databasePath, command.workflowRunId);
        const approval = run?.approvals.find((entry) => entry.id === command.approvalId) ?? null;

        if (!run || !approval) {
          return {
            snapshot: buildWorkflowSession(paths.directory, document.project.name, await listBrandKits()),
            result: createFailure(command, "WORKFLOW_APPROVAL_NOT_FOUND", `Workflow approval ${command.approvalId} could not be found.`)
          };
        }

        upsertWorkflowApprovalRecord(paths.databasePath, {
          ...approval,
          status: "rejected",
          updatedAt: nowIso(),
          resolvedAt: nowIso()
        });
        const nextRun = updateWorkflowRunRecord(paths.databasePath, run.id, {
          status: "failed",
          error: {
            code: "WORKFLOW_FAILED",
            message: "The workflow approval was rejected."
          },
          completedAt: nowIso()
        });
        updateJobRecord(paths.databasePath, run.parentJobId, {
          status: "failed",
          progress: 1,
          step: "Rejected",
          errorMessage: "The workflow approval was rejected."
        });

        return {
          snapshot: buildWorkflowSession(paths.directory, document.project.name, await listBrandKits()),
          result: {
            ok: true,
            commandType: "RejectWorkflowStep",
            workflowRun: nextRun
          }
        };
      }
      case "CreateBrandKit": {
        const brandKit = await createUserBrandKit(command.brandKit);

        return {
          snapshot: buildWorkflowSession(paths.directory, document.project.name, await listBrandKits()),
          result: {
            ok: true,
            commandType: "CreateBrandKit",
            brandKitId: brandKit.id
          }
        };
      }
      case "UpdateBrandKit": {
        const brandKit = await updateUserBrandKit(command.brandKitId, command.brandKit);

        return {
          snapshot: buildWorkflowSession(paths.directory, document.project.name, await listBrandKits()),
          result: {
            ok: true,
            commandType: "UpdateBrandKit",
            brandKitId: brandKit.id
          }
        };
      }
      case "SetDefaultBrandKit": {
        if (command.brandKitId) {
          const brandKit = await getBrandKit(command.brandKitId);

          if (!brandKit) {
            return {
              snapshot: buildWorkflowSession(paths.directory, document.project.name, await listBrandKits()),
              result: createFailure(command, "BRAND_KIT_NOT_FOUND", `Brand kit ${command.brandKitId} could not be found.`)
            };
          }
        }

        await updateDefaultBrandKitId(paths.directory, command.brandKitId);

        return {
          snapshot: buildWorkflowSession(paths.directory, document.project.name, await listBrandKits()),
          result: {
            ok: true,
            commandType: "SetDefaultBrandKit",
            brandKitId: command.brandKitId
          }
        };
      }
    }
  } catch (error) {
    const workerError =
      error instanceof WorkerError
        ? error
        : new WorkerError("WORKFLOW_FAILED", error instanceof Error ? error.message : "Workflow execution failed.");

    return {
      snapshot: buildWorkflowSession(paths.directory, document.project.name, await listBrandKits()),
      result: createFailure(
        command,
        (workerError.code as WorkflowFailureCode) ?? "WORKFLOW_FAILED",
        workerError.message,
        workerError.details
      )
    };
  }
}
