import { describe, expect, test } from "vitest";

import {
  analyzeSilenceFromWaveform,
  analyzeTranscriptFillerWords,
  analyzeWeakTranscriptSegments,
  compileSmartEditPlan,
  createEmptyDerivedAssetSet,
  createEmptyMetadataSummary,
  createEmptyTimeline,
  createTimelineClip,
  createTimelineTrack,
  createTranscriptFromNormalizedResult,
  generateHighlightSuggestionsFromTranscript,
  type MediaItem,
  type Timeline,
  type TimelineClip
} from "../src/index";

function createMediaItem(id: string, durationMs: number): MediaItem {
  return {
    id,
    displayName: id,
    source: {
      sourceType: "import",
      originalPath: `/tmp/${id}.mp4`,
      currentResolvedPath: `/tmp/${id}.mp4`,
      normalizedOriginalPath: `/tmp/${id}.mp4`,
      normalizedResolvedPath: `/tmp/${id}.mp4`
    },
    importTimestamp: new Date().toISOString(),
    lastSeenTimestamp: new Date().toISOString(),
    fileSize: 42,
    fileModifiedTimeMs: 10,
    fingerprint: {
      strategy: "partial-sha256",
      quickHash: `${id}-hash`,
      fileSize: 42,
      modifiedTimeMs: 10,
      sampleSizeBytes: 42
    },
    sourceRevision: `${id}-revision`,
    metadataSummary: {
      ...createEmptyMetadataSummary(),
      kind: "video",
      durationMs,
      hasVideo: true,
      hasAudio: true,
      container: "mp4",
      streamSignature: `${id}-signature`
    },
    streams: [],
    ingestStatus: "ready",
    relinkStatus: "linked",
    errorState: null,
    derivedAssets: createEmptyDerivedAssetSet()
  };
}

function createTimelineFixture(): { timeline: Timeline; clip: TimelineClip; mediaItem: MediaItem } {
  const timeline = createEmptyTimeline("timeline-smart");
  const videoTrack = createTimelineTrack("video", "V1", "track-video");
  const audioTrack = createTimelineTrack("audio", "A1", "track-audio");
  timeline.trackOrder = [videoTrack.id, audioTrack.id];
  timeline.tracksById = {
    [videoTrack.id]: videoTrack,
    [audioTrack.id]: audioTrack
  };

  const clip = createTimelineClip({
    id: "clip-smart",
    trackId: videoTrack.id,
    mediaItemId: "media-smart",
    streamType: "video",
    sourceInUs: 0,
    sourceOutUs: 4_000_000,
    timelineStartUs: 1_000_000
  });
  const audioClip = createTimelineClip({
    id: "clip-smart-audio",
    trackId: audioTrack.id,
    mediaItemId: "media-smart",
    streamType: "audio",
    sourceInUs: 0,
    sourceOutUs: 4_000_000,
    timelineStartUs: 1_000_000
  });

  timeline.clipsById = {
    [clip.id]: clip,
    [audioClip.id]: audioClip
  };
  timeline.tracksById[videoTrack.id].clipIds = [clip.id];
  timeline.tracksById[audioTrack.id].clipIds = [audioClip.id];

  return {
    timeline,
    clip,
    mediaItem: createMediaItem("media-smart", 4_000)
  };
}

function createTranscript(clip: TimelineClip) {
  return createTranscriptFromNormalizedResult({
    id: "transcript-smart",
    timelineId: "timeline-smart",
    source: {
      kind: "clip",
      timelineId: "timeline-smart",
      clipId: clip.id,
      mediaItemId: clip.mediaItemId,
      sourceStartUs: clip.sourceInUs,
      sourceEndUs: clip.sourceOutUs
    },
    result: {
      provider: "faster-whisper",
      model: "tiny",
      language: "en",
      confidence: 0.89,
      wordTimestamps: true,
      warnings: [],
      segments: [
        {
          startUs: 0,
          endUs: 1_000_000,
          text: "Um welcome to ClawCut",
          confidence: 0.86,
          words: [
            { text: "Um", startUs: 0, endUs: 160_000, confidence: 0.74 },
            { text: "welcome", startUs: 180_000, endUs: 420_000, confidence: 0.92 },
            { text: "to", startUs: 430_000, endUs: 500_000, confidence: 0.91 },
            { text: "ClawCut", startUs: 520_000, endUs: 1_000_000, confidence: 0.95 }
          ]
        },
        {
          startUs: 1_100_000,
          endUs: 2_600_000,
          text: "This keynote moment is incredibly useful",
          confidence: 0.89,
          words: [
            { text: "This", startUs: 1_100_000, endUs: 1_280_000, confidence: 0.9 },
            { text: "keynote", startUs: 1_300_000, endUs: 1_620_000, confidence: 0.9 },
            { text: "moment", startUs: 1_640_000, endUs: 1_930_000, confidence: 0.89 },
            { text: "is", startUs: 1_950_000, endUs: 2_020_000, confidence: 0.9 },
            { text: "incredibly", startUs: 2_040_000, endUs: 2_320_000, confidence: 0.87 },
            { text: "useful", startUs: 2_340_000, endUs: 2_600_000, confidence: 0.9 }
          ]
        },
        {
          startUs: 2_900_000,
          endUs: 3_800_000,
          text: "Okay",
          confidence: 0.65,
          words: [{ text: "Okay", startUs: 2_900_000, endUs: 3_800_000, confidence: 0.65 }]
        }
      ]
    }
  });
}

