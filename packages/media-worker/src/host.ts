import { randomUUID } from "node:crypto";
import { fork } from "node:child_process";
import { resolve } from "node:path";

import type {
  CreateProjectInput,
  MediaProbeResult,
  OpenProjectInput,
  ProbeAssetInput,
  ProjectWorkspaceSnapshot,
  RegisterFixtureMediaInput,
  ToolchainStatus
} from "@clawcut/ipc";

import type {
  WorkerErrorResponse,
  WorkerMethod,
  WorkerMethodMap,
  WorkerResponse
} from "./contracts";
import type { MediaWorkerClient } from "./types";

import { resolveSystemBinary, serializeError } from "./utils";

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

export interface CreateMediaWorkerHostOptions {
  workspaceRoot?: string;
  workerEntryPath?: string;
}

function resolveNodeBinary(): string {
  const resolved = process.env.CLAWCUT_NODE_BIN ?? resolveSystemBinary("node");

  if (resolved) {
    return resolved;
  }

  if (process.release.name === "node" && !process.execPath.toLowerCase().includes("electron")) {
    return process.execPath;
  }

  return "node";
}

function isWorkerErrorResponse(response: WorkerResponse): response is WorkerErrorResponse {
  return response.ok === false;
}

export function createMediaWorkerHost(
  options: CreateMediaWorkerHostOptions = {}
): MediaWorkerClient {
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const workerEntryPath =
    options.workerEntryPath ??
    resolve(workspaceRoot, "packages", "media-worker", "src", "worker.ts");

  const child = fork(workerEntryPath, {
    cwd: workspaceRoot,
    execPath: resolveNodeBinary(),
    execArgv: ["--import", "tsx"],
    stdio: ["pipe", "pipe", "pipe", "ipc"]
  });

  const pendingRequests = new Map<string, PendingRequest>();

  child.on("message", (message: WorkerResponse) => {
    const pending = pendingRequests.get(message.id);

    if (!pending) {
      return;
    }

    pendingRequests.delete(message.id);

    if (isWorkerErrorResponse(message)) {
      pending.reject(new Error(`${message.error.code}: ${message.error.message}`));
      return;
    }

    pending.resolve(message.data);
  });

  child.on("exit", (code) => {
    const error = new Error(`Media worker exited unexpectedly with code ${code ?? "unknown"}.`);

    for (const pending of pendingRequests.values()) {
      pending.reject(error);
    }

    pendingRequests.clear();
  });

  child.stderr?.on("data", (chunk: Buffer) => {
    const text = chunk.toString("utf8").trim();

    if (text) {
      process.stderr.write(`${text}\n`);
    }
  });

  async function invoke<Key extends WorkerMethod>(
    method: Key,
    payload: WorkerMethodMap[Key]["request"]
  ): Promise<WorkerMethodMap[Key]["response"]> {
    const id = randomUUID();

    return new Promise<WorkerMethodMap[Key]["response"]>((resolveRequest, rejectRequest) => {
      pendingRequests.set(id, {
        resolve: (value) => resolveRequest(value as WorkerMethodMap[Key]["response"]),
        reject: rejectRequest
      });

      child.send(
        {
          id,
          method,
          payload
        },
        (error) => {
          if (!error) {
            return;
          }

          pendingRequests.delete(id);
          rejectRequest(serializeError(error));
        }
      );
    });
  }

  return {
    detectToolchain(): Promise<ToolchainStatus> {
      return invoke("detectToolchain", null);
    },
    createProject(input: CreateProjectInput): Promise<ProjectWorkspaceSnapshot> {
      return invoke("createProject", input);
    },
    openProject(input: OpenProjectInput): Promise<ProjectWorkspaceSnapshot> {
      return invoke("openProject", input);
    },
    registerFixtureMedia(
      input: RegisterFixtureMediaInput
    ): Promise<ProjectWorkspaceSnapshot> {
      return invoke("registerFixtureMedia", input);
    },
    probeAsset(input: ProbeAssetInput): Promise<MediaProbeResult> {
      return invoke("probeAsset", input);
    },
    async dispose(): Promise<void> {
      if (child.killed) {
        return;
      }

      child.kill();
    }
  };
}
