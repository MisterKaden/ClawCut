import { describe, expect, test } from "vitest";

import {
  applyCaptionTemplateToTrack,
  composeTranscriptionPrompt,
  createTranscriptFromNormalizedResult,
  formatCaptionTrackAsAss,
  formatCaptionTrackAsSrt,
  generateCaptionTrackFromTranscript,
  normalizeTranscriptionOptions,
  resolveActiveCaptionOverlays,
  resolveCaptionTemplate,
  summarizeTranscript,
  updateTranscriptSegmentText,
  type Transcript
} from "../src/index";

function createTranscriptFixture(): Transcript {
  return createTranscriptFromNormalizedResult({
    id: "transcript-1",
    timelineId: "timeline-1",
    source: {
      kind: "clip",
      timelineId: "timeline-1",
      clipId: "clip-1",
      mediaItemId: "media-1",
      sourceStartUs: 0,
      sourceEndUs: 2_000_000
    },
    createdAt: "2026-03-06T08:00:00.000Z",
    result: {
      language: "en",
      provider: "faster-whisper",
      model: "base",
      wordTimestamps: true,
      confidence: 0.91,
      warnings: [],
      segments: [
        {
          startUs: 0,
          endUs: 1_000_000,
          text: "Hello there, editor.",
          confidence: 0.9,
          words: [
            { text: "Hello", startUs: 0, endUs: 250_000, confidence: 0.95 },
            { text: "there,", startUs: 250_000, endUs: 600_000, confidence: 0.93 },
            { text: "editor.", startUs: 600_000, endUs: 1_000_000, confidence: 0.92 }
          ]
        },
        {
          startUs: 1_100_000,
          endUs: 1_900_000,
          text: "Keep captions readable and timed.",
          confidence: 0.88,
          words: [
            { text: "Keep", startUs: 1_100_000, endUs: 1_300_000, confidence: 0.88 },
            { text: "captions", startUs: 1_300_000, endUs: 1_550_000, confidence: 0.89 },
            { text: "readable", startUs: 1_550_000, endUs: 1_700_000, confidence: 0.9 },
            { text: "and", startUs: 1_700_000, endUs: 1_780_000, confidence: 0.87 },
            { text: "timed.", startUs: 1_780_000, endUs: 1_900_000, confidence: 0.86 }
          ]
        }
      ]
    }
  });
}

