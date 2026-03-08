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
  SmartCommand,
  SmartCommandResult,
  SmartSessionSnapshot as DomainSmartSessionSnapshot,
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
export type SmartSessionSnapshot = DomainSmartSessionSnapshot;

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

export interface GetSmartSessionSnapshotInput {
  directory: string;
}

export interface ExecuteSmartCommandInput {
  directory: string;
  command: SmartCommand;
}

export interface ExecuteSmartCommandResult {
  snapshot: SmartSessionSnapshot;
  result: SmartCommandResult;
}

export type LocalApiOperationKind = "command" | "query";
export type LocalApiSafetyClass = "read-only" | "mutating" | "high-impact";
export type LocalApiMutabilityClass = "read" | "write";
export type LocalApiExecutionMode = "sync" | "job";
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
  "timeline.create",
  "timeline.addTrack",
  "timeline.insertClip",
  "timeline.insertLinkedMedia",
  "timeline.splitClip",
  "timeline.trimClipStart",
  "timeline.trimClipEnd",
  "timeline.moveClip",
  "timeline.rippleDeleteClip",
  "timeline.lockTrack",
  "timeline.unlockTrack",
  "timeline.setPlayhead",
  "timeline.undo",
  "timeline.redo",
  "preview.loadTimeline",
  "preview.play",
  "preview.pause",
  "preview.seek",
  "preview.stepForward",
  "preview.stepBackward",
  "preview.setQuality",
  "transcript.transcribeClip",
  "transcript.updateSegment",
  "captions.generateTrack",
  "captions.regenerateTrack",
  "captions.applyTemplate",
  "captions.updateSegment",
  "captions.exportSubtitles",
  "captions.setBurnIn",
  "smart.analyzeSilence",
  "smart.analyzeWeakSegments",
  "smart.findFillerWords",
  "smart.generateHighlights",
  "smart.compilePlan",
  "smart.applySuggestion",
  "smart.applySuggestionSet",
  "smart.rejectSuggestion",
  "smart.seekPreviewToSuggestion",
  "export.createRequest",
  "export.compilePlan",
  "export.start",
  "export.captureSnapshot",
  "export.cancel",
  "export.retry",
  "jobs.retry",
  "jobs.cancel"
] as const;
export const LOCAL_API_QUERY_NAMES = [
  "system.toolchain",
  "project.summary",
  "project.snapshot",
  "media.list",
  "media.inspect",
  "timeline.get",
  "preview.state",
  "preview.frame-snapshot",
  "preview.frame-reference",
  "export.session",
  "transcript.get",
  "captions.session",
  "captions.track",
  "smart.session",
  "smart.suggestionSet",
  "smart.suggestion",
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

export interface LocalApiPreviewFrameReference {
  status: PreviewFrameSnapshot["status"];
  timelineId: string | null;
  playheadUs: number;
  clipId: string | null;
  sourceMode: PreviewFrameSnapshot["sourceMode"];
  mimeType: string | null;
  width: number | null;
  height: number | null;
  hasImageData: boolean;
  warning: string | null;
  error: PreviewFrameSnapshot["error"];
}

export interface LocalApiJobDetailsInput {
  directory: string;
  jobId: string;
}

export interface LocalApiProjectSummary {
  directory: string;
  projectFilePath: string;
  projectName: string;
  timelineId: string;
  mediaItemCount: number;
  jobCount: number;
  transcriptCount: number;
  captionTrackCount: number;
  exportRunCount: number;
}

export interface LocalApiJobDetails {
  job: Job | null;
  exportRun: ExportSessionSnapshot["exportRuns"][number] | null;
  transcriptionRun: CaptionSessionSnapshot["transcriptionRuns"][number] | null;
}

export interface LocalApiMediaInspectInput {
  directory: string;
  mediaItemId: string;
}

export interface LocalApiTranscriptGetInput {
  directory: string;
  transcriptId: string;
}

export interface LocalApiCaptionTrackGetInput {
  directory: string;
  captionTrackId: string;
}

export interface LocalApiSmartSuggestionSetGetInput {
  directory: string;
  suggestionSetId: string;
}

export interface LocalApiSmartSuggestionGetInput {
  directory: string;
  suggestionSetId: string;
  suggestionId: string;
}

export interface LocalApiSmartSuggestionPreviewInput extends LocalApiSmartSuggestionGetInput {
  anchor?: "start" | "midpoint" | "end";
}

export interface LocalApiSmartSuggestionPreviewResult {
  suggestionSetId: string;
  suggestionId: string;
  positionUs: number;
  loadedTimeline: boolean;
  preview: PreviewCommandResult;
}

type EditorCommandByType<Type extends EditorCommand["type"]> = Extract<EditorCommand, { type: Type }>;
type PreviewCommandByType<Type extends PreviewCommand["type"]> = Extract<PreviewCommand, { type: Type }>;
type ExportCommandByType<Type extends ExportCommand["type"]> = Extract<ExportCommand, { type: Type }>;
type CaptionCommandByType<Type extends CaptionCommand["type"]> = Extract<CaptionCommand, { type: Type }>;
type SmartCommandByType<Type extends SmartCommand["type"]> = Extract<SmartCommand, { type: Type }>;

type LocalApiEditorOperationInput<Type extends EditorCommand["type"]> = {
  directory: string;
} & Omit<EditorCommandByType<Type>, "type">;
type LocalApiPreviewOperationInput<Type extends PreviewCommand["type"]> = Omit<
  PreviewCommandByType<Type>,
  "type"
>;
type LocalApiExportOperationInput<Type extends ExportCommand["type"]> = {
  directory: string;
} & Omit<ExportCommandByType<Type>, "type">;
type LocalApiCaptionOperationInput<Type extends CaptionCommand["type"]> = {
  directory: string;
} & Omit<CaptionCommandByType<Type>, "type">;
type LocalApiSmartOperationInput<Type extends SmartCommand["type"]> = {
  directory: string;
} & Omit<SmartCommandByType<Type>, "type">;

export interface LocalApiJobCancelInput {
  directory: string;
  jobId: string;
}

export interface LocalApiCommandInputMap {
  "project.create": CreateProjectInput;
  "project.open": OpenProjectInput;
  "project.save": LocalApiProjectSaveInput;
  "media.import": ImportMediaPathsInput;
  "media.relink": RelinkMediaItemInput;
  "timeline.create": LocalApiEditorOperationInput<"CreateTimeline">;
  "timeline.addTrack": LocalApiEditorOperationInput<"AddTrack">;
  "timeline.insertClip": LocalApiEditorOperationInput<"InsertClip">;
  "timeline.insertLinkedMedia": LocalApiEditorOperationInput<"InsertLinkedMedia">;
  "timeline.splitClip": LocalApiEditorOperationInput<"SplitClip">;
  "timeline.trimClipStart": LocalApiEditorOperationInput<"TrimClipStart">;
  "timeline.trimClipEnd": LocalApiEditorOperationInput<"TrimClipEnd">;
  "timeline.moveClip": LocalApiEditorOperationInput<"MoveClip">;
  "timeline.rippleDeleteClip": LocalApiEditorOperationInput<"RippleDeleteClip">;
  "timeline.lockTrack": LocalApiEditorOperationInput<"LockTrack">;
  "timeline.unlockTrack": LocalApiEditorOperationInput<"UnlockTrack">;
  "timeline.setPlayhead": LocalApiEditorOperationInput<"SetPlayhead">;
  "timeline.undo": LocalApiEditorOperationInput<"Undo">;
  "timeline.redo": LocalApiEditorOperationInput<"Redo">;
  "preview.loadTimeline": LocalApiPreviewLoadProjectInput;
  "preview.play": LocalApiPreviewOperationInput<"PlayPreview">;
  "preview.pause": LocalApiPreviewOperationInput<"PausePreview">;
  "preview.seek": LocalApiPreviewOperationInput<"SeekPreview">;
  "preview.stepForward": LocalApiPreviewOperationInput<"StepPreviewFrameForward">;
  "preview.stepBackward": LocalApiPreviewOperationInput<"StepPreviewFrameBackward">;
  "preview.setQuality": LocalApiPreviewOperationInput<"SetPreviewQuality">;
  "transcript.transcribeClip": LocalApiCaptionOperationInput<"TranscribeClip">;
  "transcript.updateSegment": LocalApiCaptionOperationInput<"UpdateTranscriptSegment">;
  "captions.generateTrack": LocalApiCaptionOperationInput<"GenerateCaptionTrack">;
  "captions.regenerateTrack": LocalApiCaptionOperationInput<"RegenerateCaptionTrack">;
  "captions.applyTemplate": LocalApiCaptionOperationInput<"ApplyCaptionTemplate">;
  "captions.updateSegment": LocalApiCaptionOperationInput<"UpdateCaptionSegment">;
  "captions.exportSubtitles": LocalApiCaptionOperationInput<"ExportSubtitleFile">;
  "captions.setBurnIn": LocalApiCaptionOperationInput<"EnableBurnInCaptionsForExport">;
  "smart.analyzeSilence": LocalApiSmartOperationInput<"AnalyzeSilence">;
  "smart.analyzeWeakSegments": LocalApiSmartOperationInput<"AnalyzeWeakSegments">;
  "smart.findFillerWords": LocalApiSmartOperationInput<"FindFillerWords">;
  "smart.generateHighlights": LocalApiSmartOperationInput<"GenerateHighlightSuggestions">;
  "smart.compilePlan": LocalApiSmartOperationInput<"CompileEditPlan">;
  "smart.applySuggestion": LocalApiSmartOperationInput<"ApplySuggestion">;
  "smart.applySuggestionSet": LocalApiSmartOperationInput<"ApplySuggestionSet">;
  "smart.rejectSuggestion": LocalApiSmartOperationInput<"RejectSuggestion">;
  "smart.seekPreviewToSuggestion": LocalApiSmartSuggestionPreviewInput;
  "export.createRequest": LocalApiExportOperationInput<"CreateExportRequest">;
  "export.compilePlan": LocalApiExportOperationInput<"CompileRenderPlan">;
  "export.start": LocalApiExportOperationInput<"StartExport">;
  "export.captureSnapshot": LocalApiExportOperationInput<"CaptureExportSnapshot">;
  "export.cancel": LocalApiExportOperationInput<"CancelExport">;
  "export.retry": LocalApiExportOperationInput<"RetryExport">;
  "jobs.retry": RetryJobInput;
  "jobs.cancel": LocalApiJobCancelInput;
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
  "timeline.create": ExecuteEditorCommandResult;
  "timeline.addTrack": ExecuteEditorCommandResult;
  "timeline.insertClip": ExecuteEditorCommandResult;
  "timeline.insertLinkedMedia": ExecuteEditorCommandResult;
  "timeline.splitClip": ExecuteEditorCommandResult;
  "timeline.trimClipStart": ExecuteEditorCommandResult;
  "timeline.trimClipEnd": ExecuteEditorCommandResult;
  "timeline.moveClip": ExecuteEditorCommandResult;
  "timeline.rippleDeleteClip": ExecuteEditorCommandResult;
  "timeline.lockTrack": ExecuteEditorCommandResult;
  "timeline.unlockTrack": ExecuteEditorCommandResult;
  "timeline.setPlayhead": ExecuteEditorCommandResult;
  "timeline.undo": ExecuteEditorCommandResult;
  "timeline.redo": ExecuteEditorCommandResult;
  "preview.loadTimeline": PreviewCommandResult;
  "preview.play": PreviewCommandResult;
  "preview.pause": PreviewCommandResult;
  "preview.seek": PreviewCommandResult;
  "preview.stepForward": PreviewCommandResult;
  "preview.stepBackward": PreviewCommandResult;
  "preview.setQuality": PreviewCommandResult;
  "transcript.transcribeClip": ExecuteCaptionCommandResult;
  "transcript.updateSegment": ExecuteCaptionCommandResult;
  "captions.generateTrack": ExecuteCaptionCommandResult;
  "captions.regenerateTrack": ExecuteCaptionCommandResult;
  "captions.applyTemplate": ExecuteCaptionCommandResult;
  "captions.updateSegment": ExecuteCaptionCommandResult;
  "captions.exportSubtitles": ExecuteCaptionCommandResult;
  "captions.setBurnIn": ExecuteCaptionCommandResult;
  "smart.analyzeSilence": ExecuteSmartCommandResult;
  "smart.analyzeWeakSegments": ExecuteSmartCommandResult;
  "smart.findFillerWords": ExecuteSmartCommandResult;
  "smart.generateHighlights": ExecuteSmartCommandResult;
  "smart.compilePlan": ExecuteSmartCommandResult;
  "smart.applySuggestion": ExecuteSmartCommandResult;
  "smart.applySuggestionSet": ExecuteSmartCommandResult;
  "smart.rejectSuggestion": ExecuteSmartCommandResult;
  "smart.seekPreviewToSuggestion": LocalApiSmartSuggestionPreviewResult;
  "export.createRequest": ExecuteExportCommandResult;
  "export.compilePlan": ExecuteExportCommandResult;
  "export.start": ExecuteExportCommandResult;
  "export.captureSnapshot": ExecuteExportCommandResult;
  "export.cancel": ExecuteExportCommandResult;
  "export.retry": ExecuteExportCommandResult;
  "jobs.retry": ProjectWorkspaceSnapshot;
  "jobs.cancel": ExecuteExportCommandResult;
}

export interface LocalApiQueryInputMap {
  "system.toolchain": Record<string, never>;
  "project.summary": GetProjectSnapshotInput;
  "project.snapshot": GetProjectSnapshotInput;
  "media.list": GetProjectSnapshotInput;
  "media.inspect": LocalApiMediaInspectInput;
  "timeline.get": GetEditorSessionSnapshotInput;
  "preview.state": Record<string, never>;
  "preview.frame-snapshot": LocalApiPreviewFrameSnapshotInput;
  "preview.frame-reference": LocalApiPreviewFrameSnapshotInput;
  "export.session": GetExportSessionSnapshotInput;
  "transcript.get": LocalApiTranscriptGetInput;
  "captions.session": GetCaptionSessionSnapshotInput;
  "captions.track": LocalApiCaptionTrackGetInput;
  "smart.session": GetSmartSessionSnapshotInput;
  "smart.suggestionSet": LocalApiSmartSuggestionSetGetInput;
  "smart.suggestion": LocalApiSmartSuggestionGetInput;
  "jobs.list": GetProjectSnapshotInput;
  "jobs.get": LocalApiJobDetailsInput;
}

export interface LocalApiQueryResultMap {
  "system.toolchain": ToolchainStatus;
  "project.summary": LocalApiProjectSummary;
  "project.snapshot": ProjectWorkspaceSnapshot;
  "media.list": {
    directory: string;
    libraryItems: MediaItem[];
    jobs: Job[];
  };
  "media.inspect": MediaItem | null;
  "timeline.get": EditorSessionSnapshot;
  "preview.state": PreviewState;
  "preview.frame-snapshot": PreviewFrameSnapshot;
  "preview.frame-reference": LocalApiPreviewFrameReference;
  "export.session": ExportSessionSnapshot;
  "transcript.get": CaptionCommandResult;
  "captions.session": CaptionSessionSnapshot;
  "captions.track": CaptionCommandResult;
  "smart.session": SmartSessionSnapshot;
  "smart.suggestionSet": SmartCommandResult;
  "smart.suggestion": SmartCommandResult;
  "jobs.list": Job[];
  "jobs.get": LocalApiJobDetails;
}

export interface LocalApiSchemaProperty {
  type: string;
  description: string;
  enum?: string[];
  nullable?: boolean;
  items?: LocalApiSchemaProperty;
  properties?: Record<string, LocalApiSchemaProperty>;
  required?: string[];
}

export interface LocalApiObjectSchema extends LocalApiSchemaProperty {
  type: "object";
  required: string[];
  properties: Record<string, LocalApiSchemaProperty>;
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
  kind: LocalApiOperationKind;
  category: string;
  description: string;
  requiredScopes: LocalApiScope[];
  safetyClass: LocalApiSafetyClass;
  mutability: LocalApiMutabilityClass;
  execution: LocalApiExecutionMode;
  returnsJob: boolean;
  longRunning: boolean;
  inputSchema: LocalApiObjectSchema;
  outputDescription: string;
  legacyNames?: string[];
}

export interface LocalApiCapabilities {
  apiVersion: "v1";
  protocolVersion: "1";
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
    openClawManifest: "/api/v1/openclaw/manifest";
    command: "/api/v1/command";
    query: "/api/v1/query";
    events: "/api/v1/events";
  };
  commands: LocalApiOperationDescriptor[];
  queries: LocalApiOperationDescriptor[];
  features: {
    localControlTransport: boolean;
    openClawPlugin: boolean;
    project: boolean;
    media: boolean;
    timeline: boolean;
    preview: boolean;
    previewInspection: boolean;
    export: boolean;
    transcript: boolean;
    captions: boolean;
    smartEditing: boolean;
    jobs: boolean;
    openClawTools: boolean;
    openClawManifest: boolean;
    eventStream: boolean;
  };
}

