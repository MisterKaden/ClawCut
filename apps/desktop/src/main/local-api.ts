import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { z } from "zod";

import type { PreviewBridge } from "./preview-bridge";

import type {
  ClawcutApi,
  LocalApiCapabilities,
  LocalApiCommandInputMap,
  LocalApiCommandName,
  LocalApiEnvelope,
  LocalApiJobDetails,
  LocalApiOperationDescriptor,
  LocalApiQueryInputMap,
  LocalApiQueryName,
  LocalApiRequestLogEntry,
  LocalApiScope,
  LocalApiState,
  LocalApiStatus,
  OpenClawToolDefinition,
  SerializedWorkerError
} from "@clawcut/ipc";

interface StoredLocalApiConfig {
  enabled: boolean;
  host: string;
  port: number;
  token: string;
  scopes: LocalApiScope[];
}

type LocalApiWorkerGateway = Omit<
  ClawcutApi,
  "getLocalApiStatus" | "setLocalApiEnabled" | "regenerateLocalApiToken"
>;

export interface LocalApiControllerOptions {
  configPath: string;
  worker: LocalApiWorkerGateway;
  preview: PreviewBridge;
}

const LOCAL_API_VERSION = "v1" as const;
const LOCAL_API_HOST = process.env.CLAWCUT_LOCAL_API_HOST?.trim() || "127.0.0.1";
const LOCAL_API_PORT = Number(process.env.CLAWCUT_LOCAL_API_PORT ?? "42170");
const MAX_REQUEST_LOGS = 50;
const DEFAULT_SCOPES: LocalApiScope[] = [
  "read",
  "edit",
  "preview",
  "export",
  "transcript",
  "admin"
];

const directorySchema = z.object({
  directory: z.string().min(1)
});
const createProjectSchema = z.object({
  directory: z.string().min(1),
  name: z.string().min(1).optional()
});
const importMediaSchema = z.object({
  directory: z.string().min(1),
  paths: z.array(z.string().min(1)).min(1)
});
const relinkMediaSchema = z.object({
  directory: z.string().min(1),
  mediaItemId: z.string().min(1),
  candidatePath: z.string().min(1)
});
const retryJobSchema = z.object({
  directory: z.string().min(1),
  jobId: z.string().min(1)
});
const previewLoadProjectSchema = z.object({
  directory: z.string().min(1),
  initialPlayheadUs: z.number().int().nonnegative().optional(),
  preservePlayhead: z.boolean().optional()
});
const previewExecuteSchema = z.object({
  command: z.object({
    type: z.string().min(1)
  }).passthrough()
});
const previewFrameSnapshotSchema = z.object({
  options: z
    .object({
      maxWidth: z.number().int().positive().optional(),
      mimeType: z.enum(["image/png", "image/jpeg"]).optional(),
      quality: z.number().min(0).max(1).optional()
    })
    .optional()
});
const executeEditorSchema = z.object({
  directory: z.string().min(1),
  command: z.object({
    type: z.string().min(1)
  }).passthrough()
});
const executeExportSchema = z.object({
  directory: z.string().min(1),
  command: z.object({
    type: z.string().min(1)
  }).passthrough()
});
const executeCaptionSchema = z.object({
  directory: z.string().min(1),
  command: z.object({
    type: z.string().min(1)
  }).passthrough()
});
const jobDetailsSchema = z.object({
  directory: z.string().min(1),
  jobId: z.string().min(1)
});

