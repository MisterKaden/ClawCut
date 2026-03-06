import type { WorkerRequest, WorkerResponse } from "./contracts";

import {
  handleCreateProject,
  handleDetectToolchain,
  handleOpenProject,
  handleProbeAsset,
  handleRegisterFixtureMedia
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
    case "registerFixtureMedia":
      return handleRegisterFixtureMedia(message.payload);
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
