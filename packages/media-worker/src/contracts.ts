import type {
  CreateProjectInput,
  MediaProbeResult,
  OpenProjectInput,
  ProbeAssetInput,
  ProjectWorkspaceSnapshot,
  RegisterFixtureMediaInput,
  SerializedWorkerError,
  ToolchainStatus
} from "@clawcut/ipc";

export interface WorkerMethodMap {
  detectToolchain: {
    request: null;
    response: ToolchainStatus;
  };
  createProject: {
    request: CreateProjectInput;
    response: ProjectWorkspaceSnapshot;
  };
  openProject: {
    request: OpenProjectInput;
    response: ProjectWorkspaceSnapshot;
  };
  registerFixtureMedia: {
    request: RegisterFixtureMediaInput;
    response: ProjectWorkspaceSnapshot;
  };
  probeAsset: {
    request: ProbeAssetInput;
    response: MediaProbeResult;
  };
}

export type WorkerMethod = keyof WorkerMethodMap;

export type WorkerRequest = {
  [Key in WorkerMethod]: {
    id: string;
    method: Key;
    payload: WorkerMethodMap[Key]["request"];
  };
}[WorkerMethod];

export type WorkerSuccessResponse = {
  [Key in WorkerMethod]: {
    id: string;
    ok: true;
    method: Key;
    data: WorkerMethodMap[Key]["response"];
  };
}[WorkerMethod];

export interface WorkerErrorResponse {
  id: string;
  ok: false;
  error: SerializedWorkerError;
}

export type WorkerResponse = WorkerSuccessResponse | WorkerErrorResponse;
