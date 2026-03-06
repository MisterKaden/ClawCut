import { mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, test } from "vitest";

import { buildQuickFingerprint } from "../src/fingerprint";

describe("media fingerprinting", () => {
  test("uses full hashing for very small files", async () => {
    const directory = mkdtempSync(join(tmpdir(), "clawcut-fingerprint-"));
    const filePath = join(directory, "tiny.txt");
    writeFileSync(filePath, "clawcut-stage-2");

    const result = await buildQuickFingerprint(filePath);

    expect(result.fingerprint.strategy).toBe("full-sha256");
    expect(result.fingerprint.quickHash).toHaveLength(64);
    expect(result.fileSize).toBeGreaterThan(0);
  });

  test("produces a stable quick fingerprint for the same imported asset", async () => {
    const fixturePath = resolve(process.cwd(), "fixtures/media/talking-head-sample.mp4");

    const first = await buildQuickFingerprint(fixturePath);
    const second = await buildQuickFingerprint(fixturePath);

    expect(first.fingerprint.strategy).toBe("full-sha256");
    expect(first.fingerprint.quickHash).toBe(second.fingerprint.quickHash);
    expect(first.sourceRevision).toBe(second.sourceRevision);
  });

  test("distinguishes different source media", async () => {
    const videoPath = resolve(process.cwd(), "fixtures/media/talking-head-sample.mp4");
    const audioPath = resolve(process.cwd(), "fixtures/media/podcast-tone.wav");

    const video = await buildQuickFingerprint(videoPath);
    const audio = await buildQuickFingerprint(audioPath);

    expect(video.fingerprint.quickHash).not.toBe(audio.fingerprint.quickHash);
    expect(video.sourceRevision).not.toBe(audio.sourceRevision);
  });

  test("keeps the quick hash stable when only modified time changes", async () => {
    const directory = mkdtempSync(join(tmpdir(), "clawcut-fingerprint-mtime-"));
    const filePath = join(directory, "mtime.txt");
    writeFileSync(filePath, "stable-content");

    const first = await buildQuickFingerprint(filePath);
    utimesSync(filePath, new Date("2024-01-01T00:00:00.000Z"), new Date("2025-01-01T00:00:00.000Z"));
    const second = await buildQuickFingerprint(filePath);

    expect(first.fingerprint.quickHash).toBe(second.fingerprint.quickHash);
    expect(first.fileModifiedTimeMs).not.toBe(second.fileModifiedTimeMs);
  });
});
