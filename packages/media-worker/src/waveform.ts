import { mkdir, readFile, stat, writeFile } from "node:fs/promises";

import type { WaveformAsset } from "@clawcut/domain";

import { WAVEFORM_PRESET_KEY } from "./cache-manager";
import type { CacheManager } from "./cache-manager";
import { runFfmpeg } from "./ffmpeg";
import { nowIso } from "./utils";

export interface WaveformEnvelope {
  version: 1;
  bucketCount: number;
  durationMs: number | null;
  peaks: number[];
  rms: number[];
}

const WAVEFORM_BUCKET_COUNT = 160;

function decodeFloatSamples(buffer: Buffer): Float32Array {
  return new Float32Array(buffer.buffer, buffer.byteOffset, Math.floor(buffer.byteLength / 4));
}

function buildEnvelope(samples: Float32Array, durationMs: number | null): WaveformEnvelope {
  if (samples.length === 0) {
    return {
      version: 1,
      bucketCount: 0,
      durationMs,
      peaks: [],
      rms: []
    };
  }

  const bucketCount = Math.min(WAVEFORM_BUCKET_COUNT, samples.length);
  const samplesPerBucket = Math.max(1, Math.floor(samples.length / bucketCount));
  const peaks: number[] = [];
  const rms: number[] = [];

  for (let bucketIndex = 0; bucketIndex < bucketCount; bucketIndex += 1) {
    const startIndex = bucketIndex * samplesPerBucket;
    const endIndex =
      bucketIndex === bucketCount - 1
        ? samples.length
        : Math.min(samples.length, startIndex + samplesPerBucket);

    let peak = 0;
    let rmsAccumulator = 0;
    let valueCount = 0;

    for (let sampleIndex = startIndex; sampleIndex < endIndex; sampleIndex += 1) {
      const amplitude = Math.abs(samples[sampleIndex] ?? 0);
      peak = Math.max(peak, amplitude);
      rmsAccumulator += amplitude * amplitude;
      valueCount += 1;
    }

    peaks.push(Number(peak.toFixed(4)));
    rms.push(Number(Math.sqrt(rmsAccumulator / Math.max(1, valueCount)).toFixed(4)));
  }

  return {
    version: 1,
    bucketCount,
    durationMs,
    peaks,
    rms
  };
}

export async function generateWaveformAsset(
  cacheManager: CacheManager,
  mediaItemId: string,
  sourceRevision: string,
  sourcePath: string,
  durationMs: number | null
): Promise<WaveformAsset> {
  const descriptor = cacheManager.resolveWaveformPath(mediaItemId, sourceRevision);

  await mkdir(descriptor.absolutePath.replace(/\/[^/]+$/u, ""), { recursive: true });
  const ffmpegResult = await runFfmpeg(
    [
      "-i",
      sourcePath,
      "-vn",
      "-ac",
      "1",
      "-f",
      "f32le",
      "-acodec",
      "pcm_f32le",
      "pipe:1"
    ],
    {
      captureStdout: true
    }
  );

  const envelope = buildEnvelope(decodeFloatSamples(ffmpegResult.stdout), durationMs);
  await writeFile(descriptor.absolutePath, JSON.stringify(envelope), "utf8");

  const fileStats = await stat(descriptor.absolutePath);

  return {
    id: `${mediaItemId}:waveform`,
    type: "waveform",
    status: "ready",
    relativePath: descriptor.relativePath,
    sourceRevision,
    presetKey: WAVEFORM_PRESET_KEY,
    generatedAt: nowIso(),
    fileSize: fileStats.size,
    errorMessage: null,
    bucketCount: envelope.bucketCount,
    durationMs,
    previewPeaks: envelope.peaks
  };
}

export async function readWaveformEnvelope(absolutePath: string): Promise<WaveformEnvelope | null> {
  try {
    const contents = await readFile(absolutePath, "utf8");

    return JSON.parse(contents) as WaveformEnvelope;
  } catch {
    return null;
  }
}