const COMMAND_DESCRIPTORS: LocalApiOperationDescriptor[] = [
  {
    name: "project.create",
    category: "project",
    description: "Create a new ClawCut project directory and bootstrap project state.",
    requiredScopes: ["edit"],
    longRunning: false
  },
  {
    name: "project.open",
    category: "project",
    description: "Open an existing project and refresh media health.",
    requiredScopes: ["read"],
    longRunning: false
  },
  {
    name: "project.save",
    category: "project",
    description: "Confirm the current project is persisted. ClawCut writes immediately.",
    requiredScopes: ["read"],
    longRunning: false
  },
  {
    name: "media.import",
    category: "media",
    description: "Import media paths into the project and queue ingest jobs.",
    requiredScopes: ["edit"],
    longRunning: true
  },
  {
    name: "media.relink",
    category: "media",
    description: "Relink a missing media item to a candidate source path.",
    requiredScopes: ["edit"],
    longRunning: false
  },
  {
    name: "timeline.execute",
    category: "timeline",
    description: "Execute a typed timeline command through the editor session.",
    requiredScopes: ["edit"],
    longRunning: false
  },
  {
    name: "preview.load-project-timeline",
    category: "preview",
    description: "Load the current project timeline into preview from the local desktop session.",
    requiredScopes: ["preview"],
    longRunning: false
  },
  {
    name: "preview.execute",
    category: "preview",
    description: "Execute a typed preview command against the active desktop preview session.",
    requiredScopes: ["preview"],
    longRunning: false
  },
  {
    name: "export.execute",
    category: "export",
    description: "Execute a typed export command through the render/export session.",
    requiredScopes: ["export"],
    longRunning: true
  },
  {
    name: "captions.execute",
    category: "captions",
    description: "Execute a typed transcript or caption command through the caption session.",
    requiredScopes: ["transcript"],
    longRunning: true
  },
  {
    name: "jobs.retry",
    category: "jobs",
    description: "Retry a previously failed or cancelled ingest/transcription/export job.",
    requiredScopes: ["edit"],
    longRunning: true
  }
];

const QUERY_DESCRIPTORS: LocalApiOperationDescriptor[] = [
  {
    name: "system.toolchain",
    category: "system",
    description: "Return current ffmpeg, ffprobe, and transcription engine readiness.",
    requiredScopes: ["read"],
    longRunning: false
  },
  {
    name: "project.snapshot",
    category: "project",
    description: "Return the canonical project workspace snapshot.",
    requiredScopes: ["read"],
    longRunning: false
  },
  {
    name: "timeline.session",
    category: "timeline",
    description: "Return the editor session snapshot including timeline and history state.",
    requiredScopes: ["read"],
    longRunning: false
  },
  {
    name: "media.snapshot",
    category: "media",
    description: "Return the current project media library and job list.",
    requiredScopes: ["read"],
    longRunning: false
  },
  {
    name: "preview.state",
    category: "preview",
    description: "Return the current preview state from the active desktop session.",
    requiredScopes: ["preview"],
    longRunning: false
  },
  {
    name: "preview.frame-snapshot",
    category: "preview",
    description: "Capture a structured frame snapshot from the active preview session.",
    requiredScopes: ["preview"],
    longRunning: false
  },
  {
    name: "export.session",
    category: "export",
    description: "Return export runs, diagnostics, and output metadata for a project.",
    requiredScopes: ["read"],
    longRunning: false
  },
  {
    name: "captions.session",
    category: "captions",
    description: "Return transcript, caption, and transcription-run state for a project.",
    requiredScopes: ["read"],
    longRunning: false
  },
  {
    name: "jobs.list",
    category: "jobs",
    description: "Return the current job list for a project.",
    requiredScopes: ["read"],
    longRunning: false
  },
  {
    name: "jobs.get",
    category: "jobs",
    description: "Return a single job with related export/transcription details when available.",
    requiredScopes: ["read"],
    longRunning: false
  }
];

