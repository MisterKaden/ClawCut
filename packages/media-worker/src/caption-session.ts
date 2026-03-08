import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  applyCaptionTemplateToTrack,
  createEmptyRecoveryInfo,
  createEmptyTranscriptDiagnostics,
  createTranscriptFromNormalizedResult,
  formatCaptionTrackAsAss,
  formatCaptionTrackAsSrt,
  generateCaptionTrackFromTranscript,
  getBuiltInCaptionTemplates,
  normalizeTranscriptionOptions,
  regenerateCaptionTrackFromTranscript,
  resolveCaptionTemplate,
  summarizeTranscript,
  summarizeTranscripts,
  updateCaptionSegmentOnTrack,
  updateTranscriptSegmentText,
  type CaptionCommandFailure,
  type CaptionCommand,
  type CaptionSessionSnapshot,
  type CaptionTrack,
  type SubtitleFormat,
  type Transcript,
  type TranscriptionRequest,
  type TranscriptionRun
} from "@clawcut/domain";
import type {
  ExecuteCaptionCommandInput,
  ExecuteCaptionCommandResult,
  GetCaptionSessionSnapshotInput
} from "@clawcut/ipc";

import { runFfmpeg } from "./ffmpeg";
import {
  createJobRecord,
  getStoredJobRecord,
  loadAndMaybeMigrateProject,
  updateCaptionExportDefaults,
  updateCaptionTrack,
  updateJobRecord,
  updateTranscript
} from "./project-repository";
import {
  resolveProjectPaths,
  resolveTranscriptionArtifactDirectory
} from "./paths";
import {
  createTranscriptionRunRecord,
  getTranscriptionRun,
  listTranscriptionRuns,
  updateTranscriptionRunRecord
} from "./transcription-repository";
import { createTranscriptionAdapter } from "./transcription-adapter";
import type { PersistedTranscriptionJobPayload } from "./job-payloads";
import { nowIso, WorkerError } from "./utils";

const activeTranscriptions = new Map<string, string>();

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+/u, "")
    .replace(/-+$/u, "")
    .slice(0, 50) || "captions";
}

function createFailure(
  command: CaptionCommand,
  code: CaptionCommandFailure["error"]["code"],
  message: string,
  details?: string
): CaptionCommandFailure {
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

function buildCaptionSessionSnapshot(
  directory: string,
  projectName: string,
  transcripts: Transcript[],
  captionTracks: CaptionTrack[]
): CaptionSessionSnapshot {
  const paths = resolveProjectPaths(directory);
  const runs = listTranscriptionRuns(paths.databasePath);

  return {
    directory: paths.directory,
    projectName,
    transcripts,
    transcriptSummaries: summarizeTranscripts(transcripts, captionTracks),
    captionTracks,
    templates: getBuiltInCaptionTemplates(),
    transcriptionRuns: runs,
    activeTranscriptionJobId:
      runs.find((run) => run.status === "queued" || run.status === "running")?.jobId ?? null,
    lastError: runs.find((run) => run.error)?.error ?? null
  };
}

export async function getCaptionSessionSnapshot(
  input: GetCaptionSessionSnapshotInput
): Promise<CaptionSessionSnapshot> {
  const { paths, document } = await loadAndMaybeMigrateProject(input.directory);

  return buildCaptionSessionSnapshot(
    paths.directory,
    document.project.name,
    document.transcripts.items,
    document.captions.tracks
  );
}

function getMostRecentRunForTranscript(
  databasePath: string,
  transcriptId: string
): TranscriptionRun | null {
  return (
    listTranscriptionRuns(databasePath).find((run) => run.transcriptId === transcriptId) ?? null
  );
}

function resolveSubtitleOutputPath(
  directory: string,
  projectName: string,
  captionTrack: CaptionTrack,
  format: SubtitleFormat,
  requestedPath?: string | null
): string {
  if (requestedPath?.trim()) {
    return requestedPath.trim();
  }

  const paths = resolveProjectPaths(directory);
  const baseName = `${slugify(projectName)}-${slugify(captionTrack.name) || slugify(captionTrack.id)}`;
  return join(paths.exportsRoot, `${baseName}.${format}`);
}

async function extractClipAudioToWav(input: {
  sourcePath: string;
  outputPath: string;
  sourceStartUs: number;
  sourceEndUs: number;
}): Promise<void> {
  const durationUs = Math.max(1, input.sourceEndUs - input.sourceStartUs);
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-ss",
    (input.sourceStartUs / 1_000_000).toFixed(6),
    "-t",
    (durationUs / 1_000_000).toFixed(6),
    "-i",
    input.sourcePath,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-c:a",
    "pcm_s16le",
    input.outputPath
  ];

  await runFfmpeg(args);
}

