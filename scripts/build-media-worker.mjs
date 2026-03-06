import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDirectory, "..");
const entryPoint = resolve(workspaceRoot, "packages/media-worker/src/worker.ts");
const outputPath = resolve(workspaceRoot, "apps/desktop/out/media-worker/worker.cjs");

mkdirSync(dirname(outputPath), { recursive: true });

await build({
  entryPoints: [entryPoint],
  outfile: outputPath,
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  sourcemap: true,
  external: ["better-sqlite3"]
});