describe("captions domain", () => {
  test("normalizes transcript segments and preserves word-level timing", () => {
    const transcript = createTranscriptFixture();

    expect(transcript.language).toBe("en");
    expect(transcript.segments).toHaveLength(2);
    expect(transcript.segments[0]?.words).toHaveLength(3);
    expect(transcript.segments[0]?.words[1]?.startUs).toBe(250_000);
    expect(transcript.segments[0]?.words[1]?.punctuationRole).toBe("trailing");
  });

  test("editing a transcript segment preserves timing and word source data", () => {
    const transcript = createTranscriptFixture();
    const segmentId = transcript.segments[0]!.id;
    const originalWords = transcript.segments[0]!.words;
    const updated = updateTranscriptSegmentText(
      transcript,
      segmentId,
      "Hello there, tighter edit.",
      "2026-03-06T08:05:00.000Z"
    );

    expect(updated.isUserEdited).toBe(true);
    expect(updated.updatedAt).toBe("2026-03-06T08:05:00.000Z");
    expect(updated.segments[0]?.isUserEdited).toBe(true);
    expect(updated.segments[0]?.text).toBe("Hello there, tighter edit.");
    expect(updated.segments[0]?.startUs).toBe(transcript.segments[0]?.startUs);
    expect(updated.segments[0]?.words).toEqual(originalWords);
  });

  test("generates caption tracks from transcript segments and applies template state", () => {
    const transcript = createTranscriptFixture();
    const track = generateCaptionTrackFromTranscript({
      timelineId: "timeline-1",
      transcript,
      templateId: "bottom-center-clean",
      name: "Stage 6 Captions",
      createdAt: "2026-03-06T08:10:00.000Z"
    });

    expect(track.name).toBe("Stage 6 Captions");
    expect(track.segments).toHaveLength(2);
    expect(track.segments[0]?.sourceTranscriptSegmentId).toBe(transcript.segments[0]?.id);
    expect(track.segments[0]?.words[0]?.sourceTranscriptWordId).toBe(
      transcript.segments[0]?.words[0]?.id
    );

    const rethemed = applyCaptionTemplateToTrack(
      track,
      "karaoke-highlight",
      "2026-03-06T08:11:00.000Z"
    );

    expect(rethemed.templateId).toBe("karaoke-highlight");
    expect(rethemed.updatedAt).toBe("2026-03-06T08:11:00.000Z");
    expect(rethemed.segments.every((segment) => segment.activeWordHighlight)).toBe(true);
  });

  test("formats SRT and ASS output deterministically", () => {
    const transcript = createTranscriptFixture();
    const track = applyCaptionTemplateToTrack(
      generateCaptionTrackFromTranscript({
        timelineId: "timeline-1",
        transcript,
        templateId: "karaoke-highlight"
      }),
      "karaoke-highlight"
    );
    const template = resolveCaptionTemplate("karaoke-highlight");

    expect(template).not.toBeNull();

    if (!template) {
      return;
    }

    const srt = formatCaptionTrackAsSrt(track);
    const ass = formatCaptionTrackAsAss(track, template);

    expect(srt).toContain("00:00:00,000 --> 00:00:01,000");
    expect(srt).toContain("Hello there, editor.");
    expect(ass).toContain("[Script Info]");
    expect(ass).toContain("Style: Default");
    expect(ass).toContain("{\\k");
  });

  test("resolves active caption overlays with active-word highlighting", () => {
    const transcript = createTranscriptFixture();
    const track = applyCaptionTemplateToTrack(
      generateCaptionTrackFromTranscript({
        timelineId: "timeline-1",
        transcript,
        templateId: "karaoke-highlight"
      }),
      "karaoke-highlight"
    );
    const overlays = resolveActiveCaptionOverlays(
      [track],
      [resolveCaptionTemplate("karaoke-highlight")!],
      1_350_000
    );

    expect(overlays).toHaveLength(1);
    expect(overlays[0]?.placement).toBe("bottom-center");
    expect(overlays[0]?.backgroundStyle).toBe("boxed");
    expect(overlays[0]?.activeWordStyle).toBe("highlight");
    expect(overlays[0]?.tokens.some((token) => token.active)).toBe(true);
    expect(overlays[0]?.tokens[0]?.startUs).toBe(1_100_000);
    expect(overlays[0]?.tokens[0]?.sourceTranscriptWordId).toBe(
      track.segments[1]?.words[0]?.sourceTranscriptWordId
    );
  });

  test("normalizes glossary terms and composes prompt guidance", () => {
    const options = normalizeTranscriptionOptions({
      initialPrompt: " Recognize product names clearly. ",
      glossaryTerms: ["ClawCut", " OpenClaw ", "ClawCut", ""]
    });

    expect(options.initialPrompt).toBe("Recognize product names clearly.");
    expect(options.glossaryTerms).toEqual(["ClawCut", "OpenClaw"]);
    expect(composeTranscriptionPrompt(options)).toContain("ClawCut, OpenClaw");
  });

  test("summarizes transcript timing and caption coverage for automation callers", () => {
    const transcript = createTranscriptFixture();
    const track = generateCaptionTrackFromTranscript({
      timelineId: "timeline-1",
      transcript,
      templateId: "bottom-center-clean"
    });
    const summary = summarizeTranscript(transcript, [track]);

    expect(summary.segmentCount).toBe(2);
    expect(summary.wordCount).toBe(8);
    expect(summary.wordTimingCoverageRatio).toBe(1);
    expect(summary.captionCoverage.trackCount).toBe(1);
    expect(summary.captionCoverage.coverageRatio).toBe(1);
    expect(summary.captionCoverage.tracks[0]?.templateId).toBe("bottom-center-clean");
    expect(summary.textPreview).toContain("Hello there");
  });
});