function updateRunAndJobFailure(
  databasePath: string,
  runId: string,
  jobId: string,
  error: WorkerError | Error
): void {
  updateTranscriptionRunRecord(databasePath, runId, {
    status: "failed",
    error: {
      code: error instanceof WorkerError ? error.code : "TRANSCRIPTION_FAILED",
      message: error.message,
      details: error instanceof WorkerError ? error.details : undefined
    },
    completedAt: nowIso()
  });
  updateJobRecord(databasePath, jobId, {
    status: "failed",
    progress: 1,
    step: "Failed",
    errorMessage: error.message
  });
}

async function runQueuedTranscription(directory: string, runId: string): Promise<void> {
  const { paths, document } = await loadAndMaybeMigrateProject(directory);
  const run = getTranscriptionRun(paths.databasePath, runId);

  if (!run) {
    throw new WorkerError("TRANSCRIPTION_FAILED", `Transcription run ${runId} could not be found.`);
  }

  const sourceClipId = run.request.source.clipId;

  if (!sourceClipId) {
    throw new WorkerError("CLIP_NOT_FOUND", "Transcription run does not reference a clip.");
  }

  const clip = document.timeline.clipsById[sourceClipId];
  const mediaItem = document.library.items.find((item) => item.id === run.request.source.mediaItemId);

  if (!clip || !mediaItem) {
    throw new WorkerError("CLIP_NOT_FOUND", "The requested clip could not be resolved for transcription.");
  }

  if (!mediaItem.metadataSummary.hasAudio) {
    throw new WorkerError(
      "NO_AUDIO_CONTENT",
      "The selected clip does not have usable audio for transcription."
    );
  }

  if (!mediaItem.source.currentResolvedPath) {
    throw new WorkerError(
      "MEDIA_ITEM_NOT_FOUND",
      "The selected media item no longer has a resolvable source path."
    );
  }

  const artifactDescriptor = resolveTranscriptionArtifactDirectory(paths, runId);
  await mkdir(artifactDescriptor.absolutePath, { recursive: true });
  const extractedAudioPath = join(artifactDescriptor.absolutePath, "input.wav");
  const adapter = createTranscriptionAdapter();
  const runtimeStatus = adapter.getRuntimeStatus();

  if (!runtimeStatus.available) {
    throw new WorkerError(
      "TRANSCRIPTION_ENGINE_UNAVAILABLE",
      "The transcription engine is not available.",
      runtimeStatus.remediationHint ?? undefined
    );
  }

  updateTranscriptionRunRecord(paths.databasePath, runId, {
    status: "running",
    startedAt: nowIso(),
    diagnostics: {
      ...run.diagnostics,
      artifactDirectory: artifactDescriptor.absolutePath,
      extractedAudioPath
    }
  });
  updateJobRecord(paths.databasePath, run.jobId, {
    status: "running",
    progress: 0.2,
    step: "Extracting clip audio",
      attemptCount: (getStoredJobRecord(paths.databasePath, run.jobId)?.attemptCount ?? 0) + 1,
    errorMessage: null
  });

  await extractClipAudioToWav({
    sourcePath: mediaItem.source.currentResolvedPath,
    outputPath: extractedAudioPath,
    sourceStartUs: clip.sourceInUs,
    sourceEndUs: clip.sourceOutUs
  });

  updateJobRecord(paths.databasePath, run.jobId, {
    status: "running",
    progress: 0.55,
    step: "Running transcription"
  });

  const transcriptionOutput = await adapter.transcribe({
    audioPath: extractedAudioPath,
    sourceDurationUs: Math.max(1, clip.sourceOutUs - clip.sourceInUs),
    options: run.request.options,
    artifactDirectory: artifactDescriptor.absolutePath
  });

  const transcript = createTranscriptFromNormalizedResult({
    timelineId: run.request.source.timelineId,
    source: run.request.source,
    result: transcriptionOutput.result,
    rawArtifactPath: transcriptionOutput.rawArtifactPath
  });

  await updateTranscript(paths.directory, transcript);
  updateTranscriptionRunRecord(paths.databasePath, runId, {
    transcriptId: transcript.id,
    status: "completed",
    rawArtifactPath: transcriptionOutput.rawArtifactPath,
    diagnostics: {
      ...run.diagnostics,
      artifactDirectory: artifactDescriptor.absolutePath,
      extractedAudioPath,
      rawArtifactPath: transcriptionOutput.rawArtifactPath,
      notes: transcriptionOutput.diagnostics
    },
    completedAt: nowIso()
  });
  updateJobRecord(paths.databasePath, run.jobId, {
    status: "completed",
    progress: 1,
    step: "Completed",
    payload: {
      ...(getStoredJobRecord(paths.databasePath, run.jobId)?.payload as PersistedTranscriptionJobPayload),
      transcriptId: transcript.id
    }
  });
}

