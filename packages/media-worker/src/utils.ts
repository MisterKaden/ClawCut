import { spawnSync } from "node:child_process";
import { platform } from "node:os";
import { resolve } from "node:path";

import type { SerializedWorkerError } from "@clawcut/ipc";

export class WorkerError extends Error {
  public readonly code: string;
  public readonly details?: string;

  constructor(code: string, message: string, details?: string) {
    super(message);
    this.name = "WorkerError";
    this.code = code;
    this.details = details;
  }
}

export function serializeError(error: unknown): SerializedWorkerError {
  if (error instanceof WorkerError) {
    return {
      code: error.code,
      message: error.message,
      details: error.details
    };
  }

  if (error instanceof Error) {
    return {
      code: "UNKNOWN_ERROR",
      message: error.message
    };
  }

  return {
    code: "UNKNOWN_ERROR",
    message: "An unknown worker error occurred."
  };
}

export function ensureAbsoluteDirectory(directory: string): string {
  if (!directory || !directory.trim()) {
    throw new WorkerError("INVALID_DIRECTORY", "Project directory is required.");
  }

  return resolve(directory.trim());
}

export function resolveSystemBinary(binaryName: string): string | null {
  const command = platform() === "win32" ? "where" : "which";
  const result = spawnSync(command, [binaryName], {
    encoding: "utf8"
  });

  if (result.status !== 0) {
    return null;
  }

  const firstLine = result.stdout.trim().split(/\r?\n/u)[0];

  return firstLine || null;
}

export function parseNumericValue(input: string | null | undefined): number | null {
  if (!input) {
    return null;
  }

  const parsed = Number(input);

  return Number.isFinite(parsed) ? parsed : null;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function normalizeFileSystemPath(input: string): string {
  return resolve(input).replace(/\\/gu, "/");
}
