import {
  createLocalApiCapabilities,
  createOpenClawToolManifest,
  getDefaultOpenClawToolNames,
  getOpenClawToolDefinition,
  getOptionalOpenClawToolNames,
  mapOpenClawToolInvocation,
  OPENCLAW_TOOL_DEFINITIONS
} from "@clawcut/ipc/control-schema";
import type {
  LocalApiEnvelope,
  LocalApiSafetyClass,
  LocalApiScope,
  OpenClawToolDefinition,
  OpenClawToolManifest
} from "@clawcut/ipc";
import { LOCAL_API_SCOPES } from "@clawcut/ipc";
import { z } from "zod";

import openClawPluginManifestJson from "../openclaw.plugin.json";

export const CLAWCUT_OPENCLAW_PLUGIN_ID = "clawcut";
export const CLAWCUT_OPENCLAW_PLUGIN_VERSION = "1";
export const CLAWCUT_OPENCLAW_PACKAGE_NAME = "@clawcut/openclaw-plugin";

const CLAWCUT_OPENCLAW_PLUGIN_MANIFEST_SCHEMA = z.object({
  manifestVersion: z.literal("1"),
  pluginId: z.literal(CLAWCUT_OPENCLAW_PLUGIN_ID),
  name: z.string().min(1),
  version: z.literal(CLAWCUT_OPENCLAW_PLUGIN_VERSION),
  entry: z.string().min(1),
  description: z.string().min(1),
  localOnly: z.literal(true),
  transport: z.object({
    kind: z.literal("local-http"),
    requiredAuth: z.literal("bearer"),
    discoveryEndpoints: z.tuple([
      z.literal("/api/v1/capabilities"),
      z.literal("/api/v1/openclaw/manifest")
    ])
  }),
  defaultToolPolicy: z.object({
    readOnly: z.literal("enabled"),
    mutating: z.literal("allowlist"),
    highImpact: z.literal("allowlist")
  }),
  configSchema: z.object({
    type: z.literal("object"),
    description: z.string().min(1),
    properties: z.record(
      z.object({
        type: z.string(),
        description: z.string().min(1),
        items: z
          .object({
            type: z.string()
          })
          .optional()
      })
    ),
    required: z.array(z.string())
  })
});

const CLAWCUT_OPENCLAW_PLUGIN_CONFIG_SCHEMA = z
  .object({
    baseUrl: z.string().url(),
    token: z.string().min(1),
    enableReadOnlyTools: z.boolean().default(true),
    enabledMutatingTools: z.array(z.string().min(1)).default([]),
    enabledHighImpactTools: z.array(z.string().min(1)).default([])
  })
  .superRefine((config, ctx) => {
    validateToolAllowlist(
      config.enabledMutatingTools,
      "mutating",
      "enabledMutatingTools",
      ctx
    );
    validateToolAllowlist(
      config.enabledHighImpactTools,
      "high-impact",
      "enabledHighImpactTools",
      ctx
    );
  });

export type ClawcutOpenClawPluginManifest = z.infer<
  typeof CLAWCUT_OPENCLAW_PLUGIN_MANIFEST_SCHEMA
>;

export type ClawcutOpenClawPluginConfig = z.infer<
  typeof CLAWCUT_OPENCLAW_PLUGIN_CONFIG_SCHEMA
>;

export interface ClawcutOpenClawPluginDescriptor {
  pluginId: typeof CLAWCUT_OPENCLAW_PLUGIN_ID;
  pluginVersion: typeof CLAWCUT_OPENCLAW_PLUGIN_VERSION;
  packageName: typeof CLAWCUT_OPENCLAW_PACKAGE_NAME;
  localOnly: true;
  tools: OpenClawToolDefinition[];
  defaultEnabledTools: string[];
  optionalTools: string[];
  transport: {
    kind: "local-http";
    requiredAuth: "bearer";
    discoveryEndpoints: ["/api/v1/capabilities", "/api/v1/openclaw/manifest"];
  };
}

export interface ClawcutOpenClawClientOptions {
  baseUrl: string;
  token: string;
  enableReadOnlyTools?: boolean;
  enabledMutatingTools?: string[];
  enabledHighImpactTools?: string[];
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
  defaultEnabledTools: getDefaultOpenClawToolNames(),
  optionalTools: getOptionalOpenClawToolNames(),
  transport: {
    kind: "local-http",
    requiredAuth: "bearer",
    discoveryEndpoints: ["/api/v1/capabilities", "/api/v1/openclaw/manifest"]
  }
};

