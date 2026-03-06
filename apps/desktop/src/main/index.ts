import * as electron from "electron";

import { PlaceholderPreviewEngine } from "@clawcut/domain";
import { createMediaWorkerHost } from "@clawcut/media-worker";

import { registerIpcHandlers } from "./ipc";
import { createMainWindow } from "./window";

const workspaceRoot = process.env.CLAWCUT_WORKSPACE_ROOT ?? process.cwd();
const mediaWorkerHost = createMediaWorkerHost({ workspaceRoot });
const previewEngine = new PlaceholderPreviewEngine();

async function bootstrap(): Promise<void> {
  const { app, BrowserWindow } = electron;
  await app.whenReady();
  registerIpcHandlers({
    async detectToolchain() {
      return mediaWorkerHost.detectToolchain();
    },
    async createProject(input) {
      const project = await mediaWorkerHost.createProject(input);
      await previewEngine.setProject({
        id: project.document.project.id,
        name: project.document.project.name
      });
      return project;
    },
    async openProject(input) {
      const project = await mediaWorkerHost.openProject(input);
      await previewEngine.setProject({
        id: project.document.project.id,
        name: project.document.project.name
      });
      return project;
    },
    async registerFixtureMedia(input) {
      return mediaWorkerHost.registerFixtureMedia(input);
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
    await previewEngine.dispose();
    await mediaWorkerHost.dispose();
    electron.app.quit();
  }
});

electron.app.on("before-quit", async () => {
  await previewEngine.dispose();
  await mediaWorkerHost.dispose();
});
