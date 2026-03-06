import type {
  EditorCommand,
  EditorCommandResult,
  EditorHistorySummary,
  Job,
  MediaItem,
  ProjectDocumentV3,
  RelinkResult,
  Timeline
} from "@clawcut/domain";

export type ToolName = "ffmpeg" | "ffprobe";
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

export interface ClawcutApi {
  detectToolchain(): Promise<ToolchainStatus>;
  createProject(input: CreateProjectInput): Promise<ProjectWorkspaceSnapshot>;
  openProject(input: OpenProjectInput): Promise<ProjectWorkspaceSnapshot>;
  getProjectSnapshot(input: GetProjectSnapshotInput): Promise<ProjectWorkspaceSnapshot>;
  getEditorSessionSnapshot(input: GetEditorSessionSnapshotInput): Promise<EditorSessionSnapshot>;
  executeEditorCommand(input: ExecuteEditorCommandInput): Promise<ExecuteEditorCommandResult>;
  pickImportPaths(input?: PickImportPathsInput): Promise<PickImportPathsResult>;
  importMediaPaths(input: ImportMediaPathsInput): Promise<ImportMediaPathsResult>;
  refreshMediaHealth(input: RefreshMediaHealthInput): Promise<ProjectWorkspaceSnapshot>;
  relinkMediaItem(input: RelinkMediaItemInput): Promise<RelinkMediaItemResult>;
  retryJob(input: RetryJobInput): Promise<ProjectWorkspaceSnapshot>;
  probeAsset(input: ProbeAssetInput): Promise<MediaProbeResult>;
}

export const IPC_CHANNELS = {
  detectToolchain: "clawcut:detect-toolchain",
  createProject: "clawcut:create-project",
  openProject: "clawcut:open-project",
  getProjectSnapshot: "clawcut:get-project-snapshot",
  getEditorSessionSnapshot: "clawcut:get-editor-session-snapshot",
  executeEditorCommand: "clawcut:execute-editor-command",
  pickImportPaths: "clawcut:pick-import-paths",
  importMediaPaths: "clawcut:import-media-paths",
  refreshMediaHealth: "clawcut:refresh-media-health",
  relinkMediaItem: "clawcut:relink-media-item",
  retryJob: "clawcut:retry-job",
  probeAsset: "clawcut:probe-asset"
} as const;
