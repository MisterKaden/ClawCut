import {
  createLocalApiCapabilities,
  createOpenClawToolManifest,
  mapOpenClawToolInvocation,
  OPENCLAW_TOOL_DEFINITIONS
} from "@clawcut/ipc/control-schema";
import type {
  LocalApiEnvelope,
  LocalApiScope,
  OpenClawToolDefinition,
  OpenClawToolManifest
} from "@clawcut/ipc";
import { LOCAL_API_SCOPES } from "@clawcut/ipc";

export const CLAWCUT_OPENCLAW_PLUGIN_ID = "clawcut";
export const CLAWCUT_OPENCLAW_PLUGIN_VERSION = "1";
export const CLAWCUT_OPENCLAW_PACKAGE_NAME = "@clawcut/openclaw-plugin";

export interface ClawcutOpenClawPluginDescriptor {
  pluginId: typeof CLAWCUT_OPENCLAW_PLUGIN_ID;
  pluginVersion: typeof CLAWCUT_OPENCLAW_PLUGIN_VERSION;
  packageName: typeof CLAWCUT_OPENCLAW_PACKAGE_NAME;
  localOnly: true;
  tools: OpenClawToolDefinition[];
  transport: {
    kind: "local-http";
    requiredAuth: "bearer";
    discoveryEndpoints: ["/api/v1/capabilities", "/api/v1/openclaw/manifest"];
  };
}

export interface ClawcutOpenClawClientOptions {
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
}

export interface ClawcutToolInvocationResult<TData = unknown> {
  toolName: string;
  operationType: "command" | "query";
  operationName: string;
  response: LocalApiEnvelope<TData>;
}

export const CLAWCUT_OPENCLAW_PLUGIN_DESCRIPTOR: ClawcutOpenClawPluginDescriptor = {
  pluginId: CLAWCUT_OPENCLAW_PLUGIN_ID,
  pluginVersion: CLAWCUT_OPENCLAW_PLUGIN_VERSION,
  packageName: CLAWCUT_OPENCLAW_PACKAGE_NAME,
  localOnly: true,
  tools: OPENCLAW_TOOL_DEFINITIONS,
  transport: {
    kind: "local-http",
    requiredAuth: "bearer",
    discoveryEndpoints: ["/api/v1/capabilities", "/api/v1/openclaw/manifest"]
  }
};

export function createStaticOpenClawToolManifest(
  scopes: LocalApiScope[] = [...LOCAL_API_SCOPES]
): OpenClawToolManifest {
  return createOpenClawToolManifest(createLocalApiCapabilities(scopes));
}

export class ClawcutOpenClawClient {
  private readonly baseUrl: string;

  private readonly token: string;

  private readonly fetchImpl: typeof fetch;

  constructor(options: ClawcutOpenClawClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/u, "");
    this.token = options.token;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async getManifest(): Promise<LocalApiEnvelope<OpenClawToolManifest>> {
    return this.request("/api/v1/openclaw/manifest", {
      method: "GET"
    });
  }

  async getCapabilities(): Promise<LocalApiEnvelope<ReturnType<typeof createLocalApiCapabilities>>> {
    return this.request("/api/v1/capabilities", {
      method: "GET"
    });
  }

  async invokeTool<TData = unknown>(
    toolName: string,
    input: unknown
  ): Promise<ClawcutToolInvocationResult<TData>> {
    const invocation = mapOpenClawToolInvocation(toolName, input);

    if (!invocation) {
      throw new Error(`Unsupported ClawCut OpenClaw tool: ${toolName}`);
    }

    const path = invocation.operationType === "command" ? "/api/v1/command" : "/api/v1/query";
    const response = await this.request<TData>(path, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        name: invocation.name,
        input: invocation.input
      })
    });

    return {
      toolName,
      operationType: invocation.operationType,
      operationName: invocation.name,
      response
    };
  }

  private async request<TData>(
    path: string,
    init: RequestInit
  ): Promise<LocalApiEnvelope<TData>> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(init.headers ?? {})
      }
    });

    return (await response.json()) as LocalApiEnvelope<TData>;
  }
}
