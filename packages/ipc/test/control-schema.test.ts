import { describe, expect, test } from "vitest";

import {
  LOCAL_API_COMMAND_DEFINITIONS,
  LOCAL_API_QUERY_DEFINITIONS,
  OPENCLAW_TOOL_DEFINITIONS,
  createLocalApiCapabilities,
  createOpenClawToolManifest,
  mapOpenClawToolInvocation,
  parseLocalApiCommandInput,
  parseLocalApiQueryInput,
  resolveLocalApiQueryName
} from "../src/control-schema";

describe("control schema", () => {
  test("covers safety classification for every published operation", () => {
    for (const definition of [...LOCAL_API_COMMAND_DEFINITIONS, ...LOCAL_API_QUERY_DEFINITIONS]) {
      expect(definition.safetyClass).toBeTruthy();
      expect(definition.mutability).toBeTruthy();
      expect(definition.execution).toBeTruthy();
      expect(definition.inputSchema.type).toBe("object");
    }
  });

  test("resolves legacy query aliases", () => {
    expect(resolveLocalApiQueryName("timeline.session")).toBe("timeline.get");
    expect(resolveLocalApiQueryName("media.snapshot")).toBe("media.list");
  });

  test("validates canonical command and query inputs", () => {
    expect(() =>
      parseLocalApiCommandInput("timeline.insertClip", {
        directory: "/tmp/project",
        timelineId: "timeline-1",
        trackId: "track-1",
        mediaItemId: "media-1",
        streamType: "video",
        timelineStartUs: 0
      })
    ).not.toThrow();

    expect(() =>
      parseLocalApiQueryInput("media.inspect", {
        directory: "/tmp/project"
      })
    ).toThrow();
  });

  test("builds a machine-readable manifest with OpenClaw tools", () => {
    const manifest = createOpenClawToolManifest(createLocalApiCapabilities(["read", "preview"]));

    expect(manifest.protocolVersion).toBe("1");
    expect(manifest.tools.some((tool) => tool.name === "clawcut.open_project")).toBe(true);
    expect(manifest.tools.some((tool) => tool.name === "clawcut.capture_preview_frame")).toBe(true);
    expect(manifest.capabilityAvailability.openClawPlugin).toBe(true);
    expect(manifest.toolExposure.defaultEnabled).toContain("clawcut.get_project_summary");
    expect(manifest.toolExposure.optionalAllowlist).toContain("clawcut.open_project");
    expect(manifest.toolExposure.defaultEnabled).toContain("clawcut.list_workflows");
    expect(manifest.toolExposure.optionalAllowlist).toContain("clawcut.start_workflow");
  });

  test("maps OpenClaw preview frame capture requests to the lighter frame reference by default", () => {
    const invocation = mapOpenClawToolInvocation("clawcut.capture_preview_frame", {});

    expect(invocation).toEqual({
      operationType: "query",
      name: "preview.frame-reference",
      input: {}
    });
  });

  test("maps suggestion preview seek tools to the explicit smart preview operation", () => {
    const invocation = mapOpenClawToolInvocation("clawcut.seek_preview_to_suggestion", {
      directory: "/tmp/project",
      suggestionSetId: "suggestion-set-1",
      suggestionId: "suggestion-1"
    });

    expect(invocation).toEqual({
      operationType: "command",
      name: "smart.seekPreviewToSuggestion",
      input: {
        directory: "/tmp/project",
        suggestionSetId: "suggestion-set-1",
        suggestionId: "suggestion-1"
      }
    });
  });

  test("publishes explicit high-impact tools", () => {
    const highImpactTools = OPENCLAW_TOOL_DEFINITIONS.filter(
      (tool) => tool.safetyClass === "high-impact"
    );

    expect(highImpactTools.some((tool) => tool.name === "clawcut.import_media")).toBe(true);
    expect(highImpactTools.some((tool) => tool.name === "clawcut.start_export")).toBe(true);
    expect(highImpactTools.some((tool) => tool.name === "clawcut.apply_suggestion")).toBe(true);
  });

  test("only exposes read-only tools by default", () => {
    const defaultEnabled = OPENCLAW_TOOL_DEFINITIONS.filter((tool) => tool.availableByDefault);

    expect(defaultEnabled.every((tool) => tool.safetyClass === "read-only")).toBe(true);
    expect(
      OPENCLAW_TOOL_DEFINITIONS.find((tool) => tool.name === "clawcut.open_project")
        ?.availableByDefault
    ).toBe(false);
    expect(
      OPENCLAW_TOOL_DEFINITIONS.find((tool) => tool.name === "clawcut.analyze_silence")
        ?.availableByDefault
    ).toBe(true);
    expect(
      OPENCLAW_TOOL_DEFINITIONS.find((tool) => tool.name === "clawcut.apply_suggestion")
        ?.availableByDefault
    ).toBe(false);
    expect(
      OPENCLAW_TOOL_DEFINITIONS.find((tool) => tool.name === "clawcut.seek_preview_to_suggestion")
        ?.availableByDefault
    ).toBe(false);
    expect(
      OPENCLAW_TOOL_DEFINITIONS.find((tool) => tool.name === "clawcut.list_workflows")
        ?.availableByDefault
    ).toBe(true);
    expect(
      OPENCLAW_TOOL_DEFINITIONS.find((tool) => tool.name === "clawcut.start_workflow")
        ?.availableByDefault
    ).toBe(false);
  });
});
