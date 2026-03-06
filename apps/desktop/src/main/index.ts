import * as electron from "electron";

import { createMediaWorkerHost } from "@clawcut/media-worker";

import { registerIpcHandlers } from "./ipc";
import { createMainWindow } from "./window";

const workspaceRoot = process.env.CLAWCUT_WORKSPACE_ROOT ?? process.cwd();
const mediaWorkerHost = createMediaWorkerHost({ workspaceRoot });
electron.app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

async function bootstrap(): Promise<void> {
  const { app, BrowserWindow } = electron;
  await app.whenReady();
  registerIpcHandlers({
    async detectToolchain() {
      return mediaWorkerHost.detectToolchain();
    },
    async createProject(input) {
      return mediaWorkerHost.createProject(input);
    },
    async openProject(input) {
      return mediaWorkerHost.openProject(input);
    },
    async getProjectSnapshot(input) {
      return mediaWorkerHost.getProjectSnapshot(input);
    },
    async getEditorSessionSnapshot(input) {
      return mediaWorkerHost.getEditorSessionSnapshot(input);
    },
    async executeEditorCommand(input) {
      return mediaWorkerHost.executeEditorCommand(input);
    },
    async pickImportPaths() {
      throw new Error("pickImportPaths is handled by the Electron IPC layer.");
    },
    async importMediaPaths(input) {
      return mediaWorkerHost.importMediaPaths(input);
    },
    async refreshMediaHealth(input) {
      return mediaWorkerHost.refreshMediaHealth(input);
    },
    async relinkMediaItem(input) {
      return mediaWorkerHost.relinkMediaItem(input);
    },
    async retryJob(input) {
      return mediaWorkerHost.retryJob(input);
    },
    async probeAsset(input) {
      return mediaWorkerHost.probeAsset(input);
    }
  });

  createMainWindow();

  app.on("activate", () => {
    if (app.isReady() && BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
}

void bootstrap();

electron.app.on("window-all-closed", async () => {
  if (process.platform !== "darwin") {
    await mediaWorkerHost.dispose();
    electron.app.quit();
  }
});

electron.app.on("before-quit", async () => {
  await mediaWorkerHost.dispose();
});
