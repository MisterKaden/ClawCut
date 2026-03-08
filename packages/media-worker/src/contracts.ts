import type {
  CaptionSessionSnapshot,
  CreateProjectInput,
  DiagnosticsSessionSnapshot,
  ExecuteDiagnosticsActionInput,
  ExecuteDiagnosticsActionResult,
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
  GetCaptionSessionSnapshotInput,
  GetDiagnosticsSessionSnapshotInput,
  GetProjectSnapshotInput,
  GetEditorSessionSnapshotInput,
  GetExportSessionSnapshotInput,
  GetSmartSessionSnapshotInput,
  GetWorkflowSessionSnapshotInput,
  ImportMediaPathsInput,
  MediaProbeResult,
  OpenProjectInput,
  PickImportPathsInput,
  PickImportPathsResult,
  ProbeAssetInput,
  ProjectWorkspaceSnapshot,
  RefreshMediaHealthInput,
  RelinkMediaItemInput,
  RelinkMediaItemResult,
  RetryJobInput,
  SerializedWorkerError,
  SmartSessionSnapshot,
  WorkflowSessionSnapshot,
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
  getProjectSnapshot: {
    request: GetProjectSnapshotInput;
    response: ProjectWorkspaceSnapshot;
  };
  getEditorSessionSnapshot: {
    request: GetEditorSessionSnapshotInput;
    response: EditorSessionSnapshot;
  };
  executeEditorCommand: {
    request: ExecuteEditorCommandInput;
    response: ExecuteEditorCommandResult;
  };
  getExportSessionSnapshot: {
    request: GetExportSessionSnapshotInput;
    response: ExportSessionSnapshot;
  };
  executeExportCommand: {
    request: ExecuteExportCommandInput;
    response: ExecuteExportCommandResult;
  };
  getCaptionSessionSnapshot: {
    request: GetCaptionSessionSnapshotInput;
    response: CaptionSessionSnapshot;
  };
  executeCaptionCommand: {
    request: ExecuteCaptionCommandInput;
    response: ExecuteCaptionCommandResult;
  };
  getSmartSessionSnapshot: {
    request: GetSmartSessionSnapshotInput;
    response: SmartSessionSnapshot;
  };
  executeSmartCommand: {
    request: ExecuteSmartCommandInput;
    response: ExecuteSmartCommandResult;
  };
  getWorkflowSessionSnapshot: {
    request: GetWorkflowSessionSnapshotInput;
    response: WorkflowSessionSnapshot;
  };
  executeWorkflowCommand: {
    request: ExecuteWorkflowCommandInput;
    response: ExecuteWorkflowCommandResult;
  };
  getDiagnosticsSessionSnapshot: {
    request: GetDiagnosticsSessionSnapshotInput;
    response: DiagnosticsSessionSnapshot;
  };
  executeDiagnosticsAction: {
    request: ExecuteDiagnosticsActionInput;
    response: ExecuteDiagnosticsActionResult;
  };
  pickImportPaths: {
    request: PickImportPathsInput | null;
    response: PickImportPathsResult;
  };
  importMediaPaths: {
    request: ImportMediaPathsInput;
    response: { snapshot: ProjectWorkspaceSnapshot; acceptedPaths: string[]; queuedJobIds: string[] };
  };
  refreshMediaHealth: {
    request: RefreshMediaHealthInput;
    response: ProjectWorkspaceSnapshot;
  };
  relinkMediaItem: {
    request: RelinkMediaItemInput;
    response: RelinkMediaItemResult;
  };
  retryJob: {
    request: RetryJobInput;
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
