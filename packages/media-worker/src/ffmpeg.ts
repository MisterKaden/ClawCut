import { spawn } from "node:child_process";

import { detectToolchain } from "./toolchain";
import { WorkerError } from "./utils";

export interface RunFfmpegOptions {
  captureStdout?: boolean;
}

export interface RunFfmpegResult {
  stdout: Buffer;
  stderr: string;
}

export async function runFfmpeg(
  args: string[],
  options: RunFfmpegOptions = {}
): Promise<RunFfmpegResult> {
  const toolchain = detectToolchain();
  const ffmpegPath = toolchain.tools.ffmpeg.resolvedPath;

  if (!ffmpegPath || !toolchain.tools.ffmpeg.available) {
    throw new WorkerError(
      "FFMPEG_UNAVAILABLE",
      "ffmpeg is required for media derivation.",
      toolchain.tools.ffmpeg.remediationHint ?? undefined
    );
  }

  return new Promise<RunFfmpegResult>((resolvePromise, rejectPromise) => {
    const child = spawn(ffmpegPath, args, {
      stdio: ["ignore", options.captureStdout ? "pipe" : "ignore", "pipe"]
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout?.on("data", (chunk: Buffer) => {
      stdoutChunks.push(chunk);
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });

    child.on("error", (error) => {
      rejectPromise(
        new WorkerError("FFMPEG_FAILED", "ffmpeg execution failed to start.", error.message)
      );
    });

    child.on("close", (exitCode) => {
      const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();

      if (exitCode !== 0) {
        rejectPromise(
          new WorkerError(
            "FFMPEG_FAILED",
            "ffmpeg command failed.",
            stderr || `Process exited with code ${exitCode ?? "unknown"}.`
          )
        );
        return;
      }

      resolvePromise({
        stdout: Buffer.concat(stdoutChunks),
        stderr
      });
    });
  });
}
