import type { ProjectDocumentV1 } from "@clawcut/domain";

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
  width: number | null;
  height: number | null;
  sampleRate: number | null;
  channels: number | null;
}

export interface MediaProbeResult {
  assetPath: string;
  displayName: string;
  container: string | null;
  durationMs: number | null;
  bitRate: number | null;
  width: number | null;
  height: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  streamCount: number;
  streams: MediaStreamSummary[];
}

export interface IndexedMediaAsset {
  assetId: string;
  label: string;
  originalPath: string;
  sourceType: "fixture" | "import";
  fixtureId?: string;
  addedAt: string;
  probe: MediaProbeResult | null;
}

export interface ProjectWorkspaceSnapshot {
  directory: string;
  projectFilePath: string;
  databasePath: string;
  document: ProjectDocumentV1;
  indexedMedia: IndexedMediaAsset[];
}

export interface CreateProjectInput {
  directory: string;
  name?: string;
}

export interface OpenProjectInput {
  directory: string;
}

export interface RegisterFixtureMediaInput {
  directory: string;
  fixtureId: "talking-head-sample";
}

export interface ProbeAssetInput {
  assetPath: string;
}

export interface ClawcutApi {
  detectToolchain(): Promise<ToolchainStatus>;
  createProject(input: CreateProjectInput): Promise<ProjectWorkspaceSnapshot>;
  openProject(input: OpenProjectInput): Promise<ProjectWorkspaceSnapshot>;
  registerFixtureMedia(input: RegisterFixtureMediaInput): Promise<ProjectWorkspaceSnapshot>;
  probeAsset(input: ProbeAssetInput): Promise<MediaProbeResult>;
}

export const IPC_CHANNELS = {
  detectToolchain: "clawcut:detect-toolchain",
  createProject: "clawcut:create-project",
  openProject: "clawcut:open-project",
  registerFixtureMedia: "clawcut:register-fixture-media",
  probeAsset: "clawcut:probe-asset"
} as const;
