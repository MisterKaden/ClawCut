import { spawnSync } from "node:child_process";
import { basename } from "node:path";

import type { MediaProbeResult, MediaStreamSummary } from "@clawcut/ipc";

import { detectToolchain } from "./toolchain";
import { WorkerError, parseNumericValue } from "./utils";

interface FFprobeStream {
  index?: number;
  codec_type?: string;
  codec_name?: string;
  duration?: string;
  width?: number;
  height?: number;
  sample_rate?: string;
  channels?: number;
}

interface FFprobeFormat {
  format_name?: string;
  duration?: string;
  bit_rate?: string;
}

interface FFprobePayload {
  streams?: FFprobeStream[];
  format?: FFprobeFormat;
}

function mapStream(stream: FFprobeStream): MediaStreamSummary {
  return {
    index: stream.index ?? 0,
    codecType: stream.codec_type ?? "unknown",
    codecName: stream.codec_name ?? null,
    durationMs: toMilliseconds(stream.duration),
    width: stream.width ?? null,
    height: stream.height ?? null,
    sampleRate: parseNumericValue(stream.sample_rate),
    channels: stream.channels ?? null
  };
}

function toMilliseconds(seconds: string | undefined): number | null {
  const numericValue = parseNumericValue(seconds);

  return numericValue === null ? null : Math.round(numericValue * 1000);
}

export function probeAsset(assetPath: string): MediaProbeResult {
  const toolchain = detectToolchain();
  const ffprobePath = toolchain.tools.ffprobe.resolvedPath;

  if (!ffprobePath || !toolchain.tools.ffprobe.available) {
    throw new WorkerError(
      "FFPROBE_UNAVAILABLE",
      "ffprobe is required to inspect media assets.",
      toolchain.tools.ffprobe.remediationHint ?? undefined
    );
  }

  const result = spawnSync(
    ffprobePath,
    [
      "-v",
      "error",
      "-show_format",
      "-show_streams",
      "-of",
      "json",
      assetPath
    ],
    {
      encoding: "utf8"
    }
  );

  if (result.status !== 0) {
    throw new WorkerError(
      "PROBE_FAILED",
      `ffprobe could not inspect ${assetPath}.`,
      result.stderr.trim() || result.stdout.trim()
    );
  }

  const payload = JSON.parse(result.stdout) as FFprobePayload;
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
    videoCodec: videoStream?.codecName ?? null,
    audioCodec: audioStream?.codecName ?? null,
    streamCount: streams.length,
    streams
  };
}
