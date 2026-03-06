import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { _electron as electron } from "playwright";

async function runSmoke(): Promise<void> {
  const require = createRequire(import.meta.url);
  const workspaceRoot = resolve(process.cwd());
  const appRoot = resolve(workspaceRoot, "apps/desktop");
  const electronBinary = require("electron") as string;
  const mainEntry = resolve(appRoot, "out/main/index.js");
  const projectDirectory = mkdtempSync(join(tmpdir(), "clawcut-smoke-"));

  const electronApp = await electron.launch({
    executablePath: electronBinary,
    args: [mainEntry],
    cwd: workspaceRoot,
    env: {
      ...process.env,
      CLAWCUT_WORKSPACE_ROOT: workspaceRoot
    }
  });

  try {
    const page = await electronApp.firstWindow();

    await page.getByTestId("project-directory-input").fill(projectDirectory);
    await page.getByTestId("project-name-input").fill("Smoke Project");
    await page.getByTestId("create-project-button").click();
    await page.waitForTimeout(2_000);

    const projectHeading = await page.getByTestId("workspace-header").textContent();

    if (!projectHeading?.includes("Smoke Project")) {
      throw new Error(`Smoke project was not opened. Header text: ${projectHeading ?? "missing"}`);
    }

    if (await page.getByTestId("register-fixture-button").isDisabled()) {
      throw new Error("Fixture registration remained disabled after project creation.");
    }

    await page.getByTestId("register-fixture-button").click();
    await page.waitForTimeout(2_500);
    await page.getByTestId("metadata-panel").waitFor({ state: "visible" });
    await page.getByTestId("metadata-duration").waitFor({ state: "visible" });
    await page.getByTestId("metadata-dimensions").waitFor({ state: "visible" });

    const duration = await page.getByTestId("metadata-duration").textContent();
    const dimensions = await page.getByTestId("metadata-dimensions").textContent();

    if (!duration || duration === "Unknown") {
      throw new Error("Smoke test expected a non-empty media duration.");
    }

    if (!dimensions || dimensions === "Unknown") {
      throw new Error("Smoke test expected probed media dimensions.");
    }

    await page.screenshot({
      path: resolve(workspaceRoot, "output/playwright/clawcut-stage1-smoke.png"),
      fullPage: true
    });
  } finally {
    await electronApp.close();
    rmSync(projectDirectory, { recursive: true, force: true });
  }
}

void runSmoke();
