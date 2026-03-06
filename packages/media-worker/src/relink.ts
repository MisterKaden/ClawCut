import { basename, extname } from "node:path";

import type { MediaItem, RelinkResult } from "@clawcut/domain";
import type { MediaProbeResult } from "@clawcut/ipc";

import type { FileFingerprintResult } from "./fingerprint";

function normalizedStem(filePath: string | null): string {
  if (!filePath) {
    return "";
  }

  const baseName = basename(filePath, extname(filePath));
  return baseName.toLowerCase().replace(/[^a-z0-9]+/gu, "");
}

function diceCoefficient(left: string, right: string): number {
  if (!left || !right) {
    return 0;
  }

  if (left === right) {
    return 1;
  }

  const pairs = new Map<string, number>();

  for (let index = 0; index < left.length - 1; index += 1) {
    const pair = left.slice(index, index + 2);
    pairs.set(pair, (pairs.get(pair) ?? 0) + 1);
  }

  let intersection = 0;

  for (let index = 0; index < right.length - 1; index += 1) {
    const pair = right.slice(index, index + 2);
    const currentCount = pairs.get(pair) ?? 0;

    if (currentCount > 0) {
      pairs.set(pair, currentCount - 1);
      intersection += 1;
    }
  }

  return (2 * intersection) / (left.length + right.length - 2);
}

export function evaluateRelinkCandidate(
  mediaItem: MediaItem,
  candidatePath: string,
  candidateFingerprint: FileFingerprintResult,
  candidateProbe: MediaProbeResult
): RelinkResult {
  const details: string[] = [];

  if (
    mediaItem.fingerprint.quickHash &&
    candidateFingerprint.fingerprint.quickHash &&
    mediaItem.fingerprint.quickHash === candidateFingerprint.fingerprint.quickHash
  ) {
    details.push("Quick fingerprint matches exactly.");

    return {
      accepted: true,
      mediaItemId: mediaItem.id,
      confidence: "exact",
      details,
      previousPath: mediaItem.source.currentResolvedPath,
      nextPath: candidatePath,
      requiresDerivedRefresh: mediaItem.sourceRevision !== candidateFingerprint.sourceRevision
    };
  }

  const sizeMatches =
    mediaItem.fileSize !== null && mediaItem.fileSize === candidateFingerprint.fileSize;
  const durationMatches =
    mediaItem.metadataSummary.durationMs !== null &&
    candidateProbe.durationMs !== null &&
    Math.abs(mediaItem.metadataSummary.durationMs - candidateProbe.durationMs) <= 250;
  const streamSignatureMatches =
    mediaItem.metadataSummary.streamSignature === candidateProbe.streamSignature;
  const filenameSimilarity = diceCoefficient(
    normalizedStem(mediaItem.source.originalPath),
    normalizedStem(candidatePath)
  );

  if (sizeMatches) {
    details.push("File size matches.");
  }

  if (durationMatches) {
    details.push("Duration is within 250 ms.");
  }

  if (streamSignatureMatches) {
    details.push("Stream signature matches.");
  }

  if (filenameSimilarity >= 0.72) {
    details.push("Filename similarity is strong.");
  }

  if (sizeMatches && durationMatches && streamSignatureMatches && filenameSimilarity >= 0.72) {
    return {
      accepted: true,
      mediaItemId: mediaItem.id,
      confidence: "probable",
      details,
      previousPath: mediaItem.source.currentResolvedPath,
      nextPath: candidatePath,
      requiresDerivedRefresh: true
    };
  }

  details.push("Candidate did not satisfy the safe relink thresholds.");

  return {
    accepted: false,
    mediaItemId: mediaItem.id,
    confidence: "unsafe",
    details,
    previousPath: mediaItem.source.currentResolvedPath,
    nextPath: candidatePath,
    requiresDerivedRefresh: false
  };
}