const OPENCLAW_TOOLS: OpenClawToolDefinition[] = [
  {
    name: "clawcut.open_project",
    description: "Open a local ClawCut project directory and return its workspace snapshot.",
    operationType: "command",
    apiName: "project.open",
    requiredScopes: ["read"],
    safetyNotes: ["Local filesystem access only.", "Project validation still runs in ClawCut."],
    inputSchema: {
      type: "object",
      required: ["directory"],
      properties: {
        directory: {
          type: "string",
          description: "Absolute path to the ClawCut project directory."
        }
      }
    },
    outputDescription: "Returns a project workspace snapshot with library items and jobs."
  },
  {
    name: "clawcut.import_media",
    description: "Import one or more local media paths into a ClawCut project.",
    operationType: "command",
    apiName: "media.import",
    requiredScopes: ["edit"],
    safetyNotes: ["Queues ingest jobs instead of blocking.", "Does not bypass media validation."],
    inputSchema: {
      type: "object",
      required: ["directory", "paths"],
      properties: {
        directory: {
          type: "string",
          description: "Absolute project directory."
        },
        paths: {
          type: "array",
          description: "Absolute file or folder paths to import."
        }
      }
    },
    outputDescription: "Returns accepted paths, queued job ids, and an updated snapshot."
  },
  {
    name: "clawcut.get_timeline",
    description: "Query the current timeline/editor session state for a project.",
    operationType: "query",
    apiName: "timeline.session",
    requiredScopes: ["read"],
    safetyNotes: ["Read-only query."],
    inputSchema: {
      type: "object",
      required: ["directory"],
      properties: {
        directory: {
          type: "string",
          description: "Absolute project directory."
        }
      }
    },
    outputDescription: "Returns the editor session snapshot including timeline and history."
  },
  {
    name: "clawcut.seek_preview",
    description: "Seek the active desktop preview to a timeline position.",
    operationType: "command",
    apiName: "preview.execute",
    requiredScopes: ["preview"],
    safetyNotes: ["Requires a running desktop preview session.", "Acts on the local desktop only."],
    inputSchema: {
      type: "object",
      required: ["command"],
      properties: {
        command: {
          type: "object",
          description: "A typed PreviewCommand such as { type: 'SeekPreview', positionUs: 500000 }."
        }
      }
    },
    outputDescription: "Returns the typed preview command result with updated preview state."
  },
  {
    name: "clawcut.transcribe_clip",
    description: "Queue transcription for a specific clip on the timeline.",
    operationType: "command",
    apiName: "captions.execute",
    requiredScopes: ["transcript"],
    safetyNotes: ["Queues a transcription job.", "Transcription options remain request-scoped."],
    inputSchema: {
      type: "object",
      required: ["directory", "command"],
      properties: {
        directory: {
          type: "string",
          description: "Absolute project directory."
        },
        command: {
          type: "object",
          description: "A CaptionCommand like { type: 'TranscribeClip', timelineId, clipId, options }."
        }
      }
    },
    outputDescription: "Returns the queued transcription run and updated caption session snapshot."
  },
  {
    name: "clawcut.generate_captions",
    description: "Generate or update a caption track from a transcript.",
    operationType: "command",
    apiName: "captions.execute",
    requiredScopes: ["transcript"],
    safetyNotes: ["Uses typed caption commands only.", "Transcript and template validation still apply."],
    inputSchema: {
      type: "object",
      required: ["directory", "command"],
      properties: {
        directory: {
          type: "string",
          description: "Absolute project directory."
        },
        command: {
          type: "object",
          description: "A CaptionCommand such as GenerateCaptionTrack, RegenerateCaptionTrack, or ApplyCaptionTemplate."
        }
      }
    },
    outputDescription: "Returns the updated caption session snapshot and typed command result."
  },
  {
    name: "clawcut.start_export",
    description: "Start a deterministic export job through the render pipeline.",
    operationType: "command",
    apiName: "export.execute",
    requiredScopes: ["export"],
    safetyNotes: ["Long-running action.", "Returns job-linked export state instead of blocking."],
    inputSchema: {
      type: "object",
      required: ["directory", "command"],
      properties: {
        directory: {
          type: "string",
          description: "Absolute project directory."
        },
        command: {
          type: "object",
          description: "An ExportCommand such as StartExport, CancelExport, or RetryExport."
        }
      }
    },
    outputDescription: "Returns the updated export session snapshot and typed export command result."
  },
  {
    name: "clawcut.query_job",
    description: "Query the current state and diagnostics for a job.",
    operationType: "query",
    apiName: "jobs.get",
    requiredScopes: ["read"],
    safetyNotes: ["Read-only query."],
    inputSchema: {
      type: "object",
      required: ["directory", "jobId"],
      properties: {
        directory: {
          type: "string",
          description: "Absolute project directory."
        },
        jobId: {
          type: "string",
          description: "ClawCut job id."
        }
      }
    },
    outputDescription: "Returns the job plus related export or transcription run details when available."
  }
];

function createApiToken(): string {
  return randomBytes(24).toString("hex");
}

function maskToken(token: string): string {
  if (token.length <= 10) {
    return token;
  }

  return `${token.slice(0, 6)}...${token.slice(-4)}`;
}

