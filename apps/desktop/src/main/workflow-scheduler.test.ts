import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test, vi } from "vitest";

import type { MediaWorkerClient } from "@clawcut/media-worker";
import {
  createWorkflowProfile,
  createWorkflowSchedule,
  listWorkflowSchedules
} from "@clawcut/media-worker";

import { createWorkflowScheduler } from "./workflow-scheduler";

const temporaryDirectories: string[] = [];
const originalUserDataPath = process.env.CLAWCUT_USER_DATA_PATH;

function registerTempDirectory(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

describe("workflow scheduler", () => {
  afterEach(() => {
    process.env.CLAWCUT_USER_DATA_PATH = originalUserDataPath;

    while (temporaryDirectories.length > 0) {
      const directory = temporaryDirectories.pop();

      if (directory) {
        rmSync(directory, { recursive: true, force: true });
      }
    }
  });

  test("starts due schedules by running the referenced workflow profile", async () => {
    const userDataPath = registerTempDirectory("clawcut-stage11-scheduler-userdata-");
    process.env.CLAWCUT_USER_DATA_PATH = userDataPath;

    await createWorkflowProfile({
      id: "profile-captioned-export",
      version: 1,
      name: "Captioned export",
      description: "Reusable captioned export workflow.",
      templateId: "captioned-export-v1",
      defaultInputs: {
        clipId: "clip-1"
      },
      approvalPolicy: "respect-template",
      defaultBrandKitId: null,
      defaultExportPresetId: "video-share-720p",
      enabledOptionalSteps: [],
      compatibility: {
        templateId: "captioned-export-v1",
        templateVersion: 1
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    await createWorkflowSchedule({
      id: "schedule-captioned-export",
      version: 1,
      name: "Hourly captioned export",
      enabled: true,
      workflowProfileId: "profile-captioned-export",
      projectPath: "/tmp/project",
      targetResolver: {
        kind: "static-clip-ids",
        clipIds: ["clip-1"]
      },
      trigger: {
        kind: "interval",
        intervalMinutes: 60
      },
      approvalPolicy: "respect-profile",
      concurrencyPolicy: "skip-if-running",
      lastRunAt: null,
      nextRunAt: new Date(Date.now() - 1_000).toISOString(),
      lastRunStatus: null,
      lastWorkflowRunId: null,
      lastError: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    const worker = {
      getEditorSessionSnapshot: vi.fn(async () => ({
        timeline: {
          clipsById: {
            "clip-1": {
              id: "clip-1",
              streamType: "video"
            }
          }
        }
      })),
      getWorkflowSessionSnapshot: vi.fn(async () => ({
        workflowRuns: [],
        workflowProfiles: [],
        schedules: [],
        candidatePackages: [],
        pendingApprovals: [],
        activeWorkflowJobId: null
      })),
      executeWorkflowCommand: vi.fn(async () => ({
        snapshot: {},
        result: {
          ok: true,
          commandType: "RunWorkflowProfile",
          profile: {
            id: "profile-captioned-export"
          },
          workflowRun: {
            id: "workflow-run-1"
          }
        }
      }))
    } as unknown as MediaWorkerClient;

    const scheduler = createWorkflowScheduler({
      worker,
      intervalMs: 10
    });
    scheduler.start();
    await new Promise((resolve) => setTimeout(resolve, 50));
    scheduler.stop();

    expect(worker.executeWorkflowCommand).toHaveBeenCalledWith({
      directory: "/tmp/project",
      command: {
        type: "RunWorkflowProfile",
        profileId: "profile-captioned-export",
        inputOverrides: {
          clipId: "clip-1"
        },
        invocation: {
          kind: "schedule",
          scheduleId: "schedule-captioned-export"
        }
      }
    });

    const schedules = await listWorkflowSchedules();
    expect(schedules.find((entry) => entry.id === "schedule-captioned-export")?.lastRunStatus).toBe(
      "scheduled"
    );
  });
});
