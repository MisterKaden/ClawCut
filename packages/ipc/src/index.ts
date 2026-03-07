import type {
  CaptionCommand,
  CaptionCommandResult,
  CaptionSessionSnapshot as DomainCaptionSessionSnapshot,
  EditorCommand,
  EditorCommandResult,
  EditorHistorySummary,
  ExportCommand,
  ExportCommandResult,
  ExportSessionSnapshot as DomainExportSessionSnapshot,
  Job,
  MediaItem,
  PreviewCommand,
  PreviewCommandResult,
  PreviewFrameSnapshot,
  PreviewFrameSnapshotOptions,
  PreviewState,
  ProjectDocumentV3,
  RelinkResult,
  Timeline
} from "@clawcut/domain";

export type ToolName = "ffmpeg" | "ffprobe" | "transcription";
export type ResultStatus = "ok" | "error";

export interface ToolStatus {
  name: ToolName;
  available: boolean;
  resolvedPath: string | null;
  version: string | null;
  remediationHint: string | null;
}

export interface ToolchainStatus {
  status: ResultStatus;
  tools: Record<ToolName, ToolStatus>;
}

export interface SerializedWorkerError {
  code: string;
  message: string;
  details?: string;
}

export interface MediaStreamSummary {
  index: number;
  codecType: string;
  codecName: string | null;
  durationMs: number | null;
  bitRate: number | null;
  timeBase: string | null;
  language: string | null;
  isDefault: boolean;
  width: number | null;
  height: number | null;
  pixelFormat: string | null;
  frameRate: number | null;
  rotation: number | null;
  sampleRate: number | null;
  channels: number | null;
  channelLayout: string | null;
}

export interface MediaProbeResult {
  assetPath: string;
  displayName: string;
  container: string | null;
  durationMs: number | null;
  bitRate: number | null;
  width: number | null;
  height: number | null;
  frameRate: number | null;
  pixelFormat: string | null;
  rotation: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  audioSampleRate: number | null;
  channelCount: number | null;
  streamSignature: string;
  streamCount: number;
  streams: MediaStreamSummary[];
}

export interface ProjectWorkspaceSnapshot {
  directory: string;
  projectFilePath: string;
  databasePath: string;
  cacheRoot: string;
  document: ProjectDocumentV3;
  libraryItems: MediaItem[];
  jobs: Job[];
}

export interface EditorSessionSnapshot extends ProjectWorkspaceSnapshot {
  timeline: Timeline;
  history: EditorHistorySummary;
}

export type ExportSessionSnapshot = DomainExportSessionSnapshot;
export type CaptionSessionSnapshot = DomainCaptionSessionSnapshot;

export interface CreateProjectInput {
  directory: string;
  name?: string;
}

export interface OpenProjectInput {
  directory: string;
}

export interface GetProjectSnapshotInput {
  directory: string;
}

export interface GetEditorSessionSnapshotInput {
  directory: string;
}

export interface PickImportPathsInput {
  mode?: "import" | "relink";
}

export interface PickImportPathsResult {
  paths: string[];
}

export interface ImportMediaPathsInput {
  directory: string;
  paths: string[];
}

export interface ImportMediaPathsResult {
  snapshot: ProjectWorkspaceSnapshot;
  acceptedPaths: string[];
  queuedJobIds: string[];
}

export interface RefreshMediaHealthInput {
  directory: string;
}

export interface RetryJobInput {
  directory: string;
  jobId: string;
}

export interface RelinkMediaItemInput {
  directory: string;
  mediaItemId: string;
  candidatePath: string;
}

export interface RelinkMediaItemResult {
  snapshot: ProjectWorkspaceSnapshot;
  result: RelinkResult;
}

export interface ProbeAssetInput {
  assetPath: string;
}

export interface ExecuteEditorCommandInput {
  directory: string;
  command: EditorCommand;
}

export interface ExecuteEditorCommandResult {
  snapshot: EditorSessionSnapshot;
  result: EditorCommandResult;
}

export interface GetExportSessionSnapshotInput {
  directory: string;
}

export interface ExecuteExportCommandInput {
  directory: string;
  command: ExportCommand;
}

export interface ExecuteExportCommandResult {
  snapshot: ExportSessionSnapshot;
  result: ExportCommandResult;
}

export interface GetCaptionSessionSnapshotInput {
  directory: string;
}

export interface ExecuteCaptionCommandInput {
  directory: string;
  command: CaptionCommand;
}

export interface ExecuteCaptionCommandResult {
  snapshot: CaptionSessionSnapshot;
  result: CaptionCommandResult;
}

export const LOCAL_API_SCOPES = [
  "read",
  "edit",
  "preview",
  "export",
  "transcript",
  "admin"
] as const;
export const LOCAL_API_COMMAND_NAMES = [
  "project.create",
  "project.open",
  "project.save",
  "media.import",
  "media.relink",
  "timeline.execute",
  "preview.load-project-timeline",
  "preview.execute",
  "export.execute",
  "captions.execute",
  "jobs.retry"
] as const;
export const LOCAL_API_QUERY_NAMES = [
  "system.toolchain",
  "project.snapshot",
  "timeline.session",
  "media.snapshot",
  "preview.state",
  "preview.frame-snapshot",
  "export.session",
  "captions.session",
  "jobs.list",
  "jobs.get"
] as const;

