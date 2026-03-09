import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
  createEmptyDerivedAssetSet,
  createEmptyMetadataSummary,
  getBuiltInBrandKits,
  getTimelineEndUs,
  type MediaItem
} from "@clawcut/domain";

import { executeEditorCommand, getEditorSessionSnapshot } from "../src/editor-session";
import { WAVEFORM_PRESET_KEY } from "../src/cache-manager";
import { probeAsset } from "../src/probe";
import {
  createProject,
  updateMediaItem
} from "../src/project-repository";
import { resolveDerivedAssetPath, resolveProjectPaths } from "../src/paths";
import {
  executeWorkflowCommand,
  getWorkflowSessionSnapshot
} from "../src/workflow-session";

const temporaryDirectories: string[] = [];
const originalAdapter = process.env.CLAWCUT_TRANSCRIPTION_ADAPTER;
const originalUserDataPath = process.env.CLAWCUT_USER_DATA_PATH;

function registerTempDirectory(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

async function createMediaItemFromFixture(
  id: string,
  displayName: string,
  sourcePath: string
): Promise<MediaItem> {
  const probe = await probeAsset(sourcePath);

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
      kind: probe.width ? "video" : "audio",
      container: probe.container,
      durationMs: probe.durationMs,
      bitRate: probe.bitRate,
      hasVideo: probe.streams.some((stream) => stream.codecType === "video"),
      hasAudio: probe.streams.some((stream) => stream.codecType === "audio"),
      width: probe.width,
      height: probe.height,
      frameRate: probe.frameRate,
      pixelFormat: probe.pixelFormat,
      rotation: probe.rotation,
      videoCodec: probe.videoCodec,
      audioCodec: probe.audioCodec,
      audioSampleRate: probe.audioSampleRate,
      channelCount: probe.channelCount,
      streamSignature: probe.streamSignature
    },
    streams: [],
    ingestStatus: "ready",
    relinkStatus: "linked",
    errorState: null,
    derivedAssets: createEmptyDerivedAssetSet()
  };
}

async function seedVideoTimeline(directory: string, mediaItem: MediaItem): Promise<{
  timelineId: string;
  clipId: string;
}> {
  await updateMediaItem(directory, mediaItem);
  const initialSession = await getEditorSessionSnapshot(directory);
  const timelineResult = await executeEditorCommand({
    directory,
    command: {
      type: "CreateTimeline",
      timelineId: initialSession.timeline.id
    }
  });

  if (!timelineResult.result.ok || timelineResult.result.commandType !== "CreateTimeline") {
    throw new Error("Could not create the default timeline.");
  }

  const [videoTrackId, audioTrackId] = timelineResult.result.createdTrackIds;

  if (!videoTrackId || !audioTrackId) {
    throw new Error("Default timeline did not create V1 and A1.");
  }

  const insertResult = await executeEditorCommand({
    directory,
    command: {
      type: "InsertLinkedMedia",
      timelineId: timelineResult.snapshot.timeline.id,
      mediaItemId: mediaItem.id,
      videoTrackId,
      audioTrackId,
      timelineStartUs: 0
    }
  });

  if (!insertResult.result.ok) {
    throw new Error("Could not insert the fixture media.");
  }

  const videoClipId = Object.values(insertResult.snapshot.timeline.clipsById).find(
    (clip) => clip.streamType === "video"
  )?.id;

  if (!videoClipId) {
    throw new Error("Inserted timeline did not expose a video clip.");
  }

  return {
    timelineId: insertResult.snapshot.timeline.id,
    clipId: videoClipId
  };
}

async function seedSilenceWaveform(directory: string, mediaItem: MediaItem): Promise<void> {
  const paths = resolveProjectPaths(directory);
  const waveformPath = resolveDerivedAssetPath(
    paths,
    mediaItem.id,
    mediaItem.sourceRevision,
    "waveform.json"
  );
  mkdirSync(join(waveformPath.absolutePath, ".."), { recursive: true });
  writeFileSync(
    waveformPath.absolutePath,
    JSON.stringify({
      version: 1,
      bucketCount: 8,
      durationMs: mediaItem.metadataSummary.durationMs ?? 4_000,
      peaks: [0.24, 0.22, 0.01, 0.01, 0.01, 0.21, 0.18, 0.16],
      rms: [0.12, 0.11, 0.01, 0.01, 0.01, 0.09, 0.08, 0.07]
    }),
    "utf8"
  );

  await updateMediaItem(directory, {
    ...mediaItem,
    derivedAssets: {
      ...mediaItem.derivedAssets,
      waveform: {
        id: `${mediaItem.id}:waveform`,
        type: "waveform",
        status: "ready",
        relativePath: waveformPath.relativePath,
        sourceRevision: mediaItem.sourceRevision,
        presetKey: WAVEFORM_PRESET_KEY,
        generatedAt: new Date().toISOString(),
        fileSize: 1,
        errorMessage: null,
        bucketCount: 8,
        durationMs: mediaItem.metadataSummary.durationMs ?? 4_000,
        previewPeaks: [0.24, 0.22, 0.01, 0.01, 0.01, 0.21, 0.18, 0.16]
      }
    }
  });
}