export interface OpenClawToolDefinition {
  name: string;
  category: string;
  description: string;
  operationType: "command" | "query";
  operationName: string;
  requiredScopes: LocalApiScope[];
  safetyClass: LocalApiSafetyClass;
  mutability: LocalApiMutabilityClass;
  execution: LocalApiExecutionMode;
  returnsJob: boolean;
  longRunning: boolean;
  availableByDefault: boolean;
  safetyNotes: string[];
  inputSchema: LocalApiObjectSchema;
  outputDescription: string;
}

export interface OpenClawToolManifest {
  manifestVersion: "1";
  apiVersion: "v1";
  protocolVersion: "1";
  generatedAt: string;
  localOnly: true;
  auth: LocalApiCapabilities["auth"];
  capabilityAvailability: LocalApiCapabilities["features"];
  toolExposure: {
    defaultEnabled: string[];
    optionalAllowlist: string[];
  };
  endpoints: Pick<
    LocalApiCapabilities["endpoints"],
    "capabilities" | "openClawTools" | "openClawManifest" | "command" | "query" | "events"
  >;
  tools: OpenClawToolDefinition[];
}

export type LocalApiEventTopic = "jobs" | "exports" | "transcriptions" | "smart";

export interface LocalApiEventStreamDescriptor {
  transport: "sse";
  path: "/api/v1/events";
  topics: LocalApiEventTopic[];
  pollingFallback: "/api/v1/query";
}

export interface LocalApiStatus {
  apiVersion: "v1";
  protocolVersion: "1";
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
  openClawManifest: OpenClawToolManifest;
  eventStream: LocalApiEventStreamDescriptor;
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
  getSmartSessionSnapshot(input: GetSmartSessionSnapshotInput): Promise<SmartSessionSnapshot>;
  executeSmartCommand(input: ExecuteSmartCommandInput): Promise<ExecuteSmartCommandResult>;
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
  getSmartSessionSnapshot: "clawcut:get-smart-session-snapshot",
  executeSmartCommand: "clawcut:execute-smart-command",
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