export const CLAWCUT_OPENCLAW_PLUGIN_MANIFEST: ClawcutOpenClawPluginManifest =
  CLAWCUT_OPENCLAW_PLUGIN_MANIFEST_SCHEMA.parse(openClawPluginManifestJson);

function validateToolAllowlist(
  toolNames: string[],
  expectedSafetyClass: LocalApiSafetyClass,
  path: "enabledMutatingTools" | "enabledHighImpactTools",
  ctx: z.RefinementCtx
): void {
  for (const toolName of toolNames) {
    const definition = getOpenClawToolDefinition(toolName);

    if (!definition) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Unknown ClawCut OpenClaw tool ${toolName}.`,
        path: [path]
      });
      continue;
    }

    if (definition.safetyClass !== expectedSafetyClass) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${toolName} is ${definition.safetyClass}, not ${expectedSafetyClass}.`,
        path: [path]
      });
    }
  }
}

export function parseClawcutOpenClawPluginConfig(
  input: unknown
): ClawcutOpenClawPluginConfig {
  return CLAWCUT_OPENCLAW_PLUGIN_CONFIG_SCHEMA.parse(input);
}

export function getEnabledOpenClawTools(
  input: unknown
): OpenClawToolDefinition[] {
  const config = parseClawcutOpenClawPluginConfig(input);
  const enabledToolNames = new Set<string>();

  if (config.enableReadOnlyTools) {
    for (const toolName of getDefaultOpenClawToolNames()) {
      enabledToolNames.add(toolName);
    }
  }

  for (const toolName of config.enabledMutatingTools) {
    enabledToolNames.add(toolName);
  }

  for (const toolName of config.enabledHighImpactTools) {
    enabledToolNames.add(toolName);
  }

  return OPENCLAW_TOOL_DEFINITIONS.filter((tool) => enabledToolNames.has(tool.name));
}

export function createStaticOpenClawToolManifest(
  scopes: LocalApiScope[] = [...LOCAL_API_SCOPES]
): OpenClawToolManifest {
  return createOpenClawToolManifest(createLocalApiCapabilities(scopes));
}

export class ClawcutOpenClawClient {
  private readonly baseUrl: string;

  private readonly token: string;

  private readonly config: ClawcutOpenClawPluginConfig;

  private readonly enabledToolNames: Set<string>;

  private readonly fetchImpl: typeof fetch;

  constructor(options: ClawcutOpenClawClientOptions) {
    this.config = parseClawcutOpenClawPluginConfig({
      baseUrl: options.baseUrl,
      token: options.token,
      enableReadOnlyTools: options.enableReadOnlyTools,
      enabledMutatingTools: options.enabledMutatingTools,
      enabledHighImpactTools: options.enabledHighImpactTools
    });
    this.baseUrl = this.config.baseUrl.replace(/\/+$/u, "");
    this.token = this.config.token;
    this.enabledToolNames = new Set(getEnabledOpenClawTools(this.config).map((tool) => tool.name));
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

  getEnabledTools(): OpenClawToolDefinition[] {
    return OPENCLAW_TOOL_DEFINITIONS.filter((tool) => this.enabledToolNames.has(tool.name));
  }

  async invokeTool<TData = unknown>(
    toolName: string,
    input: unknown
  ): Promise<ClawcutToolInvocationResult<TData>> {
    const invocation = mapOpenClawToolInvocation(toolName, input);
    const toolDefinition = getOpenClawToolDefinition(toolName);

    if (!invocation || !toolDefinition) {
      throw new Error(`Unsupported ClawCut OpenClaw tool: ${toolName}`);
    }

    if (!this.enabledToolNames.has(toolName)) {
      const allowlistField =
        toolDefinition.safetyClass === "high-impact"
          ? "enabledHighImpactTools"
          : toolDefinition.safetyClass === "mutating"
            ? "enabledMutatingTools"
            : "enableReadOnlyTools";
      throw new Error(
        `ClawCut OpenClaw tool ${toolName} is not enabled by the current plugin config. Configure ${allowlistField} to expose it.`
      );
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
