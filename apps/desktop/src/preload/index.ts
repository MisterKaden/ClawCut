import * as electron from "electron";

import {
  IPC_CHANNELS,
  type ClawcutApi,
  type CreateProjectInput,
  type OpenProjectInput,
  type ProbeAssetInput,
  type RegisterFixtureMediaInput
} from "@clawcut/ipc";

const clawcutApi: ClawcutApi = {
  detectToolchain() {
    return electron.ipcRenderer.invoke(IPC_CHANNELS.detectToolchain);
  },
  createProject(input: CreateProjectInput) {
    return electron.ipcRenderer.invoke(IPC_CHANNELS.createProject, input);
  },
  openProject(input: OpenProjectInput) {
    return electron.ipcRenderer.invoke(IPC_CHANNELS.openProject, input);
  },
  registerFixtureMedia(input: RegisterFixtureMediaInput) {
    return electron.ipcRenderer.invoke(IPC_CHANNELS.registerFixtureMedia, input);
  },
  probeAsset(input: ProbeAssetInput) {
    return electron.ipcRenderer.invoke(IPC_CHANNELS.probeAsset, input);
  }
};

electron.contextBridge.exposeInMainWorld("clawcut", clawcutApi);
