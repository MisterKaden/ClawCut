import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { DiagnosticsFailureRecord } from "@clawcut/ipc";

interface WorkerDiagnosticLogEntry extends DiagnosticsFailureRecord {
  timestamp: string;
}

function getSessionLogDirectory(): string | null {
  return process.env.CLAWCUT_SESSION_LOG_DIR?.trim() || null;
}

export function getWorkerDiagnosticLogPath(): string | null {
  const sessionLogDirectory = getSessionLogDirectory();
  return sessionLogDirectory ? join(sessionLogDirectory, "worker-diagnostics.jsonl") : null;
}

export async function appendWorkerDiagnostic(
  entry: Omit<WorkerDiagnosticLogEntry, "timestamp">
): Promise<string | null> {
  const logPath = getWorkerDiagnosticLogPath();

  if (!logPath) {
    return null;
  }

  await mkdir(dirname(logPath), { recursive: true });
  await appendFile(
    logPath,
    `${JSON.stringify({
      ...entry,
      timestamp: entry.occurredAt
    })}\n`,
    "utf8"
  );

  return logPath;
}

export async function readRecentWorkerDiagnostics(
  limit = 25
): Promise<DiagnosticsFailureRecord[]> {
  const logPath = getWorkerDiagnosticLogPath();

  if (!logPath) {
    return [];
  }

  try {
    const contents = await readFile(logPath, "utf8");
    const lines = contents
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-limit)
      .reverse();

    return lines.flatMap((line) => {
      try {
        const parsed = JSON.parse(line) as WorkerDiagnosticLogEntry;
        return [
          {
            id: parsed.id,
            subsystem: parsed.subsystem,
            severity: parsed.severity,
            code: parsed.code,
            message: parsed.message,
            details: parsed.details,
            occurredAt: parsed.occurredAt,
            requestId: parsed.requestId,
            jobId: parsed.jobId,
            runId: parsed.runId,
            logPath: parsed.logPath,
            artifactPath: parsed.artifactPath
          }
        ];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}
