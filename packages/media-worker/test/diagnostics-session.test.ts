import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createEmptyExportDiagnostics,
  createEmptyRecoveryInfo,
  createEmptyTranscriptDiagnostics,
  createExportRequest,
  createSmartAnalysisRun,
  createEmptySmartAnalysisDiagnostics,
  createEmptyTimeline
} from "@clawcut/domain";
import { describe, expect, test } from "vitest";

import { getDiagnosticsSessionSnapshot } from "../src/diagnostics-session";
import { createExportRunRecord, getExportRun } from "../src/export-repository";
import {
  createJobRecord,
  createProject,
  getStoredJobRecord
} from "../src/project-repository";
import { listSmartAnalysisRuns } from "../src/smart-repository";
import { createTranscriptionRunRecord, listTranscriptionRuns } from "../src/transcription-repository";
import { createWorkflowRunRecord, listWorkflowRuns } from "../src/workflow-repository";

describe("diagnostics recovery", () => {
  test("marks interrupted operational runs as recoverable and reports them in the diagnostics snapshot", async () => {
    const directory = mkdtempSync(join(tmpdir(), "clawcut-diagnostics-"));
    const created = await createProject(directory, "Recovery Fixture");
    const timestamp = new Date().toISOString();
    const timeline = createEmptyTimeline(created.document.timeline.id);
    const exportJobId = createJobRecord(created.databasePath, {
      kind: "export",
      projectDirectory: directory,
      mediaItemId: null,
      payload: {
        exportRunId: "export-run-1",
        timelineId: created.document.timeline.id,
        exportMode: "video",
        presetId: "video-share-720p",
        outputPath: join(directory, "exports", "fixture.mp4")
      },
      status: "running",
      progress: 0.4,
      step: "Rendering"
    });
    const exportRequestResult = createExportRequest(timeline, "video-share-720p", {
      timelineId: created.document.timeline.id
    });

    if (!exportRequestResult.ok) {
      throw new Error("Failed to construct the export request fixture.");
    }

    createExportRunRecord(created.databasePath, {
      id: "export-run-1",
      jobId: exportJobId,
      projectDirectory: directory,
      timelineId: created.document.timeline.id,
      status: "rendering",
      exportMode: exportRequestResult.request.exportMode,
      presetId: exportRequestResult.request.presetId,
      outputPath: null,
      artifactDirectory: join(directory, ".clawcut", "exports", "export-run-1"),
      request: exportRequestResult.request,
      renderPlan: null,
      ffmpegSpec: null,
      verification: null,
      diagnostics: createEmptyExportDiagnostics(),
      error: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      startedAt: timestamp,
      completedAt: null,
      retryOfRunId: null,
      cancellationRequested: false,
      recovery: createEmptyRecoveryInfo()
    });

    const transcriptionJobId = createJobRecord(created.databasePath, {
      kind: "transcription",
      projectDirectory: directory,
      mediaItemId: "media-item-1",
      payload: {
        transcriptionRunId: "transcription-run-1",
        transcriptId: null,
        timelineId: created.document.timeline.id,
        mediaItemId: "media-item-1",
        clipId: "clip-1",
        subtitleFormat: null
      },
      status: "running",
      progress: 0.2,
      step: "Extracting audio"
    });

    createTranscriptionRunRecord(created.databasePath, {
      id: "transcription-run-1",
      jobId: transcriptionJobId,
      transcriptId: null,
      projectDirectory: directory,
      request: {
        source: {
          kind: "clip",
          timelineId: created.document.timeline.id,
          clipId: "clip-1",
          mediaItemId: "media-item-1",
          sourceStartUs: 0,
          sourceEndUs: 2_000_000
        },
        options: {
          language: null,
          model: "tiny",
          wordTimestamps: true,
          initialPrompt: null,
          glossaryTerms: [],
          normalizeText: true
        }
      },
      status: "running",
      rawArtifactPath: null,
      diagnostics: createEmptyTranscriptDiagnostics(),
      error: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      startedAt: timestamp,
      completedAt: null,
      retryOfRunId: null,
      recovery: createEmptyRecoveryInfo()
    });

    const smartJobId = createJobRecord(created.databasePath, {
      kind: "analysis",
      projectDirectory: directory,
      mediaItemId: "media-item-1",
      payload: {
        analysisRunId: "analysis-run-1",
        suggestionSetId: null,
        analysisType: "silence",
        timelineId: created.document.timeline.id,
        clipId: "clip-1",
        transcriptId: null,
        mediaItemId: "media-item-1"
      },
      status: "running",
      progress: 0.1,
      step: "Analyzing"
    });

    const smartRun = createSmartAnalysisRun({
      jobId: smartJobId,
      projectDirectory: directory,
      request: {
        analysisType: "silence",
        target: {
          kind: "clip",
          timelineId: created.document.timeline.id,
          clipId: "clip-1",
          transcriptId: null,
          mediaItemId: "media-item-1",
          startUs: 0,
          endUs: 2_000_000
        },
        options: {}
      }
    });
    smartRun.id = "analysis-run-1";
    smartRun.status = "running";
    smartRun.createdAt = timestamp;
    smartRun.updatedAt = timestamp;
    smartRun.startedAt = timestamp;
    smartRun.completedAt = null;
    smartRun.diagnostics = createEmptySmartAnalysisDiagnostics();

    const { createSmartAnalysisRunRecord } = await import("../src/smart-repository");
    createSmartAnalysisRunRecord(created.databasePath, smartRun);

    const workflowJobId = createJobRecord(created.databasePath, {
      kind: "workflow",
      projectDirectory: directory,
      mediaItemId: null,
      payload: {
        workflowRunId: "workflow-run-1",
        templateId: "smart-cleanup-v1",
        childJobIds: []
      },
      status: "running",
      progress: 0.5,
      step: "Executing workflow"
    });

    createWorkflowRunRecord(created.databasePath, {
      id: "workflow-run-1",
      templateId: "smart-cleanup-v1",
      templateVersion: 1,
      projectDirectory: directory,
      status: "running",
      parentJobId: workflowJobId,
      input: {},
      safetyProfile: {
        highestSafetyClass: "high-impact",
        hasMutatingSteps: true,
        hasHighImpactSteps: true,
        requiresApproval: true
      },
      warnings: [],
      error: null,
      recovery: createEmptyRecoveryInfo(),
      createdAt: timestamp,
      updatedAt: timestamp,
      startedAt: timestamp,
      completedAt: null,
      steps: [],
      batchItems: [],
      approvals: [],
      artifacts: [],
      summary: {
        completedStepCount: 0,
        totalStepCount: 0,
        completedBatchItemCount: 0,
        totalBatchItemCount: 0,
        failedBatchItemCount: 0,
        waitingApprovalCount: 0
      }
    });

    const snapshot = await getDiagnosticsSessionSnapshot({ directory });

    expect(snapshot.recoverableItems.map((item) => item.kind)).toEqual(
      expect.arrayContaining([
        "export-run",
        "transcription-run",
        "smart-analysis-run",
        "workflow-run"
      ])
    );
    expect(snapshot.migration.databaseSchemaVersion).toBeGreaterThan(0);

    expect(getExportRun(created.databasePath, "export-run-1")?.recovery.state).toBe("recoverable");
    expect(listTranscriptionRuns(created.databasePath)[0]?.recovery.state).toBe("recoverable");
    expect(listSmartAnalysisRuns(created.databasePath)[0]?.recovery.state).toBe("recoverable");
    expect(listWorkflowRuns(created.databasePath)[0]?.recovery.state).toBe("recoverable");
    expect(getStoredJobRecord(created.databasePath, exportJobId)?.recovery.state).toBe("recoverable");
  });
});