async function waitForWorkflowState(
  directory: string,
  workflowRunId: string,
  statuses: string[],
  timeoutMs: number = 60_000
) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const snapshot = await getWorkflowSessionSnapshot({ directory });
    const run = snapshot.workflowRuns.find((entry) => entry.id === workflowRunId);

    if (run && statuses.includes(run.status)) {
      return {
        snapshot,
        run
      };
    }

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 150));
  }

  throw new Error(
    `Timed out waiting for workflow ${workflowRunId} to reach ${statuses.join(", ")}.`
  );
}

describe.sequential("workflow session", () => {
  beforeEach(() => {
    process.env.CLAWCUT_TRANSCRIPTION_ADAPTER = "fixture";
  });

  afterEach(() => {
    process.env.CLAWCUT_TRANSCRIPTION_ADAPTER = originalAdapter;
    process.env.CLAWCUT_USER_DATA_PATH = originalUserDataPath;

    while (temporaryDirectories.length > 0) {
      const directory = temporaryDirectories.pop();

      if (directory) {
        rmSync(directory, { recursive: true, force: true });
      }
    }
  });

  test("creates and updates user brand kits and can set a project default", async () => {
    const directory = registerTempDirectory("clawcut-stage9-brand-kits-");
    const userDataDirectory = registerTempDirectory("clawcut-stage9-brand-kit-userdata-");
    process.env.CLAWCUT_USER_DATA_PATH = userDataDirectory;

    await createProject(directory, "Stage 9 Brand Kits");
    const baseKit = getBuiltInBrandKits()[0];

    if (!baseKit) {
      throw new Error("Expected a built-in brand kit.");
    }

    const created = await executeWorkflowCommand({
      directory,
      command: {
        type: "CreateBrandKit",
        brandKit: {
          ...baseKit,
          id: "stage9-user-kit",
          name: "Stage 9 User Kit",
          description: "A user-defined workflow brand kit.",
          source: "user"
        }
      }
    });

    expect(created.result.ok).toBe(true);

    const updated = await executeWorkflowCommand({
      directory,
      command: {
        type: "UpdateBrandKit",
        brandKitId: "stage9-user-kit",
        brandKit: {
          ...baseKit,
          id: "stage9-user-kit",
          name: "Stage 9 User Kit",
          description: "Updated description",
          source: "user"
        }
      }
    });

    expect(updated.result.ok).toBe(true);

    await executeWorkflowCommand({
      directory,
      command: {
        type: "SetDefaultBrandKit",
        brandKitId: "stage9-user-kit"
      }
    });

    const workflowSnapshot = await getWorkflowSessionSnapshot({ directory });
    const editorSnapshot = await getEditorSessionSnapshot(directory);

    expect(
      workflowSnapshot.brandKits.find((brandKit) => brandKit.id === "stage9-user-kit")?.description
    ).toBe("Updated description");
    expect(editorSnapshot.document.settings.branding.defaultBrandKitId).toBe("stage9-user-kit");
  });

  test("creates workflow profiles and schedules and exposes candidate packages in the session snapshot", async () => {
    const directory = registerTempDirectory("clawcut-stage11-workflow-profiles-");
    const userDataDirectory = registerTempDirectory("clawcut-stage11-workflow-profile-userdata-");
    const fixturePath = resolve(process.cwd(), "fixtures/media/talking-head-sample.mp4");
    process.env.CLAWCUT_USER_DATA_PATH = userDataDirectory;

    await createProject(directory, "Stage 11 Profiles");
    const mediaItem = await createMediaItemFromFixture("media-video", "Talking Head", fixturePath);
    const seeded = await seedVideoTimeline(directory, mediaItem);

    const createdProfile = await executeWorkflowCommand({
      directory,
      command: {
        type: "CreateWorkflowProfile",
        profile: {
          id: "stage11-captioned-profile",
          version: 1,
          name: "Stage 11 Captioned Export",
          description: "Reusable captioned export defaults.",
          templateId: "captioned-export-v1",
          defaultInputs: {
            clipId: seeded.clipId,
            exportSubtitles: true
          },
          approvalPolicy: "respect-template",
          defaultBrandKitId: "clawcut-clean",
          defaultExportPresetId: "video-share-720p",
          enabledOptionalSteps: [],
          compatibility: {
            templateId: "captioned-export-v1",
            templateVersion: 1
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      }
    });

    expect(createdProfile.result.ok).toBe(true);

    const createdSchedule = await executeWorkflowCommand({
      directory,
      command: {
        type: "CreateWorkflowSchedule",
        schedule: {
          id: "stage11-captioned-schedule",
          version: 1,
          name: "Stage 11 Schedule",
          enabled: true,
          workflowProfileId: "stage11-captioned-profile",
          projectPath: directory,
          targetResolver: {
            kind: "static-clip-ids",
            clipIds: [seeded.clipId]
          },
          trigger: {
            kind: "interval",
            intervalMinutes: 60
          },
          approvalPolicy: "respect-profile",
          concurrencyPolicy: "skip-if-running",
          lastRunAt: null,
          nextRunAt: null,
          lastRunStatus: null,
          lastWorkflowRunId: null,
          lastError: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      }
    });

    expect(createdSchedule.result.ok).toBe(true);

    const socialStarted = await executeWorkflowCommand({
      directory,
      command: {
        type: "StartWorkflow",
        templateId: "social-candidate-package-v1",
        input: {
          clipId: seeded.clipId
        }
      }
    });

    expect(socialStarted.result.ok).toBe(true);

    if (!socialStarted.result.ok || socialStarted.result.commandType !== "StartWorkflow") {
      return;
    }

    const completed = await waitForWorkflowState(directory, socialStarted.result.workflowRun.id, [
      "completed"
    ]);

    expect(
      completed.run.artifacts.some((artifact) => artifact.kind === "candidate-package")
    ).toBe(true);

    const snapshot = await getWorkflowSessionSnapshot({ directory });
    expect(snapshot.workflowProfiles.some((profile) => profile.id === "stage11-captioned-profile")).toBe(
      true
    );
    expect(snapshot.schedules.some((schedule) => schedule.id === "stage11-captioned-schedule")).toBe(
      true
    );
    expect(snapshot.candidatePackages.length).toBeGreaterThan(0);
    expect(snapshot.auditEvents.some((event) => event.kind === "run-created")).toBe(true);
    expect(snapshot.auditEvents.some((event) => event.kind === "artifact")).toBe(true);
  });

  test("updates candidate-package review state and records workflow audit events", async () => {
    const directory = registerTempDirectory("clawcut-stage12-candidate-review-");
    const fixturePath = resolve(process.cwd(), "fixtures/media/talking-head-sample.mp4");

    await createProject(directory, "Stage 12 Candidate Review");
    const mediaItem = await createMediaItemFromFixture("media-video", "Talking Head", fixturePath);
    const seeded = await seedVideoTimeline(directory, mediaItem);

    const started = await executeWorkflowCommand({
      directory,
      command: {
        type: "StartWorkflow",
        templateId: "social-candidate-package-v1",
        input: {
          clipId: seeded.clipId
        }
      }
    });

    expect(started.result.ok).toBe(true);

    if (!started.result.ok || started.result.commandType !== "StartWorkflow") {
      return;
    }

    await waitForWorkflowState(directory, started.result.workflowRun.id, ["completed"]);
    const beforeReview = await getWorkflowSessionSnapshot({ directory });
    const candidatePackage = beforeReview.candidatePackages[0];

    expect(candidatePackage).toBeTruthy();
    expect(beforeReview.auditEvents.some((event) => event.kind === "artifact")).toBe(true);

    if (!candidatePackage) {
      throw new Error("Expected a generated candidate package.");
    }

    const reviewed = await executeWorkflowCommand({
      directory,
      command: {
        type: "ReviewWorkflowCandidatePackage",
        candidatePackageId: candidatePackage.id,
        reviewStatus: "shortlisted",
        reviewNotes: "Strong opening beat."
      }
    });

    expect(reviewed.result.ok).toBe(true);

    if (
      !reviewed.result.ok ||
      reviewed.result.commandType !== "ReviewWorkflowCandidatePackage"
    ) {
      return;
    }

    expect(reviewed.result.candidatePackage.reviewStatus).toBe("shortlisted");
    expect(reviewed.result.candidatePackage.reviewNotes).toBe("Strong opening beat.");

    const afterReview = await getWorkflowSessionSnapshot({ directory });
    const updatedCandidate = afterReview.candidatePackages.find(
      (entry) => entry.id === candidatePackage.id
    );

    expect(updatedCandidate?.reviewStatus).toBe("shortlisted");
    expect(updatedCandidate?.reviewNotes).toBe("Strong opening beat.");
    expect(
      afterReview.auditEvents.some(
        (event) =>
          event.kind === "candidate-review" &&
          event.candidatePackageId === candidatePackage.id &&
          event.message.includes("shortlisted")
      )
    ).toBe(true);
  });

  test("runs smart cleanup through approval and preserves undoability after application", async () => {
    const directory = registerTempDirectory("clawcut-stage9-smart-cleanup-");
    const fixturePath = resolve(process.cwd(), "fixtures/media/talking-head-sample.mp4");

    await createProject(directory, "Stage 9 Cleanup");
    const mediaItem = await createMediaItemFromFixture("media-video", "Talking Head", fixturePath);
    const seeded = await seedVideoTimeline(directory, mediaItem);
    await seedSilenceWaveform(directory, mediaItem);

    const beforeApply = await getEditorSessionSnapshot(directory);
    const timelineEndBeforeApply = getTimelineEndUs(beforeApply.timeline);

    const started = await executeWorkflowCommand({
      directory,
      command: {
        type: "StartWorkflow",
        templateId: "smart-cleanup-v1",
        input: {
          clipId: seeded.clipId,
          primarySuggestionSource: "silence",
          requireApproval: true
        }
      }
    });

    expect(started.result.ok).toBe(true);

    if (!started.result.ok || started.result.commandType !== "StartWorkflow") {
      return;
    }

    const waiting = await waitForWorkflowState(
      directory,
      started.result.workflowRun.id,
      ["waiting-approval"]
    );

    expect(waiting.snapshot.pendingApprovals.length).toBeGreaterThan(0);
    expect(waiting.run.artifacts.some((artifact) => artifact.kind === "edit-plan")).toBe(true);

    const approval = waiting.snapshot.pendingApprovals.find(
      (entry) => entry.workflowRunId === waiting.run.id
    );

    if (!approval) {
      throw new Error("Expected a pending approval for the smart cleanup workflow.");
    }

    const approved = await executeWorkflowCommand({
      directory,
      command: {
        type: "ApproveWorkflowStep",
        workflowRunId: waiting.run.id,
        approvalId: approval.id
      }
    });

    expect(approved.result.ok).toBe(true);

    const completed = await waitForWorkflowState(
      directory,
      waiting.run.id,
      ["completed"]
    );
    const afterApply = await getEditorSessionSnapshot(directory);

    expect(getTimelineEndUs(afterApply.timeline)).toBeLessThan(timelineEndBeforeApply);
    expect(
      completed.run.steps.find((step) => step.kind === "transcribeClip")?.status
    ).toBe("completed");
    expect(
      completed.run.artifacts.some((artifact) => artifact.kind === "suggestion-set")
    ).toBe(true);

    const undone = await executeEditorCommand({
      directory,
      command: {
        type: "Undo",
        timelineId: afterApply.timeline.id
      }
    });

    expect(undone.result.ok).toBe(true);
    expect(getTimelineEndUs(undone.snapshot.timeline)).toBe(timelineEndBeforeApply);
  });

  test("runs a batch caption workflow with partial failure and preserves per-item status", async () => {
    const directory = registerTempDirectory("clawcut-stage9-batch-workflow-");
    const fixturePath = resolve(process.cwd(), "fixtures/media/talking-head-sample.mp4");

    await createProject(directory, "Stage 9 Batch");
    const mediaItem = await createMediaItemFromFixture("media-video", "Talking Head", fixturePath);
    const seeded = await seedVideoTimeline(directory, mediaItem);

    const started = await executeWorkflowCommand({
      directory,
      command: {
        type: "StartBatchWorkflow",
        templateId: "batch-caption-export-v1",
        input: {
          clipIds: [seeded.clipId, "missing-clip"],
          brandKitId: "clawcut-clean",
          exportSubtitles: true,
          exportVideo: false
        }
      }
    });

    expect(started.result.ok).toBe(true);

    if (!started.result.ok || started.result.commandType !== "StartBatchWorkflow") {
      return;
    }

    const completed = await waitForWorkflowState(
      directory,
      started.result.workflowRun.id,
      ["completed", "failed"]
    );

    expect(completed.run.status).toBe("completed");
    expect(completed.run.batchItems.some((item) => item.status === "completed")).toBe(true);
    expect(completed.run.batchItems.some((item) => item.status === "failed")).toBe(true);
    expect(completed.run.warnings).toContain("1 batch item(s) failed.");
    expect(completed.run.artifacts.some((artifact) => artifact.kind === "subtitle")).toBe(true);

    const subtitleArtifact = completed.run.artifacts.find((artifact) => artifact.kind === "subtitle");
    expect(subtitleArtifact?.path).toBeTruthy();
    expect(subtitleArtifact?.path ? existsSync(subtitleArtifact.path) : false).toBe(true);
  });
});
