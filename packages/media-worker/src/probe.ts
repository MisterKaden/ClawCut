import { basename } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { MediaProbeResult, MediaStreamSummary } from "@clawcut/ipc";

import { detectToolchain } from "./toolchain";
import { WorkerError, parseNumericValue } from "./utils";

const execFileAsync = promisify(execFile);

interface FFprobeDisposition {
  default?: number;
}

interface FFprobeTagMap {
  language?: string;
  rotate?: string;
}

interface FFprobeSideData {
  rotation?: number;
}

interface FFprobeStream {
  index?: number;
  codec_type?: string;
  codec_name?: string;
  duration?: string;
  width?: number;
  height?: number;
  sample_rate?: string;
  channels?: number;
  channel_layout?: string;
  bit_rate?: string;
  time_base?: string;
  avg_frame_rate?: string;
  r_frame_rate?: string;
  pix_fmt?: string;
  disposition?: FFprobeDisposition;
  tags?: FFprobeTagMap;
  side_data_list?: FFprobeSideData[];
}

interface FFprobeFormat {
  format_name?: string;
  duration?: string;
  bit_rate?: string;
}

export interface FFprobePayload {
  streams?: FFprobeStream[];
  format?: FFprobeFormat;
}

function parseRate(input: string | undefined): number | null {
  if (!input || input === "0/0") {
    return null;
  }

  const [numeratorText, denominatorText] = input.split("/");

  if (!numeratorText || !denominatorText) {
    return parseNumericValue(input);
  }

  const numerator = Number(numeratorText);
  const denominator = Number(denominatorText);

  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return null;
  }

  return numerator / denominator;
}

function toMilliseconds(seconds: string | undefined): number | null {
  const numericValue = parseNumericValue(seconds);

  return numericValue === null ? null : Math.round(numericValue * 1000);
}

function resolveRotation(stream: FFprobeStream): number | null {
  const sideDataRotation = stream.side_data_list
    ?.map((entry) => entry.rotation)
    .find((entry): entry is number => typeof entry === "number");

  if (typeof sideDataRotation === "number") {
    return sideDataRotation;
  }

  return parseNumericValue(stream.tags?.rotate);
}

function mapStream(stream: FFprobeStream): MediaStreamSummary {
  return {
    index: stream.index ?? 0,
    codecType: stream.codec_type ?? "unknown",
    codecName: stream.codec_name ?? null,
    durationMs: toMilliseconds(stream.duration),
    bitRate: parseNumericValue(stream.bit_rate),
    timeBase: stream.time_base ?? null,
    language: stream.tags?.language ?? null,
    isDefault: Boolean(stream.disposition?.default),
    width: stream.width ?? null,
    height: stream.height ?? null,
    pixelFormat: stream.pix_fmt ?? null,
    frameRate: parseRate(stream.avg_frame_rate) ?? parseRate(stream.r_frame_rate),
    rotation: resolveRotation(stream),
    sampleRate: parseNumericValue(stream.sample_rate),
    channels: stream.channels ?? null,
    channelLayout: stream.channel_layout ?? null
  };
}

function buildStreamSignature(streams: MediaStreamSummary[]): string {
  return streams
    .map((stream) => {
      const shape =
        stream.codecType === "video"
          ? `${stream.width ?? "x"}x${stream.height ?? "x"}@${stream.frameRate?.toFixed(2) ?? "?"}`
          : stream.codecType === "audio"
            ? `${stream.sampleRate ?? "?"}:${stream.channels ?? "?"}`
            : "na";

      return `${stream.codecType}:${stream.codecName ?? "unknown"}:${shape}`;
    })
    .join("|");
}

export function normalizeProbePayload(
  assetPath: string,
  payload: FFprobePayload
): MediaProbeResult {
  const streams = (payload.streams ?? []).map(mapStream);
  const videoStream = streams.find((stream) => stream.codecType === "video") ?? null;
  const audioStream = streams.find((stream) => stream.codecType === "audio") ?? null;

  return {
    assetPath,
    displayName: basename(assetPath),
    container: payload.format?.format_name ?? null,
    durationMs: toMilliseconds(payload.format?.duration) ?? videoStream?.durationMs ?? null,
    bitRate: parseNumericValue(payload.format?.bit_rate),
    width: videoStream?.width ?? null,
    height: videoStream?.height ?? null,
    frameRate: videoStream?.frameRate ?? null,
    pixelFormat: videoStream?.pixelFormat ?? null,
    rotation: videoStream?.rotation ?? null,
    videoCodec: videoStream?.codecName ?? null,
    audioCodec: audioStream?.codecName ?? null,
    audioSampleRate: audioStream?.sampleRate ?? null,
    channelCount: audioStream?.channels ?? null,
    streamSignature: buildStreamSignature(streams),
    streamCount: streams.length,
    streams
  };
}

export async function probeAsset(assetPath: string): Promise<MediaProbeResult> {
  const toolchain = detectToolchain();
  const ffprobePath = toolchain.tools.ffprobe.resolvedPath;

  if (!ffprobePath || !toolchain.tools.ffprobe.available) {
    throw new WorkerError(
      "FFPROBE_UNAVAILABLE",
      "ffprobe is required to inspect media assets.",
      toolchain.tools.ffprobe.remediationHint ?? undefined
    );
  }

  try {
    const result = await execFileAsync(ffprobePath, [
      "-v",
      "error",
      "-show_format",
      "-show_streams",
      "-of",
      "json",
      assetPath
    ]);

    const payload = JSON.parse(result.stdout) as FFprobePayload;

    return normalizeProbePayload(assetPath, payload);
  } catch (error) {
    throw new WorkerError(
      "PROBE_FAILED",
      `ffprobe could not inspect ${assetPath}.`,
      error instanceof Error ? error.message : String(error)
    );
  }
}