function createDefaultConfig(): StoredLocalApiConfig {
  return {
    enabled: true,
    host: LOCAL_API_HOST,
    port: Number.isFinite(LOCAL_API_PORT) && LOCAL_API_PORT >= 0 ? LOCAL_API_PORT : 42170,
    token: createApiToken(),
    scopes: [...DEFAULT_SCOPES]
  };
}

function createCapabilities(scopes: LocalApiScope[]): LocalApiCapabilities {
  return {
    apiVersion: LOCAL_API_VERSION,
    localOnly: true,
    auth: {
      required: true,
      scheme: "bearer",
      headerName: "Authorization",
      tokenPrefix: "Bearer",
      scopes
    },
    endpoints: {
      health: "/api/v1/health",
      capabilities: "/api/v1/capabilities",
      openClawTools: "/api/v1/openclaw/tools",
      command: "/api/v1/command",
      query: "/api/v1/query"
    },
    commands: COMMAND_DESCRIPTORS,
    queries: QUERY_DESCRIPTORS,
    features: {
      project: true,
      media: true,
      timeline: true,
      preview: true,
      export: true,
      transcript: true,
      captions: true,
      openClawTools: true
    }
  };
}

function toSerializedError(error: unknown): SerializedWorkerError {
  if (error instanceof z.ZodError) {
    return {
      code: "INVALID_REQUEST_SCHEMA",
      message: "Request input was invalid.",
      details: error.message
    };
  }

  if (error && typeof error === "object" && "code" in error && "message" in error) {
    const details =
      "details" in error && typeof error.details === "string" ? error.details : undefined;

    return {
      code: String(error.code),
      message: String(error.message),
      details
    };
  }

  if (error instanceof Error) {
    return {
      code: "INTERNAL_ERROR",
      message: error.message
    };
  }

  return {
    code: "INTERNAL_ERROR",
    message: "An unknown local API error occurred."
  };
}

function hasAllScopes(grantedScopes: LocalApiScope[], requiredScopes: LocalApiScope[]): boolean {
  const granted = new Set(grantedScopes);
  return requiredScopes.every((scope) => granted.has(scope));
}

function tokenMatches(expected: string, provided: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);

  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, providedBuffer);
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);

    const size = chunks.reduce((sum, buffer) => sum + buffer.byteLength, 0);

    if (size > 1_000_000) {
      throw Object.assign(new Error("Request body exceeded the 1 MB limit."), {
        code: "REQUEST_TOO_LARGE"
      });
    }
  }

  if (chunks.length === 0) {
    return {};
  }

  const bodyText = Buffer.concat(chunks).toString("utf8");

  try {
    return JSON.parse(bodyText);
  } catch (error) {
    throw Object.assign(new Error("The request body was not valid JSON."), {
      code: "INVALID_JSON",
      details: error instanceof Error ? error.message : undefined
    });
  }
}

function writeJson<TData>(
  response: ServerResponse,
  statusCode: number,
  payload: LocalApiEnvelope<TData>
): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

async function loadOrCreateConfig(configPath: string): Promise<StoredLocalApiConfig> {
  try {
    const contents = await readFile(configPath, "utf8");
    const parsed = JSON.parse(contents) as Partial<StoredLocalApiConfig>;

    return {
      enabled: parsed.enabled ?? true,
      host: parsed.host?.trim() || LOCAL_API_HOST,
      port:
        typeof parsed.port === "number" && Number.isFinite(parsed.port) && parsed.port >= 0
          ? parsed.port
          : createDefaultConfig().port,
      token: parsed.token?.trim() || createApiToken(),
      scopes: Array.isArray(parsed.scopes) && parsed.scopes.length > 0 ? parsed.scopes : [...DEFAULT_SCOPES]
    };
  } catch {
    const created = createDefaultConfig();
    await saveConfig(configPath, created);
    return created;
  }
}

async function saveConfig(configPath: string, config: StoredLocalApiConfig): Promise<void> {
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify(config, null, 2), "utf8");
}

export class LocalApiController {
  private readonly worker: LocalApiWorkerGateway;

  private readonly preview: PreviewBridge;

  private readonly configPath: string;