async function processQueuedTranscriptions(directory: string): Promise<void> {
  const paths = resolveProjectPaths(directory);

  if (activeTranscriptions.has(paths.directory)) {
    return;
  }

  const nextRun = listTranscriptionRuns(paths.databasePath)
    .filter((run) => run.status === "queued")
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))[0];

  if (!nextRun) {
    return;
  }

  activeTranscriptions.set(paths.directory, nextRun.id);

  try {
    await runQueuedTranscription(paths.directory, nextRun.id);
  } catch (error) {
    updateRunAndJobFailure(
      paths.databasePath,
      nextRun.id,
      nextRun.jobId,
      error instanceof Error ? error : new Error("The transcription failed.")
    );
  } finally {
    activeTranscriptions.delete(paths.directory);
    void processQueuedTranscriptions(paths.directory);
  }
}

export function scheduleTranscriptionJob(directory: string): void {
  void processQueuedTranscriptions(directory);
}

export async function executeCaptionCommand(
  input: ExecuteCaptionCommandInput
): Promise<ExecuteCaptionCommandResult> {
  const { paths, document } = await loadAndMaybeMigrateProject(input.directory);
  const command = input.command;

  switch (command.type) {
    case "TranscribeClip": {
      const clip = document.timeline.clipsById[command.clipId];

      if (!clip || clip.trackId === "") {
        return {
          snapshot: await getCaptionSessionSnapshot({ directory: paths.directory }),
          result: createFailure(
            command,
            "CLIP_NOT_FOUND",
            `Clip ${command.clipId} could not be found.`
          )
        };
      }

      if (document.timeline.id !== command.timelineId) {
        return {
          snapshot: await getCaptionSessionSnapshot({ directory: paths.directory }),
          result: createFailure(
            command,
            "TIMELINE_NOT_FOUND",
            `Timeline ${command.timelineId} could not be found.`
          )
        };
      }

      const mediaItem = document.library.items.find((item) => item.id === clip.mediaItemId);

      if (!mediaItem) {
        return {
          snapshot: await getCaptionSessionSnapshot({ directory: paths.directory }),
          result: createFailure(
            command,
            "MEDIA_ITEM_NOT_FOUND",
            `Media item ${clip.mediaItemId} could not be found.`
          )
        };
      }

      if (!mediaItem.metadataSummary.hasAudio) {
        return {
          snapshot: await getCaptionSessionSnapshot({ directory: paths.directory }),
          result: createFailure(
            command,
            "NO_AUDIO_CONTENT",
            "The selected clip does not contain usable audio for transcription."
          )
        };
      }

      const request: TranscriptionRequest = {
        source: {
          kind: "clip",
          timelineId: document.timeline.id,
          clipId: clip.id,
          mediaItemId: mediaItem.id,
          sourceStartUs: clip.sourceInUs,
          sourceEndUs: clip.sourceOutUs
        },
        options: normalizeTranscriptionOptions(command.options)
        
      };
      const jobId = createJobRecord(paths.databasePath, {
        kind: "transcription",
        projectDirectory: paths.directory,
        mediaItemId: mediaItem.id,
        payload: {
          transcriptionRunId: randomUUID(),
          transcriptId: null,
          timelineId: document.timeline.id,
          clipId: clip.id,
          mediaItemId: mediaItem.id,
          subtitleFormat: document.captions.exportDefaults.sidecarFormat
        },
        step: "Queued",
        status: "queued"
      });
      const storedJob = getStoredJobRecord(paths.databasePath, jobId);

      if (!storedJob) {
        throw new WorkerError("TRANSCRIPTION_FAILED", "The transcription job could not be created.");
      }

      const runId = (storedJob.payload as PersistedTranscriptionJobPayload).transcriptionRunId;
      const run: TranscriptionRun = {
        id: runId,
        jobId,
        transcriptId: null,
        projectDirectory: paths.directory,
        request,
        status: "queued",
        rawArtifactPath: null,
        diagnostics: createEmptyTranscriptDiagnostics(),
        error: null,
        recovery: createEmptyRecoveryInfo(),
        createdAt: nowIso(),
        updatedAt: nowIso(),
        startedAt: null,
        completedAt: null,
        retryOfRunId: null
      };
      createTranscriptionRunRecord(paths.databasePath, run);
      scheduleTranscriptionJob(paths.directory);

      return {
        snapshot: await getCaptionSessionSnapshot({ directory: paths.directory }),
        result: {
          ok: true,
          commandType: "TranscribeClip",
          run
        }
      };
    }
    case "CreateTranscript": {
      await updateTranscript(paths.directory, command.transcript);
      return {
        snapshot: await getCaptionSessionSnapshot({ directory: paths.directory }),
        result: {
          ok: true,
          commandType: "CreateTranscript",
          transcript: command.transcript
        }
      };
    }
    case "UpdateTranscriptSegment": {
      const transcript = document.transcripts.items.find(
        (entry) => entry.id === command.transcriptId
      );

      if (!transcript) {
        return {
          snapshot: await getCaptionSessionSnapshot({ directory: paths.directory }),
          result: createFailure(
            command,
            "TRANSCRIPT_NOT_FOUND",
            `Transcript ${command.transcriptId} could not be found.`
          )
        };
      }

      if (!transcript.segments.some((segment) => segment.id === command.segmentId)) {
        return {
          snapshot: await getCaptionSessionSnapshot({ directory: paths.directory }),
          result: createFailure(
            command,
            "TRANSCRIPT_SEGMENT_NOT_FOUND",
            `Transcript segment ${command.segmentId} could not be found.`
          )
        };
      }

      const updatedTranscript = updateTranscriptSegmentText(
        transcript,
        command.segmentId,
        command.text
      );
      await updateTranscript(paths.directory, updatedTranscript);

      return {
        snapshot: await getCaptionSessionSnapshot({ directory: paths.directory }),
        result: {
          ok: true,
          commandType: "UpdateTranscriptSegment",
          transcript: updatedTranscript
        }
      };
    }
    case "GenerateCaptionTrack": {
      if (document.timeline.id !== command.timelineId) {
        return {
          snapshot: await getCaptionSessionSnapshot({ directory: paths.directory }),
          result: createFailure(
            command,
            "TIMELINE_NOT_FOUND",
            `Timeline ${command.timelineId} could not be found.`
          )
        };
      }

      const transcript = document.transcripts.items.find(
        (entry) => entry.id === command.transcriptId
      );

      if (!transcript) {
        return {
          snapshot: await getCaptionSessionSnapshot({ directory: paths.directory }),
          result: createFailure(
            command,
            "TRANSCRIPT_NOT_FOUND",
            `Transcript ${command.transcriptId} could not be found.`
          )
        };
      }

      if (!resolveCaptionTemplate(command.templateId)) {
        return {
          snapshot: await getCaptionSessionSnapshot({ directory: paths.directory }),
          result: createFailure(
            command,
            "CAPTION_TEMPLATE_NOT_FOUND",
            `Caption template ${command.templateId} is not available.`
          )
        };
      }

      const track = generateCaptionTrackFromTranscript({
        timelineId: command.timelineId,
        transcript,
        templateId: command.templateId,
        name: command.name
      });
      await updateCaptionTrack(paths.directory, track);

      return {
        snapshot: await getCaptionSessionSnapshot({ directory: paths.directory }),
        result: {
          ok: true,
          commandType: "GenerateCaptionTrack",
          captionTrack: track
        }
      };
    }
    case "RegenerateCaptionTrack": {
      const track = document.captions.tracks.find((entry) => entry.id === command.captionTrackId);

      if (!track) {
        return {
          snapshot: await getCaptionSessionSnapshot({ directory: paths.directory }),
          result: createFailure(
            command,
            "CAPTION_TRACK_NOT_FOUND",
            `Caption track ${command.captionTrackId} could not be found.`
          )
        };
      }

      const transcript = document.transcripts.items.find((entry) => entry.id === track.sourceTranscriptId);

      if (!transcript) {
        return {
          snapshot: await getCaptionSessionSnapshot({ directory: paths.directory }),
          result: createFailure(
            command,
            "TRANSCRIPT_NOT_FOUND",
            `Transcript ${track.sourceTranscriptId} could not be found.`
          )
        };
      }

      const nextTrack = regenerateCaptionTrackFromTranscript(track, transcript);
      await updateCaptionTrack(paths.directory, nextTrack);

      return {
        snapshot: await getCaptionSessionSnapshot({ directory: paths.directory }),
        result: {
          ok: true,
          commandType: "RegenerateCaptionTrack",
          captionTrack: nextTrack
        }
      };
    }
    case "ApplyCaptionTemplate": {
      const track = document.captions.tracks.find((entry) => entry.id === command.captionTrackId);

      if (!track) {
        return {
          snapshot: await getCaptionSessionSnapshot({ directory: paths.directory }),
          result: createFailure(command, "CAPTION_TRACK_NOT_FOUND", `Caption track ${command.captionTrackId} could not be found.`)
        };
      }

      const nextTrack = applyCaptionTemplateToTrack(track, command.templateId);
      await updateCaptionTrack(paths.directory, nextTrack);

      return {
        snapshot: await getCaptionSessionSnapshot({ directory: paths.directory }),
        result: {
          ok: true,
          commandType: "ApplyCaptionTemplate",
          captionTrack: nextTrack
        }
      };
    }
    case "UpdateCaptionSegment": {
      const track = document.captions.tracks.find((entry) => entry.id === command.captionTrackId);

      if (!track) {
        return {
          snapshot: await getCaptionSessionSnapshot({ directory: paths.directory }),
          result: createFailure(command, "CAPTION_TRACK_NOT_FOUND", `Caption track ${command.captionTrackId} could not be found.`)
        };
      }

      if (!track.segments.some((segment) => segment.id === command.segmentId)) {
        return {
          snapshot: await getCaptionSessionSnapshot({ directory: paths.directory }),
          result: createFailure(command, "CAPTION_SEGMENT_NOT_FOUND", `Caption segment ${command.segmentId} could not be found.`)
        };
      }

      const nextTrack = updateCaptionSegmentOnTrack(track, command.segmentId, {
        text: command.text,
        startUs: command.startUs,
        endUs: command.endUs,
        enabled: command.enabled
      });
      await updateCaptionTrack(paths.directory, nextTrack);

      return {
        snapshot: await getCaptionSessionSnapshot({ directory: paths.directory }),
        result: {
          ok: true,
          commandType: "UpdateCaptionSegment",
          captionTrack: nextTrack
        }
      };
    }
    case "ExportSubtitleFile": {
      const track = document.captions.tracks.find((entry) => entry.id === command.captionTrackId);

      if (!track) {
        return {
          snapshot: await getCaptionSessionSnapshot({ directory: paths.directory }),
          result: createFailure(command, "CAPTION_TRACK_NOT_FOUND", `Caption track ${command.captionTrackId} could not be found.`)
        };
      }

      const template = resolveCaptionTemplate(track.templateId);

      if (!template) {
        return {
          snapshot: await getCaptionSessionSnapshot({ directory: paths.directory }),
          result: createFailure(command, "CAPTION_TEMPLATE_NOT_FOUND", `Caption template ${track.templateId} could not be found.`)
        };
      }

      const outputPath = resolveSubtitleOutputPath(
        paths.directory,
        document.project.name,
        track,
        command.format,
        command.outputPath
      );
      await mkdir(dirname(outputPath), { recursive: true });
      await mkdir(join(paths.exportsRoot), { recursive: true });
      const contents =
        command.format === "srt"
          ? formatCaptionTrackAsSrt(track)
          : formatCaptionTrackAsAss(track, template);
      await writeFile(outputPath, contents, "utf8");

      return {
        snapshot: await getCaptionSessionSnapshot({ directory: paths.directory }),
        result: {
          ok: true,
          commandType: "ExportSubtitleFile",
          artifact: {
            captionTrackId: track.id,
            format: command.format,
            outputPath
          }
        }
      };
    }
    case "EnableBurnInCaptionsForExport": {
      if (document.timeline.id !== command.timelineId) {
        return {
          snapshot: await getCaptionSessionSnapshot({ directory: paths.directory }),
          result: createFailure(
            command,
            "TIMELINE_NOT_FOUND",
            `Timeline ${command.timelineId} could not be found.`
          )
        };
      }

      if (
        command.captionTrackId &&
        !document.captions.tracks.some(
          (track) =>
            track.id === command.captionTrackId && track.timelineId === command.timelineId
        )
      ) {
        return {
          snapshot: await getCaptionSessionSnapshot({ directory: paths.directory }),
          result: createFailure(
            command,
            "CAPTION_TRACK_NOT_FOUND",
            `Caption track ${command.captionTrackId} could not be found on the active timeline.`
          )
        };
      }

      await updateCaptionExportDefaults(paths.directory, {
        burnInTrackId: command.captionTrackId,
        burnInEnabled: command.enabled
      });

      return {
        snapshot: await getCaptionSessionSnapshot({ directory: paths.directory }),
        result: {
          ok: true,
          commandType: "EnableBurnInCaptionsForExport",
          exportDefaults: {
            ...document.captions.exportDefaults,
            burnInTrackId: command.captionTrackId,
            burnInEnabled: command.enabled
          }
        }
      };
    }
    case "QueryTranscriptStatus": {
      const transcript = document.transcripts.items.find((entry) => entry.id === command.transcriptId) ?? null;

      return {
        snapshot: await getCaptionSessionSnapshot({ directory: paths.directory }),
        result: {
          ok: true,
          commandType: "QueryTranscriptStatus",
          transcript,
          summary: transcript ? summarizeTranscript(transcript, document.captions.tracks) : null,
          run: transcript ? getMostRecentRunForTranscript(paths.databasePath, transcript.id) : null
        }
      };
    }
    case "QueryCaptionTrackState": {
      return {
        snapshot: await getCaptionSessionSnapshot({ directory: paths.directory }),
        result: {
          ok: true,
          commandType: "QueryCaptionTrackState",
          captionTrack:
            document.captions.tracks.find((entry) => entry.id === command.captionTrackId) ?? null
        }
      };
    }
  }
}
