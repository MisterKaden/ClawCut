import { randomUUID } from "node:crypto";
import { fork } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, resolve } from "node:path";

import type {
  CaptionSessionSnapshot,
  CreateProjectInput,
  ExecuteCaptionCommandInput,
  ExecuteCaptionCommandResult,
  ExecuteExportCommandInput,
  ExecuteExportCommandResult,
  ExecuteEditorCommandInput,
  ExecuteEditorCommandResult,
  ExecuteSmartCommandInput,
  ExecuteSmartCommandResult,
  ExecuteWorkflowCommandInput,
  ExecuteWorkflowCommandResult,
  ExportSessionSnapshot,
  EditorSessionSnapshot,
  GetProjectSnapshotInput,
  GetEditorSessionSnapshotInput,
  GetExportSessionSnapshotInput,
  ImportMediaPathsInput,
  ImportMediaPathsResult,
  MediaProbeResult,
  OpenProjectInput,
  PickImportPathsResult,
  ProbeAssetInput,
  RefreshMediaHealthInput,
  RelinkMediaItemInput,
  RelinkMediaItemResult,
  RetryJobInput,
  ProjectWorkspaceSnapshot,
  GetCaptionSessionSnapshotInput,
  GetSmartSessionSnapshotInput,
  GetWorkflowSessionSnapshotInput,
  SmartSessionSnapshot,
  WorkflowSessionSnapshot,
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

export class MediaWorkerHostError extends Error {
  public readonly code: string;
  public readonly details?: string;

  constructor(code: string, message: string, details?: string) {
    super(message);
    this.name = "MediaWorkerHostError";
    this.code = code;
    this.details = details;
  }
}

export interface CreateMediaWorkerHostOptions {
  workspaceRoot?: string;
  workerEntryPath?: string;
  userDataPath?: string;
}

export interface MediaWorkerLaunchConfig {
  workerEntryPath: string;
  execPath?: string;
  execArgv?: string[];
  env?: NodeJS.ProcessEnv;
}

function isTypeScriptWorkerEntry(entryPath: string): boolean {
  return entryPath.endsWith(".ts") || entryPath.endsWith(".tsx");
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

export function resolveMediaWorkerLaunchConfig(
  options: CreateMediaWorkerHostOptions = {}
): MediaWorkerLaunchConfig {
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const packageNodePaths = [
    resolve(workspaceRoot, "node_modules"),
    resolve(workspaceRoot, "packages", "media-worker", "node_modules")
  ];
  const nodePath = [...packageNodePaths, process.env.NODE_PATH].filter(Boolean).join(delimiter);
  const explicitEntryPath = options.workerEntryPath;
  const extraEnv = options.userDataPath
    ? {
        CLAWCUT_USER_DATA_PATH: options.userDataPath
      }
    : {};

  if (explicitEntryPath) {
    return isTypeScriptWorkerEntry(explicitEntryPath)
      ? {
          workerEntryPath: explicitEntryPath,
          execPath: resolveNodeBinary(),
          execArgv: ["--import", "tsx"],
          env: {
            ...process.env,
            ...extraEnv,
            NODE_PATH: nodePath
          }
        }
      : {
          workerEntryPath: explicitEntryPath,
          execPath: resolveNodeBinary(),
          env: {
            ...process.env,
            ...extraEnv,
            NODE_PATH: nodePath
          }
        };
  }

  const builtWorkerEntryPath = resolve(
    workspaceRoot,
    "apps",
    "desktop",
    "out",
    "media-worker",
    "worker.cjs"
  );

  if (existsSync(builtWorkerEntryPath)) {
    return {
      workerEntryPath: builtWorkerEntryPath,
      execPath: resolveNodeBinary(),
      env: {
        ...process.env,
        ...extraEnv,
        NODE_PATH: nodePath
      }
    };
  }

  return {
    workerEntryPath: resolve(workspaceRoot, "packages", "media-worker", "src", "worker.ts"),
    execPath: resolveNodeBinary(),
    execArgv: ["--import", "tsx"],
    env: {
      ...process.env,
      ...extraEnv,
      NODE_PATH: nodePath
    }
  };
}

export function createMediaWorkerHost(
  options: CreateMediaWorkerHostOptions = {}
): MediaWorkerClient {
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const launchConfig = resolveMediaWorkerLaunchConfig(options);

  const child = fork(launchConfig.workerEntryPath, {
    cwd: workspaceRoot,
    execPath: launchConfig.execPath,
    execArgv: launchConfig.execArgv,
    env: launchConfig.env,
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
      pending.reject(
        new MediaWorkerHostError(
          message.error.code,
          message.error.message,
          message.error.details
        )
      );
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
    getProjectSnapshot(input: GetProjectSnapshotInput): Promise<ProjectWorkspaceSnapshot> {
      return invoke("getProjectSnapshot", input);
    },
    getEditorSessionSnapshot(
      input: GetEditorSessionSnapshotInput
    ): Promise<EditorSessionSnapshot> {
      return invoke("getEditorSessionSnapshot", input);
    },
    executeEditorCommand(
      input: ExecuteEditorCommandInput
    ): Promise<ExecuteEditorCommandResult> {
      return invoke("executeEditorCommand", input);
    },
    getExportSessionSnapshot(
      input: GetExportSessionSnapshotInput
    ): Promise<ExportSessionSnapshot> {
      return invoke("getExportSessionSnapshot", input);
    },
    executeExportCommand(
      input: ExecuteExportCommandInput
    ): Promise<ExecuteExportCommandResult> {
      return invoke("executeExportCommand", input);
    },
    getCaptionSessionSnapshot(
      input: GetCaptionSessionSnapshotInput
    ): Promise<CaptionSessionSnapshot> {
      return invoke("getCaptionSessionSnapshot", input);
    },
    executeCaptionCommand(
      input: ExecuteCaptionCommandInput
    ): Promise<ExecuteCaptionCommandResult> {
      return invoke("executeCaptionCommand", input);
    },
    getSmartSessionSnapshot(
      input: GetSmartSessionSnapshotInput
    ): Promise<SmartSessionSnapshot> {
      return invoke("getSmartSessionSnapshot", input);
    },
    executeSmartCommand(
      input: ExecuteSmartCommandInput
    ): Promise<ExecuteSmartCommandResult> {
      return invoke("executeSmartCommand", input);
    },
    getWorkflowSessionSnapshot(
      input: GetWorkflowSessionSnapshotInput
    ): Promise<WorkflowSessionSnapshot> {
      return invoke("getWorkflowSessionSnapshot", input);
    },
    executeWorkflowCommand(
      input: ExecuteWorkflowCommandInput
    ): Promise<ExecuteWorkflowCommandResult> {
      return invoke("executeWorkflowCommand", input);
    },
    pickImportPaths(): Promise<PickImportPathsResult> {
      throw new Error("pickImportPaths is handled in the Electron main process.");
    },
    importMediaPaths(input: ImportMediaPathsInput): Promise<ImportMediaPathsResult> {
      return invoke("importMediaPaths", input);
    },
    refreshMediaHealth(input: RefreshMediaHealthInput): Promise<ProjectWorkspaceSnapshot> {
      return invoke("refreshMediaHealth", input);
    },
    relinkMediaItem(input: RelinkMediaItemInput): Promise<RelinkMediaItemResult> {
      return invoke("relinkMediaItem", input);
    },
    retryJob(input: RetryJobInput): Promise<ProjectWorkspaceSnapshot> {
      return invoke("retryJob", input);
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
