import type { MediaItem } from "@clawcut/domain";
import type { MediaProbeResult } from "@clawcut/ipc";
import { describe, expect, test } from "vitest";

import { evaluateRelinkCandidate } from "../src/relink";
import type { FileFingerprintResult } from "../src/fingerprint";

function createMediaItem(): MediaItem {
  return {
    id: "media-item-1",
    displayName: "Episode Take",
    source: {
      sourceType: "import",
      originalPath: "/shots/episode-take.mp4",
      currentResolvedPath: null,
      normalizedOriginalPath: "/shots/episode-take.mp4",
      normalizedResolvedPath: null
    },
    importTimestamp: new Date().toISOString(),
    lastSeenTimestamp: null,
    fileSize: 4_096,
    fileModifiedTimeMs: 10,
    fingerprint: {
      strategy: "partial-sha256",
      quickHash: "exact-hash",
      fileSize: 4_096,
      modifiedTimeMs: 10,
      sampleSizeBytes: 192
    },
    sourceRevision: "exact-revision",
    metadataSummary: {
      kind: "video",
      container: "mov,mp4,m4a,3gp,3g2,mj2",
      durationMs: 1_200,
      bitRate: 123_000,
      hasVideo: true,
      hasAudio: true,
      width: 1920,
      height: 1080,
      frameRate: 24,
      pixelFormat: "yuv420p",
      rotation: null,
      videoCodec: "h264",
      audioCodec: "aac",
      audioSampleRate: 48_000,
      channelCount: 2,
      streamSignature: "video:h264:1920x1080@24.00|audio:aac:48000:2"
    },
    streams: [],
    ingestStatus: "missing",
    relinkStatus: "missing",
    errorState: null,
    derivedAssets: {
      thumbnail: null,
      waveform: null,
      proxy: null
    }
  };
}

function createProbe(overrides: Partial<MediaProbeResult> = {}): MediaProbeResult {
  return {
    assetPath: "/relinked/episode-take-v2.mp4",
    displayName: "episode-take-v2.mp4",
    container: "mov,mp4,m4a,3gp,3g2,mj2",
    durationMs: 1_240,
    bitRate: 122_000,
    width: 1920,
    height: 1080,
    frameRate: 24,
    pixelFormat: "yuv420p",
    rotation: null,
    videoCodec: "h264",
    audioCodec: "aac",
    audioSampleRate: 48_000,
    channelCount: 2,
    streamSignature: "video:h264:1920x1080@24.00|audio:aac:48000:2",
    streamCount: 2,
    streams: [],
    ...overrides
  };
}

function createFingerprint(overrides: Partial<FileFingerprintResult> = {}): FileFingerprintResult {
  return {
    fingerprint: {
      strategy: "partial-sha256",
      quickHash: "different-hash",
      fileSize: 4_096,
      modifiedTimeMs: 20,
      sampleSizeBytes: 192
    },
    sourceRevision: "different-revision",
    fileSize: 4_096,
    fileModifiedTimeMs: 20,
    ...overrides
  };
}

describe("relink matching", () => {
  test("accepts an exact fingerprint match", () => {
    const mediaItem = createMediaItem();
    const result = evaluateRelinkCandidate(
      mediaItem,
      "/relinked/episode-take.mp4",
      createFingerprint({
        fingerprint: {
          ...mediaItem.fingerprint,
          strategy: "partial-sha256"
        },
        sourceRevision: mediaItem.sourceRevision,
        fileSize: mediaItem.fileSize ?? 0,
        fileModifiedTimeMs: mediaItem.fileModifiedTimeMs
      }),
      createProbe()
    );

    expect(result.accepted).toBe(true);
    expect(result.confidence).toBe("exact");
    expect(result.requiresDerivedRefresh).toBe(false);
  });

  test("accepts a probable match when safe heuristics align", () => {
    const result = evaluateRelinkCandidate(
      createMediaItem(),
      "/relinked/episode-take-v2.mp4",
      createFingerprint(),
      createProbe()
    );

    expect(result.accepted).toBe(true);
    expect(result.confidence).toBe("probable");
    expect(result.requiresDerivedRefresh).toBe(true);
  });

  test("rejects unsafe candidates", () => {
    const result = evaluateRelinkCandidate(
      createMediaItem(),
      "/relinked/random-broll.mp4",
      createFingerprint({
        fileSize: 9_999,
        fingerprint: {
          strategy: "partial-sha256",
          quickHash: "another-hash",
          fileSize: 9_999,
          modifiedTimeMs: 20,
          sampleSizeBytes: 192
        }
      }),
      createProbe({
        durationMs: 4_200,
        streamSignature: "video:prores:3840x2160@25.00|audio:pcm_s24le:48000:2"
      })
    );

    expect(result.accepted).toBe(false);
    expect(result.confidence).toBe("unsafe");
  });
});
