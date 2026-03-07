import { randomUUID } from "node:crypto";
import {
  access,
  appendFile,
  mkdir,
  readFile,
  stat,
  writeFile
} from "node:fs/promises";
import { dirname, extname, join } from "node:path";

import {
  compileFfmpegExecutionSpec,
  compileRenderPlan,
  formatCaptionTrackAsAss,
  createEmptyExportDiagnostics,
  createPendingVerificationResult,
  createExportRequest,
  getBuiltInExportPresets,
  resolveCaptionTemplate,
  resolveExportPreset,
  type ExportFrameSnapshot,
  type ExportCommand,
  type ExportCommandFailure,
  type ExportRequestInput,
  type ExportRun,
  type ExportSessionSnapshot,
  type ExportVerificationResult,
  type FfmpegExecutionSpec,
  type FfmpegSegmentSpec,
  type RenderPlan
} from "@clawcut/domain";
import type {
  ExecuteExportCommandInput,
  ExecuteExportCommandResult,
  GetExportSessionSnapshotInput
} from "@clawcut/ipc";

import {
  renderCaptionTrackToPngPlates,
  type CaptionBurnInPlate
} from "./caption-rasterizer";
import {
  createExportRunRecord,
  getExportRun,
  listExportRuns,
  updateExportRunRecord
} from "./export-repository";
import {
  runFfmpeg,
  spawnFfmpegProcess,
  type FfmpegProgress
} from "./ffmpeg";
import {
  loadAndMaybeMigrateProject,
  createJobRecord,
  getStoredJobRecord,
  updateJobRecord
} from "./project-repository";
import { resolveExportArtifactDirectory, resolveProjectPaths } from "./paths";
import { probeAsset } from "./probe";
import { nowIso, normalizeFileSystemPath, WorkerError } from "./utils";

interface ActiveExportProcess {
  exportRunId: string;
  cancel(): void;
}

const activeExports = new Map<string, ActiveExportProcess>();

function isActiveStatus(status: ExportRun["status"]): boolean {
  return (
    status === "queued" ||
    status === "preparing" ||
    status === "compiling" ||
    status === "rendering" ||
    status === "finalizing" ||
    status === "verifying"
  );
}

function isInFlightStatus(status: ExportRun["status"]): boolean {
  return (
    status === "preparing" ||
    status === "compiling" ||
    status === "rendering" ||
    status === "finalizing" ||
    status === "verifying"
  );
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+/u, "")
    .replace(/-+$/u, "")
    .slice(0, 60) || "clawcut-export";
}

async function fileExists(path: string | null): Promise<boolean> {
  if (!path) {
    return false;
  }

  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function isDevelopmentExportLoggingEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.CLAWCUT_DEBUG_EXPORT_ARTIFACTS === "1";
}

async function readJsonFile<T>(path: string): Promise<T | null> {
  if (!(await fileExists(path))) {
    return null;
  }

  try {
    const contents = await readFile(path, "utf8");
    return JSON.parse(contents) as T;
  } catch {
    return null;
  }
}

function createFailure(
  command: ExportCommand,
  code: ExportCommandFailure["error"]["code"],
  message: string,
  details?: string
): ExportCommandFailure {
  return {
    ok: false,
    commandType: command.type,
    error: {
      code,
      message,
      details
    }
  };
}

function resolveSnapshotFailureCode(
  error: unknown
): ExportCommandFailure["error"]["code"] {
  if (!(error instanceof WorkerError)) {
    return "SNAPSHOT_CAPTURE_FAILED";
  }

  switch (error.code) {
    case "EXPORT_NOT_FOUND":
    case "TIMELINE_NOT_FOUND":
    case "INVALID_EXPORT_RANGE":
    case "REGION_NOT_FOUND":
    case "MISSING_SOURCE_MEDIA":
    case "INVALID_OUTPUT_PATH":
    case "SNAPSHOT_UNAVAILABLE":
    case "SNAPSHOT_CAPTURE_FAILED":
      return error.code;
    default:
      return "SNAPSHOT_CAPTURE_FAILED";
  }
}

async function primeInterruptedExports(directory: string): Promise<void> {
  const paths = resolveProjectPaths(directory);
  const runs = listExportRuns(paths.databasePath);

  for (const run of runs) {
    if (!isInFlightStatus(run.status)) {
      continue;
    }

    if (activeExports.get(paths.directory)?.exportRunId === run.id) {
      continue;
    }

    updateExportRunRecord(paths.databasePath, run.id, {
      status: "failed",
      error: {
        code: "EXPORT_INTERRUPTED",
        message: "The export was interrupted before completion."
      },
      completedAt: nowIso()
    });

    const job = getStoredJobRecord(paths.databasePath, run.jobId);

    if (job) {
      updateJobRecord(paths.databasePath, job.id, {
        status: "failed",
        step: "Interrupted",
        errorMessage: "The export was interrupted before completion."
      });
    }
  }
}

function buildSessionSnapshot(
  directory: string,
  projectName: string,
  defaultPresetId: ExportSessionSnapshot["defaultPresetId"]
): ExportSessionSnapshot {
  const paths = resolveProjectPaths(directory);
  const exportRuns = listExportRuns(paths.databasePath);
  const lastError = exportRuns.find((run) => run.error)?.error ?? null;

  return {
    directory: paths.directory,
    projectName,
    outputRoot: paths.exportsRoot,
    defaultPresetId,
    presets: getBuiltInExportPresets(),
    exportRuns,
    activeExportRunId: exportRuns.find((run) => isActiveStatus(run.status))?.id ?? null,
    lastError
  };
}

export async function getExportSessionSnapshot(
  input: GetExportSessionSnapshotInput
): Promise<ExportSessionSnapshot> {
  const { paths, document } = await loadAndMaybeMigrateProject(input.directory);
  await primeInterruptedExports(paths.directory);

  return {
    ...buildSessionSnapshot(
      paths.directory,
      document.project.name,
      document.settings.exports.defaultPreset
    )
  };
}

interface ExportDevelopmentManifest {
  exportRunId: string;
  generatedAt: string;
  renderPlanPath: string;
  ffmpegSpecPath: string;
  segmentSteps: Array<{
    segmentId: string;
    outputPath: string;
    filterScriptPath: string;
    args: string[];
  }>;
  concatStep: {
    concatListPath: string;
    outputPath: string;
    args: string[];
  } | null;
  burnInStep: {
    strategy: "subtitle-filter" | "overlay-plates";
    subtitlePath: string;
    filterScriptPath: string | null;
    platePaths: string[];
    outputPath: string;
    args: string[];
  } | null;
}

interface ExportSnapshotManifest {
  generatedAt: string;
  snapshots: ExportFrameSnapshot[];
}

async function writeDevelopmentManifest(
  manifestPath: string,
  manifest: ExportDevelopmentManifest
): Promise<void> {
  if (!isDevelopmentExportLoggingEnabled()) {
    return;
  }

  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
}

