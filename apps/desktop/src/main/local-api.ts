import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { z } from "zod";

import type { PreviewBridge } from "./preview-bridge";

import {
  buildProjectSummary,
  createLocalApiCapabilities,
  createOpenClawToolManifest,
  getLocalApiOperationDescriptor,
  OPENCLAW_TOOL_DEFINITIONS,
  parseLocalApiCommandInput,
  parseLocalApiQueryInput,
  resolveLocalApiCommandName,
  resolveLocalApiQueryName
} from "../../../../packages/ipc/src/control-schema";
import type {
  ClawcutApi,
  ExecuteCaptionCommandInput,
  ExecuteEditorCommandInput,
  ExecuteExportCommandInput,
  ExecuteSmartCommandInput,
  ExecuteWorkflowCommandInput,
  LocalApiCommandInputMap,
  LocalApiCommandName,
  LocalApiEventStreamDescriptor,
  LocalApiEventTopic,
  LocalApiEnvelope,
  LocalApiPreviewFrameReference,
  LocalApiJobDetails,
  LocalApiQueryInputMap,
  LocalApiQueryName,
  LocalApiRequestLogEntry,
  LocalApiScope,
  LocalApiState,
  LocalApiStatus,
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
  sessionLogDirectory: string;
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

const eventStreamQuerySchema = z.object({
  directory: z.string().min(1).optional(),
  topics: z
    .array(z.enum(["jobs", "exports", "transcriptions", "smart", "workflows"]))
    .default(["jobs", "exports", "transcriptions", "smart", "workflows"])
});
const EVENT_STREAM_DESCRIPTOR: LocalApiEventStreamDescriptor = {
  transport: "sse",
  path: "/api/v1/events",
  topics: ["jobs", "exports", "transcriptions", "smart", "workflows"],
  pollingFallback: "/api/v1/query"
};

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

function createPreviewFrameReference(snapshot: {
  status: LocalApiPreviewFrameReference["status"];
  timelineId: string | null;
  playheadUs: number;
  clipId: string | null;
  sourceMode: LocalApiPreviewFrameReference["sourceMode"];
  mimeType: string | null;
  width: number | null;
  height: number | null;
  dataUrl: string | null;
  warning: string | null;
  error: LocalApiPreviewFrameReference["error"];
}): LocalApiPreviewFrameReference {
  return {
    status: snapshot.status,
    timelineId: snapshot.timelineId,
    playheadUs: snapshot.playheadUs,
    clipId: snapshot.clipId,
    sourceMode: snapshot.sourceMode,
    mimeType: snapshot.mimeType,
    width: snapshot.width,
    height: snapshot.height,
    hasImageData: Boolean(snapshot.dataUrl),
    warning: snapshot.warning,
    error: snapshot.error
  };
}

function parseEventTopics(searchParams: URLSearchParams): LocalApiEventTopic[] {
  const topicsParam = searchParams.get("topics");

  if (!topicsParam) {
    return [...EVENT_STREAM_DESCRIPTOR.topics];
  }

  const topics = topicsParam
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return eventStreamQuerySchema.parse({ topics }).topics;
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

  private readonly sessionLogDirectory: string;

  private readonly requestLogPath: string;

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
    this.sessionLogDirectory = options.sessionLogDirectory;
    this.requestLogPath = join(options.sessionLogDirectory, "local-api-requests.jsonl");
  }

  async initialize(): Promise<void> {
    await mkdir(this.sessionLogDirectory, { recursive: true });
    this.config = await loadOrCreateConfig(this.configPath);

    if (this.config.enabled) {
      await this.start();
    }
  }

  getStatus(): LocalApiStatus {
    const config = this.config ?? createDefaultConfig();
    const capabilities = createLocalApiCapabilities(config.scopes);

    return {
      apiVersion: LOCAL_API_VERSION,
      protocolVersion: "1",
      enabled: config.enabled,
      state: this.state,
      bindAddress: config.host,
      port: this.activePort,
      baseUrl: this.activePort === null ? null : `http://${config.host}:${this.activePort}`,
      token: config.token,
      tokenPreview: maskToken(config.token),
      scopes: [...config.scopes],
      capabilities,
      openClawTools: OPENCLAW_TOOL_DEFINITIONS,
      openClawManifest: createOpenClawToolManifest(capabilities),
      eventStream: EVENT_STREAM_DESCRIPTOR,
      sessionLogDirectory: this.sessionLogDirectory,
      requestLogPath: this.requestLogPath,
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
    void this.persistRequestLog(entry);

    if (process.env.NODE_ENV !== "production") {
      const suffix = entry.errorCode ? ` (${entry.errorCode})` : "";
      console.log(
        `[clawcut-local-api] ${entry.operationType} ${entry.name} -> ${entry.status}${suffix} [${entry.requestId}] ${entry.durationMs}ms`
      );
    }
  }

  private async persistRequestLog(entry: LocalApiRequestLogEntry): Promise<void> {
    try {
      await mkdir(dirname(this.requestLogPath), { recursive: true });
      await appendFile(this.requestLogPath, `${JSON.stringify(entry)}\n`, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
        return;
      }

      if (process.env.NODE_ENV !== "production") {
        console.error("[clawcut-local-api] failed to persist request log", error);
      }
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
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const pathname = url.pathname;

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

      if (pathname === "/api/v1/events" && request.method === "GET") {
        await this.handleEventStream(request, response, requestId, receivedAt, startedAt, url);
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

      if (pathname === "/api/v1/openclaw/manifest" && request.method === "GET") {
        writeJson(response, 200, {
          ok: true,
          apiVersion: LOCAL_API_VERSION,
          requestId,
          name: "openclaw.manifest",
          warnings: [],
          data: this.getStatus().openClawManifest
        });
        this.logRequest({
          requestId,
          operationType: "query",
          name: "openclaw.manifest",
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
          data: OPENCLAW_TOOL_DEFINITIONS
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
            name: z.string().min(1),
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

        const resolvedName = resolveLocalApiCommandName(parsed.data.name);

        if (!resolvedName) {
          fail(404, parsed.data.name, {
            code: "UNSUPPORTED_OPERATION",
            message: `Command ${parsed.data.name} is not supported by this ClawCut build.`
          });
          return;
        }

        const result = await this.executeCommand(resolvedName, parsed.data.input);
        writeJson(response, 200, {
          ok: true,
          apiVersion: LOCAL_API_VERSION,
          requestId,
          name: resolvedName,
          warnings: [],
          data: result
        });
        this.logRequest({
          requestId,
          operationType: "command",
          name: resolvedName,
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
            name: z.string().min(1),
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

        const resolvedName = resolveLocalApiQueryName(parsed.data.name);

        if (!resolvedName) {
          fail(404, parsed.data.name, {
            code: "UNSUPPORTED_OPERATION",
            message: `Query ${parsed.data.name} is not supported by this ClawCut build.`
          });
          return;
        }

        const result = await this.executeQuery(resolvedName, parsed.data.input);
        writeJson(response, 200, {
          ok: true,
          apiVersion: LOCAL_API_VERSION,
          requestId,
          name: resolvedName,
          warnings: [],
          data: result
        });
        this.logRequest({
          requestId,
          operationType: "query",
          name: resolvedName,
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

  private async handleEventStream(
    request: IncomingMessage,
    response: ServerResponse,
    requestId: string,
    receivedAt: string,
    startedAt: number,
    url: URL
  ): Promise<void> {
    this.ensureAuthorizedScopes("events", ["read"]);

    const parsed = eventStreamQuerySchema.parse({
      directory: url.searchParams.get("directory") ?? undefined,
      topics: parseEventTopics(url.searchParams)
    });
    const streamId = randomUUID();
    let disposed = false;
    let lastPayloadSignature = "";
    let inFlight = false;

    response.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    });
    response.flushHeaders?.();

    const writeEvent = (event: string, data: unknown): void => {
      if (disposed) {
        return;
      }

      response.write(`event: ${event}\n`);
      response.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const publishSnapshot = async (): Promise<void> => {
      if (disposed || inFlight || !parsed.directory) {
        return;
      }

      inFlight = true;

      try {
        const snapshot = await this.buildEventPayload(parsed.directory, parsed.topics);
        const signature = JSON.stringify(snapshot);

        if (signature !== lastPayloadSignature) {
          lastPayloadSignature = signature;
          writeEvent("jobs.snapshot", snapshot);
        }
      } catch (error) {
        writeEvent("error", {
          code: "EVENT_STREAM_UPDATE_FAILED",
          message: toSerializedError(error).message
        });
      } finally {
        inFlight = false;
      }
    };

    const heartbeatTimer = setInterval(() => {
      writeEvent("heartbeat", {
        streamId,
        emittedAt: new Date().toISOString()
      });
    }, 15_000);
    const snapshotTimer = setInterval(() => {
      void publishSnapshot();
    }, 750);

    const cleanup = (): void => {
      if (disposed) {
        return;
      }

      disposed = true;
      clearInterval(heartbeatTimer);
      clearInterval(snapshotTimer);
      response.end();
    };

    request.on("close", cleanup);
    response.on("close", cleanup);

    writeEvent("ready", {
      streamId,
      apiVersion: LOCAL_API_VERSION,
      topics: parsed.topics,
      directory: parsed.directory ?? null
    });
    await publishSnapshot();
    this.logRequest({
      requestId,
      operationType: "query",
      name: "events",
      status: "ok",
      errorCode: null,
      receivedAt,
      durationMs: Date.now() - startedAt
    });
  }

  private async buildEventPayload(directory: string, topics: LocalApiEventTopic[]): Promise<{
    directory: string;
    emittedAt: string;
    topics: LocalApiEventTopic[];
    jobs: Awaited<ReturnType<LocalApiWorkerGateway["getProjectSnapshot"]>>["jobs"];
    exportRuns: Awaited<ReturnType<LocalApiWorkerGateway["getExportSessionSnapshot"]>>["exportRuns"];
    transcriptionRuns: Awaited<
      ReturnType<LocalApiWorkerGateway["getCaptionSessionSnapshot"]>
    >["transcriptionRuns"];
    smart: {
      suggestionSets: Awaited<
        ReturnType<LocalApiWorkerGateway["getSmartSessionSnapshot"]>
      >["suggestionSets"];
      analysisRuns: Awaited<
        ReturnType<LocalApiWorkerGateway["getSmartSessionSnapshot"]>
      >["analysisRuns"];
      editPlans: Awaited<
        ReturnType<LocalApiWorkerGateway["getSmartSessionSnapshot"]>
      >["editPlans"];
    };
    workflows: {
      runs: Awaited<
        ReturnType<LocalApiWorkerGateway["getWorkflowSessionSnapshot"]>
      >["workflowRuns"];
      profiles: Awaited<
        ReturnType<LocalApiWorkerGateway["getWorkflowSessionSnapshot"]>
      >["workflowProfiles"];
      schedules: Awaited<
        ReturnType<LocalApiWorkerGateway["getWorkflowSessionSnapshot"]>
      >["schedules"];
      candidatePackages: Awaited<
        ReturnType<LocalApiWorkerGateway["getWorkflowSessionSnapshot"]>
      >["candidatePackages"];
      approvals: Awaited<
        ReturnType<LocalApiWorkerGateway["getWorkflowSessionSnapshot"]>
      >["pendingApprovals"];
      activeWorkflowJobId: Awaited<
        ReturnType<LocalApiWorkerGateway["getWorkflowSessionSnapshot"]>
      >["activeWorkflowJobId"];
    };
  }> {
    const projectSnapshot = await this.worker.getProjectSnapshot({ directory });
    const exportRuns = topics.includes("exports")
      ? (await this.worker.getExportSessionSnapshot({ directory })).exportRuns
      : [];
    const transcriptionRuns = topics.includes("transcriptions")
      ? (await this.worker.getCaptionSessionSnapshot({ directory })).transcriptionRuns
      : [];
    const smartSnapshot = topics.includes("smart")
      ? await this.worker.getSmartSessionSnapshot({ directory })
      : null;
    const workflowSnapshot = topics.includes("workflows")
      ? await this.worker.getWorkflowSessionSnapshot({ directory })
      : null;

    return {
      directory,
      emittedAt: new Date().toISOString(),
      topics,
      jobs: topics.includes("jobs") ? projectSnapshot.jobs : [],
      exportRuns,
      transcriptionRuns,
      smart: {
        suggestionSets: smartSnapshot?.suggestionSets ?? [],
        analysisRuns: smartSnapshot?.analysisRuns ?? [],
        editPlans: smartSnapshot?.editPlans ?? []
      },
      workflows: {
        runs: workflowSnapshot?.workflowRuns ?? [],
        profiles: workflowSnapshot?.workflowProfiles ?? [],
        schedules: workflowSnapshot?.schedules ?? [],
        candidatePackages: workflowSnapshot?.candidatePackages ?? [],
        approvals: workflowSnapshot?.pendingApprovals ?? [],
        activeWorkflowJobId: workflowSnapshot?.activeWorkflowJobId ?? null
      }
    };
  }

  private async executeCommand<Name extends LocalApiCommandName>(
    name: Name,
    input: unknown
  ): Promise<unknown> {
    const descriptor = getLocalApiOperationDescriptor(name);

    if (!descriptor || descriptor.kind !== "command") {
      throw {
        code: "UNSUPPORTED_OPERATION",
        message: `Command ${name} is not supported by this ClawCut build.`
      };
    }

    this.ensureAuthorizedScopes(name, descriptor.requiredScopes);
    const parsed = parseLocalApiCommandInput(name, input);

    switch (name) {
      case "project.create":
        return this.worker.createProject(parsed as LocalApiCommandInputMap["project.create"]);
      case "project.open":
        return this.worker.openProject(parsed as LocalApiCommandInputMap["project.open"]);
      case "project.save": {
        const saveInput = parsed as LocalApiCommandInputMap["project.save"];
        const snapshot = await this.worker.getProjectSnapshot(saveInput);

        return {
          directory: snapshot.directory,
          projectFilePath: snapshot.projectFilePath,
          savedAt: new Date().toISOString(),
          persistenceMode: "immediate" as const
        };
      }
      case "media.import":
        return this.worker.importMediaPaths(parsed as LocalApiCommandInputMap["media.import"]);
      case "media.relink":
        return this.worker.relinkMediaItem(parsed as LocalApiCommandInputMap["media.relink"]);
      case "timeline.create":
        return this.worker.executeEditorCommand({
          directory: (parsed as LocalApiCommandInputMap["timeline.create"]).directory,
          command: {
            type: "CreateTimeline",
            timelineId: (parsed as LocalApiCommandInputMap["timeline.create"]).timelineId
          }
        });
      case "timeline.addTrack":
        return this.worker.executeEditorCommand(
          {
            directory: (parsed as LocalApiCommandInputMap["timeline.addTrack"]).directory,
            command: {
              type: "AddTrack",
              timelineId: (parsed as LocalApiCommandInputMap["timeline.addTrack"]).timelineId,
              trackKind: (parsed as LocalApiCommandInputMap["timeline.addTrack"]).trackKind,
              name: (parsed as LocalApiCommandInputMap["timeline.addTrack"]).name,
              index: (parsed as LocalApiCommandInputMap["timeline.addTrack"]).index
            }
          }
        );
      case "timeline.insertClip":
      case "timeline.insertLinkedMedia":
      case "timeline.splitClip":
      case "timeline.trimClipStart":
      case "timeline.trimClipEnd":
      case "timeline.moveClip":
      case "timeline.rippleDeleteClip":
      case "timeline.lockTrack":
      case "timeline.unlockTrack":
      case "timeline.setPlayhead":
      case "timeline.undo":
      case "timeline.redo": {
        const {
          directory,
          ...commandInput
        } = parsed as { directory: string } & Record<string, unknown>;
        return this.worker.executeEditorCommand({
          directory,
          command: {
            ...commandInput,
            type:
              name === "timeline.insertClip"
                ? "InsertClip"
                : name === "timeline.insertLinkedMedia"
                  ? "InsertLinkedMedia"
                  : name === "timeline.splitClip"
                    ? "SplitClip"
                    : name === "timeline.trimClipStart"
                      ? "TrimClipStart"
                      : name === "timeline.trimClipEnd"
                        ? "TrimClipEnd"
                        : name === "timeline.moveClip"
                          ? "MoveClip"
                          : name === "timeline.rippleDeleteClip"
                            ? "RippleDeleteClip"
                            : name === "timeline.lockTrack"
                              ? "LockTrack"
                              : name === "timeline.unlockTrack"
                                ? "UnlockTrack"
                                : name === "timeline.setPlayhead"
                                  ? "SetPlayhead"
                                  : name === "timeline.undo"
                                    ? "Undo"
                                    : "Redo"
          } as ExecuteEditorCommandInput["command"]
        });
      }
      case "preview.loadTimeline": {
        const loadInput = parsed as LocalApiCommandInputMap["preview.loadTimeline"];
        const snapshot = await this.worker.getEditorSessionSnapshot({
          directory: loadInput.directory
        });

        return this.preview.loadProjectTimeline({
          snapshot,
          initialPlayheadUs: loadInput.initialPlayheadUs,
          preservePlayhead: loadInput.preservePlayhead
        });
      }
      case "preview.play":
      case "preview.pause":
      case "preview.seek":
      case "preview.stepForward":
      case "preview.stepBackward":
      case "preview.setQuality":
        return this.preview.executeCommand(
          name === "preview.play"
            ? { type: "PlayPreview" }
            : name === "preview.pause"
              ? { type: "PausePreview" }
              : name === "preview.seek"
                ? {
                    type: "SeekPreview",
                    positionUs: (parsed as LocalApiCommandInputMap["preview.seek"]).positionUs
                  }
                : name === "preview.stepForward"
                  ? { type: "StepPreviewFrameForward" }
                  : name === "preview.stepBackward"
                    ? { type: "StepPreviewFrameBackward" }
                    : {
                        type: "SetPreviewQuality",
                        qualityMode: (parsed as LocalApiCommandInputMap["preview.setQuality"]).qualityMode
                      }
        );
      case "transcript.transcribeClip":
      case "transcript.updateSegment":
      case "captions.generateTrack":
      case "captions.regenerateTrack":
      case "captions.applyTemplate":
      case "captions.updateSegment":
      case "captions.exportSubtitles":
      case "captions.setBurnIn": {
        const {
          directory,
          ...commandInput
        } = parsed as { directory: string } & Record<string, unknown>;
        return this.worker.executeCaptionCommand({
          directory,
          command: {
            ...commandInput,
            type:
              name === "transcript.transcribeClip"
                ? "TranscribeClip"
                : name === "transcript.updateSegment"
                  ? "UpdateTranscriptSegment"
                  : name === "captions.generateTrack"
                    ? "GenerateCaptionTrack"
                    : name === "captions.regenerateTrack"
                      ? "RegenerateCaptionTrack"
                      : name === "captions.applyTemplate"
                        ? "ApplyCaptionTemplate"
                        : name === "captions.updateSegment"
                          ? "UpdateCaptionSegment"
                          : name === "captions.exportSubtitles"
                            ? "ExportSubtitleFile"
                            : "EnableBurnInCaptionsForExport"
          } as ExecuteCaptionCommandInput["command"]
        });
      }
      case "smart.analyzeSilence":
      case "smart.analyzeWeakSegments":
      case "smart.findFillerWords":
      case "smart.generateHighlights":
      case "smart.compilePlan":
      case "smart.applySuggestion":
      case "smart.applySuggestionSet":
      case "smart.rejectSuggestion": {
        const {
          directory,
          ...commandInput
        } = parsed as { directory: string } & Record<string, unknown>;
        return this.worker.executeSmartCommand({
          directory,
          command: {
            ...commandInput,
            type:
              name === "smart.analyzeSilence"
                ? "AnalyzeSilence"
                : name === "smart.analyzeWeakSegments"
                  ? "AnalyzeWeakSegments"
                  : name === "smart.findFillerWords"
                    ? "FindFillerWords"
                    : name === "smart.generateHighlights"
                      ? "GenerateHighlightSuggestions"
                      : name === "smart.compilePlan"
                        ? "CompileEditPlan"
                        : name === "smart.applySuggestion"
                          ? "ApplySuggestion"
                          : name === "smart.applySuggestionSet"
                            ? "ApplySuggestionSet"
                            : "RejectSuggestion"
          } as ExecuteSmartCommandInput["command"]
        });
      }
      case "smart.seekPreviewToSuggestion": {
        const previewInput = parsed as LocalApiCommandInputMap["smart.seekPreviewToSuggestion"];
        const inspection = await this.worker.executeSmartCommand({
          directory: previewInput.directory,
          command: {
            type: "InspectSuggestion",
            suggestionSetId: previewInput.suggestionSetId,
            suggestionId: previewInput.suggestionId
          }
        });

        if (!inspection.result.ok) {
          throw inspection.result.error;
        }

        if (inspection.result.commandType !== "InspectSuggestion") {
          throw {
            code: "UNSUPPORTED_OPERATION",
            message: "The smart preview seek helper could not inspect the requested suggestion."
          };
        }

        const suggestion = inspection.result.suggestion;
        const anchor = previewInput.anchor ?? "midpoint";
        const positionUs =
          anchor === "start"
            ? suggestion.target.startUs
            : anchor === "end"
              ? suggestion.target.endUs
              : suggestion.target.startUs +
                Math.round((suggestion.target.endUs - suggestion.target.startUs) / 2);
        const previewState = await this.preview.getPreviewState();
        let loadedTimeline = false;
        let previewResult;

        if (!previewState.loaded || previewState.timelineId !== suggestion.target.timelineId) {
          const snapshot = await this.worker.getEditorSessionSnapshot({
            directory: previewInput.directory
          });

          previewResult = await this.preview.loadProjectTimeline({
            snapshot,
            initialPlayheadUs: positionUs,
            preservePlayhead: false
          });
          loadedTimeline = true;
        } else {
          previewResult = await this.preview.executeCommand({
            type: "SeekPreview",
            positionUs
          });
        }

        return {
          suggestionSetId: previewInput.suggestionSetId,
          suggestionId: previewInput.suggestionId,
          positionUs,
          loadedTimeline,
          preview: previewResult
        };
      }
      case "workflow.start":
      case "workflow.startBatch":
      case "workflow.exportCandidatePackage":
      case "workflow.cancelRun":
      case "workflow.resumeRun":
      case "workflow.retryStep":
      case "workflow.approveStep":
      case "workflow.rejectStep":
      case "workflowProfiles.create":
      case "workflowProfiles.update":
      case "workflowProfiles.delete":
      case "workflowProfiles.run":
      case "schedules.create":
      case "schedules.update":
      case "schedules.pause":
      case "schedules.resume":
      case "schedules.delete":
      case "brandKits.create":
      case "brandKits.update":
      case "brandKits.setDefault": {
        const {
          directory,
          ...commandInput
        } = parsed as { directory: string } & Record<string, unknown>;
        return this.worker.executeWorkflowCommand({
          directory,
          command: {
            ...commandInput,
            type:
              name === "workflow.start"
                ? "StartWorkflow"
                : name === "workflow.startBatch"
                  ? "StartBatchWorkflow"
                  : name === "workflow.exportCandidatePackage"
                    ? "ExportCandidatePackage"
                  : name === "workflow.cancelRun"
                    ? "CancelWorkflowRun"
                    : name === "workflow.resumeRun"
                      ? "ResumeWorkflowRun"
                    : name === "workflow.retryStep"
                      ? "RetryWorkflowStep"
                    : name === "workflow.approveStep"
                      ? "ApproveWorkflowStep"
                    : name === "workflow.rejectStep"
                      ? "RejectWorkflowStep"
                          : name === "workflowProfiles.create"
                            ? "CreateWorkflowProfile"
                            : name === "workflowProfiles.update"
                              ? "UpdateWorkflowProfile"
                              : name === "workflowProfiles.delete"
                                ? "DeleteWorkflowProfile"
                                : name === "workflowProfiles.run"
                                  ? "RunWorkflowProfile"
                                  : name === "schedules.create"
                                    ? "CreateWorkflowSchedule"
                                    : name === "schedules.update"
                                      ? "UpdateWorkflowSchedule"
                                      : name === "schedules.pause"
                                        ? "PauseWorkflowSchedule"
                                        : name === "schedules.resume"
                                          ? "ResumeWorkflowSchedule"
                                          : name === "schedules.delete"
                                            ? "DeleteWorkflowSchedule"
                            : name === "brandKits.create"
                              ? "CreateBrandKit"
                              : name === "brandKits.update"
                                ? "UpdateBrandKit"
                                : "SetDefaultBrandKit"
          } as ExecuteWorkflowCommandInput["command"]
        });
      }
      case "export.createRequest":
      case "export.compilePlan":
      case "export.start":
      case "export.captureSnapshot":
      case "export.cancel":
      case "export.retry": {
        const exportInput = parsed as { directory: string };
        return this.worker.executeExportCommand({
          directory: exportInput.directory,
          command: (
            name === "export.createRequest"
              ? {
                  type: "CreateExportRequest",
                  request: (parsed as LocalApiCommandInputMap["export.createRequest"]).request
                }
              : name === "export.compilePlan"
                ? {
                    type: "CompileRenderPlan",
                    request: (parsed as LocalApiCommandInputMap["export.compilePlan"]).request
                  }
                : name === "export.start"
                  ? {
                      type: "StartExport",
                      request: (parsed as LocalApiCommandInputMap["export.start"]).request
                    }
                  : name === "export.captureSnapshot"
                    ? {
                        type: "CaptureExportSnapshot",
                        request: (parsed as LocalApiCommandInputMap["export.captureSnapshot"]).request
                      }
                    : name === "export.cancel"
                      ? {
                          type: "CancelExport",
                          exportRunId: (parsed as LocalApiCommandInputMap["export.cancel"]).exportRunId
                        }
                      : {
                          type: "RetryExport",
                          exportRunId: (parsed as LocalApiCommandInputMap["export.retry"]).exportRunId
                        }
          ) as ExecuteExportCommandInput["command"]
        });
      }
      case "jobs.retry":
        return this.worker.retryJob(parsed as LocalApiCommandInputMap["jobs.retry"]);
      case "jobs.cancel": {
        const cancelInput = parsed as LocalApiCommandInputMap["jobs.cancel"];
        const snapshot = await this.worker.getProjectSnapshot({
          directory: cancelInput.directory
        });
        const job = snapshot.jobs.find((entry) => entry.id === cancelInput.jobId);

        if (!job) {
          throw {
            code: "JOB_NOT_FOUND",
            message: `Job ${cancelInput.jobId} was not found.`
          };
        }

        if (job.kind !== "export" || !job.exportRunId) {
          throw {
            code: "JOB_CANCEL_UNSUPPORTED",
            message: `Job ${cancelInput.jobId} does not support cancellation through the local control surface.`
          };
        }

        return this.worker.executeExportCommand({
          directory: cancelInput.directory,
          command: {
            type: "CancelExport",
            exportRunId: job.exportRunId
          }
        });
      }
    }
  }

  private async executeQuery<Name extends LocalApiQueryName>(
    name: Name,
    input: unknown
  ): Promise<unknown> {
    const descriptor = getLocalApiOperationDescriptor(name);

    if (!descriptor || descriptor.kind !== "query") {
      throw {
        code: "UNSUPPORTED_OPERATION",
        message: `Query ${name} is not supported by this ClawCut build.`
      };
    }

    this.ensureAuthorizedScopes(name, descriptor.requiredScopes);
    const parsed = parseLocalApiQueryInput(name, input);

    switch (name) {
      case "system.toolchain":
        return this.worker.detectToolchain();
      case "project.summary": {
        const snapshot = await this.worker.getProjectSnapshot(
          parsed as LocalApiQueryInputMap["project.summary"]
        );
        const exportSession = await this.worker.getExportSessionSnapshot({
          directory: snapshot.directory
        });
        const captionSession = await this.worker.getCaptionSessionSnapshot({
          directory: snapshot.directory
        });

        return buildProjectSummary({
          directory: snapshot.directory,
          projectFilePath: snapshot.projectFilePath,
          projectName: snapshot.document.project.name,
          timelineId: snapshot.document.timeline.id,
          mediaItemCount: snapshot.libraryItems.length,
          jobCount: snapshot.jobs.length,
          transcriptCount: captionSession.transcripts.length,
          captionTrackCount: captionSession.captionTracks.length,
          exportRunCount: exportSession.exportRuns.length
        });
      }
      case "diagnostics.session": {
        const diagnostics = await this.worker.getDiagnosticsSessionSnapshot(
          parsed as LocalApiQueryInputMap["diagnostics.session"]
        );
        return {
          ...diagnostics,
          sessionLogDirectory: diagnostics.sessionLogDirectory ?? this.sessionLogDirectory,
          requestLogPath: this.requestLogPath
        };
      }
      case "project.snapshot":
        return this.worker.getProjectSnapshot(parsed as LocalApiQueryInputMap["project.snapshot"]);
      case "media.list": {
        const snapshot = await this.worker.getProjectSnapshot(
          parsed as LocalApiQueryInputMap["media.list"]
        );

        return {
          directory: snapshot.directory,
          libraryItems: snapshot.libraryItems,
          jobs: snapshot.jobs
        };
      }
      case "media.inspect": {
        const inspectInput = parsed as LocalApiQueryInputMap["media.inspect"];
        const snapshot = await this.worker.getProjectSnapshot({
          directory: inspectInput.directory
        });
        return snapshot.libraryItems.find((item) => item.id === inspectInput.mediaItemId) ?? null;
      }
      case "timeline.get":
        return this.worker.getEditorSessionSnapshot(parsed as LocalApiQueryInputMap["timeline.get"]);
      case "preview.state":
        return this.preview.getPreviewState();
      case "preview.frame-snapshot":
        return this.preview.captureFrameSnapshot(
          (parsed as LocalApiQueryInputMap["preview.frame-snapshot"]).options
        );
      case "preview.frame-reference": {
        const snapshot = await this.preview.captureFrameSnapshot(
          (parsed as LocalApiQueryInputMap["preview.frame-reference"]).options
        );
        return createPreviewFrameReference(snapshot);
      }
      case "export.session":
        return this.worker.getExportSessionSnapshot(parsed as LocalApiQueryInputMap["export.session"]);
      case "transcript.get":
        return (
          await this.worker.executeCaptionCommand({
            directory: (parsed as LocalApiQueryInputMap["transcript.get"]).directory,
            command: {
              type: "QueryTranscriptStatus",
              transcriptId: (parsed as LocalApiQueryInputMap["transcript.get"]).transcriptId
            }
          })
        ).result;
      case "captions.session":
        return this.worker.getCaptionSessionSnapshot(parsed as LocalApiQueryInputMap["captions.session"]);
      case "captions.track":
        return (
          await this.worker.executeCaptionCommand({
            directory: (parsed as LocalApiQueryInputMap["captions.track"]).directory,
            command: {
              type: "QueryCaptionTrackState",
              captionTrackId: (parsed as LocalApiQueryInputMap["captions.track"]).captionTrackId
            }
          })
        ).result;
      case "smart.session":
        return this.worker.getSmartSessionSnapshot(parsed as LocalApiQueryInputMap["smart.session"]);
      case "smart.suggestionSet":
        return (
          await this.worker.executeSmartCommand({
            directory: (parsed as LocalApiQueryInputMap["smart.suggestionSet"]).directory,
            command: {
              type: "QuerySuggestionSet",
              suggestionSetId: (parsed as LocalApiQueryInputMap["smart.suggestionSet"]).suggestionSetId
            }
          })
        ).result;
      case "smart.suggestion":
        return (
          await this.worker.executeSmartCommand({
            directory: (parsed as LocalApiQueryInputMap["smart.suggestion"]).directory,
            command: {
              type: "InspectSuggestion",
              suggestionSetId: (parsed as LocalApiQueryInputMap["smart.suggestion"]).suggestionSetId,
              suggestionId: (parsed as LocalApiQueryInputMap["smart.suggestion"]).suggestionId
            }
          })
        ).result;
      case "workflow.session":
        return this.worker.getWorkflowSessionSnapshot(
          parsed as LocalApiQueryInputMap["workflow.session"]
        );
      case "workflow.list":
        return (
          await this.worker.getWorkflowSessionSnapshot(
            parsed as LocalApiQueryInputMap["workflow.list"]
          )
        ).workflows;
      case "workflow.inspect": {
        const workflowInput = parsed as LocalApiQueryInputMap["workflow.inspect"];
        const snapshot = await this.worker.getWorkflowSessionSnapshot({
          directory: workflowInput.directory
        });
        return snapshot.workflows.find((workflow) => workflow.id === workflowInput.workflowId) ?? null;
      }
      case "workflow.runs":
        return (
          await this.worker.getWorkflowSessionSnapshot(
            parsed as LocalApiQueryInputMap["workflow.runs"]
          )
        ).workflowRuns;
      case "workflow.run": {
        const workflowInput = parsed as LocalApiQueryInputMap["workflow.run"];
        const snapshot = await this.worker.getWorkflowSessionSnapshot({
          directory: workflowInput.directory
        });
        return snapshot.workflowRuns.find((run) => run.id === workflowInput.workflowRunId) ?? null;
      }
      case "workflow.approvals":
        return (
          await this.worker.getWorkflowSessionSnapshot(
            parsed as LocalApiQueryInputMap["workflow.approvals"]
          )
        ).pendingApprovals;
      case "workflow.artifacts": {
        const workflowInput = parsed as LocalApiQueryInputMap["workflow.artifacts"];
        const snapshot = await this.worker.getWorkflowSessionSnapshot({
          directory: workflowInput.directory
        });
        return (
          snapshot.workflowRuns.find((run) => run.id === workflowInput.workflowRunId)?.artifacts ??
          []
        );
      }
      case "workflow.artifact": {
        const workflowInput = parsed as LocalApiQueryInputMap["workflow.artifact"];
        const snapshot = await this.worker.getWorkflowSessionSnapshot({
          directory: workflowInput.directory
        });
        return (
          snapshot.workflowRuns
            .find((run) => run.id === workflowInput.workflowRunId)
            ?.artifacts.find((artifact) => artifact.id === workflowInput.artifactId) ?? null
        );
      }
      case "workflow.candidatePackages":
        return (
          await this.worker.getWorkflowSessionSnapshot(
            parsed as LocalApiQueryInputMap["workflow.candidatePackages"]
          )
        ).candidatePackages;
      case "workflow.candidatePackage": {
        const workflowInput = parsed as LocalApiQueryInputMap["workflow.candidatePackage"];
        const snapshot = await this.worker.getWorkflowSessionSnapshot({
          directory: workflowInput.directory
        });
        return (
          snapshot.candidatePackages.find(
            (candidatePackage) => candidatePackage.id === workflowInput.candidatePackageId
          ) ?? null
        );
      }
      case "workflowProfiles.list":
        return (
          await this.worker.getWorkflowSessionSnapshot(
            parsed as LocalApiQueryInputMap["workflowProfiles.list"]
          )
        ).workflowProfiles;
      case "workflowProfiles.inspect": {
        const workflowInput = parsed as LocalApiQueryInputMap["workflowProfiles.inspect"];
        const snapshot = await this.worker.getWorkflowSessionSnapshot({
          directory: workflowInput.directory
        });
        return (
          snapshot.workflowProfiles.find((profile) => profile.id === workflowInput.profileId) ??
          null
        );
      }
      case "schedules.list":
        return (
          await this.worker.getWorkflowSessionSnapshot(
            parsed as LocalApiQueryInputMap["schedules.list"]
          )
        ).schedules;
      case "schedules.inspect": {
        const workflowInput = parsed as LocalApiQueryInputMap["schedules.inspect"];
        const snapshot = await this.worker.getWorkflowSessionSnapshot({
          directory: workflowInput.directory
        });
        return (
          snapshot.schedules.find((schedule) => schedule.id === workflowInput.scheduleId) ??
          null
        );
      }
      case "brandKits.list":
        return (
          await this.worker.getWorkflowSessionSnapshot(
            parsed as LocalApiQueryInputMap["brandKits.list"]
          )
        ).brandKits;
      case "jobs.list": {
        const snapshot = await this.worker.getProjectSnapshot(
          parsed as LocalApiQueryInputMap["jobs.list"]
        );
        return snapshot.jobs;
      }
      case "jobs.get": {
        const jobInput = parsed as LocalApiQueryInputMap["jobs.get"];
        const snapshot = await this.worker.getProjectSnapshot({
          directory: jobInput.directory
        });
        const job = snapshot.jobs.find((entry) => entry.id === jobInput.jobId) ?? null;
        let exportRun: LocalApiJobDetails["exportRun"] = null;
        let transcriptionRun: LocalApiJobDetails["transcriptionRun"] = null;

        if (job?.kind === "export") {
          const exportSnapshot = await this.worker.getExportSessionSnapshot({
            directory: jobInput.directory
          });
          exportRun =
            exportSnapshot.exportRuns.find((entry) => entry.id === job.exportRunId) ?? null;
        }

        if (job?.kind === "transcription") {
          const captionSnapshot = await this.worker.getCaptionSessionSnapshot({
            directory: jobInput.directory
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
