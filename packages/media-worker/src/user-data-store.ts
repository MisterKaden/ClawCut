import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

export function resolveClawcutUserDataPath(): string {
  const explicit = process.env.CLAWCUT_USER_DATA_PATH?.trim();

  if (explicit) {
    return resolve(explicit);
  }

  return resolve(homedir(), ".clawcut");
}

export function resolveUserDataFilePath(fileName: string): string {
  return join(resolveClawcutUserDataPath(), fileName);
}

export async function readJsonStore<T>(
  fileName: string,
  fallback: T
): Promise<T> {
  const filePath = resolveUserDataFilePath(fileName);

  try {
    const contents = await readFile(filePath, "utf8");
    return JSON.parse(contents) as T;
  } catch {
    return fallback;
  }
}

export async function writeJsonStore(fileName: string, payload: unknown): Promise<void> {
  const filePath = resolveUserDataFilePath(fileName);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
}