async function appendSnapshotManifest(
  manifestPath: string,
  snapshot: ExportFrameSnapshot
): Promise<void> {
  const existing = await readJsonFile<ExportSnapshotManifest>(manifestPath);
  const nextManifest: ExportSnapshotManifest = {
    generatedAt: existing?.generatedAt ?? snapshot.createdAt,
    snapshots: [...(existing?.snapshots ?? []), snapshot]
  };

  await mkdir(dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, JSON.stringify(nextManifest, null, 2), "utf8");
}

function formatSeconds(valueUs: number): string {
  return (valueUs / 1_000_000).toFixed(6);
}

async function resolveDefaultOutputPath(
  directory: string,
  projectName: string,
  presetId: string,
  extension: string
): Promise<string> {
  const paths = resolveProjectPaths(directory);
  await mkdir(paths.exportsRoot, { recursive: true });
  const exportRuns = listExportRuns(paths.databasePath);
  const reservedPaths = new Set(
    exportRuns.map((run) => run.outputPath).filter((path): path is string => Boolean(path))
  );
  const projectSlug = slugify(projectName);
  const presetSlug = slugify(presetId);

  for (let index = 1; index <= 9999; index += 1) {
    const candidate = join(
      paths.exportsRoot,
      `${projectSlug}-${presetSlug}-${String(index).padStart(3, "0")}.${extension}`
    );

    if (!reservedPaths.has(candidate) && !(await fileExists(candidate))) {
      return candidate;
    }
  }

  throw new WorkerError(
    "INVALID_OUTPUT_PATH",
    "Could not resolve a unique export output path."
  );
}

function withProjectCaptionDefaults(
  document: Awaited<ReturnType<typeof loadAndMaybeMigrateProject>>["document"],
  request: ExportRequestInput
): ExportRequestInput {
  return {
    ...request,
    captionBurnIn:
      request.captionBurnIn ?? {
        enabled: document.captions.exportDefaults.burnInEnabled,
        captionTrackId: document.captions.exportDefaults.burnInTrackId,
        subtitleFormat: "ass"
      }
  };
}

async function resolveRequestedOutputPath(
  directory: string,
  requestedPath: string | null | undefined,
  projectName: string,
  presetId: string,
  extension: string,
  overwritePolicy: "increment" | "replace"
): Promise<string> {
  if (!requestedPath) {
    return resolveDefaultOutputPath(directory, projectName, presetId, extension);
  }

  const normalizedRequested = normalizeFileSystemPath(
    extname(requestedPath) ? requestedPath : `${requestedPath}.${extension}`
  );
  const parsedDirectory = dirname(normalizedRequested);

  try {
    await mkdir(parsedDirectory, { recursive: true });
  } catch (error) {
    throw new WorkerError(
      "INVALID_OUTPUT_PATH",
      `The export destination ${parsedDirectory} could not be created.`,
      error instanceof Error ? error.message : String(error)
    );
  }

  if (!(await fileExists(normalizedRequested))) {
    return normalizedRequested;
  }

  if (overwritePolicy === "replace") {
    return normalizedRequested;
  }

  const baseName = normalizedRequested.slice(0, -extname(normalizedRequested).length);

  for (let index = 1; index <= 9999; index += 1) {
    const candidate = `${baseName}-${String(index).padStart(3, "0")}${extname(normalizedRequested)}`;

    if (!(await fileExists(candidate))) {
      return candidate;
    }
  }

  throw new WorkerError(
    "INVALID_OUTPUT_PATH",
    `Could not resolve an incremental output path for ${normalizedRequested}.`
  );
}

function durationToleranceMs(renderPlan: RenderPlan): number {
  return Math.max(500, Math.round((1_000 / (renderPlan.preset.video?.frameRate ?? 30)) * 4));
}

async function verifyExportOutput(
  outputPath: string,
  renderPlan: RenderPlan
): Promise<ExportVerificationResult> {
  const exists = await fileExists(outputPath);

  if (!exists) {
    return {
      ...createPendingVerificationResult(),
      status: "failed",
      errorMessage: "The export output file was not created.",
      notes: ["Output file missing after FFmpeg completed."]
    };
  }

  const fileStats = await stat(outputPath);

  try {
    const probe = await probeAsset(outputPath);
    const expectedDurationMs = Math.round(renderPlan.durationUs / 1_000);
    const deltaMs =
      probe.durationMs === null ? null : Math.abs(probe.durationMs - expectedDurationMs);
    const containerMatches =
      probe.container?.split(",").some((entry) => entry.trim() === renderPlan.preset.container) ??
      false;
    const hasExpectedVideo = renderPlan.hasVideoOutput ? probe.streams.some((stream) => stream.codecType === "video") : !probe.streams.some((stream) => stream.codecType === "video");
    const hasExpectedAudio = renderPlan.hasAudioOutput ? probe.streams.some((stream) => stream.codecType === "audio") : !probe.streams.some((stream) => stream.codecType === "audio");
    const verificationPassed =
      fileStats.size > 0 &&
      containerMatches &&
      hasExpectedVideo &&
      hasExpectedAudio &&
      (deltaMs === null || deltaMs <= durationToleranceMs(renderPlan));

    return {
      status: verificationPassed ? "passed" : "failed",
      fileExists: true,
      fileSizeBytes: fileStats.size,
      containerMatches,
      probeSucceeded: true,
      durationDeltaMs: deltaMs,
      notes: verificationPassed
        ? ["Output file exists, is probeable, and matches the expected export shape."]
        : ["Output verification found one or more mismatches."],
      output: {
        path: outputPath,
        container: probe.container,
        durationMs: probe.durationMs,
        fileSize: fileStats.size,
        hasVideo: probe.streams.some((stream) => stream.codecType === "video"),
        hasAudio: probe.streams.some((stream) => stream.codecType === "audio")
      },
      errorMessage: verificationPassed ? null : "The exported file did not match the expected container, streams, or duration."
    };
  } catch (error) {
    return {
      status: "failed",
      fileExists: true,
      fileSizeBytes: fileStats.size,
      containerMatches: false,
      probeSucceeded: false,
      durationDeltaMs: null,
      notes: ["ffprobe could not inspect the generated export output."],
      output: null,
      errorMessage: error instanceof Error ? error.message : "ffprobe verification failed."
    };
  }
}

function createSnapshotVideoFilter(renderPlan: RenderPlan): string | null {
  const video = renderPlan.preset.video;

  if (!video) {
    return null;
  }

  return `scale=${video.width}:${video.height}:force_original_aspect_ratio=decrease,pad=${video.width}:${video.height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1`;
}

async function captureStillFrameFromSource(
  input: {
    sourcePath: string;
    outputPath: string;
    seekUs: number;
    filter: string | null;
  }
): Promise<void> {
  const args = ["-y", "-ss", formatSeconds(input.seekUs), "-i", input.sourcePath];

  if (input.filter) {
    args.push("-vf", input.filter);
  }

  args.push("-frames:v", "1", input.outputPath);
  await runFfmpeg(args);
}