  private config: StoredLocalApiConfig | null = null;

  private server: Server | null = null;

  private state: LocalApiState = "stopped";

  private activePort: number | null = null;

  private lastError: SerializedWorkerError | null = null;

  private recentRequests: LocalApiRequestLogEntry[] = [];

  constructor(options: LocalApiControllerOptions) {
    this.worker = options.worker;
    this.preview = options.preview;
    this.configPath = options.configPath;
  }

  async initialize(): Promise<void> {
    this.config = await loadOrCreateConfig(this.configPath);

    if (this.config.enabled) {
      await this.start();
    }
  }

  getStatus(): LocalApiStatus {
    const config = this.config ?? createDefaultConfig();

    return {
      apiVersion: LOCAL_API_VERSION,
      enabled: config.enabled,
      state: this.state,
      bindAddress: config.host,
      port: this.activePort,
      baseUrl: this.activePort === null ? null : `http://${config.host}:${this.activePort}`,
      token: config.token,
      tokenPreview: maskToken(config.token),
      scopes: [...config.scopes],
      capabilities: createCapabilities(config.scopes),
      openClawTools: OPENCLAW_TOOLS,
      recentRequests: [...this.recentRequests],
      lastError: this.lastError
    };
  }

  async setEnabled(enabled: boolean): Promise<LocalApiStatus> {
    const config = this.config ?? (await loadOrCreateConfig(this.configPath));
    config.enabled = enabled;
    this.config = config;
    await saveConfig(this.configPath, config);

    if (enabled) {
      await this.start();
    } else {
      await this.stop();
    }

    return this.getStatus();
  }

  async regenerateToken(): Promise<LocalApiStatus> {
    const config = this.config ?? (await loadOrCreateConfig(this.configPath));
    config.token = createApiToken();
    this.config = config;
    await saveConfig(this.configPath, config);
    return this.getStatus();
  }

  async dispose(): Promise<void> {
    await this.stop();
  }

  private async start(): Promise<void> {
    const config = this.config ?? (await loadOrCreateConfig(this.configPath));

    if (this.server) {
      this.state = "running";
      return;
    }

    this.state = "starting";
    this.lastError = null;
    const server = createServer((request, response) => {
      void this.handleRequest(request, response);
    });
    this.server = server;

    try {
      await new Promise<void>((resolvePromise, rejectPromise) => {
        const onError = (error: NodeJS.ErrnoException): void => {
          server.off("listening", onListening);
          rejectPromise(error);
        };
        const onListening = (): void => {
          server.off("error", onError);
          resolvePromise();
        };

        server.once("error", onError);
        server.once("listening", onListening);
        server.listen(config.port, config.host);
      });
    } catch (error) {
      const serialized = toSerializedError(error);

      if ((error as NodeJS.ErrnoException)?.code === "EADDRINUSE") {
        await new Promise<void>((resolvePromise, rejectPromise) => {
          const onError = (listenError: NodeJS.ErrnoException): void => {
            server.off("listening", onListening);
            rejectPromise(listenError);
          };
          const onListening = (): void => {
            server.off("error", onError);
            resolvePromise();
          };

          server.once("error", onError);
          server.once("listening", onListening);
          server.listen(0, config.host);
        }).catch(async (fallbackError) => {
          this.server = null;
          this.state = "error";
          this.lastError = toSerializedError(fallbackError);
          throw fallbackError;
        });
      } else {
        this.server = null;
        this.state = "error";
        this.lastError = serialized;
        throw error;
      }
    }

    const address = server.address();
    this.activePort =
      address && typeof address === "object" && "port" in address ? address.port : null;
    this.state = "running";
  }

  private async stop(): Promise<void> {
    if (!this.server) {
      this.state = "stopped";
      this.activePort = null;
      return;
    }

    const server = this.server;
    this.server = null;
    this.activePort = null;

    await new Promise<void>((resolvePromise, rejectPromise) => {
      server.close((error) => {
        if (error) {
          rejectPromise(error);
          return;
        }

        resolvePromise();
      });
    });

    this.state = "stopped";
  }

