import * as electron from "electron";

import {
  IPC_CHANNELS,
  type ClawcutApi,
  type CreateProjectInput,
  type OpenProjectInput,
  type ProbeAssetInput,
  type RegisterFixtureMediaInput
} from "@clawcut/ipc";

export function registerIpcHandlers(api: ClawcutApi): void {
  const { ipcMain } = electron;
  ipcMain.handle(IPC_CHANNELS.detectToolchain, async () => api.detectToolchain());
  ipcMain.handle(IPC_CHANNELS.createProject, async (_event, input: CreateProjectInput) =>
    api.createProject(input)
  );
  ipcMain.handle(IPC_CHANNELS.openProject, async (_event, input: OpenProjectInput) =>
    api.openProject(input)
  );
  ipcMain.handle(
    IPC_CHANNELS.registerFixtureMedia,
    async (_event, input: RegisterFixtureMediaInput) => api.registerFixtureMedia(input)
  );
  ipcMain.handle(IPC_CHANNELS.probeAsset, async (_event, input: ProbeAssetInput) =>
    api.probeAsset(input)
  );
}
