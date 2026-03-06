import type { WorkerRequest, WorkerResponse } from "./contracts";

import {
  handleCreateProject,
  handleDetectToolchain,
  handleExecuteEditorCommand,
  handleGetEditorSessionSnapshot,
  handleGetProjectSnapshot,
  handleImportMediaPaths,
  handleOpenProject,
  handleProbeAsset,
  handleRefreshMediaHealth,
  handleRelinkMediaItem,
  handleRetryJob
} from "./handlers";
import { serializeError } from "./utils";

async function dispatchRequest(message: WorkerRequest): Promise<unknown> {
  switch (message.method) {
    case "detectToolchain":
      return handleDetectToolchain();
    case "createProject":
      return handleCreateProject(message.payload);
    case "openProject":
      return handleOpenProject(message.payload);
    case "getProjectSnapshot":
      return handleGetProjectSnapshot(message.payload);
    case "getEditorSessionSnapshot":
      return handleGetEditorSessionSnapshot(message.payload);
    case "executeEditorCommand":
      return handleExecuteEditorCommand(message.payload);
    case "pickImportPaths":
      throw new Error("pickImportPaths must be handled in the Electron main process.");
    case "importMediaPaths":
      return handleImportMediaPaths(message.payload);
    case "refreshMediaHealth":
      return handleRefreshMediaHealth(message.payload);
    case "relinkMediaItem":
      return handleRelinkMediaItem(message.payload);
    case "retryJob":
      return handleRetryJob(message.payload);
    case "probeAsset":
      return handleProbeAsset(message.payload);
  }

  throw new Error("Unhandled worker method.");
}

process.on("message", async (message: WorkerRequest) => {
  const sendResponse = (response: WorkerResponse): void => {
    process.send?.(response);
  };

  try {
    const data = await dispatchRequest(message);

    sendResponse({
      id: message.id,
      ok: true,
      method: message.method,
      data
    } as WorkerResponse);
  } catch (error) {
    sendResponse({
      id: message.id,
      ok: false,
      error: serializeError(error)
    });
  }
});
