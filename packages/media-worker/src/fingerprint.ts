import { createHash, randomUUID } from "node:crypto";
import { open, stat } from "node:fs/promises";

import type { MediaFingerprint } from "@clawcut/domain";

const FINGERPRINT_WINDOW_SIZE = 64 * 1024;

export interface FileFingerprintResult {
  fingerprint: MediaFingerprint;
  sourceRevision: string;
  fileSize: number;
  fileModifiedTimeMs: number | null;
}

function encodeSampleDescriptor(fileSize: number): Buffer {
  return Buffer.from(`${fileSize}`, "utf8");
}

export async function buildQuickFingerprint(
  filePath: string
): Promise<FileFingerprintResult> {
  const fileStats = await stat(filePath);
  const hash = createHash("sha256");
  const modifiedTimeMs = Number.isFinite(fileStats.mtimeMs) ? Math.round(fileStats.mtimeMs) : null;

  hash.update(encodeSampleDescriptor(fileStats.size));

  if (fileStats.size <= 0) {
    const quickHash = hash.digest("hex");

    return {
      fingerprint: {
        strategy: "stat-only",
        quickHash,
        fileSize: fileStats.size,
        modifiedTimeMs,
        sampleSizeBytes: 0
      },
      sourceRevision: quickHash.slice(0, 20),
      fileSize: fileStats.size,
      fileModifiedTimeMs: modifiedTimeMs
    };
  }

  const fileHandle = await open(filePath, "r");

  try {
    const sampleOffsets =
      fileStats.size <= FINGERPRINT_WINDOW_SIZE * 3
        ? [0]
        : [
            0,
            Math.max(0, Math.floor(fileStats.size / 2) - Math.floor(FINGERPRINT_WINDOW_SIZE / 2)),
            Math.max(0, fileStats.size - FINGERPRINT_WINDOW_SIZE)
          ];

    let sampleSizeBytes = 0;

    for (const offset of sampleOffsets) {
      const targetLength =
        sampleOffsets.length === 1
          ? fileStats.size
          : Math.min(FINGERPRINT_WINDOW_SIZE, fileStats.size - offset);
      const buffer = Buffer.alloc(targetLength);
      const { bytesRead } = await fileHandle.read(buffer, 0, targetLength, offset);

      hash.update(buffer.subarray(0, bytesRead));
      sampleSizeBytes += bytesRead;
    }

    const strategy = sampleOffsets.length === 1 ? "full-sha256" : "partial-sha256";
    const quickHash = hash.digest("hex");

    return {
      fingerprint: {
        strategy,
        quickHash,
        fileSize: fileStats.size,
        modifiedTimeMs,
        sampleSizeBytes
      },
      sourceRevision: quickHash.slice(0, 20),
      fileSize: fileStats.size,
      fileModifiedTimeMs: modifiedTimeMs
    };
  } finally {
    await fileHandle.close();
  }
}

export function createMediaItemId(): string {
  return randomUUID();
}
