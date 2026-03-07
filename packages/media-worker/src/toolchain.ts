import { spawnSync } from "node:child_process";

import type { ToolName, ToolStatus, ToolchainStatus } from "@clawcut/ipc";

import { createTranscriptionAdapter } from "./transcription-adapter";
import { resolveSystemBinary } from "./utils";

const TOOL_ENV_OVERRIDES: Record<ToolName, readonly string[]> = {
  ffmpeg: ["CLAWCUT_FFMPEG_PATH", "FFMPEG_PATH"],
  ffprobe: ["CLAWCUT_FFPROBE_PATH", "FFPROBE_PATH"],
  transcription: ["CLAWCUT_PYTHON_BIN", "PYTHON"]
};

function resolveToolPath(toolName: ToolName): string | null {
  const override = TOOL_ENV_OVERRIDES[toolName]
    .map((variableName) => process.env[variableName]?.trim())
    .find((value) => Boolean(value));

  if (override) {
    return override;
  }

  return resolveSystemBinary(toolName);
}

function readVersion(toolPath: string | null): string | null {
  if (!toolPath) {
    return null;
  }

  const result = spawnSync(toolPath, ["-version"], {
    encoding: "utf8"
  });

  if (result.status !== 0) {
    return null;
  }

  const firstLine = result.stdout.trim().split(/\r?\n/u)[0];

  return firstLine || null;
}

function createToolStatus(toolName: ToolName): ToolStatus {
  if (toolName === "transcription") {
    const status = createTranscriptionAdapter().getRuntimeStatus();

    return {
      name: toolName,
      available: status.available,
      resolvedPath: status.resolvedPath,
      version: status.version,
      remediationHint: status.remediationHint
    };
  }

  const resolvedPath = resolveToolPath(toolName);
  const version = readVersion(resolvedPath);
  const available = Boolean(resolvedPath && version);

  return {
    name: toolName,
    available,
    resolvedPath,
    version,
    remediationHint: available
      ? null
      : `Install ${toolName} and ensure it is on PATH or set ${TOOL_ENV_OVERRIDES[toolName][0]}.`
  };
}

export function detectToolchain(): ToolchainStatus {
  const ffmpeg = createToolStatus("ffmpeg");
  const ffprobe = createToolStatus("ffprobe");
  const transcription = createToolStatus("transcription");

  return {
    status: ffmpeg.available && ffprobe.available && transcription.available ? "ok" : "error",
    tools: {
      ffmpeg,
      ffprobe,
      transcription
    }
  };
}