export type LocalApiScope = (typeof LOCAL_API_SCOPES)[number];
export type LocalApiCommandName = (typeof LOCAL_API_COMMAND_NAMES)[number];
export type LocalApiQueryName = (typeof LOCAL_API_QUERY_NAMES)[number];
export type LocalApiState = "starting" | "running" | "stopped" | "error";

export interface LocalApiProjectSaveInput {
  directory: string;
}

export interface LocalApiPreviewLoadProjectInput {
  directory: string;
  initialPlayheadUs?: number;
  preservePlayhead?: boolean;
}

export interface LocalApiPreviewExecuteInput {
  command: PreviewCommand;
}

export interface LocalApiPreviewFrameSnapshotInput {
  options?: PreviewFrameSnapshotOptions;
}

export interface LocalApiJobDetailsInput {
  directory: string;
  jobId: string;
}

export interface LocalApiJobDetails {
  job: Job | null;
  exportRun: ExportSessionSnapshot["exportRuns"][number] | null;
  transcriptionRun: CaptionSessionSnapshot["transcriptionRuns"][number] | null;
}

export interface LocalApiCommandInputMap {
  "project.create": CreateProjectInput;
  "project.open": OpenProjectInput;
  "project.save": LocalApiProjectSaveInput;
  "media.import": ImportMediaPathsInput;
  "media.relink": RelinkMediaItemInput;
  "timeline.execute": ExecuteEditorCommandInput;
  "preview.load-project-timeline": LocalApiPreviewLoadProjectInput;
  "preview.execute": LocalApiPreviewExecuteInput;
  "export.execute": ExecuteExportCommandInput;
  "captions.execute": ExecuteCaptionCommandInput;
  "jobs.retry": RetryJobInput;
}

export interface LocalApiCommandResultMap {
  "project.create": ProjectWorkspaceSnapshot;
  "project.open": ProjectWorkspaceSnapshot;
  "project.save": {
    directory: string;
    projectFilePath: string;
    savedAt: string;
    persistenceMode: "immediate";
  };
  "media.import": ImportMediaPathsResult;
  "media.relink": RelinkMediaItemResult;
  "timeline.execute": ExecuteEditorCommandResult;
  "preview.load-project-timeline": PreviewCommandResult;
  "preview.execute": PreviewCommandResult;
  "export.execute": ExecuteExportCommandResult;
  "captions.execute": ExecuteCaptionCommandResult;
  "jobs.retry": ProjectWorkspaceSnapshot;
}

export interface LocalApiQueryInputMap {
  "system.toolchain": Record<string, never>;
  "project.snapshot": GetProjectSnapshotInput;
  "timeline.session": GetEditorSessionSnapshotInput;
  "media.snapshot": GetProjectSnapshotInput;
  "preview.state": Record<string, never>;
  "preview.frame-snapshot": LocalApiPreviewFrameSnapshotInput;
  "export.session": GetExportSessionSnapshotInput;
  "captions.session": GetCaptionSessionSnapshotInput;
  "jobs.list": GetProjectSnapshotInput;
  "jobs.get": LocalApiJobDetailsInput;
}

export interface LocalApiQueryResultMap {
  "system.toolchain": ToolchainStatus;
  "project.snapshot": ProjectWorkspaceSnapshot;
  "timeline.session": EditorSessionSnapshot;
  "media.snapshot": {
    directory: string;
    libraryItems: MediaItem[];
    jobs: Job[];
  };
  "preview.state": PreviewState;
  "preview.frame-snapshot": PreviewFrameSnapshot;
  "export.session": ExportSessionSnapshot;
  "captions.session": CaptionSessionSnapshot;
  "jobs.list": Job[];
  "jobs.get": LocalApiJobDetails;
}

export interface LocalApiRequestLogEntry {
  requestId: string;
  operationType: "command" | "query";
  name: string;
  status: "ok" | "error";
  errorCode: string | null;
  receivedAt: string;
  durationMs: number;
}

export interface LocalApiOperationDescriptor {
  name: string;
  category: string;
  description: string;
  requiredScopes: LocalApiScope[];
  longRunning: boolean;
}

export interface LocalApiCapabilities {
  apiVersion: "v1";
  localOnly: true;
  auth: {
    required: true;
    scheme: "bearer";
    headerName: "Authorization";
    tokenPrefix: "Bearer";
    scopes: LocalApiScope[];
  };
  endpoints: {
    health: "/api/v1/health";
    capabilities: "/api/v1/capabilities";
    openClawTools: "/api/v1/openclaw/tools";
    command: "/api/v1/command";
    query: "/api/v1/query";
  };
  commands: LocalApiOperationDescriptor[];
  queries: LocalApiOperationDescriptor[];
  features: {
    project: boolean;
    media: boolean;
    timeline: boolean;
    preview: boolean;
    export: boolean;
    transcript: boolean;
    captions: boolean;
    openClawTools: boolean;
  };
}