  private logRequest(entry: LocalApiRequestLogEntry): void {
    this.recentRequests = [entry, ...this.recentRequests].slice(0, MAX_REQUEST_LOGS);

    if (process.env.NODE_ENV !== "production") {
      const suffix = entry.errorCode ? ` (${entry.errorCode})` : "";
      console.log(
        `[clawcut-local-api] ${entry.operationType} ${entry.name} -> ${entry.status}${suffix} [${entry.requestId}] ${entry.durationMs}ms`
      );
    }
  }

  private authorizeRequest(request: IncomingMessage): SerializedWorkerError | null {
    const config = this.config;

    if (!config) {
      return {
        code: "LOCAL_API_NOT_READY",
        message: "The local API has not finished initializing."
      };
    }

    const header = request.headers.authorization;

    if (!header || !header.startsWith("Bearer ")) {
      return {
        code: "AUTH_REQUIRED",
        message: "Authorization header with a bearer token is required."
      };
    }

    const token = header.slice("Bearer ".length).trim();

    if (!tokenMatches(config.token, token)) {
      return {
        code: "AUTH_INVALID",
        message: "The supplied local API token was rejected."
      };
    }

    return null;
  }

  private async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const requestId = request.headers["x-request-id"]?.toString() || randomUUID();
    const receivedAt = new Date().toISOString();
    const startedAt = Date.now();
    const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;

    const fail = (
      statusCode: number,
      name: string | null,
      error: SerializedWorkerError
    ): void => {
      writeJson(response, statusCode, {
        ok: false,
        apiVersion: LOCAL_API_VERSION,
        requestId,
        name,
        warnings: [],
        error: {
          ...error,
          status: statusCode
        }
      });
      this.logRequest({
        requestId,
        operationType:
          pathname === "/api/v1/query" ? "query" : pathname === "/api/v1/command" ? "command" : "query",
        name: name ?? pathname,
        status: "error",
        errorCode: error.code,
        receivedAt,
        durationMs: Date.now() - startedAt
      });
    };

