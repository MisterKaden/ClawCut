import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test, vi } from "vitest";

import { resolveMediaWorkerLaunchConfig } from "../src/host";

describe("media worker host", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

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

  test("uses the embedded Electron runtime for packaged worker execution", () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "clawcut-host-packaged-"));
    const builtWorkerPath = join(workspaceRoot, "out/media-worker/worker.cjs");

    mkdirSync(join(workspaceRoot, "out/media-worker"), { recursive: true });
    writeFileSync(builtWorkerPath, "module.exports = {};");
    vi.stubEnv("ELECTRON_RUN_AS_NODE", "");

    const config = resolveMediaWorkerLaunchConfig({
      workspaceRoot,
      preferEmbeddedNodeRuntime: true
    });

    expect(config.workerEntryPath).toBe(builtWorkerPath);
    expect(config.execPath).toBe(process.execPath);
    expect(config.env?.ELECTRON_RUN_AS_NODE).toBe("1");
  });
});
