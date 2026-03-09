import { describe, expect, test, vi } from "vitest";

import {
  CLAWCUT_OPENCLAW_PLUGIN_DESCRIPTOR,
  CLAWCUT_OPENCLAW_PLUGIN_MANIFEST,
  ClawcutOpenClawClient,
  getEnabledOpenClawTools,
  parseClawcutOpenClawPluginConfig,
  createStaticOpenClawToolManifest
} from "../src/index";

describe("openclaw plugin descriptor", () => {
  test("publishes a stable tool manifest", () => {
    const manifest = createStaticOpenClawToolManifest();

    expect(manifest.protocolVersion).toBe("1");
    expect(manifest.tools.some((tool) => tool.name === "clawcut.start_export")).toBe(true);
    expect(manifest.tools.some((tool) => tool.name === "clawcut.capture_preview_frame")).toBe(true);
    expect(manifest.tools.some((tool) => tool.name === "clawcut.list_candidate_packages")).toBe(true);
    expect(manifest.tools.some((tool) => tool.name === "clawcut.review_candidate_package")).toBe(true);
    expect(manifest.toolExposure.defaultEnabled).toContain("clawcut.get_project_summary");
    expect(manifest.toolExposure.optionalAllowlist).toContain("clawcut.start_export");
    expect(manifest.toolExposure.defaultEnabled).toContain("clawcut.list_workflows");
    expect(manifest.toolExposure.optionalAllowlist).toContain("clawcut.start_workflow");
    expect(manifest.toolExposure.defaultEnabled).toContain("clawcut.list_workflow_audit_events");
    expect(manifest.toolExposure.optionalAllowlist).toContain("clawcut.review_candidate_package");
    expect(CLAWCUT_OPENCLAW_PLUGIN_DESCRIPTOR.transport.kind).toBe("local-http");
    expect(CLAWCUT_OPENCLAW_PLUGIN_DESCRIPTOR.defaultEnabledTools).toContain(
      "clawcut.capture_preview_frame"
    );
    expect(CLAWCUT_OPENCLAW_PLUGIN_DESCRIPTOR.defaultEnabledTools).toContain(
      "clawcut.list_workflows"
    );
    expect(CLAWCUT_OPENCLAW_PLUGIN_DESCRIPTOR.optionalTools).toContain("clawcut.start_export");
    expect(CLAWCUT_OPENCLAW_PLUGIN_DESCRIPTOR.optionalTools).toContain("clawcut.start_workflow");
    expect(CLAWCUT_OPENCLAW_PLUGIN_MANIFEST.defaultToolPolicy.highImpact).toBe("allowlist");
  });

  test("maps OpenClaw trim requests onto the canonical transport operations", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      void init;
      return {
        async json() {
          return {
            ok: true,
            apiVersion: "v1",
            requestId: "req-1",
            name: "timeline.trimClipEnd",
            warnings: [],
            data: {
              ok: true
            }
          };
        }
      } as Response;
    });

    const client = new ClawcutOpenClawClient({
      baseUrl: "http://127.0.0.1:42170",
      token: "token",
      enabledMutatingTools: ["clawcut.trim_clip"],
      fetchImpl: fetchImpl as unknown as typeof fetch
    });

    const result = await client.invokeTool("clawcut.trim_clip", {
      directory: "/tmp/project",
      timelineId: "timeline-1",
      clipId: "clip-1",
      edge: "end",
      positionUs: 750_000
    });

    expect(result.operationName).toBe("timeline.trimClipEnd");
    expect(fetchImpl).toHaveBeenCalledOnce();
    const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
    expect(body.name).toBe("timeline.trimClipEnd");
    expect(body.input.newTimelineEndUs).toBe(750_000);
  });

  test("validates plugin config and exposes only read-only tools by default", () => {
    const config = parseClawcutOpenClawPluginConfig({
      baseUrl: "http://127.0.0.1:42170",
      token: "token"
    });

    const enabledTools = getEnabledOpenClawTools(config);

    expect(enabledTools.some((tool) => tool.name === "clawcut.get_project_summary")).toBe(true);
    expect(enabledTools.some((tool) => tool.name === "clawcut.start_export")).toBe(false);
  });

  test("rejects allowlists that mix the wrong safety class", () => {
    expect(() =>
      parseClawcutOpenClawPluginConfig({
        baseUrl: "http://127.0.0.1:42170",
        token: "token",
        enabledMutatingTools: ["clawcut.start_export"]
      })
    ).toThrow(/high-impact/u);
  });

  test("blocks non-allowlisted mutating tools by default and permits them when enabled", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      void init;
      return {
        async json() {
          return {
            ok: true,
            apiVersion: "v1",
            requestId: "req-2",
            name: "captions.generateTrack",
            warnings: [],
            data: {
              ok: true
            }
          };
        }
      } as Response;
    });

    const defaultClient = new ClawcutOpenClawClient({
      baseUrl: "http://127.0.0.1:42170",
      token: "token",
      fetchImpl: fetchImpl as unknown as typeof fetch
    });

    await expect(
      defaultClient.invokeTool("clawcut.generate_captions", {
        directory: "/tmp/project",
        timelineId: "timeline-1",
        transcriptId: "transcript-1",
        templateId: "bottom-center-clean"
      })
    ).rejects.toThrow(/not enabled/u);

    const allowlistedClient = new ClawcutOpenClawClient({
      baseUrl: "http://127.0.0.1:42170",
      token: "token",
      enabledMutatingTools: ["clawcut.generate_captions"],
      fetchImpl: fetchImpl as unknown as typeof fetch
    });

    await allowlistedClient.invokeTool("clawcut.generate_captions", {
      directory: "/tmp/project",
      timelineId: "timeline-1",
      transcriptId: "transcript-1",
      templateId: "bottom-center-clean"
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  test("treats workflow start as an allowlisted high-impact tool", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      void init;
      return {
        async json() {
          return {
            ok: true,
            apiVersion: "v1",
            requestId: "req-3",
            name: "workflow.start",
            warnings: [],
            data: {
              snapshot: {},
              result: {
                ok: true,
                commandType: "StartWorkflow",
                workflowRun: {
                  id: "workflow-run-1"
                }
              }
            }
          };
        }
      } as Response;
    });

    const defaultClient = new ClawcutOpenClawClient({
      baseUrl: "http://127.0.0.1:42170",
      token: "token",
      fetchImpl: fetchImpl as unknown as typeof fetch
    });

    await expect(
      defaultClient.invokeTool("clawcut.start_workflow", {
        directory: "/tmp/project",
        templateId: "captioned-export-v1",
        input: {
          clipId: "clip-1"
        }
      })
    ).rejects.toThrow(/not enabled/u);

    const allowlistedClient = new ClawcutOpenClawClient({
      baseUrl: "http://127.0.0.1:42170",
      token: "token",
      enabledHighImpactTools: ["clawcut.start_workflow"],
      fetchImpl: fetchImpl as unknown as typeof fetch
    });

    const result = await allowlistedClient.invokeTool("clawcut.start_workflow", {
      directory: "/tmp/project",
      templateId: "captioned-export-v1",
      input: {
        clipId: "clip-1"
      }
    });

    expect(result.operationName).toBe("workflow.start");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