async function captureBlackPlaceholderFrame(
  outputPath: string,
  renderPlan: RenderPlan
): Promise<void> {
  const video = renderPlan.preset.video;

  if (!video) {
    throw new WorkerError(
      "SNAPSHOT_UNAVAILABLE",
      "Snapshot capture requires a video-capable export preset."
    );
  }

  await runFfmpeg([
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=c=black:s=${video.width}x${video.height}:r=${video.frameRate}:d=0.1`,
    "-frames:v",
    "1",
    outputPath
  ]);
}

function findSpanAtPosition(renderPlan: RenderPlan, positionUs: number) {
  const clampedPositionUs = Math.min(
    Math.max(positionUs, renderPlan.rangeStartUs),
    Math.max(renderPlan.rangeStartUs, renderPlan.rangeEndUs - 1)
  );

  return {
    clampedPositionUs,
    span:
      renderPlan.spans.find(
        (entry) => clampedPositionUs >= entry.startUs && clampedPositionUs < entry.endUs
      ) ?? null
  };
}

function createSegmentFilterGraph(
  spec: FfmpegExecutionSpec,
  segment: FfmpegSegmentSpec
): string {
  const lines: string[] = [];
  const preset = spec.preset;

  if (spec.hasVideoOutput && preset.video) {
    if (segment.videoSource?.kind === "clip") {
      lines.push(
        `[0:v]scale=${preset.video.width}:${preset.video.height}:force_original_aspect_ratio=decrease,pad=${preset.video.width}:${preset.video.height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1[vout]`
      );
    } else {
      lines.push(`[0:v]format=${preset.video.pixelFormat},setsar=1[vout]`);
    }
  }

  if (spec.hasAudioOutput && preset.audio) {
    const baseIndex = spec.hasVideoOutput ? 1 : 0;
    const labels: string[] = [];

    segment.audioSources.forEach((source, index) => {
      const inputIndex = baseIndex + index;
      const filters = [
        `aresample=${preset.audio?.sampleRate}`,
        `aformat=channel_layouts=stereo:sample_rates=${preset.audio?.sampleRate}`
      ];

      if (source.kind === "clip" && source.gainDb !== 0) {
        filters.push(`volume=${source.gainDb}dB`);
      }

      lines.push(`[${inputIndex}:a]${filters.join(",")}[a${index}]`);
      labels.push(`[a${index}]`);
    });

    if (labels.length === 1) {
      lines.push(`${labels[0]}anull[aout]`);
    } else {
      lines.push(
        `${labels.join("")}amix=inputs=${labels.length}:duration=longest:dropout_transition=0[aout]`
      );
    }
  }

  return lines.join(";\n");
}

function createSegmentArgs(
  spec: FfmpegExecutionSpec,
  segment: FfmpegSegmentSpec,
  filterScriptPath: string,
  outputPath: string
): string[] {
  const args = ["-y"];
  const preset = spec.preset;

  if (spec.hasVideoOutput && preset.video) {
    if (segment.videoSource?.kind === "clip") {
      args.push(
        "-ss",
        formatSeconds(segment.videoSource.sourceStartUs),
        "-t",
        formatSeconds(segment.durationUs),
        "-i",
        segment.videoSource.sourcePath
      );
    } else {
      args.push(
        "-f",
        "lavfi",
        "-i",
        `color=c=black:s=${preset.video.width}x${preset.video.height}:r=${preset.video.frameRate}:d=${formatSeconds(segment.durationUs)}`
      );
    }
  }

  if (spec.hasAudioOutput && preset.audio) {
    for (const source of segment.audioSources) {
      if (source.kind === "clip") {
        args.push(
          "-ss",
          formatSeconds(source.sourceStartUs),
          "-t",
          formatSeconds(source.durationUs),
          "-i",
          source.sourcePath
        );
      } else {
        args.push(
          "-f",
          "lavfi",
          "-i",
          `anullsrc=r=${preset.audio.sampleRate}:cl=stereo:d=${formatSeconds(source.durationUs)}`
        );
      }
    }
  }

  args.push("-filter_complex_script", filterScriptPath);

  if (spec.hasVideoOutput && preset.video) {
    args.push(
      "-map",
      "[vout]",
      "-c:v",
      preset.video.codec,
      "-pix_fmt",
      preset.video.pixelFormat,
      "-r",
      String(preset.video.frameRate),
      "-b:v",
      `${preset.video.bitrateKbps}k`
    );
  }

  if (spec.hasAudioOutput && preset.audio) {
    args.push(
      "-map",
      "[aout]",
      "-c:a",
      preset.audio.codec,
      "-ar",
      String(preset.audio.sampleRate),
      "-ac",
      String(preset.audio.channelCount),
      "-b:a",
      `${preset.audio.bitrateKbps}k`
    );
  }

  args.push(
    "-t",
    formatSeconds(segment.durationUs),
    "-movflags",
    "+faststart",
    "-progress",
    "pipe:1",
    "-nostats",
    outputPath
  );

  return args;
}

function createConcatArgs(concatListPath: string, outputPath: string): string[] {
  return [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    concatListPath,
    "-c",
    "copy",
    "-movflags",
    "+faststart",
    "-progress",
    "pipe:1",
    "-nostats",
    outputPath
  ];
}

function createBurnInFilterScript(plates: CaptionBurnInPlate[]): string {
  let currentLabel = "[0:v]";

  const filterLines = plates.map((plate, index) => {
    const nextLabel = index === plates.length - 1 ? "[vout]" : `[v${index + 1}]`;
    const escapedStart = formatSeconds(plate.startUs);
    const escapedEnd = formatSeconds(plate.endUs);
    const line =
      `${currentLabel}[${index + 1}:v]overlay=0:0:` +
      `enable='between(t,${escapedStart},${escapedEnd})'${nextLabel}`;

    currentLabel = nextLabel;
    return line;
  });

  return `${filterLines.join(";\n")}\n`;
}

function createBurnInArgs(
  inputPath: string,
  filterScriptPath: string,
  plates: CaptionBurnInPlate[],
  outputPath: string,
  renderPlan: RenderPlan
): string[] {
  const args: string[] = [
    "-y",
    "-i",
    inputPath
  ];

  for (const plate of plates) {
    args.push("-loop", "1", "-i", plate.imagePath);
  }

  args.push("-filter_complex_script", filterScriptPath, "-map", "[vout]");

  if (renderPlan.preset.video) {
    args.push(
      "-c:v",
      renderPlan.preset.video.codec,
      "-r",
      String(renderPlan.preset.video.frameRate),
      "-pix_fmt",
      renderPlan.preset.video.pixelFormat,
      "-b:v",
      `${renderPlan.preset.video.bitrateKbps}k`
    );
  }

  if (renderPlan.hasAudioOutput && renderPlan.preset.audio) {
    args.push(
      "-map",
      "0:a?",
      "-c:a",
      renderPlan.preset.audio.codec,
      "-ar",
      String(renderPlan.preset.audio.sampleRate),
      "-ac",
      String(renderPlan.preset.audio.channelCount),
      "-b:a",
      `${renderPlan.preset.audio.bitrateKbps}k`
    );
  }

  args.push(
    "-t",
    formatSeconds(renderPlan.durationUs),
    "-movflags",
    "+faststart",
    "-progress",
    "pipe:1",
    "-nostats",
    outputPath
  );

  return args;
}

async function appendProgressLog(
  progressLogPath: string,
  prefix: string,
  progress: FfmpegProgress
): Promise<void> {
  await appendFile(
    progressLogPath,
    `${prefix} progress=${progress.progress} out_time_ms=${progress.outTimeMs ?? "na"} speed=${progress.speed ?? "na"}\n`,
    "utf8"
  );
}

async function runFfmpegStep(
  directory: string,
  exportRunId: string,
  args: string[],
  totalDurationUs: number,
  stepLabel: string,
  baseProgress: number,
  progressSpan: number,
  progressLogPath: string,
  ffmpegLogPath: string,
  onProgress: (progress: number, step: string) => Promise<void>
): Promise<void> {
  const active = activeExports.get(directory);

  if (!active || active.exportRunId !== exportRunId) {
    throw new WorkerError("EXPORT_CANCELLED", "The export is no longer active.");
  }

  const process = spawnFfmpegProcess(args, {
    onProgress(progressEvent) {
      const childPercent =
        progressEvent.progress === "end"
          ? 1
          : Math.max(
              0,
              Math.min(1, (progressEvent.outTimeMs ?? 0) / Math.max(1, totalDurationUs))
            );
      void appendProgressLog(progressLogPath, stepLabel, progressEvent);
      void onProgress(Math.min(0.99, baseProgress + childPercent * progressSpan), stepLabel);
    },
    onStderrLine(line) {
      void appendFile(ffmpegLogPath, `[${stepLabel}] ${line}\n`, "utf8");
    }
  });

  activeExports.set(directory, {
    exportRunId,
    cancel() {
      process.cancel();
    }
  });

  const result = await process.completed;

  if (result.cancelled) {
    throw new WorkerError("EXPORT_CANCELLED", "The export was cancelled.");
  }
}

async function updateRunState(
  databasePath: string,
  exportRunId: string,
  input: {
    status: ExportRun["status"];
    step: string;
    progress: number;
    errorMessage?: string | null;
    error?: ExportRun["error"];
    renderPlan?: RenderPlan | null;
    ffmpegSpec?: FfmpegExecutionSpec | null;
    diagnostics?: ExportRun["diagnostics"];
    verification?: ExportRun["verification"];
    artifactDirectory?: string | null;
    startedAt?: string | null;
    completedAt?: string | null;
    cancellationRequested?: boolean;
  }
): Promise<ExportRun> {
  const run = updateExportRunRecord(databasePath, exportRunId, {
    status: input.status,
    renderPlan: input.renderPlan,
    ffmpegSpec: input.ffmpegSpec,
    diagnostics: input.diagnostics,
    verification: input.verification,
    artifactDirectory: input.artifactDirectory,
    error: input.error ?? null,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    cancellationRequested: input.cancellationRequested
  });

  updateJobRecord(databasePath, run.jobId, {
    status:
      input.status === "completed"
        ? "completed"
        : input.status === "failed"
          ? "failed"
          : input.status === "cancelled"
            ? "cancelled"
            : "running",
    step: input.step,
    progress: input.progress,
    errorMessage:
      input.errorMessage === undefined ? run.error?.message ?? null : input.errorMessage
  });

  return run;
}

async function captureSnapshotForExportRun(
  directory: string,
  run: ExportRun,
  requestedPositionUs?: number | null
): Promise<ExportFrameSnapshot> {
  if (run.status !== "completed" || !run.outputPath || !run.renderPlan) {
    throw new WorkerError(
      "SNAPSHOT_UNAVAILABLE",
      "Snapshots can only be captured from completed exports with a resolved render plan."
    );
  }

  if (!run.renderPlan.hasVideoOutput) {
    throw new WorkerError(
      "SNAPSHOT_UNAVAILABLE",
      "The selected export does not contain video frames to capture."
    );
  }

  if (!(await fileExists(run.outputPath))) {
    throw new WorkerError(
      "SNAPSHOT_UNAVAILABLE",
      "The export output file could not be found for snapshot capture."
    );
  }

  const paths = resolveProjectPaths(directory);
  const artifactDirectory =
    run.artifactDirectory ?? resolveExportArtifactDirectory(paths, run.id).absolutePath;
  const snapshotDirectory = join(artifactDirectory, "snapshots");
  const manifestPath = join(snapshotDirectory, "snapshot-manifest.json");
  const snapshotId = randomUUID();
  const positionUs =
    requestedPositionUs === undefined || requestedPositionUs === null
      ? Math.round(run.renderPlan.durationUs / 2)
      : Math.max(0, Math.min(requestedPositionUs, Math.max(0, run.renderPlan.durationUs - 1)));
  const outputPath = join(snapshotDirectory, `${snapshotId}.png`);

  await mkdir(snapshotDirectory, { recursive: true });
  await captureStillFrameFromSource({
    sourcePath: run.outputPath,
    outputPath,
    seekUs: positionUs,
    filter: null
  });

  const snapshot: ExportFrameSnapshot = {
    id: snapshotId,
    sourceKind: "export-run",
    exportRunId: run.id,
    timelineId: run.timelineId,
    presetId: run.presetId,
    positionUs,
    outputPath,
    placeholderFrame: false,
    note: "Captured from the completed export output.",
    createdAt: nowIso()
  };

  await appendSnapshotManifest(manifestPath, snapshot);
  updateExportRunRecord(paths.databasePath, run.id, {
    diagnostics: {
      ...run.diagnostics,
      snapshotManifestPath: manifestPath
    }
  });

  return snapshot;
}

async function captureSnapshotForTimelinePosition(
  directory: string,
  timelineId: string,
  positionUs: number,
  presetId: RenderPlan["preset"]["id"] | undefined
): Promise<ExportFrameSnapshot> {
  const { paths, document } = await loadAndMaybeMigrateProject(directory);
  const renderPlanResult = compileRenderPlan(
    document.timeline,
    Object.fromEntries(document.library.items.map((item) => [item.id, item])),
    document.settings.exports.defaultPreset,
    {
      timelineId,
      presetId,
      exportMode: "video",
      target: {
        kind: "timeline"
      }
    }
  );

  if (!renderPlanResult.ok) {
    throw new WorkerError(
      renderPlanResult.error.code,
      renderPlanResult.error.message,
      renderPlanResult.error.details
    );
  }

  const renderPlan = renderPlanResult.renderPlan;

  if (!renderPlan.preset.video) {
    throw new WorkerError(
      "SNAPSHOT_UNAVAILABLE",
      "Timeline snapshot capture requires a video-capable export preset."
    );
  }

  if (positionUs < renderPlan.rangeStartUs || positionUs > renderPlan.rangeEndUs) {
    throw new WorkerError(
      "INVALID_EXPORT_RANGE",
      "Timeline snapshot position falls outside the current timeline."
    );
  }

  const snapshotDirectory = join(paths.exportArtifactsRoot, "snapshots", "timeline");
  const manifestPath = join(snapshotDirectory, "snapshot-manifest.json");
  const snapshotId = randomUUID();
  const outputPath = join(snapshotDirectory, `${snapshotId}.png`);
  const { span, clampedPositionUs } = findSpanAtPosition(renderPlan, positionUs);

  await mkdir(snapshotDirectory, { recursive: true });

  let placeholderFrame = false;
  let note: string | null = null;

  if (span?.video) {
    const sourceSeekUs =
      span.video.sourceStartUs + Math.max(0, clampedPositionUs - span.startUs);
    await captureStillFrameFromSource({
      sourcePath: span.video.sourcePath,
      outputPath,
      seekUs: sourceSeekUs,
      filter: createSnapshotVideoFilter(renderPlan)
    });
  } else {
    placeholderFrame = true;
    note = "No video clip is active at the requested timeline position; generated a black placeholder frame.";
    await captureBlackPlaceholderFrame(outputPath, renderPlan);
  }

  const snapshot: ExportFrameSnapshot = {
    id: snapshotId,
    sourceKind: "timeline",
    exportRunId: null,
    timelineId: renderPlan.timelineId,
    presetId: renderPlan.preset.id,
    positionUs: clampedPositionUs,
    outputPath,
    placeholderFrame,
    note,
    createdAt: nowIso()
  };

  await appendSnapshotManifest(manifestPath, snapshot);
  return snapshot;
}

async function processQueuedExport(directory: string): Promise<void> {
  const paths = resolveProjectPaths(directory);

  if (activeExports.has(paths.directory)) {
    return;
  }

  const nextRun = listExportRuns(paths.databasePath)
    .filter((run) => run.status === "queued")
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))[0];

  if (!nextRun) {
    return;
  }

  const activeHandle: ActiveExportProcess = {
    exportRunId: nextRun.id,
    cancel() {
      // replaced when ffmpeg starts
    }
  };
  activeExports.set(paths.directory, activeHandle);

  try {
    await runExportPipeline(paths.directory, nextRun.id);
  } catch (error) {
    const failedRun = getExportRun(paths.databasePath, nextRun.id);

    if (failedRun && failedRun.status !== "failed" && failedRun.status !== "cancelled") {
      const cancelled =
        error instanceof WorkerError && error.code === "EXPORT_CANCELLED";
      await updateRunState(paths.databasePath, nextRun.id, {
        status: cancelled ? "cancelled" : "failed",
        step: cancelled ? "Cancelled" : "Failed",
        progress: 1,
        errorMessage: error instanceof Error ? error.message : "The export failed.",
        error: {
          code:
            error instanceof WorkerError
              ? error.code
              : "EXPORT_FAILED",
          message: error instanceof Error ? error.message : "The export failed."
        },
        completedAt: nowIso(),
        cancellationRequested: cancelled || failedRun.cancellationRequested
      });
    }
  } finally {
    activeExports.delete(paths.directory);
    void processQueuedExport(paths.directory);
  }
}

async function runExportPipeline(directory: string, exportRunId: string): Promise<void> {
  const { paths, document } = await loadAndMaybeMigrateProject(directory);
  const existingRun = getExportRun(paths.databasePath, exportRunId);

  if (!existingRun) {
    throw new WorkerError("EXPORT_NOT_FOUND", `Export run ${exportRunId} could not be found.`);
  }

  const artifactDescriptor = resolveExportArtifactDirectory(paths, exportRunId);
  const artifactDirectory = artifactDescriptor.absolutePath;
  const segmentsDirectory = join(artifactDirectory, "segments");
  const progressLogPath = join(artifactDirectory, "ffmpeg-progress.log");
  const ffmpegLogPath = join(artifactDirectory, "ffmpeg.log");
  const renderPlanPath = join(artifactDirectory, "render-plan.json");
  const ffmpegSpecPath = join(artifactDirectory, "ffmpeg-spec.json");
  const verificationPath = join(artifactDirectory, "verification.json");
  const developmentManifestPath = join(artifactDirectory, "development-manifest.json");
  const snapshotManifestPath = join(artifactDirectory, "snapshots", "snapshot-manifest.json");

  await mkdir(segmentsDirectory, { recursive: true });

  let diagnostics = {
    ...existingRun.diagnostics,
    renderPlanPath,
    ffmpegSpecPath,
    developmentManifestPath: isDevelopmentExportLoggingEnabled()
      ? developmentManifestPath
      : null,
    ffmpegLogPath,
    ffmpegProgressPath: progressLogPath,
    verificationPath,
    snapshotManifestPath
  };

  await updateRunState(paths.databasePath, exportRunId, {
    status: "preparing",
    step: "Preparing export",
    progress: 0.05,
    diagnostics,
    artifactDirectory,
    startedAt: nowIso()
  });

  const renderPlanResult = compileRenderPlan(
    document.timeline,
    Object.fromEntries(document.library.items.map((item) => [item.id, item])),
    document.settings.exports.defaultPreset,
    existingRun.request
  );

  if (!renderPlanResult.ok) {
    await updateRunState(paths.databasePath, exportRunId, {
      status: "failed",
      step: "Compile failed",
      progress: 1,
      errorMessage: renderPlanResult.error.message,
      error: {
        code: renderPlanResult.error.code,
        message: renderPlanResult.error.message,
        details: renderPlanResult.error.details
      },
      completedAt: nowIso()
    });
    return;
  }

  const renderPlan = renderPlanResult.renderPlan;
  let burnInPlates: CaptionBurnInPlate[] = [];
  let burnInFilterScriptPath: string | null = null;

  if (renderPlan.captionBurnIn && !renderPlan.preset.video) {
    renderPlan.diagnostics.warnings.push(
      "Caption burn-in is ignored for non-video export presets."
    );
    renderPlan.captionBurnIn = null;
  }

  if (renderPlan.captionBurnIn) {
    const captionTrack = document.captions.tracks.find(
      (track) => track.id === renderPlan.captionBurnIn?.captionTrackId
    );

    if (!captionTrack) {
      await updateRunState(paths.databasePath, exportRunId, {
        status: "failed",
        step: "Caption track missing",
        progress: 1,
        errorMessage: "The configured burn-in caption track could not be found.",
        error: {
          code: "CAPTION_TRACK_NOT_FOUND",
          message: "The configured burn-in caption track could not be found."
        },
        completedAt: nowIso()
      });
      return;
    }

    const template = resolveCaptionTemplate(captionTrack.templateId);

    if (!template) {
      await updateRunState(paths.databasePath, exportRunId, {
        status: "failed",
        step: "Caption template missing",
        progress: 1,
        errorMessage: `Caption template ${captionTrack.templateId} could not be resolved for burn-in.`,
        error: {
          code: "CAPTION_TEMPLATE_NOT_FOUND",
          message: `Caption template ${captionTrack.templateId} could not be resolved for burn-in.`
        },
        completedAt: nowIso()
      });
      return;
    }

    const subtitleDirectory = join(artifactDirectory, "captions");
    const plateDirectory = join(subtitleDirectory, "plates");
    const subtitlePath = join(subtitleDirectory, "burn-in.ass");
    await mkdir(subtitleDirectory, { recursive: true });
    await writeFile(subtitlePath, formatCaptionTrackAsAss(captionTrack, template), "utf8");
    burnInPlates = await renderCaptionTrackToPngPlates({
      track: captionTrack,
      template,
      width: renderPlan.preset.video!.width,
      height: renderPlan.preset.video!.height,
      outputDirectory: plateDirectory
    });

    if (burnInPlates.length === 0) {
      renderPlan.captionBurnIn = null;
      renderPlan.diagnostics.notes.push(
        `Caption burn-in was requested for ${captionTrack.name}, but the track has no enabled segments.`
      );
    } else {
    burnInFilterScriptPath = join(subtitleDirectory, "burn-in.ffmpeg-filter.txt");
    await writeFile(
      burnInFilterScriptPath,
      createBurnInFilterScript(burnInPlates),
      "utf8"
    );

    renderPlan.captionBurnIn = {
      ...renderPlan.captionBurnIn,
      subtitleArtifactPath: subtitlePath,
      templateIds: [captionTrack.templateId]
    };
    renderPlan.diagnostics.notes.push(
      `Caption burn-in enabled with ${captionTrack.name}; ASS is preserved as the subtitle artifact and PNG caption plates drive the final overlay step.`
    );
    renderPlan.diagnostics.warnings.push(
      "Stage 6 burn-in ignores template animation intents and active-word highlight timing during rasterized fallback overlays."
    );
    diagnostics = {
      ...diagnostics,
      subtitleArtifactPaths: [...diagnostics.subtitleArtifactPaths, subtitlePath]
    };
    }
  }

  for (const span of renderPlan.spans) {
    if (span.video && !(await fileExists(span.video.sourcePath))) {
      await updateRunState(paths.databasePath, exportRunId, {
        status: "failed",
        step: "Source missing",
        progress: 1,
        errorMessage: `Source media missing: ${span.video.sourcePath}`,
        error: {
          code: "MISSING_SOURCE_MEDIA",
          message: `Source media missing: ${span.video.sourcePath}`
        },
        completedAt: nowIso()
      });
      return;
    }

    for (const audio of span.audio) {
      if (!(await fileExists(audio.sourcePath))) {
        await updateRunState(paths.databasePath, exportRunId, {
          status: "failed",
          step: "Source missing",
          progress: 1,
          errorMessage: `Source media missing: ${audio.sourcePath}`,
          error: {
            code: "MISSING_SOURCE_MEDIA",
            message: `Source media missing: ${audio.sourcePath}`
          },
          completedAt: nowIso()
        });
        return;
      }
    }
  }

  await writeFile(renderPlanPath, JSON.stringify(renderPlan, null, 2), "utf8");

  const ffmpegSpecResult = compileFfmpegExecutionSpec(renderPlan, exportRunId);

  if (!ffmpegSpecResult.ok) {
    await updateRunState(paths.databasePath, exportRunId, {
      status: "failed",
      step: "Compile failed",
      progress: 1,
      errorMessage: ffmpegSpecResult.error.message,
      error: {
        code: ffmpegSpecResult.error.code,
        message: ffmpegSpecResult.error.message,
        details: ffmpegSpecResult.error.details
      },
      completedAt: nowIso()
    });
    return;
  }

  const ffmpegSpec = ffmpegSpecResult.ffmpegSpec;
  await writeFile(ffmpegSpecPath, JSON.stringify(ffmpegSpec, null, 2), "utf8");

  diagnostics = {
    ...diagnostics,
    concatListPath: join(artifactDirectory, ffmpegSpec.concat.concatListFileName)
  };

  await updateRunState(paths.databasePath, exportRunId, {
    status: "compiling",
    step: "Compiling render plan",
    progress: 0.1,
    renderPlan,
    ffmpegSpec,
    diagnostics,
    artifactDirectory
  });

  const developmentManifest: ExportDevelopmentManifest = {
    exportRunId,
    generatedAt: nowIso(),
    renderPlanPath,
    ffmpegSpecPath,
    segmentSteps: [],
    concatStep: null,
    burnInStep: null
  };
  const segmentPaths: string[] = [];

  for (const segment of ffmpegSpec.segmentSpecs) {
    const filterScriptPath = join(
      artifactDirectory,
      `segment-${String(segment.segmentIndex + 1).padStart(4, "0")}.ffmpeg-filter.txt`
    );
    const segmentOutputPath = join(segmentsDirectory, segment.outputFileName);
    const filterGraph = createSegmentFilterGraph(ffmpegSpec, segment);
    const segmentArgs = createSegmentArgs(
      ffmpegSpec,
      segment,
      filterScriptPath,
      segmentOutputPath
    );
    await writeFile(filterScriptPath, filterGraph, "utf8");
    developmentManifest.segmentSteps.push({
      segmentId: segment.id,
      outputPath: segmentOutputPath,
      filterScriptPath,
      args: segmentArgs
    });
    await writeDevelopmentManifest(developmentManifestPath, developmentManifest);

    await updateRunState(paths.databasePath, exportRunId, {
      status: "rendering",
      step: `Rendering segment ${segment.segmentIndex + 1}/${ffmpegSpec.segmentSpecs.length}`,
      progress:
        0.1 + (segment.segmentIndex / Math.max(1, ffmpegSpec.segmentSpecs.length)) * 0.7,
      diagnostics,
      artifactDirectory
    });

    await runFfmpegStep(
      paths.directory,
      exportRunId,
      segmentArgs,
      segment.durationUs,
      `segment-${segment.segmentIndex + 1}`,
      0.1 + (segment.segmentIndex / Math.max(1, ffmpegSpec.segmentSpecs.length)) * 0.7,
      0.7 / Math.max(1, ffmpegSpec.segmentSpecs.length),
      progressLogPath,
      ffmpegLogPath,
      async (progress, step) => {
        await updateRunState(paths.databasePath, exportRunId, {
          status: "rendering",
          step,
          progress,
          diagnostics,
          artifactDirectory
        });
      }
    );

    segmentPaths.push(segmentOutputPath);
  }

  const concatListPath = join(artifactDirectory, ffmpegSpec.concat.concatListFileName);
  await writeFile(
    concatListPath,
    `${segmentPaths.map((path) => `file '${path.replace(/'/gu, "'\\''")}'`).join("\n")}\n`,
    "utf8"
  );

  await updateRunState(paths.databasePath, exportRunId, {
    status: "finalizing",
    step: "Finalizing export",
    progress: 0.85,
    diagnostics,
    artifactDirectory
  });

  const assembledOutputPath = renderPlan.captionBurnIn
    ? join(artifactDirectory, "assembled-pre-burnin.mp4")
    : (existingRun.outputPath ?? existingRun.request.outputPath ?? "");
  const concatArgs = createConcatArgs(
    concatListPath,
    assembledOutputPath
  );
  developmentManifest.concatStep = {
    concatListPath,
    outputPath: assembledOutputPath,
    args: concatArgs
  };
  await writeDevelopmentManifest(developmentManifestPath, developmentManifest);

  await runFfmpegStep(
    paths.directory,
    exportRunId,
    concatArgs,
    renderPlan.durationUs,
    "concat",
    0.85,
    0.1,
    progressLogPath,
    ffmpegLogPath,
    async (progress, step) => {
      await updateRunState(paths.databasePath, exportRunId, {
        status: "finalizing",
        step,
        progress,
        diagnostics,
        artifactDirectory
      });
    }
  );

  if (renderPlan.captionBurnIn?.subtitleArtifactPath) {
    const filterScriptPath =
      burnInFilterScriptPath ?? join(artifactDirectory, "captions", "burn-in.ffmpeg-filter.txt");
    const burnInArgs = createBurnInArgs(
      assembledOutputPath,
      filterScriptPath,
      burnInPlates,
      existingRun.outputPath ?? existingRun.request.outputPath ?? "",
      renderPlan
    );
    developmentManifest.burnInStep = {
      strategy: "overlay-plates",
      subtitlePath: renderPlan.captionBurnIn.subtitleArtifactPath,
      filterScriptPath,
      platePaths: burnInPlates.map((plate) => plate.imagePath),
      outputPath: existingRun.outputPath ?? existingRun.request.outputPath ?? "",
      args: burnInArgs
    };
    await writeDevelopmentManifest(developmentManifestPath, developmentManifest);
    await updateRunState(paths.databasePath, exportRunId, {
      status: "finalizing",
      step: "Burning in captions",
      progress: 0.92,
      diagnostics,
      artifactDirectory,
      renderPlan
    });
    await runFfmpegStep(
      paths.directory,
      exportRunId,
      burnInArgs,
      renderPlan.durationUs,
      "burn-in",
      0.92,
      0.05,
      progressLogPath,
      ffmpegLogPath,
      async (progress, step) => {
        await updateRunState(paths.databasePath, exportRunId, {
          status: "finalizing",
          step,
          progress,
          diagnostics,
          artifactDirectory
        });
      }
    );
  }

  await updateRunState(paths.databasePath, exportRunId, {
    status: "verifying",
    step: "Verifying output",
    progress: 0.97,
    diagnostics,
    artifactDirectory
  });

  const verification = await verifyExportOutput(existingRun.outputPath ?? "", renderPlan);
  await writeFile(verificationPath, JSON.stringify(verification, null, 2), "utf8");

  await updateRunState(paths.databasePath, exportRunId, {
    status: verification.status === "passed" ? "completed" : "failed",
    step: verification.status === "passed" ? "Completed" : "Verification failed",
    progress: 1,
    verification,
    diagnostics,
    artifactDirectory,
    errorMessage: verification.errorMessage,
    error:
      verification.status === "passed"
        ? null
        : {
            code: "EXPORT_VERIFICATION_FAILED",
            message: verification.errorMessage ?? "Output verification failed."
          },
    completedAt: nowIso()
  });
}

function extractRetryRequest(run: ExportRun): ExportRun["request"] {
  return {
    ...run.request
  };
}

export async function executeExportCommand(
  input: ExecuteExportCommandInput
): Promise<ExecuteExportCommandResult> {
  const { paths, document } = await loadAndMaybeMigrateProject(input.directory);
  await primeInterruptedExports(paths.directory);

  switch (input.command.type) {
    case "CreateExportRequest": {
      const request = withProjectCaptionDefaults(document, input.command.request);
      const result = createExportRequest(
        document.timeline,
        document.settings.exports.defaultPreset,
        request
      );

      return {
        snapshot: await getExportSessionSnapshot({ directory: paths.directory }),
        result: result.ok
          ? {
              ok: true,
              commandType: "CreateExportRequest",
              request: result.request
            }
          : createFailure(
              input.command,
              result.error.code,
              result.error.message,
              result.error.details
            )
      };
    }
    case "CompileRenderPlan": {
      const request = withProjectCaptionDefaults(document, input.command.request);
      const renderPlanResult = compileRenderPlan(
        document.timeline,
        Object.fromEntries(document.library.items.map((item) => [item.id, item])),
        document.settings.exports.defaultPreset,
        request
      );

      if (!renderPlanResult.ok) {
        return {
          snapshot: await getExportSessionSnapshot({ directory: paths.directory }),
          result: createFailure(
            input.command,
            renderPlanResult.error.code,
            renderPlanResult.error.message,
            renderPlanResult.error.details
          )
        };
      }

      const ffmpegSpecResult = compileFfmpegExecutionSpec(
        renderPlanResult.renderPlan,
        "compile-preview"
      );

      if (!ffmpegSpecResult.ok) {
        return {
          snapshot: await getExportSessionSnapshot({ directory: paths.directory }),
          result: createFailure(
            input.command,
            ffmpegSpecResult.error.code,
            ffmpegSpecResult.error.message,
            ffmpegSpecResult.error.details
          )
        };
      }

      return {
        snapshot: await getExportSessionSnapshot({ directory: paths.directory }),
        result: {
          ok: true,
          commandType: "CompileRenderPlan",
          request: renderPlanResult.request,
          renderPlan: renderPlanResult.renderPlan,
          ffmpegSpec: ffmpegSpecResult.ffmpegSpec
        }
      };
    }
    case "StartExport": {
      const request = withProjectCaptionDefaults(document, input.command.request);
      const wasBusy =
        activeExports.has(paths.directory) ||
        listExportRuns(paths.databasePath).some((run) => isActiveStatus(run.status));
      const requestResult = createExportRequest(
        document.timeline,
        document.settings.exports.defaultPreset,
        request
      );

      if (!requestResult.ok) {
        return {
          snapshot: await getExportSessionSnapshot({ directory: paths.directory }),
          result: createFailure(
            input.command,
            requestResult.error.code,
            requestResult.error.message,
            requestResult.error.details
          )
        };
      }

      const outputPath = await resolveRequestedOutputPath(
        paths.directory,
        requestResult.request.outputPath,
        document.project.name,
        requestResult.request.presetId,
        requestResult.preset.extension,
        requestResult.request.overwritePolicy
      );

      const exportRunId = randomUUID();
      const jobId = createJobRecord(paths.databasePath, {
        kind: "export",
        projectDirectory: paths.directory,
        payload: {
          exportRunId,
          timelineId: requestResult.request.timelineId,
          exportMode: requestResult.request.exportMode,
          presetId: requestResult.request.presetId,
          outputPath
        },
        status: "queued",
        progress: 0,
        step: "Queued"
      });
      const exportRun: ExportRun = {
        id: exportRunId,
        jobId,
        projectDirectory: paths.directory,
        timelineId: requestResult.request.timelineId,
        status: "queued",
        exportMode: requestResult.request.exportMode,
        presetId: requestResult.request.presetId,
        outputPath,
        artifactDirectory: null,
        request: requestResult.request,
        renderPlan: null,
        ffmpegSpec: null,
        verification: createPendingVerificationResult(),
        diagnostics: createEmptyExportDiagnostics(),
        error: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        startedAt: null,
        completedAt: null,
        retryOfRunId: null,
        cancellationRequested: false
      };

      createExportRunRecord(paths.databasePath, exportRun);
      void processQueuedExport(paths.directory);

      return {
        snapshot: await getExportSessionSnapshot({ directory: paths.directory }),
        result: {
          ok: true,
          commandType: "StartExport",
          exportRun,
          queued: wasBusy
        }
      };
    }
    case "CaptureExportSnapshot": {
      try {
        const snapshot =
          input.command.request.sourceKind === "export-run"
            ? await captureSnapshotForExportRun(
                paths.directory,
                getExportRun(paths.databasePath, input.command.request.exportRunId) ??
                  (() => {
                    throw new WorkerError(
                      "EXPORT_NOT_FOUND",
                      `Export run ${input.command.request.exportRunId} was not found.`
                    );
                  })(),
                input.command.request.positionUs
              )
            : await captureSnapshotForTimelinePosition(
                paths.directory,
                input.command.request.timelineId,
                input.command.request.positionUs,
                input.command.request.presetId
              );

        return {
          snapshot: await getExportSessionSnapshot({ directory: paths.directory }),
          result: {
            ok: true,
            commandType: "CaptureExportSnapshot",
            snapshot
          }
        };
      } catch (error) {
        return {
          snapshot: await getExportSessionSnapshot({ directory: paths.directory }),
          result: createFailure(
            input.command,
            resolveSnapshotFailureCode(error),
            error instanceof Error ? error.message : "Snapshot capture failed.",
            error instanceof WorkerError ? error.details : undefined
          )
        };
      }
    }
    case "CancelExport": {
      const run = getExportRun(paths.databasePath, input.command.exportRunId);

      if (!run) {
        return {
          snapshot: await getExportSessionSnapshot({ directory: paths.directory }),
          result: createFailure(input.command, "EXPORT_NOT_FOUND", `Export run ${input.command.exportRunId} was not found.`)
        };
      }

      if (!isActiveStatus(run.status)) {
        return {
          snapshot: await getExportSessionSnapshot({ directory: paths.directory }),
          result: createFailure(input.command, "EXPORT_NOT_ACTIVE", "Only queued or active exports can be cancelled.")
        };
      }

      const active = activeExports.get(paths.directory);

      if (active?.exportRunId === run.id) {
        active.cancel();
      }

      const nextRun = updateExportRunRecord(paths.databasePath, run.id, {
        cancellationRequested: true,
        status: run.status === "queued" ? "cancelled" : run.status,
        completedAt: run.status === "queued" ? nowIso() : run.completedAt,
        error:
          run.status === "queued"
            ? {
                code: "EXPORT_CANCELLED",
                message: "The queued export was cancelled before rendering started."
              }
            : run.error
      });

      if (run.status === "queued") {
        updateJobRecord(paths.databasePath, run.jobId, {
          status: "cancelled",
          progress: 0,
          step: "Cancelled",
          errorMessage: "The queued export was cancelled."
        });
      }

      return {
        snapshot: await getExportSessionSnapshot({ directory: paths.directory }),
        result: {
          ok: true,
          commandType: "CancelExport",
          exportRun: nextRun
        }
      };
    }
    case "RetryExport": {
      const run = getExportRun(paths.databasePath, input.command.exportRunId);

      if (!run) {
        return {
          snapshot: await getExportSessionSnapshot({ directory: paths.directory }),
          result: createFailure(input.command, "EXPORT_NOT_FOUND", `Export run ${input.command.exportRunId} was not found.`)
        };
      }

      if (run.status !== "failed" && run.status !== "cancelled") {
        return {
          snapshot: await getExportSessionSnapshot({ directory: paths.directory }),
          result: createFailure(input.command, "NOTHING_TO_RETRY", "Only failed or cancelled exports can be retried.")
        };
      }

      const preset = resolveExportPreset(run.presetId);

      if (!preset) {
        return {
          snapshot: await getExportSessionSnapshot({ directory: paths.directory }),
          result: createFailure(input.command, "INVALID_PRESET", `Export preset ${run.presetId} is no longer available.`)
        };
      }

      const outputPath = await resolveRequestedOutputPath(
        paths.directory,
        run.request.outputPath,
        document.project.name,
        run.request.presetId,
        preset.extension,
        run.request.overwritePolicy
      );

      const exportRunId = randomUUID();
      const retryRequest = extractRetryRequest(run);
      const jobId = createJobRecord(paths.databasePath, {
        kind: "export",
        projectDirectory: paths.directory,
        payload: {
          exportRunId,
          timelineId: retryRequest.timelineId,
          exportMode: retryRequest.exportMode,
          presetId: retryRequest.presetId,
          outputPath
        },
        status: "queued",
        progress: 0,
        step: "Queued"
      });
      const nextRun: ExportRun = {
        ...run,
        id: exportRunId,
        jobId,
        status: "queued",
        outputPath,
        artifactDirectory: null,
        renderPlan: null,
        ffmpegSpec: null,
        verification: createPendingVerificationResult(),
        diagnostics: createEmptyExportDiagnostics(),
        error: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        startedAt: null,
        completedAt: null,
        retryOfRunId: run.id,
        cancellationRequested: false
      };

      createExportRunRecord(paths.databasePath, nextRun);
      void processQueuedExport(paths.directory);

      return {
        snapshot: await getExportSessionSnapshot({ directory: paths.directory }),
        result: {
          ok: true,
          commandType: "RetryExport",
          exportRun: nextRun
        }
      };
    }
    case "QueryExportStatus": {
      return {
        snapshot: await getExportSessionSnapshot({ directory: paths.directory }),
        result: {
          ok: true,
          commandType: "QueryExportStatus",
          exportRun: getExportRun(paths.databasePath, input.command.exportRunId)
        }
      };
    }
    case "ListExports": {
      return {
        snapshot: await getExportSessionSnapshot({ directory: paths.directory }),
        result: {
          ok: true,
          commandType: "ListExports",
          exportRuns: listExportRuns(paths.databasePath)
        }
      };
    }
  }
}
