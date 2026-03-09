import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test, vi } from "vitest";

import {
  createEmptyRecoveryInfo,
  createEmptyProjectDocument,
  getBuiltInBrandKits,
  getBuiltInCaptionTemplates,
  getBuiltInExportPresets,
  getBuiltInWorkflowTemplates,
  type Job
} from "@clawcut/domain";
import type { PreviewBridge } from "./preview-bridge";
import { LocalApiController } from "./local-api";

const temporaryDirectories: string[] = [];
const activeControllers: LocalApiController[] = [];

function registerTempDirectory(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

function createFakeSnapshots(directory: string) {
  const document = createEmptyProjectDocument("Local API Test");
  const createdAt = new Date().toISOString();
  const exportJob: Job = {
    id: "job-export-1",
    kind: "export",
    status: "queued",
    projectDirectory: directory,
    mediaItemId: null,
    progress: 0,
    step: "queued",
    attemptCount: 1,
    createdAt,
    updatedAt: createdAt,
    errorMessage: null,
    recovery: createEmptyRecoveryInfo(),
    exportRunId: "export-run-1",
    exportMode: "video",
    presetId: "video-share-720p",
    outputPath: null
  };
  const transcriptionJob: Job = {
    id: "job-transcription-1",
    kind: "transcription",
    status: "running",
    projectDirectory: directory,
    mediaItemId: "media-item-1",
    progress: 25,
    step: "extracting-audio",
    attemptCount: 1,
    createdAt,
    updatedAt: createdAt,
    errorMessage: null,
    recovery: createEmptyRecoveryInfo(),
    transcriptionRunId: "transcription-run-1",
    transcriptId: null,
    sourceClipId: "clip-1",
    subtitleFormat: null
  };
  const analysisJob: Job = {
    id: "job-analysis-1",
    kind: "analysis",
    status: "completed",
    projectDirectory: directory,
    mediaItemId: "media-item-1",
    progress: 100,
    step: "completed",
    attemptCount: 1,
    createdAt,
    updatedAt: createdAt,
    errorMessage: null,
    recovery: createEmptyRecoveryInfo(),
    analysisRunId: "analysis-run-1",
    analysisType: "silence",
    suggestionSetId: "suggestion-set-1"
  };

  const workspaceSnapshot = {
    directory,
    projectFilePath: join(directory, "clawcut.project.json"),
    databasePath: join(directory, ".clawcut", "project.db"),
    cacheRoot: join(directory, ".clawcut", "cache"),
    document,
    libraryItems: [],
    jobs: [exportJob, transcriptionJob, analysisJob]
  } as const;

  const editorSnapshot = {
    ...workspaceSnapshot,
    timeline: document.timeline,
    history: {
      canUndo: false,
      canRedo: false,
      undoDepth: 0,
      redoDepth: 0,
      lastUndoLabel: null,
      lastRedoLabel: null
    }
  } as const;

  const exportSession = {
    directory,
    projectName: document.project.name,
    outputRoot: join(directory, "exports"),
    defaultPresetId: "video-master-1080p",
    presets: getBuiltInExportPresets(),
    exportRuns: [
      {
        id: "export-run-1",
        jobId: exportJob.id,
        projectDirectory: directory,
        timelineId: document.timeline.id,
        status: "queued",
        exportMode: "video",
        presetId: "video-share-720p",
        outputPath: null,
        artifactDirectory: join(directory, ".clawcut", "exports", "export-run-1"),
        request: {
          timelineId: document.timeline.id,
          presetId: "video-share-720p"
        },
        renderPlan: null,
        ffmpegSpec: null,
        verification: null,
        diagnostics: {
          warnings: [],
          notes: [],
          subtitleArtifactPaths: [],
          renderPlanPath: null,
          ffmpegSpecPath: null,
          developmentManifestPath: null,
          concatListPath: null,
          ffmpegLogPath: null,
          ffmpegProgressPath: null,
          verificationPath: null,
          snapshotManifestPath: null
        },
        error: null,
        createdAt,
        updatedAt: createdAt,
        startedAt: null,
        completedAt: null,
        retryOfRunId: null,
        cancellationRequested: false,
        recovery: createEmptyRecoveryInfo()
      }
    ],
    activeExportRunId: "export-run-1",
    lastError: null
  } as const;

  const captionSession = {
    directory,
    projectName: document.project.name,
    transcripts: [],
    transcriptSummaries: [],
    captionTracks: [],
    templates: getBuiltInCaptionTemplates(),
    transcriptionRuns: [
      {
        id: "transcription-run-1",
        jobId: transcriptionJob.id,
        transcriptId: null,
        projectDirectory: directory,
        request: {
          source: {
            kind: "clip",
            timelineId: document.timeline.id,
            clipId: "clip-1",
            mediaItemId: "media-item-1",
            sourceStartUs: 0,
            sourceEndUs: 2_000_000
          },
          options: {
            language: null,
            model: "tiny",
            wordTimestamps: true,
            initialPrompt: "Prefer ClawCut and OpenClaw.",
            glossaryTerms: ["ClawCut", "OpenClaw"],
            normalizeText: true
          }
        },
        status: "running",
        rawArtifactPath: null,
        diagnostics: {
          warnings: [],
          notes: [],
          artifactDirectory: join(directory, ".clawcut", "transcription", "transcription-run-1"),
          extractedAudioPath: null,
          rawArtifactPath: null,
          logPath: null
        },
        error: null,
        createdAt,
        updatedAt: createdAt,
        startedAt: createdAt,
        completedAt: null,
        retryOfRunId: null,
        recovery: createEmptyRecoveryInfo()
      }
    ],
    activeTranscriptionJobId: transcriptionJob.id,
    lastError: null
  } as const;

  const smartSession = {
    directory,
    projectName: document.project.name,
    suggestionSets: [
      {
        id: "suggestion-set-1",
        analysisType: "silence",
        target: {
          kind: "clip",
          timelineId: document.timeline.id,
          clipId: "clip-1",
          transcriptId: null,
          mediaItemId: "media-item-1",
          startUs: 0,
          endUs: 2_000_000
        },
        title: "Silence opportunities",
        summary: "1 removable silence span detected.",
        createdAt,
        updatedAt: createdAt,
        completedAt: createdAt,
        warnings: [],
        items: [
          {
            id: "suggestion-1",
            setId: "suggestion-set-1",
            type: "silence",
            status: "new",
            label: "Dead air 1",
            confidence: 0.88,
            rationale: ["Detected a long near-silent span in the waveform envelope."],
            evidence: [
              {
                kind: "waveform",
                summary: "Buckets stayed under the configured threshold.",
                score: 0.88
              }
            ],
            suggestedAction: "ripple-delete-range",
            previewable: true,
            reversible: true,
            target: {
              timelineId: document.timeline.id,
              clipId: "clip-1",
              mediaItemId: "media-item-1",
              transcriptId: null,
              startUs: 500_000,
              endUs: 900_000
            },
            planId: null,
            createdAt,
            updatedAt: createdAt
          }
        ]
      }
    ],
    analysisRuns: [
      {
        id: "analysis-run-1",
        jobId: analysisJob.id,
        projectDirectory: directory,
        suggestionSetId: "suggestion-set-1",
        request: {
          analysisType: "silence",
          target: {
            kind: "clip",
            timelineId: document.timeline.id,
            clipId: "clip-1",
            transcriptId: null,
            mediaItemId: "media-item-1",
            startUs: 0,
            endUs: 2_000_000
          },
          options: {}
        },
        status: "completed",
        diagnostics: {
          warnings: [],
          notes: ["Silence analysis completed."],
          artifactDirectory: join(directory, ".clawcut", "smart", "analysis-run-1"),
          artifactPath: join(directory, ".clawcut", "smart", "analysis-run-1", "silence-suggestions.json"),
          logPath: null
        },
        error: null,
        createdAt,
        updatedAt: createdAt,
        startedAt: createdAt,
        completedAt: createdAt,
        retryOfRunId: null,
        recovery: createEmptyRecoveryInfo()
      }
    ],
    editPlans: [
      {
        id: "plan-1",
        timelineId: document.timeline.id,
        suggestionSetId: "suggestion-set-1",
        suggestionIds: ["suggestion-1"],
        createdAt,
        updatedAt: createdAt,
        appliedAt: null,
        warnings: [],
        conflicts: [],
        steps: [
          {
            id: "plan-step-1",
            suggestionId: "suggestion-1",
            description: "Remove a silent span.",
            command: {
              type: "RippleDeleteRange",
              timelineId: document.timeline.id,
              startUs: 500_000,
              endUs: 900_000
            }
          }
        ],
        summary: {
          predictedTimelineEndUs: 1_600_000,
          predictedRemovedDurationUs: 400_000,
          regionCountDelta: 0
        },
        status: "draft"
      }
    ],
    activeAnalysisJobId: null,
    lastError: null
  } as const;

  const workflowSession = {
    directory,
    projectName: document.project.name,
    workflows: getBuiltInWorkflowTemplates(),
    brandKits: getBuiltInBrandKits(),
    workflowProfiles: [],
    schedules: [],
    workflowRuns: [
      {
        id: "workflow-run-1",
        templateId: "smart-cleanup-v1",
        templateVersion: 1,
        projectDirectory: directory,
        status: "waiting-approval",
        parentJobId: "job-workflow-1",
        input: {
          clipId: "clip-1",
          requireApproval: true
        },
        safetyProfile: {
          highestSafetyClass: "high-impact",
          hasMutatingSteps: true,
          hasHighImpactSteps: true,
          requiresApproval: true
        },
        warnings: [],
        error: null,
        createdAt,
        updatedAt: createdAt,
        startedAt: createdAt,
        completedAt: null,
        steps: [
          {
            id: "workflow-step-1",
            workflowRunId: "workflow-run-1",
            batchItemRunId: null,
            definitionId: "compile-plan",
            kind: "compileSmartPlan",
            name: "Compile edit plan",
            status: "completed",
            safetyClass: "mutating",
            mutability: "write",
            execution: "sync",
            requiresApproval: false,
            childJobId: null,
            warnings: [],
            outputSummary: {
              planId: "plan-1"
            },
            error: null,
            createdAt,
            updatedAt: createdAt,
            startedAt: createdAt,
            completedAt: createdAt
          },
          {
            id: "workflow-step-2",
            workflowRunId: "workflow-run-1",
            batchItemRunId: null,
            definitionId: "approval-before-apply",
            kind: "approvalCheckpoint",
            name: "Approval before apply",
            status: "waiting-approval",
            safetyClass: "high-impact",
            mutability: "write",
            execution: "sync",
            requiresApproval: true,
            childJobId: null,
            warnings: [],
            outputSummary: {},
            error: null,
            createdAt,
            updatedAt: createdAt,
            startedAt: createdAt,
            completedAt: null
          }
        ],
        batchItems: [],
        approvals: [
          {
            id: "workflow-approval-1",
            workflowRunId: "workflow-run-1",
            stepRunId: "workflow-step-2",
            batchItemRunId: null,
            status: "pending",
            reason: "Smart cleanup needs explicit approval before applying edits.",
            summary: "Apply a reviewed smart edit plan",
            proposedEffects: ["Ripple delete one silence span"],
            artifactIds: ["workflow-artifact-1"],
            createdAt,
            updatedAt: createdAt,
            resolvedAt: null
          }
        ],
        artifacts: [
          {
            id: "workflow-artifact-1",
            workflowRunId: "workflow-run-1",
            stepRunId: "workflow-step-1",
            batchItemRunId: null,
            kind: "edit-plan",
            label: "Smart cleanup plan",
            path: join(directory, ".clawcut", "workflows", "workflow-run-1", "plan-1.json"),
            metadata: {
              planId: "plan-1"
            },
            createdAt
          }
        ],
        summary: {
          completedStepCount: 1,
          totalStepCount: 2,
          completedBatchItemCount: 0,
          totalBatchItemCount: 0,
          failedBatchItemCount: 0,
          waitingApprovalCount: 1
        },
        recovery: createEmptyRecoveryInfo()
      }
    ],
    pendingApprovals: [
      {
        id: "workflow-approval-1",
        workflowRunId: "workflow-run-1",
        stepRunId: "workflow-step-2",
        batchItemRunId: null,
        status: "pending",
        reason: "Smart cleanup needs explicit approval before applying edits.",
        summary: "Apply a reviewed smart edit plan",
        proposedEffects: ["Ripple delete one silence span"],
        artifactIds: ["workflow-artifact-1"],
        createdAt,
        updatedAt: createdAt,
        resolvedAt: null
      }
    ],
    candidatePackages: [
      {
        id: "candidate-package-1",
        workflowRunId: "workflow-run-1",
        sourceKind: "highlight" as const,
        title: "Candidate opening clip",
        timelineId: document.timeline.id,
        transcriptId: null,
        startUs: 1_000_000,
        endUs: 2_000_000,
        label: "Opening highlight",
        sourceSuggestionSetId: "suggestion-set-1",
        sourceSuggestionId: "suggestion-1",
        regionId: null,
        exportRunId: null,
        snapshotArtifactIds: [],
        reviewStatus: "new" as const,
        reviewNotes: null,
        reviewedAt: null,
        createdAt
      }
    ],
    auditEvents: [
      {
        id: "workflow-audit-1",
        workflowRunId: "workflow-run-1",
        stepRunId: "workflow-step-1",
        batchItemRunId: null,
        candidatePackageId: null,
        kind: "run-created" as const,
        severity: "info" as const,
        message: "Created workflow run smart-cleanup-v1.",
        details: {
          templateId: "smart-cleanup-v1"
        },
        createdAt
      },
      {
        id: "workflow-audit-2",
        workflowRunId: "workflow-run-1",
        stepRunId: null,
        batchItemRunId: null,
        candidatePackageId: "candidate-package-1",
        kind: "candidate-review" as const,
        severity: "info" as const,
        message: "Candidate package Candidate opening clip marked shortlisted.",
        details: {
          reviewStatus: "shortlisted"
        },
        createdAt
      }
    ],
    activeWorkflowJobId: "job-workflow-1",
    lastError: null
  } as const;

  const diagnosticsSession = {
    directory,
    projectName: document.project.name,
    sessionLogDirectory: join(directory, "logs"),
    requestLogPath: join(directory, "logs", "local-api-requests.jsonl"),
    workerLogPath: join(directory, "logs", "worker-diagnostics.jsonl"),
    recentFailures: [
      {
        id: "failure-1",
        subsystem: "export" as const,
        severity: "warning" as const,
        code: "EXPORT_INTERRUPTED",
        message: "The export was interrupted before completion.",
        occurredAt: createdAt,
        requestId: null,
        jobId: exportJob.id,
        runId: "export-run-1",
        logPath: null,
        artifactPath: join(directory, ".clawcut", "exports", "export-run-1")
      }
    ],
    recoverableItems: [
      {
        id: "export-run-1",
        kind: "export-run" as const,
        jobId: exportJob.id,
        title: "Retry export video-share-720p",
        status: "failed",
        recommendedAction: "retry" as const,
        reason: "The export was interrupted before completion.",
        interruptedAt: createdAt,
        logPath: null,
        artifactPath: join(directory, ".clawcut", "exports", "export-run-1")
      }
    ],
    migration: {
      projectSchemaVersion: 6,
      databaseSchemaVersion: 2,
      projectDocumentMigrated: false,
      databaseMigrated: false
    }
  } as const;

  return {
    workspaceSnapshot,
    editorSnapshot,
    exportSession,
    captionSession,
    smartSession,
    workflowSession,
    diagnosticsSession
  };
}

function createFakeWorker(directory: string, snapshots = createFakeSnapshots(directory)) {
  const toolchainStatus = {
    status: "ok",
    tools: {
      ffmpeg: {
        name: "ffmpeg",
        available: true,
        resolvedPath: "/usr/local/bin/ffmpeg",
        version: "7.1",
        remediationHint: null
      },
      ffprobe: {
        name: "ffprobe",
        available: true,
        resolvedPath: "/usr/local/bin/ffprobe",
        version: "7.1",
        remediationHint: null
      },
      transcription: {
        name: "transcription",
        available: true,
        resolvedPath: "/usr/bin/python3",
        version: "faster-whisper-fixture",
        remediationHint: null
      }
    }
  } as const;

  return {
    snapshots,
    detectToolchain: vi.fn(async () => toolchainStatus),
    createProject: vi.fn(async () => snapshots.workspaceSnapshot),
    openProject: vi.fn(async () => snapshots.workspaceSnapshot),
    getProjectSnapshot: vi.fn(async () => snapshots.workspaceSnapshot),
    getEditorSessionSnapshot: vi.fn(async () => snapshots.editorSnapshot),
    executeEditorCommand: vi.fn(async () => ({
      snapshot: snapshots.editorSnapshot,
      result: {
        ok: true,
        commandType: "SetPlayhead",
        playheadUs: 500_000
      }
    })),
    importMediaPaths: vi.fn(async (input: { paths: string[] }) => ({
      snapshot: snapshots.workspaceSnapshot,
      acceptedPaths: input.paths,
      queuedJobIds: ["job-ingest-1"]
    })),
    relinkMediaItem: vi.fn(async () => ({
      snapshot: snapshots.workspaceSnapshot,
      result: {
        ok: true,
        confidence: "exact",
        mediaItemId: "media-item-1",
        previousPath: "/missing.mp4",
        resolvedPath: "/linked.mp4",
        notes: []
      }
    })),
    retryJob: vi.fn(async () => snapshots.workspaceSnapshot),
    getExportSessionSnapshot: vi.fn(async () => snapshots.exportSession),
    executeExportCommand: vi.fn(async () => ({
      snapshot: snapshots.exportSession,
      result: {
        ok: true,
        commandType: "StartExport",
        exportRun: snapshots.exportSession.exportRuns[0]
      }
    })),
    getCaptionSessionSnapshot: vi.fn(async () => snapshots.captionSession),
    executeCaptionCommand: vi.fn(async () => ({
      snapshot: snapshots.captionSession,
      result: {
        ok: true,
        commandType: "TranscribeClip",
        run: snapshots.captionSession.transcriptionRuns[0]
      }
    })),
    getSmartSessionSnapshot: vi.fn(async () => snapshots.smartSession),
    executeSmartCommand: vi.fn(async (input: { command: { type: string } }) => ({
      snapshot: snapshots.smartSession,
      result:
        input.command.type === "ApplySuggestion"
          ? {
              ok: true,
              commandType: "ApplySuggestion" as const,
              plan: snapshots.smartSession.editPlans[0],
              appliedSuggestionIds: ["suggestion-1"]
            }
          : input.command.type === "QuerySuggestionSet"
            ? {
                ok: true,
                commandType: "QuerySuggestionSet" as const,
                suggestionSet: snapshots.smartSession.suggestionSets[0]
              }
            : {
                ok: true,
                commandType: "InspectSuggestion" as const,
                suggestionSetId: "suggestion-set-1",
                suggestion: snapshots.smartSession.suggestionSets[0].items[0]
              }
    })),
    getWorkflowSessionSnapshot: vi.fn(async () => snapshots.workflowSession),
    getDiagnosticsSessionSnapshot: vi.fn(async () => snapshots.diagnosticsSession),
    executeWorkflowCommand: vi.fn(async (input: { command: { type: string } }) => ({
      snapshot: snapshots.workflowSession,
      result:
        input.command.type === "StartWorkflow"
          ? {
              ok: true,
              commandType: "StartWorkflow" as const,
              workflowRun: snapshots.workflowSession.workflowRuns[0],
              queued: true
            }
          : input.command.type === "ReviewWorkflowCandidatePackage"
            ? {
                ok: true,
                commandType: "ReviewWorkflowCandidatePackage" as const,
                candidatePackage: {
                  ...snapshots.workflowSession.candidatePackages[0],
                  reviewStatus: "approved" as const,
                  reviewNotes: "Looks strong.",
                  reviewedAt:
                    snapshots.workflowSession.candidatePackages[0]?.createdAt ??
                    new Date().toISOString()
                }
              }
          : {
              ok: true,
              commandType: "ApproveWorkflowStep" as const,
              workflowRun: snapshots.workflowSession.workflowRuns[0]
            }
    }))
    ,
    executeDiagnosticsAction: vi.fn(async () => ({
      snapshot: snapshots.diagnosticsSession,
      result: {
        ok: true,
        actionType: "RetryRecoverableItem" as const,
        targetKind: "export-run" as const,
        targetId: "export-run-1"
      }
    }))
  };
}

function createFakePreviewBridge(timelineId: string): PreviewBridge {
  const previewState = {
    loaded: true,
    timelineId,
    directory: "/tmp/project",
    playbackStatus: "paused",
    playheadUs: 500_000,
    timelineEndUs: 2_000_000,
    qualityMode: "standard",
    sourceMode: "original",
    playbackRate: 1,
    activeVideoClipId: "clip-1",
    activeAudioClipId: "clip-1-audio",
    selection: {
      selectedClipId: "clip-1",
      selectedTrackId: "track-video-1"
    },
    loadedMedia: {
      video: null,
      audio: null
    },
    overlays: {
      safeZones: {
        enabled: true
      },
      markers: [],
      regions: [],
      caption: null,
      selection: {
        clipId: "clip-1",
        trackId: "track-video-1"
      }
    } as Record<string, unknown>,
    warning: null,
    error: null
  } as const;

  return {
    executeCommand: vi.fn(async (command) => ({
      ok: true,
      commandType: command.type,
      state: previewState,
      ...(command.type === "SeekPreview" ? { playheadUs: previewState.playheadUs } : {})
    })),
    getPreviewState: vi.fn(async () => previewState),
    captureFrameSnapshot: vi.fn(async () => ({
      status: "available",
      timelineId,
      playheadUs: previewState.playheadUs,
      clipId: previewState.activeVideoClipId,
      sourceMode: previewState.sourceMode,
      mimeType: "image/png",
      width: 320,
      height: 180,
      dataUrl: "data:image/png;base64,AA==",
      warning: null,
      error: null
    })),
    loadProjectTimeline: vi.fn(async () => ({
      ok: true,
      commandType: "LoadTimelinePreview",
      state: previewState,
      timelineId,
      changed: true
    }))
  } as unknown as PreviewBridge;
}

async function createStartedController(options?: {
  scopes?: Array<"read" | "edit" | "preview" | "export" | "transcript" | "admin">;
}) {
  const directory = registerTempDirectory("clawcut-local-api-test-");
  const configPath = join(directory, "local-api.json");
  const config = {
    enabled: true,
    host: "127.0.0.1",
    port: 0,
    token: "local-api-test-token",
    scopes: options?.scopes ?? ["read", "edit", "preview", "export", "transcript", "admin"]
  };

  writeFileSync(configPath, JSON.stringify(config, null, 2));

  const snapshots = createFakeSnapshots(directory);
  const worker = createFakeWorker(directory, snapshots);
  const preview = createFakePreviewBridge(snapshots.editorSnapshot.timeline.id);
  const controller = new LocalApiController({
    configPath,
    sessionLogDirectory: join(directory, "logs"),
    worker: worker as never,
    preview
  });

  activeControllers.push(controller);
  await controller.initialize();

  return {
    directory,
    worker,
    preview,
    controller,
    status: controller.getStatus(),
    token: config.token
  };
}

async function requestJson<TData>(
  baseUrl: string,
  path: string,
  options?: {
    method?: "GET" | "POST";
    token?: string;
    body?: unknown;
  }
): Promise<{ status: number; body: TData }> {
  const response = await fetch(`${baseUrl}${path}`, {
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

async function readEventStreamChunk(
  response: Response,
  expectedFragments: string[],
  timeoutMs = 2_000
): Promise<string> {
  if (!response.body) {
    throw new Error("Expected an event-stream body.");
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

describe.sequential("LocalApiController", () => {
  afterEach(async () => {
    while (activeControllers.length > 0) {
      const controller = activeControllers.pop();

      if (controller) {
        await controller.dispose();
      }
    }

    while (temporaryDirectories.length > 0) {
      const directory = temporaryDirectories.pop();

      if (directory) {
        rmSync(directory, { recursive: true, force: true });
      }
    }
  });

  test("keeps health public and rejects unauthorized protected requests", async () => {
    const started = await createStartedController();

    if (!started.status.baseUrl) {
      throw new Error("Local API did not expose a base URL.");
    }

    const health = await requestJson<{ ok: boolean; data: { status: string } }>(
      started.status.baseUrl,
      "/api/v1/health"
    );
    const capabilities = await requestJson<{
      ok: false;
      error: { code: string; message: string; status: number };
    }>(started.status.baseUrl, "/api/v1/capabilities");

    expect(health.status).toBe(200);
    expect(health.body.ok).toBe(true);
    expect(capabilities.status).toBe(401);
    expect(capabilities.body.ok).toBe(false);
    expect(capabilities.body.error.code).toBe("AUTH_REQUIRED");
  });

  test("returns authenticated capabilities and OpenClaw tool discovery", async () => {
    const started = await createStartedController();

    if (!started.status.baseUrl) {
      throw new Error("Local API did not expose a base URL.");
    }

    const capabilities = await requestJson<{
      ok: true;
      data: {
        apiVersion: string;
        protocolVersion: string;
        auth: { required: boolean; scopes: string[] };
        commands: Array<{ name: string; safetyClass: string }>;
      };
    }>(started.status.baseUrl, "/api/v1/capabilities", {
      token: started.token
    });
    const tools = await requestJson<{
      ok: true;
      data: Array<{ name: string; operationName: string; safetyClass: string }>;
    }>(started.status.baseUrl, "/api/v1/openclaw/tools", {
      token: started.token
    });
    const manifest = await requestJson<{
      ok: true;
      data: {
        manifestVersion: string;
        protocolVersion: string;
        endpoints: { events: string; openClawManifest: string };
        capabilityAvailability: { eventStream: boolean; openClawPlugin: boolean };
        tools: Array<{ name: string }>;
      };
    }>(started.status.baseUrl, "/api/v1/openclaw/manifest", {
      token: started.token
    });

    expect(capabilities.status).toBe(200);
    expect(capabilities.body.data.apiVersion).toBe("v1");
    expect(capabilities.body.data.protocolVersion).toBe("1");
    expect(capabilities.body.data.auth.required).toBe(true);
    expect(capabilities.body.data.commands.some((entry) => entry.name === "project.open")).toBe(
      true
    );
    expect(
      capabilities.body.data.commands.some(
        (entry) => entry.name === "export.start" && entry.safetyClass === "high-impact"
      )
    ).toBe(true);
    expect(tools.status).toBe(200);
    expect(tools.body.data.some((entry) => entry.name === "clawcut.open_project")).toBe(true);
    expect(tools.body.data.some((entry) => entry.operationName === "export.start")).toBe(true);
    expect(tools.body.data.some((entry) => entry.name === "clawcut.capture_preview_frame")).toBe(
      true
    );
    expect(tools.body.data.some((entry) => entry.name === "clawcut.list_candidate_packages")).toBe(
      true
    );
    expect(tools.body.data.some((entry) => entry.name === "clawcut.review_candidate_package")).toBe(
      true
    );
    expect(manifest.status).toBe(200);
    expect(manifest.body.data.manifestVersion).toBe("1");
    expect(manifest.body.data.protocolVersion).toBe("1");
    expect(manifest.body.data.capabilityAvailability.eventStream).toBe(true);
    expect(manifest.body.data.capabilityAvailability.openClawPlugin).toBe(true);
    expect(manifest.body.data.endpoints.events).toBe("/api/v1/events");
    expect(manifest.body.data.tools.some((entry) => entry.name === "clawcut.capture_preview_frame")).toBe(
      true
    );
    expect(manifest.body.data.tools.some((entry) => entry.name === "clawcut.list_workflow_audit_events")).toBe(
      true
    );
  });

  test("rejects malformed command payloads with structured validation errors", async () => {
    const started = await createStartedController();

    if (!started.status.baseUrl) {
      throw new Error("Local API did not expose a base URL.");
    }

    const response = await requestJson<{
      ok: false;
      error: { code: string; message: string; status: number };
    }>(started.status.baseUrl, "/api/v1/command", {
      method: "POST",
      token: started.token,
      body: {
        name: "project.open",
        input: {}
      }
    });

    expect(response.status).toBe(400);
    expect(response.body.ok).toBe(false);
    expect(response.body.error.code).toBe("INVALID_REQUEST_SCHEMA");
  });

  test("dispatches command and query operations through the worker and preview bridge", async () => {
    const started = await createStartedController();

    if (!started.status.baseUrl) {
      throw new Error("Local API did not expose a base URL.");
    }

    const openProject = await requestJson<{
      ok: true;
      data: { directory: string };
    }>(started.status.baseUrl, "/api/v1/command", {
      method: "POST",
      token: started.token,
      body: {
        name: "project.open",
        input: {
          directory: started.directory
        }
      }
    });
    const timelineSession = await requestJson<{
      ok: true;
      data: { timeline: { id: string } };
    }>(started.status.baseUrl, "/api/v1/query", {
      method: "POST",
      token: started.token,
      body: {
        name: "timeline.get",
        input: {
          directory: started.directory
        }
      }
    });
    const previewState = await requestJson<{
      ok: true;
      data: { loaded: boolean; timelineId: string | null };
    }>(started.status.baseUrl, "/api/v1/query", {
      method: "POST",
      token: started.token,
      body: {
        name: "preview.state",
        input: {}
      }
    });
    const exportCommand = await requestJson<{
      ok: true;
      data: { result: { ok: true; commandType: string; exportRun: { id: string } } };
    }>(started.status.baseUrl, "/api/v1/command", {
      method: "POST",
      token: started.token,
      body: {
        name: "export.start",
        input: {
          directory: started.directory,
          request: {
            timelineId: timelineSession.body.data.timeline.id,
            presetId: "video-share-720p"
          }
        }
      }
    });
    const previewFrameReference = await requestJson<{
      ok: true;
      data: {
        timelineId: string | null;
        clipId: string | null;
        hasImageData: boolean;
        sourceMode: string;
      };
    }>(started.status.baseUrl, "/api/v1/query", {
      method: "POST",
      token: started.token,
      body: {
        name: "preview.frame-reference",
        input: {
          options: {
            maxWidth: 320
          }
        }
      }
    });
    const captionCommand = await requestJson<{
      ok: true;
      data: { result: { ok: true; commandType: string; run: { id: string } } };
    }>(started.status.baseUrl, "/api/v1/command", {
      method: "POST",
      token: started.token,
      body: {
        name: "transcript.transcribeClip",
        input: {
          directory: started.directory,
          timelineId: timelineSession.body.data.timeline.id,
          clipId: "clip-1"
        }
      }
    });
    const smartSession = await requestJson<{
      ok: true;
      data: { suggestionSets: Array<{ id: string }> };
    }>(started.status.baseUrl, "/api/v1/query", {
      method: "POST",
      token: started.token,
      body: {
        name: "smart.session",
        input: {
          directory: started.directory
        }
      }
    });
    const smartInspect = await requestJson<{
      ok: true;
      data: { ok: true; commandType: string; suggestion: { id: string } };
    }>(started.status.baseUrl, "/api/v1/query", {
      method: "POST",
      token: started.token,
      body: {
        name: "smart.suggestion",
        input: {
          directory: started.directory,
          suggestionSetId: "suggestion-set-1",
          suggestionId: "suggestion-1"
        }
      }
    });
    const smartApply = await requestJson<{
      ok: true;
      data: { result: { ok: true; commandType: string } };
    }>(started.status.baseUrl, "/api/v1/command", {
      method: "POST",
      token: started.token,
      body: {
        name: "smart.applySuggestion",
        input: {
          directory: started.directory,
          timelineId: timelineSession.body.data.timeline.id,
          suggestionSetId: "suggestion-set-1",
          suggestionId: "suggestion-1"
        }
      }
    });
    const smartPreviewSeek = await requestJson<{
      ok: true;
      data: {
        suggestionSetId: string;
        suggestionId: string;
        positionUs: number;
        loadedTimeline: boolean;
        preview: { ok: true; commandType: string };
      };
    }>(started.status.baseUrl, "/api/v1/command", {
      method: "POST",
      token: started.token,
      body: {
        name: "smart.seekPreviewToSuggestion",
        input: {
          directory: started.directory,
          suggestionSetId: "suggestion-set-1",
          suggestionId: "suggestion-1"
        }
      }
    });
    const workflowSession = await requestJson<{
      ok: true;
      data: {
        workflows: Array<{ id: string }>;
        workflowRuns: Array<{ id: string; status: string }>;
        pendingApprovals: Array<{ id: string }>;
        candidatePackages: Array<{ id: string; reviewStatus: string }>;
      };
    }>(started.status.baseUrl, "/api/v1/query", {
      method: "POST",
      token: started.token,
      body: {
        name: "workflow.session",
        input: {
          directory: started.directory
        }
      }
    });
    const workflowAuditEvents = await requestJson<{
      ok: true;
      data: Array<{ id: string; kind: string; candidatePackageId: string | null }>;
    }>(started.status.baseUrl, "/api/v1/query", {
      method: "POST",
      token: started.token,
      body: {
        name: "workflow.auditEvents",
        input: {
          directory: started.directory
        }
      }
    });
    const workflowPreviewCandidate = await requestJson<{
      ok: true;
      data: {
        candidatePackageId: string;
        positionUs: number;
        loadedTimeline: boolean;
        preview: { ok: true; commandType: string };
      };
    }>(started.status.baseUrl, "/api/v1/command", {
      method: "POST",
      token: started.token,
      body: {
        name: "workflow.seekPreviewToCandidatePackage",
        input: {
          directory: started.directory,
          candidatePackageId: "candidate-package-1"
        }
      }
    });
    const workflowReviewCandidate = await requestJson<{
      ok: true;
      data: {
        result: {
          ok: true;
          commandType: string;
          candidatePackage: { id: string; reviewStatus: string; reviewNotes: string | null };
        };
      };
    }>(started.status.baseUrl, "/api/v1/command", {
      method: "POST",
      token: started.token,
      body: {
        name: "workflow.reviewCandidatePackage",
        input: {
          directory: started.directory,
          candidatePackageId: "candidate-package-1",
          reviewStatus: "approved",
          reviewNotes: "Looks strong."
        }
      }
    });
    const workflowStart = await requestJson<{
      ok: true;
      data: {
        result: {
          ok: true;
          commandType: string;
          workflowRun: { id: string };
        };
      };
    }>(started.status.baseUrl, "/api/v1/command", {
      method: "POST",
      token: started.token,
      body: {
        name: "workflow.start",
        input: {
          directory: started.directory,
          templateId: "captioned-export-v1",
          input: {
            clipId: "clip-1"
          }
        }
      }
    });

    expect(openProject.status).toBe(200);
    expect(openProject.body.data.directory).toBe(started.directory);
    expect(timelineSession.status).toBe(200);
    expect(previewState.status).toBe(200);
    expect(previewState.body.data.loaded).toBe(true);
    expect(previewFrameReference.status).toBe(200);
    expect(previewFrameReference.body.data.timelineId).toBeTruthy();
    expect(previewFrameReference.body.data.clipId).toBe("clip-1");
    expect(previewFrameReference.body.data.hasImageData).toBe(true);
    expect(exportCommand.body.data.result.exportRun.id).toBe("export-run-1");
    expect(captionCommand.body.data.result.run.id).toBe("transcription-run-1");
    expect(smartSession.body.data.suggestionSets[0]?.id).toBe("suggestion-set-1");
    expect(smartInspect.body.data.commandType).toBe("InspectSuggestion");
    expect(smartApply.body.data.result.commandType).toBe("ApplySuggestion");
    expect(smartPreviewSeek.body.data.suggestionId).toBe("suggestion-1");
    expect(smartPreviewSeek.body.data.positionUs).toBe(700_000);
    expect(smartPreviewSeek.body.data.loadedTimeline).toBe(false);
    expect(smartPreviewSeek.body.data.preview.commandType).toBe("SeekPreview");
    expect(workflowSession.body.data.workflows.some((workflow) => workflow.id === "smart-cleanup-v1")).toBe(true);
    expect(workflowSession.body.data.workflowRuns[0]?.id).toBe("workflow-run-1");
    expect(workflowSession.body.data.pendingApprovals[0]?.id).toBe("workflow-approval-1");
    expect(workflowSession.body.data.candidatePackages[0]?.id).toBe("candidate-package-1");
    expect(
      workflowAuditEvents.body.data.some((event) => event.id === "workflow-audit-1")
    ).toBe(true);
    expect(workflowPreviewCandidate.body.data.candidatePackageId).toBe("candidate-package-1");
    expect(workflowPreviewCandidate.body.data.positionUs).toBe(1_500_000);
    expect(workflowPreviewCandidate.body.data.preview.commandType).toBe("SeekPreview");
    expect(workflowReviewCandidate.body.data.result.commandType).toBe(
      "ReviewWorkflowCandidatePackage"
    );
    expect(workflowReviewCandidate.body.data.result.candidatePackage.reviewStatus).toBe("approved");
    expect(workflowReviewCandidate.body.data.result.candidatePackage.reviewNotes).toBe(
      "Looks strong."
    );
    expect(workflowStart.body.data.result.commandType).toBe("StartWorkflow");
    expect(started.worker.openProject).toHaveBeenCalledWith({ directory: started.directory });
    expect(started.worker.getEditorSessionSnapshot).toHaveBeenCalledWith({
      directory: started.directory
    });
    expect(started.worker.executeExportCommand).toHaveBeenCalled();
    expect(started.worker.executeCaptionCommand).toHaveBeenCalled();
    expect(started.worker.getSmartSessionSnapshot).toHaveBeenCalled();
    expect(started.worker.executeSmartCommand).toHaveBeenCalled();
    expect(started.worker.getWorkflowSessionSnapshot).toHaveBeenCalled();
    expect(started.worker.executeWorkflowCommand).toHaveBeenCalled();
    expect(started.preview.executeCommand).toHaveBeenCalledWith({
      type: "SeekPreview",
      positionUs: 700_000
    });
    expect(started.preview.executeCommand).toHaveBeenCalledWith({
      type: "SeekPreview",
      positionUs: 1_500_000
    });
    expect(started.preview.getPreviewState).toHaveBeenCalled();
    expect(started.preview.captureFrameSnapshot).toHaveBeenCalled();
  });

  test("enforces configured scopes for mutating or privileged operations", async () => {
    const started = await createStartedController({
      scopes: ["read"]
    });

    if (!started.status.baseUrl) {
      throw new Error("Local API did not expose a base URL.");
    }

    const response = await requestJson<{
      ok: false;
      error: { code: string; message: string; status: number; details?: string };
    }>(started.status.baseUrl, "/api/v1/command", {
      method: "POST",
      token: started.token,
      body: {
        name: "media.import",
        input: {
          directory: started.directory,
          paths: ["/tmp/example.mp4"]
        }
      }
    });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("AUTH_FORBIDDEN");
    expect(response.body.error.details).toContain("edit");
  });

  test("returns related run details for job queries", async () => {
    const started = await createStartedController();

    if (!started.status.baseUrl) {
      throw new Error("Local API did not expose a base URL.");
    }

    const exportJob = await requestJson<{
      ok: true;
      data: {
        job: { id: string; kind: string } | null;
        exportRun: { id: string } | null;
        transcriptionRun: { id: string } | null;
      };
    }>(started.status.baseUrl, "/api/v1/query", {
      method: "POST",
      token: started.token,
      body: {
        name: "jobs.get",
        input: {
          directory: started.directory,
          jobId: "job-export-1"
        }
      }
    });
    const transcriptionJob = await requestJson<{
      ok: true;
      data: {
        job: { id: string; kind: string } | null;
        exportRun: { id: string } | null;
        transcriptionRun: { id: string } | null;
      };
    }>(started.status.baseUrl, "/api/v1/query", {
      method: "POST",
      token: started.token,
      body: {
        name: "jobs.get",
        input: {
          directory: started.directory,
          jobId: "job-transcription-1"
        }
      }
    });

    expect(exportJob.status).toBe(200);
    expect(exportJob.body.data.job?.kind).toBe("export");
    expect(exportJob.body.data.exportRun?.id).toBe("export-run-1");
    expect(exportJob.body.data.transcriptionRun).toBeNull();
    expect(transcriptionJob.body.data.job?.kind).toBe("transcription");
    expect(transcriptionJob.body.data.transcriptionRun?.id).toBe("transcription-run-1");
    expect(transcriptionJob.body.data.exportRun).toBeNull();
  });

  test("returns diagnostics session snapshots with persisted request-log metadata", async () => {
    const started = await createStartedController();

    if (!started.status.baseUrl) {
      throw new Error("Local API did not expose a base URL.");
    }

    const diagnostics = await requestJson<{
      ok: true;
      data: {
        projectName: string;
        requestLogPath: string | null;
        recoverableItems: Array<{ kind: string }>;
        migration: { databaseSchemaVersion: number };
      };
    }>(started.status.baseUrl, "/api/v1/query", {
      method: "POST",
      token: started.token,
      body: {
        name: "diagnostics.session",
        input: {
          directory: started.directory
        }
      }
    });

    expect(diagnostics.status).toBe(200);
    expect(diagnostics.body.data.projectName).toBe("Local API Test");
    expect(diagnostics.body.data.requestLogPath).toContain("local-api-requests.jsonl");
    expect(diagnostics.body.data.recoverableItems[0]?.kind).toBe("export-run");
    expect(diagnostics.body.data.migration.databaseSchemaVersion).toBe(2);
    expect(started.worker.getDiagnosticsSessionSnapshot).toHaveBeenCalledWith({
      directory: started.directory
    });
  });

  test("streams authenticated job updates through the local event stream", async () => {
    const started = await createStartedController();

    if (!started.status.baseUrl) {
      throw new Error("Local API did not expose a base URL.");
    }

    const response = await fetch(
      `${started.status.baseUrl}/api/v1/events?directory=${encodeURIComponent(started.directory)}`,
      {
        headers: {
          Authorization: `Bearer ${started.token}`
        }
      }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");

    const chunk = await readEventStreamChunk(response, [
      "event: ready",
      "event: jobs.snapshot",
      "\"workflows\""
    ]);

    expect(chunk).toContain("event: ready");
    expect(chunk).toContain("event: jobs.snapshot");
    expect(chunk).toContain("job-export-1");
    expect(chunk).toContain("transcription-run-1");
    expect(chunk).toContain("suggestion-set-1");
    expect(chunk).toContain("workflow-run-1");
  });
});
