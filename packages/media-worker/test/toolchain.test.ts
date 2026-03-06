import { describe, expect, test, vi } from "vitest";

import { detectToolchain } from "../src/toolchain";

describe("toolchain detection", () => {
  test("resolves ffmpeg and ffprobe from PATH", () => {
    const result = detectToolchain();

    expect(result.tools.ffmpeg.name).toBe("ffmpeg");
    expect(result.tools.ffprobe.name).toBe("ffprobe");
  });

  test("surfaces missing binaries with remediation hints", async () => {
    const originalEnv = process.env.PATH;

    vi.stubEnv("PATH", "");
    vi.stubEnv("CLAWCUT_FFMPEG_PATH", "");
    vi.stubEnv("CLAWCUT_FFPROBE_PATH", "");

    const { detectToolchain: detectWithoutPath } = await import("../src/toolchain");
    const result = detectWithoutPath();

    expect(result.status).toBe("error");
    expect(result.tools.ffmpeg.remediationHint).toContain("Install ffmpeg");
    expect(result.tools.ffprobe.remediationHint).toContain("Install ffprobe");

    vi.unstubAllEnvs();
    process.env.PATH = originalEnv;
  });
});
