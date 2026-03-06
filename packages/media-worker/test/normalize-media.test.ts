import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

import { normalizeProbeToLibraryData } from "../src/normalize-media";
import {
  normalizeProbePayload,
  type FFprobePayload
} from "../src/probe";

function readFixture(name: string): FFprobePayload {
  const path = resolve(process.cwd(), "packages/media-worker/test/fixtures", name);
  return JSON.parse(readFileSync(path, "utf8")) as FFprobePayload;
}

describe("ffprobe normalization", () => {
  test("normalizes a talking-head video fixture into app-owned metadata", () => {
    const raw = readFixture("talking-head-ffprobe.json");
    const probe = normalizeProbePayload("/tmp/talking-head-sample.mp4", raw);
    const normalized = normalizeProbeToLibraryData(probe);

    expect(probe.container).toContain("mov");
    expect(probe.durationMs).toBeGreaterThan(1_000);
    expect(probe.streamCount).toBe(2);
    expect(normalized.metadataSummary.kind).toBe("video");
    expect(normalized.metadataSummary.hasVideo).toBe(true);
    expect(normalized.metadataSummary.hasAudio).toBe(true);
    expect(normalized.metadataSummary.width).toBe(320);
    expect(normalized.metadataSummary.height).toBe(180);
    expect(normalized.metadataSummary.videoCodec).toBe("h264");
    expect(normalized.metadataSummary.audioCodec).toBe("aac");
    expect(normalized.metadataSummary.streamSignature).toContain("video:h264");
    expect(normalized.metadataSummary.streamSignature).toContain("audio:aac");
  });

  test("normalizes an audio-only fixture without inventing video state", () => {
    const raw = readFixture("podcast-tone-ffprobe.json");
    const probe = normalizeProbePayload("/tmp/podcast-tone.wav", raw);
    const normalized = normalizeProbeToLibraryData(probe);

    expect(normalized.metadataSummary.kind).toBe("audio");
    expect(normalized.metadataSummary.hasVideo).toBe(false);
    expect(normalized.metadataSummary.hasAudio).toBe(true);
    expect(normalized.metadataSummary.audioCodec).toBe("pcm_s16le");
    expect(normalized.metadataSummary.audioSampleRate).toBe(44_100);
    expect(normalized.metadataSummary.channelCount).toBe(1);
    expect(normalized.streams).toHaveLength(1);
    expect(normalized.streams[0]?.codecType).toBe("audio");
  });
});
