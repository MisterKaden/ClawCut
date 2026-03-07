import { describe, expect, test, vi } from "vitest";

import {
  CLAWCUT_OPENCLAW_PLUGIN_DESCRIPTOR,
  ClawcutOpenClawClient,
  createStaticOpenClawToolManifest
} from "../src/index";

describe("openclaw plugin descriptor", () => {
  test("publishes a stable tool manifest", () => {
    const manifest = createStaticOpenClawToolManifest();

    expect(manifest.protocolVersion).toBe("1");
    expect(manifest.tools.some((tool) => tool.name === "clawcut.start_export")).toBe(true);
    expect(manifest.tools.some((tool) => tool.name === "clawcut.capture_preview_frame")).toBe(true);
    expect(CLAWCUT_OPENCLAW_PLUGIN_DESCRIPTOR.transport.kind).toBe("local-http");
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
});
