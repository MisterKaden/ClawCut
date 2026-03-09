import { describe, expect, test } from "vitest";

import {
  applyCaptionStyleOverridesToTrack,
  brandKitSchema,
  createTranscriptFromNormalizedResult,
  generateCaptionTrackFromTranscript,
  getBuiltInBrandKits,
  getBuiltInWorkflowTemplates,
  resolveBrandKit,
  workflowTemplateSchema
} from "@clawcut/domain";

describe("workflow and brand-kit domain primitives", () => {
  test("publishes valid built-in workflow templates with explicit safety metadata", () => {
    const templates = getBuiltInWorkflowTemplates().map((template) =>
      workflowTemplateSchema.parse(template)
    );

    expect(templates.some((template) => template.id === "captioned-export-v1")).toBe(true);
    expect(templates.some((template) => template.id === "smart-cleanup-v1")).toBe(true);
    expect(
      templates.find((template) => template.id === "smart-cleanup-v1")?.safetyProfile
        .requiresApproval
    ).toBe(true);
    expect(
      templates.find((template) => template.id === "batch-caption-export-v1")?.batchMode
    ).toBe("clip-batch");
    expect(
      templates.find((template) => template.id === "short-clip-candidates-v1")?.expectedOutputs
    ).toContain("snapshot");
    expect(
      templates.find((template) => template.id === "social-candidate-package-v1")?.expectedOutputs
    ).toContain("candidate-package");
    expect(
      templates.find((template) => template.id === "transcript-range-package-v1")?.expectedOutputs
    ).toContain("transcript-range-selection");
  });

  test("resolves built-in brand kits and applies style overrides to caption tracks", () => {
    const transcript = createTranscriptFromNormalizedResult({
      timelineId: "timeline-1",
      source: {
        kind: "clip",
        timelineId: "timeline-1",
        clipId: "clip-1",
        mediaItemId: "media-1",
        sourceStartUs: 0,
        sourceEndUs: 2_000_000
      },
      result: {
        provider: "faster-whisper",
        model: "tiny",
        language: "en",
        wordTimestamps: true,
        confidence: 0.91,
        warnings: [],
        segments: [
          {
            startUs: 0,
            endUs: 900_000,
            text: "ClawCut makes workflows reviewable",
            confidence: 0.91,
            words: [
              { text: "ClawCut", startUs: 0, endUs: 250_000, confidence: 0.91 },
              { text: "makes", startUs: 260_000, endUs: 430_000, confidence: 0.9 },
              { text: "workflows", startUs: 440_000, endUs: 700_000, confidence: 0.92 },
              { text: "reviewable", startUs: 710_000, endUs: 900_000, confidence: 0.9 }
            ]
          }
        ]
      }
    });
    const baseTrack = generateCaptionTrackFromTranscript({
      timelineId: "timeline-1",
      transcript,
      templateId: "bottom-center-clean"
    });
    const brandKit = brandKitSchema.parse(
      resolveBrandKit("clawcut-social-pop", getBuiltInBrandKits())
    );

    expect(brandKit).not.toBeNull();

    const styledTrack = applyCaptionStyleOverridesToTrack(baseTrack, {
      brandKitId: brandKit.id,
      templateId: brandKit.captionTemplateId,
      styleOverrides: brandKit.captionStyleOverrides
    });

    expect(styledTrack.branding.brandKitId).toBe("clawcut-social-pop");
    expect(styledTrack.templateId).toBe("social-highlight");
    expect(styledTrack.segments[0]?.activeWordHighlight).toBe(true);
    expect(styledTrack.segments[0]?.placement).toBe("bottom-center");
    expect(brandKit.watermarkAsset.kind).toBe("none");
    expect(brandKit.exportPresetBundle.primaryPresetId).toBeTruthy();
  });
});