describe("smart editing", () => {
  test("finds removable silence spans from waveform envelopes", () => {
    const { clip, mediaItem } = createTimelineFixture();

    const suggestionSet = analyzeSilenceFromWaveform({
      timelineId: "timeline-smart",
      clip,
      mediaItem,
      waveform: {
        durationMs: 4_000,
        bucketCount: 8,
        peaks: [0.22, 0.2, 0.01, 0.01, 0.01, 0.24, 0.18, 0.16],
        rms: [0.12, 0.11, 0.01, 0.01, 0.01, 0.1, 0.09, 0.08]
      },
      options: {
        amplitudeThreshold: 0.02,
        peakThreshold: 0.02,
        minimumDurationUs: 900_000
      }
    });

    expect(suggestionSet.analysisType).toBe("silence");
    expect(suggestionSet.items).toHaveLength(1);
    expect(suggestionSet.items[0]?.type).toBe("silence");
    expect(suggestionSet.items[0]?.target.startUs).toBe(2_000_000);
    expect(suggestionSet.items[0]?.target.endUs).toBe(3_500_000);
  });

  test("flags filler words with timing-linked rationale", () => {
    const { clip } = createTimelineFixture();
    const transcript = createTranscript(clip);

    const suggestionSet = analyzeTranscriptFillerWords({
      timelineId: "timeline-smart",
      clip,
      transcript,
      options: {
        vocabulary: ["um", "you know"],
        paddingUs: 120_000
      }
    });

    expect(suggestionSet.analysisType).toBe("filler-words");
    expect(suggestionSet.items).toHaveLength(1);
    expect(suggestionSet.items[0]?.type).toBe("filler-word");
    expect(suggestionSet.items[0]?.evidence[0]?.kind).toBe("transcript-word");
    expect(suggestionSet.items[0]?.target.startUs).toBe(880_000);
  });

  test("scores weak segments and explainable highlight candidates", () => {
    const { clip } = createTimelineFixture();
    const transcript = createTranscript(clip);

    const weakSegments = analyzeWeakTranscriptSegments({
      timelineId: "timeline-smart",
      clip,
      transcript,
      options: {
        minimumDurationUs: 500_000,
        wordsPerSecondThreshold: 1.2
      }
    });
    const highlights = generateHighlightSuggestionsFromTranscript({
      timelineId: "timeline-smart",
      clip,
      transcript,
      options: {
        minimumDurationUs: 800_000,
        maximumDurationUs: 2_000_000,
        keywordBoostTerms: ["keynote", "useful"],
        minimumScore: 0.4
      }
    });

    expect(weakSegments.items.some((item) => item.type === "weak-segment")).toBe(true);
    expect(highlights.items.length).toBeGreaterThan(0);
    expect(highlights.items[0]?.type).toBe("highlight");
    expect(highlights.items.some((item) => item.evidence.some((evidence) => evidence.kind === "keyword"))).toBe(
      true
    );
  });

  test("compiles smart suggestions into explicit editor commands without mutating the original timeline", () => {
    const { clip, timeline } = createTimelineFixture();
    const transcript = createTranscript(clip);
    const fillerSuggestions = analyzeTranscriptFillerWords({
      timelineId: "timeline-smart",
      clip,
      transcript,
      options: {
        vocabulary: ["um"],
        paddingUs: 120_000
      }
    });
    const highlightSuggestions = generateHighlightSuggestionsFromTranscript({
      timelineId: "timeline-smart",
      clip,
      transcript,
      options: {
        minimumDurationUs: 800_000,
        maximumDurationUs: 2_000_000,
        keywordBoostTerms: ["keynote"],
        minimumScore: 0.3
      }
    });

    const plan = compileSmartEditPlan({
      timeline,
      suggestionSetId: fillerSuggestions.id,
      suggestions: [fillerSuggestions.items[0]!, highlightSuggestions.items[0]!]
    });

    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[0]?.command.type).toBe("RippleDeleteRange");
    expect(plan.steps[1]?.command.type).toBe("AddRegion");
    expect(plan.summary.predictedRemovedDurationUs).toBeGreaterThan(0);
    expect(timeline.regions).toHaveLength(0);
  });
});