export interface OpenClawToolDefinition {
  name: string;
  description: string;
  operationType: "command" | "query";
  apiName: string;
  requiredScopes: LocalApiScope[];
  safetyNotes: string[];
  inputSchema: {
    type: "object";
    required: string[];
    properties: Record<string, { type: string; description: string }>;
  };
  outputDescription: string;
}

export interface LocalApiStatus {
  apiVersion: "v1";
  enabled: boolean;
  state: LocalApiState;
  bindAddress: string;
  port: number | null;
  baseUrl: string | null;
  token: string;
  tokenPreview: string;
  scopes: LocalApiScope[];
  capabilities: LocalApiCapabilities;
  openClawTools: OpenClawToolDefinition[];
  recentRequests: LocalApiRequestLogEntry[];
  lastError: SerializedWorkerError | null;
}

export interface SetLocalApiEnabledInput {
  enabled: boolean;
}

export interface LocalApiEnvelopeSuccess<TData> {
  ok: true;
  apiVersion: "v1";
  requestId: string;
  name: string;
  warnings: string[];
  data: TData;
}

export interface LocalApiEnvelopeError {
  ok: false;
  apiVersion: "v1";
  requestId: string;
  name: string | null;
  warnings: string[];
  error: {
    code: string;
    message: string;
    details?: string;
    status: number;
  };
}

export type LocalApiEnvelope<TData> = LocalApiEnvelopeSuccess<TData> | LocalApiEnvelopeError;

export interface LocalApiCommandRequest<Name extends LocalApiCommandName = LocalApiCommandName> {
  name: Name;
  input: LocalApiCommandInputMap[Name];
}

export interface LocalApiQueryRequest<Name extends LocalApiQueryName = LocalApiQueryName> {
  name: Name;
  input: LocalApiQueryInputMap[Name];
}

export interface ClawcutApi {
  detectToolchain(): Promise<ToolchainStatus>;
  createProject(input: CreateProjectInput): Promise<ProjectWorkspaceSnapshot>;
  openProject(input: OpenProjectInput): Promise<ProjectWorkspaceSnapshot>;
  getProjectSnapshot(input: GetProjectSnapshotInput): Promise<ProjectWorkspaceSnapshot>;
  getEditorSessionSnapshot(input: GetEditorSessionSnapshotInput): Promise<EditorSessionSnapshot>;
  executeEditorCommand(input: ExecuteEditorCommandInput): Promise<ExecuteEditorCommandResult>;
  getExportSessionSnapshot(input: GetExportSessionSnapshotInput): Promise<ExportSessionSnapshot>;
  executeExportCommand(input: ExecuteExportCommandInput): Promise<ExecuteExportCommandResult>;
  getCaptionSessionSnapshot(input: GetCaptionSessionSnapshotInput): Promise<CaptionSessionSnapshot>;
  executeCaptionCommand(input: ExecuteCaptionCommandInput): Promise<ExecuteCaptionCommandResult>;
  pickImportPaths(input?: PickImportPathsInput): Promise<PickImportPathsResult>;
  importMediaPaths(input: ImportMediaPathsInput): Promise<ImportMediaPathsResult>;
  refreshMediaHealth(input: RefreshMediaHealthInput): Promise<ProjectWorkspaceSnapshot>;
  relinkMediaItem(input: RelinkMediaItemInput): Promise<RelinkMediaItemResult>;
  retryJob(input: RetryJobInput): Promise<ProjectWorkspaceSnapshot>;
  probeAsset(input: ProbeAssetInput): Promise<MediaProbeResult>;
  getLocalApiStatus(): Promise<LocalApiStatus>;
  setLocalApiEnabled(input: SetLocalApiEnabledInput): Promise<LocalApiStatus>;
  regenerateLocalApiToken(): Promise<LocalApiStatus>;
}

export const IPC_CHANNELS = {
  detectToolchain: "clawcut:detect-toolchain",
  createProject: "clawcut:create-project",
  openProject: "clawcut:open-project",
  getProjectSnapshot: "clawcut:get-project-snapshot",
  getEditorSessionSnapshot: "clawcut:get-editor-session-snapshot",
  executeEditorCommand: "clawcut:execute-editor-command",
  getExportSessionSnapshot: "clawcut:get-export-session-snapshot",
  executeExportCommand: "clawcut:execute-export-command",
  getCaptionSessionSnapshot: "clawcut:get-caption-session-snapshot",
  executeCaptionCommand: "clawcut:execute-caption-command",
  pickImportPaths: "clawcut:pick-import-paths",
  importMediaPaths: "clawcut:import-media-paths",
  refreshMediaHealth: "clawcut:refresh-media-health",
  relinkMediaItem: "clawcut:relink-media-item",
  retryJob: "clawcut:retry-job",
  probeAsset: "clawcut:probe-asset",
  getLocalApiStatus: "clawcut:get-local-api-status",
  setLocalApiEnabled: "clawcut:set-local-api-enabled",
  regenerateLocalApiToken: "clawcut:regenerate-local-api-token"
} as const;
