import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { runSmoke } from "./smoke";

function resolvePackagedExecutable(workspaceRoot: string): string {
  const candidates = [
    resolve(workspaceRoot, "apps/desktop/dist/mac/Clawcut.app/Contents/MacOS/Clawcut"),
    resolve(workspaceRoot, "apps/desktop/dist/mac-arm64/Clawcut.app/Contents/MacOS/Clawcut"),
    resolve(workspaceRoot, "apps/desktop/dist/mac-x64/Clawcut.app/Contents/MacOS/Clawcut")
  ];

  const executable = candidates.find((candidate) => existsSync(candidate));

  if (!executable) {
    throw new Error(
      `Packaged Clawcut executable was not found. Checked: ${candidates.join(", ")}`
    );
  }

  return executable;
}

async function main(): Promise<void> {
  const workspaceRoot = resolve(process.cwd());
  process.env.CLAWCUT_SMOKE_EXECUTABLE = resolvePackagedExecutable(workspaceRoot);
  await runSmoke();
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
