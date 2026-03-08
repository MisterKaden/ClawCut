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
  type OpenProjectInput,
  type ProbeAssetInput,
  type RefreshMediaHealthInput,
  type RelinkMediaItemInput,
  type RetryJobInput,
  type SetLocalApiEnabledInput
} from "@clawcut/ipc";

export function registerIpcHandlers(api: ClawcutApi): void {
  const { BrowserWindow, dialog, ipcMain } = electron;
  ipcMain.handle(IPC_CHANNELS.detectToolchain, async () => api.detectToolchain());
  ipcMain.handle(IPC_CHANNELS.createProject, async (_event, input: CreateProjectInput) =>
    api.createProject(input)
  );
  ipcMain.handle(IPC_CHANNELS.openProject, async (_event, input: OpenProjectInput) =>
    api.openProject(input)
  );
  ipcMain.handle(
    IPC_CHANNELS.getProjectSnapshot,
    async (_event, input: GetProjectSnapshotInput) => api.getProjectSnapshot(input)
  );
  ipcMain.handle(
    IPC_CHANNELS.getEditorSessionSnapshot,
    async (_event, input: GetEditorSessionSnapshotInput) => api.getEditorSessionSnapshot(input)
  );
  ipcMain.handle(
    IPC_CHANNELS.executeEditorCommand,
    async (_event, input: ExecuteEditorCommandInput) => api.executeEditorCommand(input)
  );
  ipcMain.handle(
    IPC_CHANNELS.getExportSessionSnapshot,
    async (_event, input: GetExportSessionSnapshotInput) => api.getExportSessionSnapshot(input)
  );
  ipcMain.handle(
    IPC_CHANNELS.executeExportCommand,
    async (_event, input: ExecuteExportCommandInput) => api.executeExportCommand(input)
  );
  ipcMain.handle(
    IPC_CHANNELS.getCaptionSessionSnapshot,
    async (_event, input: GetCaptionSessionSnapshotInput) => api.getCaptionSessionSnapshot(input)
  );
  ipcMain.handle(
    IPC_CHANNELS.executeCaptionCommand,
    async (_event, input: ExecuteCaptionCommandInput) => api.executeCaptionCommand(input)
  );
  ipcMain.handle(
    IPC_CHANNELS.getSmartSessionSnapshot,
    async (_event, input: GetSmartSessionSnapshotInput) => api.getSmartSessionSnapshot(input)
  );
  ipcMain.handle(
    IPC_CHANNELS.executeSmartCommand,
    async (_event, input: ExecuteSmartCommandInput) => api.executeSmartCommand(input)
  );
  ipcMain.handle(
    IPC_CHANNELS.pickImportPaths,
    async (_event, input?: { mode?: "import" | "relink" }) => {
      const browserWindow = BrowserWindow.getFocusedWindow();
      const properties: electron.OpenDialogOptions["properties"] =
        input?.mode === "relink"
          ? ["openFile"]
          : ["openFile", "openDirectory", "multiSelections"];
      const options: electron.OpenDialogOptions = {
        title: input?.mode === "relink" ? "Relink missing media" : "Import media",
        properties
      };
      const result = browserWindow
        ? await dialog.showOpenDialog(browserWindow, options)
        : await dialog.showOpenDialog(options);

      return {
        paths: result.canceled ? [] : result.filePaths
      };
    }
  );
  ipcMain.handle(
    IPC_CHANNELS.importMediaPaths,
    async (_event, input: ImportMediaPathsInput) => api.importMediaPaths(input)
  );
  ipcMain.handle(
    IPC_CHANNELS.refreshMediaHealth,
    async (_event, input: RefreshMediaHealthInput) => api.refreshMediaHealth(input)
  );
  ipcMain.handle(
    IPC_CHANNELS.relinkMediaItem,
    async (_event, input: RelinkMediaItemInput) => api.relinkMediaItem(input)
  );
  ipcMain.handle(IPC_CHANNELS.retryJob, async (_event, input: RetryJobInput) =>
    api.retryJob(input)
  );
  ipcMain.handle(IPC_CHANNELS.probeAsset, async (_event, input: ProbeAssetInput) =>
    api.probeAsset(input)
  );
  ipcMain.handle(IPC_CHANNELS.getLocalApiStatus, async () => api.getLocalApiStatus());
  ipcMain.handle(
    IPC_CHANNELS.setLocalApiEnabled,
    async (_event, input: SetLocalApiEnabledInput) => api.setLocalApiEnabled(input)
  );
  ipcMain.handle(IPC_CHANNELS.regenerateLocalApiToken, async () =>
    api.regenerateLocalApiToken()
  );
}
