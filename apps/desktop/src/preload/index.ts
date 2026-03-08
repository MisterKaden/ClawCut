import * as electron from "electron";

import {
  IPC_CHANNELS,
  type ClawcutApi,
  type CreateProjectInput,
  type ExecuteCaptionCommandInput,
  type ExecuteExportCommandInput,
  type ExecuteEditorCommandInput,
  type ExecuteSmartCommandInput,
  type GetCaptionSessionSnapshotInput,
  type GetExportSessionSnapshotInput,
  type GetEditorSessionSnapshotInput,
  type GetProjectSnapshotInput,
  type GetSmartSessionSnapshotInput,
  type ImportMediaPathsInput,
  type SetLocalApiEnabledInput,
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
  getExportSessionSnapshot(input: GetExportSessionSnapshotInput) {
    return electron.ipcRenderer.invoke(IPC_CHANNELS.getExportSessionSnapshot, input);
  },
  executeExportCommand(input: ExecuteExportCommandInput) {
    return electron.ipcRenderer.invoke(IPC_CHANNELS.executeExportCommand, input);
  },
  getCaptionSessionSnapshot(input: GetCaptionSessionSnapshotInput) {
    return electron.ipcRenderer.invoke(IPC_CHANNELS.getCaptionSessionSnapshot, input);
  },
  executeCaptionCommand(input: ExecuteCaptionCommandInput) {
    return electron.ipcRenderer.invoke(IPC_CHANNELS.executeCaptionCommand, input);
  },
  getSmartSessionSnapshot(input: GetSmartSessionSnapshotInput) {
    return electron.ipcRenderer.invoke(IPC_CHANNELS.getSmartSessionSnapshot, input);
  },
  executeSmartCommand(input: ExecuteSmartCommandInput) {
    return electron.ipcRenderer.invoke(IPC_CHANNELS.executeSmartCommand, input);
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
  },
  getLocalApiStatus() {
    return electron.ipcRenderer.invoke(IPC_CHANNELS.getLocalApiStatus);
  },
  setLocalApiEnabled(input: SetLocalApiEnabledInput) {
    return electron.ipcRenderer.invoke(IPC_CHANNELS.setLocalApiEnabled, input);
  },
  regenerateLocalApiToken() {
    return electron.ipcRenderer.invoke(IPC_CHANNELS.regenerateLocalApiToken);
  }
};

electron.contextBridge.exposeInMainWorld("clawcut", clawcutApi);
