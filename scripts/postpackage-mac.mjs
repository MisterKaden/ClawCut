import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const workspaceRoot = resolve(import.meta.dirname, "..");
const desktopDirectory = resolve(workspaceRoot, "apps", "desktop");
const distDirectory = resolve(desktopDirectory, "dist");

function run(command, args, cwd = workspaceRoot) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    env: process.env
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}.`);
  }
}

function findPackagedNodeModuleDirectories() {
  if (!existsSync(distDirectory)) {
    return [];
  }

  return readdirSync(distDirectory)
    .filter((entry) => entry === "mac" || entry.startsWith("mac-"))
    .map((entry) => join(distDirectory, entry, "Clawcut.app", "Contents", "Resources", "app"))
    .filter((entry) => existsSync(entry));
}

const packagedApplicationDirectories = findPackagedNodeModuleDirectories();

for (const moduleDirectory of packagedApplicationDirectories) {
  run(
    "pnpm",
    [
      "exec",
      "electron-rebuild",
      "--version",
      "40.8.0",
      "--module-dir",
      moduleDirectory,
      "--force",
      "--only",
      "better-sqlite3"
    ],
    desktopDirectory
  );
}

run("pnpm", ["--filter", "@clawcut/media-worker", "rebuild", "better-sqlite3"]);