    try {
      if (pathname === "/api/v1/health" && request.method === "GET") {
        writeJson(response, 200, {
          ok: true,
          apiVersion: LOCAL_API_VERSION,
          requestId,
          name: "health",
          warnings: [],
          data: {
            status: this.state === "running" ? "ok" : this.state,
            authRequired: true,
            localOnly: true
          }
        });
        this.logRequest({
          requestId,
          operationType: "query",
          name: "health",
          status: "ok",
          errorCode: null,
          receivedAt,
          durationMs: Date.now() - startedAt
        });
        return;
      }

      const authError = this.authorizeRequest(request);

      if (authError) {
        fail(401, null, authError);
        return;
      }

      if (pathname === "/api/v1/capabilities" && request.method === "GET") {
        writeJson(response, 200, {
          ok: true,
          apiVersion: LOCAL_API_VERSION,
          requestId,
          name: "capabilities",
          warnings: [],
          data: this.getStatus().capabilities
        });
        this.logRequest({
          requestId,
          operationType: "query",
          name: "capabilities",
          status: "ok",
          errorCode: null,
          receivedAt,
          durationMs: Date.now() - startedAt
        });
        return;
      }

      if (pathname === "/api/v1/openclaw/tools" && request.method === "GET") {
        writeJson(response, 200, {
          ok: true,
          apiVersion: LOCAL_API_VERSION,
          requestId,
          name: "openclaw.tools",
          warnings: [],
          data: OPENCLAW_TOOLS
        });
        this.logRequest({
          requestId,
          operationType: "query",
          name: "openclaw.tools",
          status: "ok",
          errorCode: null,
          receivedAt,
          durationMs: Date.now() - startedAt
        });
        return;
      }

      if (pathname === "/api/v1/command" && request.method === "POST") {
        const rawBody = await readJsonBody(request);
        const parsed = z
          .object({
            name: z.enum([
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
            ]),
            input: z.unknown()
          })
          .safeParse(rawBody);

        if (!parsed.success) {
          fail(400, null, {
            code: "INVALID_REQUEST_SCHEMA",
            message: "Command request shape was invalid.",
            details: parsed.error.message
          });
          return;
        }

        const result = await this.executeCommand(parsed.data.name, parsed.data.input);
        writeJson(response, 200, {
          ok: true,
          apiVersion: LOCAL_API_VERSION,
          requestId,
          name: parsed.data.name,
          warnings: [],
          data: result
        });
        this.logRequest({
          requestId,
          operationType: "command",
          name: parsed.data.name,
          status: "ok",
          errorCode: null,
          receivedAt,
          durationMs: Date.now() - startedAt
        });
        return;
      }

      if (pathname === "/api/v1/query" && request.method === "POST") {
        const rawBody = await readJsonBody(request);
        const parsed = z
          .object({
            name: z.enum([
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
            ]),
            input: z.unknown()
          })
          .safeParse(rawBody);

        if (!parsed.success) {
          fail(400, null, {
            code: "INVALID_REQUEST_SCHEMA",
            message: "Query request shape was invalid.",
            details: parsed.error.message
          });
          return;
        }

        const result = await this.executeQuery(parsed.data.name, parsed.data.input);
        writeJson(response, 200, {
          ok: true,
          apiVersion: LOCAL_API_VERSION,
          requestId,
          name: parsed.data.name,
          warnings: [],
          data: result
        });
        this.logRequest({
          requestId,
          operationType: "query",
          name: parsed.data.name,
          status: "ok",
          errorCode: null,
          receivedAt,
          durationMs: Date.now() - startedAt
        });
        return;
      }

      fail(404, null, {
        code: "UNSUPPORTED_OPERATION",
        message: `Route ${request.method ?? "GET"} ${pathname} is not supported.`
      });
    } catch (error) {
      const serialized = toSerializedError(error);
      const statusCode =
        serialized.code === "AUTH_FORBIDDEN"
          ? 403
          : serialized.code === "INVALID_REQUEST_SCHEMA" ||
              serialized.code === "INVALID_JSON" ||
              serialized.code === "PROJECT_NOT_FOUND"
            ? 400
            : 500;
      this.lastError = serialized;
      fail(statusCode, null, serialized);
    }
  }

  private ensureAuthorizedScopes(name: string, requiredScopes: LocalApiScope[]): void {
    const config = this.config ?? createDefaultConfig();

    if (!hasAllScopes(config.scopes, requiredScopes)) {
      throw {
        code: "AUTH_FORBIDDEN",
        message: `The configured local API token does not allow ${name}.`,
        details: `Required scopes: ${requiredScopes.join(", ")}`
      };
    }
  }

  private async executeCommand<Name extends LocalApiCommandName>(
    name: Name,
    input: unknown
  ): Promise<unknown> {
    const descriptor = COMMAND_DESCRIPTORS.find((entry) => entry.name === name);

    if (!descriptor) {
      throw {
        code: "UNSUPPORTED_OPERATION",
        message: `Command ${name} is not supported by this ClawCut build.`
      };
    }

    this.ensureAuthorizedScopes(name, descriptor.requiredScopes);

    switch (name) {
      case "project.create":
        return this.worker.createProject(
          createProjectSchema.parse(input) as LocalApiCommandInputMap["project.create"]
        );
      case "project.open":
        return this.worker.openProject(
          directorySchema.parse(input) as LocalApiCommandInputMap["project.open"]
        );
      case "project.save": {
        const parsed = directorySchema.parse(input) as LocalApiCommandInputMap["project.save"];
        const snapshot = await this.worker.getProjectSnapshot(parsed);

        return {
          directory: snapshot.directory,
          projectFilePath: snapshot.projectFilePath,
          savedAt: new Date().toISOString(),
          persistenceMode: "immediate" as const
        };
      }
      case "media.import":
        return this.worker.importMediaPaths(
          importMediaSchema.parse(input) as LocalApiCommandInputMap["media.import"]
        );
      case "media.relink":
        return this.worker.relinkMediaItem(
          relinkMediaSchema.parse(input) as LocalApiCommandInputMap["media.relink"]
        );
      case "timeline.execute":
        return this.worker.executeEditorCommand(
          executeEditorSchema.parse(input) as unknown as LocalApiCommandInputMap["timeline.execute"]
        );
      case "preview.load-project-timeline": {
        const parsed =
          previewLoadProjectSchema.parse(input) as LocalApiCommandInputMap["preview.load-project-timeline"];
        const snapshot = await this.worker.getEditorSessionSnapshot({
          directory: parsed.directory
        });

        return this.preview.loadProjectTimeline({
          snapshot,
          initialPlayheadUs: parsed.initialPlayheadUs,
          preservePlayhead: parsed.preservePlayhead
        });
      }
      case "preview.execute":
        return this.preview.executeCommand(
          previewExecuteSchema.parse(input).command as LocalApiCommandInputMap["preview.execute"]["command"]
        );
      case "export.execute":
        return this.worker.executeExportCommand(
          executeExportSchema.parse(input) as LocalApiCommandInputMap["export.execute"]
        );
      case "captions.execute":
        return this.worker.executeCaptionCommand(
          executeCaptionSchema.parse(input) as unknown as LocalApiCommandInputMap["captions.execute"]
        );
      case "jobs.retry":
        return this.worker.retryJob(
          retryJobSchema.parse(input) as LocalApiCommandInputMap["jobs.retry"]
        );
    }
  }

  private async executeQuery<Name extends LocalApiQueryName>(
    name: Name,
    input: unknown
  ): Promise<unknown> {
    const descriptor = QUERY_DESCRIPTORS.find((entry) => entry.name === name);

    if (!descriptor) {
      throw {
        code: "UNSUPPORTED_OPERATION",
        message: `Query ${name} is not supported by this ClawCut build.`
      };
    }

    this.ensureAuthorizedScopes(name, descriptor.requiredScopes);

    switch (name) {
      case "system.toolchain":
        return this.worker.detectToolchain();
      case "project.snapshot":
        return this.worker.getProjectSnapshot(
          directorySchema.parse(input) as LocalApiQueryInputMap["project.snapshot"]
        );
      case "timeline.session":
        return this.worker.getEditorSessionSnapshot(
          directorySchema.parse(input) as LocalApiQueryInputMap["timeline.session"]
        );
      case "media.snapshot": {
        const snapshot = await this.worker.getProjectSnapshot(
          directorySchema.parse(input) as LocalApiQueryInputMap["media.snapshot"]
        );

        return {
          directory: snapshot.directory,
          libraryItems: snapshot.libraryItems,
          jobs: snapshot.jobs
        };
      }
      case "preview.state":
        return this.preview.getPreviewState();
      case "preview.frame-snapshot":
        return this.preview.captureFrameSnapshot(
          previewFrameSnapshotSchema.parse(input).options
        );
      case "export.session":
        return this.worker.getExportSessionSnapshot(
          directorySchema.parse(input) as LocalApiQueryInputMap["export.session"]
        );
      case "captions.session":
        return this.worker.getCaptionSessionSnapshot(
          directorySchema.parse(input) as LocalApiQueryInputMap["captions.session"]
        );
      case "jobs.list": {
        const snapshot = await this.worker.getProjectSnapshot(
          directorySchema.parse(input) as LocalApiQueryInputMap["jobs.list"]
        );
        return snapshot.jobs;
      }
      case "jobs.get": {
        const parsed = jobDetailsSchema.parse(input) as LocalApiQueryInputMap["jobs.get"];
        const snapshot = await this.worker.getProjectSnapshot({
          directory: parsed.directory
        });
        const job = snapshot.jobs.find((entry) => entry.id === parsed.jobId) ?? null;
        let exportRun: LocalApiJobDetails["exportRun"] = null;
        let transcriptionRun: LocalApiJobDetails["transcriptionRun"] = null;

        if (job?.kind === "export") {
          const exportSnapshot = await this.worker.getExportSessionSnapshot({
            directory: parsed.directory
          });
          exportRun =
            exportSnapshot.exportRuns.find((entry) => entry.id === job.exportRunId) ?? null;
        }

        if (job?.kind === "transcription") {
          const captionSnapshot = await this.worker.getCaptionSessionSnapshot({
            directory: parsed.directory
          });
          transcriptionRun =
            captionSnapshot.transcriptionRuns.find(
              (entry) => entry.id === job.transcriptionRunId
            ) ?? null;
        }

        const details: LocalApiJobDetails = {
          job,
          exportRun,
          transcriptionRun
        };

        return details;
      }
    }
  }
}
