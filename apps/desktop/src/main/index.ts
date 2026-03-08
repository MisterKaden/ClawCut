import * as electron from "electron";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { createMediaWorkerHost } from "@clawcut/media-worker";

import { registerIpcHandlers } from "./ipc";
import { LocalApiController } from "./local-api";
import { createPreviewBridge } from "./preview-bridge";
import { createMainWindow } from "./window";

electron.app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
let mainWindow: electron.BrowserWindow | null = null;
let localApiController: LocalApiController | null = null;
let mediaWorkerHost: ReturnType<typeof createMediaWorkerHost> | null = null;

async function createSessionLogDirectory(userDataPath: string): Promise<string> {
  const sessionId = `${new Date().toISOString().replace(/[:.]/gu, "-")}-${process.pid}`;
  const directory = join(userDataPath, "logs", "sessions", sessionId);
  await mkdir(directory, { recursive: true });
  return directory;
}

function resolveCurrentWindow(): electron.BrowserWindow | null {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow;
  }

  return electron.BrowserWindow.getAllWindows()[0] ?? null;
}

async function bootstrap(): Promise<void> {
  const { app, BrowserWindow } = electron;
  await app.whenReady();
  const userDataPath = app.getPath("userData");
  const workspaceRoot = app.isPackaged
    ? app.getAppPath()
    : process.env.CLAWCUT_WORKSPACE_ROOT ?? process.cwd();
  const sessionLogDirectory = await createSessionLogDirectory(userDataPath);
  mediaWorkerHost = createMediaWorkerHost({
    workspaceRoot,
    userDataPath,
    sessionLogDirectory
  });
  localApiController = new LocalApiController({
    configPath: join(userDataPath, "local-api.json"),
    sessionLogDirectory,
    worker: mediaWorkerHost,
    preview: createPreviewBridge(resolveCurrentWindow)
  });
  await localApiController.initialize();
  registerIpcHandlers({
    async detectToolchain() {
      return mediaWorkerHost!.detectToolchain();
    },
    async createProject(input) {
      return mediaWorkerHost!.createProject(input);
    },
    async openProject(input) {
      return mediaWorkerHost!.openProject(input);
    },
    async getProjectSnapshot(input) {
      return mediaWorkerHost!.getProjectSnapshot(input);
    },
    async getEditorSessionSnapshot(input) {
      return mediaWorkerHost!.getEditorSessionSnapshot(input);
    },
    async executeEditorCommand(input) {
      return mediaWorkerHost!.executeEditorCommand(input);
    },
    async getExportSessionSnapshot(input) {
      return mediaWorkerHost!.getExportSessionSnapshot(input);
    },
    async executeExportCommand(input) {
      return mediaWorkerHost!.executeExportCommand(input);
    },
    async getCaptionSessionSnapshot(input) {
      return mediaWorkerHost!.getCaptionSessionSnapshot(input);
    },
    async executeCaptionCommand(input) {
      return mediaWorkerHost!.executeCaptionCommand(input);
    },
    async getSmartSessionSnapshot(input) {
      return mediaWorkerHost!.getSmartSessionSnapshot(input);
    },
    async executeSmartCommand(input) {
      return mediaWorkerHost!.executeSmartCommand(input);
    },
    async getWorkflowSessionSnapshot(input) {
      return mediaWorkerHost!.getWorkflowSessionSnapshot(input);
    },
    async executeWorkflowCommand(input) {
      return mediaWorkerHost!.executeWorkflowCommand(input);
    },
    async getDiagnosticsSessionSnapshot(input) {
      const snapshot = await mediaWorkerHost!.getDiagnosticsSessionSnapshot(input);
      const localApiStatus = localApiController?.getStatus();
      return {
        ...snapshot,
        sessionLogDirectory: snapshot.sessionLogDirectory ?? localApiStatus?.sessionLogDirectory ?? null,
        requestLogPath: localApiStatus?.requestLogPath ?? snapshot.requestLogPath
      };
    },
    async executeDiagnosticsAction(input) {
      return mediaWorkerHost!.executeDiagnosticsAction(input);
    },
    async pickImportPaths() {
      throw new Error("pickImportPaths is handled by the Electron IPC layer.");
    },
    async importMediaPaths(input) {
      return mediaWorkerHost!.importMediaPaths(input);
    },
    async refreshMediaHealth(input) {
      return mediaWorkerHost!.refreshMediaHealth(input);
    },
    async relinkMediaItem(input) {
      return mediaWorkerHost!.relinkMediaItem(input);
    },
    async retryJob(input) {
      return mediaWorkerHost!.retryJob(input);
    },
    async probeAsset(input) {
      return mediaWorkerHost!.probeAsset(input);
    },
    async getLocalApiStatus() {
      if (!localApiController) {
        throw new Error("Local API controller is not initialized.");
      }

      return localApiController.getStatus();
    },
    async setLocalApiEnabled(input) {
      if (!localApiController) {
        throw new Error("Local API controller is not initialized.");
      }

      return localApiController.setEnabled(input.enabled);
    },
    async regenerateLocalApiToken() {
      if (!localApiController) {
        throw new Error("Local API controller is not initialized.");
      }

      return localApiController.regenerateToken();
    }
  });

  mainWindow = createMainWindow();
  mainWindow.on("closed", () => {
    if (mainWindow?.isDestroyed()) {
      mainWindow = null;
    }
  });

  app.on("activate", () => {
    if (app.isReady() && BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
      mainWindow.on("closed", () => {
        if (mainWindow?.isDestroyed()) {
          mainWindow = null;
        }
      });
    }
  });
}

void bootstrap();

electron.app.on("window-all-closed", async () => {
  if (process.platform !== "darwin") {
    await localApiController?.dispose();
    await mediaWorkerHost?.dispose();
    electron.app.quit();
  }
});

electron.app.on("before-quit", async () => {
  await localApiController?.dispose();
  await mediaWorkerHost?.dispose();
});
