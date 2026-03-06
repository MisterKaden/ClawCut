import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { resolveMediaWorkerLaunchConfig } from "../src/host";

describe("media worker host", () => {
  test("prefers the built worker bundle when available", () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "clawcut-host-built-"));
    const builtWorkerPath = join(
      workspaceRoot,
      "apps/desktop/out/media-worker/worker.cjs"
    );

    mkdirSync(join(workspaceRoot, "apps/desktop/out/media-worker"), { recursive: true });
    writeFileSync(builtWorkerPath, "module.exports = {};");

    const config = resolveMediaWorkerLaunchConfig({ workspaceRoot });

    expect(config.workerEntryPath).toBe(builtWorkerPath);
    expect(config.execPath).toBeTruthy();
    expect(config.execArgv).toBeUndefined();
  });

  test("falls back to tsx-backed source execution in development workspaces", () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "clawcut-host-source-"));

    const config = resolveMediaWorkerLaunchConfig({ workspaceRoot });

    expect(config.workerEntryPath.endsWith("packages/media-worker/src/worker.ts")).toBe(true);
    expect(config.execArgv).toEqual(["--import", "tsx"]);
  });
});
