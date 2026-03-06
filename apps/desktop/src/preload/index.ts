import * as electron from "electron";

import {
  IPC_CHANNELS,
  type ClawcutApi,
  type CreateProjectInput,
  type ExecuteEditorCommandInput,
  type GetEditorSessionSnapshotInput,
  type GetProjectSnapshotInput,
  type ImportMediaPathsInput,
  type OpenProjectInput,
  type PickImportPathsInput,
  type ProbeAssetInput,
  type RefreshMediaHealthInput,
  type RelinkMediaItemInput,
  type RetryJobInput
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
  getProjectSnapshot(input: GetProjectSnapshotInput) {
    return electron.ipcRenderer.invoke(IPC_CHANNELS.getProjectSnapshot, input);
  },
  getEditorSessionSnapshot(input: GetEditorSessionSnapshotInput) {
    return electron.ipcRenderer.invoke(IPC_CHANNELS.getEditorSessionSnapshot, input);
  },
  executeEditorCommand(input: ExecuteEditorCommandInput) {
    return electron.ipcRenderer.invoke(IPC_CHANNELS.executeEditorCommand, input);
  },
  pickImportPaths(input?: PickImportPathsInput) {
    return electron.ipcRenderer.invoke(IPC_CHANNELS.pickImportPaths, input);
  },
  importMediaPaths(input: ImportMediaPathsInput) {
    return electron.ipcRenderer.invoke(IPC_CHANNELS.importMediaPaths, input);
  },
  refreshMediaHealth(input: RefreshMediaHealthInput) {
    return electron.ipcRenderer.invoke(IPC_CHANNELS.refreshMediaHealth, input);
  },
  relinkMediaItem(input: RelinkMediaItemInput) {
    return electron.ipcRenderer.invoke(IPC_CHANNELS.relinkMediaItem, input);
  },
  retryJob(input: RetryJobInput) {
    return electron.ipcRenderer.invoke(IPC_CHANNELS.retryJob, input);
  },
  probeAsset(input: ProbeAssetInput) {
    return electron.ipcRenderer.invoke(IPC_CHANNELS.probeAsset, input);
  }
};

electron.contextBridge.exposeInMainWorld("clawcut", clawcutApi);
