import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  analyzeSilenceFromWaveform,
  markRecoveryHandled,
  analyzeTranscriptFillerWords,
  analyzeWeakTranscriptSegments,
  compileSmartEditPlan,
  createSmartAnalysisRun,
  createSmartSessionSnapshot,
  generateHighlightSuggestionsFromTranscript,
  getSuggestionById,
  getTimelineClipEndUs,
  markPlanApplied,
  updateSuggestionStatus,
  type SmartAnalysisRun,
  type SmartCommand,
  type SmartCommandFailure,
  type SmartEditPlan,
  type SmartSessionSnapshot,
  type SmartSuggestionItem,
  type SmartSuggestionSet
} from "@clawcut/domain";
import type {
  ExecuteSmartCommandInput,
  ExecuteSmartCommandResult,
  GetSmartSessionSnapshotInput
} from "@clawcut/ipc";

import { executeEditorCommand } from "./editor-session";
import type { PersistedSmartAnalysisJobPayload } from "./job-payloads";
import { resolveProjectPaths, resolveSmartArtifactDirectory } from "./paths";
import {
  createJobRecord,
  getStoredJobRecord,
  loadAndMaybeMigrateProject,
  updateJobRecord
} from "./project-repository";
import {
  createSmartAnalysisRunRecord,
  getSmartAnalysisRun,
  getSuggestionSet,
  listSmartAnalysisRuns,
  listSmartEditPlans,
  listSuggestionSets,
  updateSmartAnalysisRunRecord,
  upsertSmartEditPlanRecord,
  upsertSuggestionSetRecord
} from "./smart-repository";
import { readWaveformEnvelope } from "./waveform";
import { WorkerError, nowIso } from "./utils";

function createFailure(
  command: SmartCommand,
  code: SmartCommandFailure["error"]["code"],
  message: string,
  details?: string
): SmartCommandFailure {
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

function buildSmartSessionSnapshot(
  directory: string,
  projectName: string
): SmartSessionSnapshot {
  const paths = resolveProjectPaths(directory);
  const analysisRuns = listSmartAnalysisRuns(paths.databasePath);

  return createSmartSessionSnapshot({
    directory: paths.directory,
    projectName,
    suggestionSets: listSuggestionSets(paths.databasePath),
    analysisRuns,
    editPlans: listSmartEditPlans(paths.databasePath),
    activeAnalysisJobId:
      analysisRuns.find((run) => run.status === "queued" || run.status === "running")?.jobId ??
      null,
    lastError: analysisRuns.find((run) => run.error)?.error ?? null
  });
}

export async function getSmartSessionSnapshot(
  input: GetSmartSessionSnapshotInput
): Promise<SmartSessionSnapshot> {
  const { paths, document } = await loadAndMaybeMigrateProject(input.directory);

  return buildSmartSessionSnapshot(paths.directory, document.project.name);
}

function resolveClipForTimeline(
  _command: SmartCommand,
  document: Awaited<ReturnType<typeof loadAndMaybeMigrateProject>>["document"],
  timelineId: string | null,
  clipId: string
): Awaited<ReturnType<typeof loadAndMaybeMigrateProject>>["document"]["timeline"]["clipsById"][string] {
  if (timelineId && document.timeline.id !== timelineId) {
    throw new WorkerError("TIMELINE_NOT_FOUND", `Timeline ${timelineId} could not be found.`);
  }

  const clip = document.timeline.clipsById[clipId];

  if (!clip) {
    throw new WorkerError("CLIP_NOT_FOUND", `Clip ${clipId} could not be found.`);
  }

  return clip;
}

function resolveMediaItem(
  _command: SmartCommand,
  document: Awaited<ReturnType<typeof loadAndMaybeMigrateProject>>["document"],
  mediaItemId: string
): Awaited<ReturnType<typeof loadAndMaybeMigrateProject>>["document"]["library"]["items"][number] {
  const mediaItem = document.library.items.find((item) => item.id === mediaItemId);

  if (!mediaItem) {
    throw new WorkerError("MEDIA_ITEM_NOT_FOUND", `Media item ${mediaItemId} could not be found.`);
  }

  return mediaItem;
}

function resolveTranscript(
  _command: SmartCommand,
  document: Awaited<ReturnType<typeof loadAndMaybeMigrateProject>>["document"],
  transcriptId: string
): Awaited<ReturnType<typeof loadAndMaybeMigrateProject>>["document"]["transcripts"]["items"][number] {
  const transcript = document.transcripts.items.find((item) => item.id === transcriptId);

  if (!transcript) {
    throw new WorkerError("TRANSCRIPT_NOT_FOUND", `Transcript ${transcriptId} could not be found.`);
  }

  return transcript;
}

async function resolveClipWaveform(input: {
  command: SmartCommand;
  directory: string;
  mediaItem: Awaited<ReturnType<typeof loadAndMaybeMigrateProject>>["document"]["library"]["items"][number];
}) {
  const waveform = input.mediaItem.derivedAssets.waveform;

  if (!waveform || waveform.status !== "ready") {
    throw new WorkerError(
      "WAVEFORM_NOT_FOUND",
      `Media item ${input.mediaItem.displayName} does not have a ready waveform asset.`
    );
  }

  const paths = resolveProjectPaths(input.directory);
  const absolutePath = join(paths.cacheRoot, waveform.relativePath);
  const envelope = await readWaveformEnvelope(absolutePath);

  if (!envelope) {
    throw new WorkerError(
      "WAVEFORM_NOT_FOUND",
      `Waveform envelope for ${input.mediaItem.displayName} could not be read.`
    );
  }

  return envelope;
}

async function writeAnalysisArtifacts(input: {
  directory: string;
  analysisRunId: string;
  fileName: string;
  payload: unknown;
}): Promise<string> {
  const paths = resolveProjectPaths(input.directory);
  const artifactDirectory = resolveSmartArtifactDirectory(paths, input.analysisRunId);
  await mkdir(artifactDirectory.absolutePath, { recursive: true });
  const artifactPath = join(artifactDirectory.absolutePath, input.fileName);
  await writeFile(artifactPath, JSON.stringify(input.payload, null, 2), "utf8");
  return artifactPath;
}

async function createAnalysisJobAndRun(input: {
  directory: string;
  payload: PersistedSmartAnalysisJobPayload;
  request: SmartAnalysisRun["request"];
}): Promise<{ jobId: string; run: SmartAnalysisRun }> {
  const paths = resolveProjectPaths(input.directory);
  const jobId = createJobRecord(paths.databasePath, {
    kind: "analysis",
    projectDirectory: paths.directory,
    mediaItemId: input.payload.mediaItemId,
    payload: input.payload,
    step: "Queued"
  });
  const run = createSmartAnalysisRun({
    jobId,
    projectDirectory: paths.directory,
    request: input.request
  });

  createSmartAnalysisRunRecord(paths.databasePath, run);
  return { jobId, run };
}

function updateAnalysisFailure(
  databasePath: string,
  runId: string,
  jobId: string,
  error: WorkerError | Error
): void {
  updateSmartAnalysisRunRecord(databasePath, runId, {
    status: "failed",
    error: {
      code: error instanceof WorkerError ? error.code : "ANALYSIS_FAILED",
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

async function runSilenceAnalysis(
  directory: string,
  command: Extract<SmartCommand, { type: "AnalyzeSilence" }>
): Promise<{ run: SmartAnalysisRun; suggestionSet: SmartSuggestionSet }> {
  const { paths, document } = await loadAndMaybeMigrateProject(directory);
  const clip = resolveClipForTimeline(command, document, command.timelineId, command.clipId);
  const mediaItem = resolveMediaItem(command, document, clip.mediaItemId);

  if (!mediaItem.metadataSummary.hasAudio) {
    throw new WorkerError(
      "NO_AUDIO_CONTENT",
      "The selected clip does not have usable audio for silence analysis."
    );
  }

  const waveform = await resolveClipWaveform({
    command,
    directory,
    mediaItem
  });

  const payload: PersistedSmartAnalysisJobPayload = {
    analysisRunId: "",
    suggestionSetId: null,
    analysisType: "silence",
    timelineId: document.timeline.id,
    clipId: clip.id,
    transcriptId: document.transcripts.items.find((item) => item.source.clipId === clip.id)?.id ?? null,
    mediaItemId: mediaItem.id
  };
  const request: SmartAnalysisRun["request"] = {
    analysisType: "silence",
    target: {
      kind: "clip",
      timelineId: document.timeline.id,
      clipId: clip.id,
      transcriptId: payload.transcriptId,
      mediaItemId: mediaItem.id,
      startUs: clip.timelineStartUs,
      endUs: getTimelineClipEndUs(clip)
    },
    options: command.options ?? {}
  };
  const created = await createAnalysisJobAndRun({
    directory,
    payload: {
      ...payload,
      analysisRunId: ""
    },
    request
  });
  const run = {
    ...created.run
  };

  updateJobRecord(paths.databasePath, created.jobId, {
    status: "running",
    progress: 0.2,
    step: "Analyzing waveform",
    attemptCount: (getStoredJobRecord(paths.databasePath, created.jobId)?.attemptCount ?? 0) + 1
  });
  updateSmartAnalysisRunRecord(paths.databasePath, run.id, {
    status: "running",
    startedAt: nowIso()
  });

  const suggestionSet = analyzeSilenceFromWaveform({
    timelineId: document.timeline.id,
    clip,
    mediaItem,
    waveform,
    transcriptId: payload.transcriptId,
    options: command.options
  });
  const artifactPath = await writeAnalysisArtifacts({
    directory,
    analysisRunId: run.id,
    fileName: "silence-suggestions.json",
    payload: suggestionSet
  });
  upsertSuggestionSetRecord(paths.databasePath, paths.directory, suggestionSet);
  const completedRun = updateSmartAnalysisRunRecord(paths.databasePath, run.id, {
    suggestionSetId: suggestionSet.id,
    status: "completed",
    diagnostics: {
      ...run.diagnostics,
      artifactDirectory: resolveSmartArtifactDirectory(paths, run.id).absolutePath,
      artifactPath,
      notes: [`Detected ${suggestionSet.items.length} silence spans.`]
    },
    completedAt: nowIso()
  });
  updateJobRecord(paths.databasePath, created.jobId, {
    status: "completed",
    progress: 1,
    step: "Completed",
    payload: {
      analysisRunId: run.id,
      suggestionSetId: suggestionSet.id,
      analysisType: "silence",
      timelineId: document.timeline.id,
      clipId: clip.id,
      transcriptId: payload.transcriptId,
      mediaItemId: mediaItem.id
    }
  });

  return {
    run: completedRun,
    suggestionSet
  };
}

function resolveTranscriptClipOrThrow(
  command: SmartCommand,
  document: Awaited<ReturnType<typeof loadAndMaybeMigrateProject>>["document"],
  transcriptId: string
) {
  const transcript = resolveTranscript(command, document, transcriptId);

  if (!transcript.source.clipId) {
    throw new WorkerError(
      "INVALID_ANALYSIS_TARGET",
      "This transcript is not currently attached to a timeline clip."
    );
  }

  const clip = resolveClipForTimeline(command, document, transcript.timelineId, transcript.source.clipId);

  return {
    transcript,
    clip
  };
}

async function runTranscriptAnalysis(
  directory: string,
  analysisType: "weak-segments" | "filler-words" | "highlights",
  transcriptId: string,
  options: Record<string, unknown>,
  command: SmartCommand
): Promise<{ run: SmartAnalysisRun; suggestionSet: SmartSuggestionSet }> {
  const { paths, document } = await loadAndMaybeMigrateProject(directory);
  const { transcript, clip } = resolveTranscriptClipOrThrow(command, document, transcriptId);
  const payload: PersistedSmartAnalysisJobPayload = {
    analysisRunId: "",
    suggestionSetId: null,
    analysisType,
    timelineId: transcript.timelineId,
    clipId: clip.id,
    transcriptId: transcript.id,
    mediaItemId: transcript.source.mediaItemId
  };
  const request: SmartAnalysisRun["request"] = {
    analysisType,
    target: {
      kind: "transcript",
      timelineId: transcript.timelineId,
      clipId: clip.id,
      transcriptId: transcript.id,
      mediaItemId: transcript.source.mediaItemId,
      startUs: clip.timelineStartUs,
      endUs: getTimelineClipEndUs(clip)
    },
    options
  };
  const created = await createAnalysisJobAndRun({
    directory,
    payload,
    request
  });

  updateJobRecord(paths.databasePath, created.jobId, {
    status: "running",
    progress: 0.25,
    step: "Analyzing transcript",
    attemptCount: (getStoredJobRecord(paths.databasePath, created.jobId)?.attemptCount ?? 0) + 1
  });
  updateSmartAnalysisRunRecord(paths.databasePath, created.run.id, {
    status: "running",
    startedAt: nowIso()
  });

  const suggestionSet =
    analysisType === "weak-segments"
      ? analyzeWeakTranscriptSegments({
          timelineId: document.timeline.id,
          clip,
          transcript,
          options
        })
      : analysisType === "filler-words"
        ? analyzeTranscriptFillerWords({
            timelineId: document.timeline.id,
            clip,
            transcript,
            options
          })
        : generateHighlightSuggestionsFromTranscript({
            timelineId: document.timeline.id,
            clip,
            transcript,
            options
          });

  const artifactPath = await writeAnalysisArtifacts({
    directory,
    analysisRunId: created.run.id,
    fileName: `${analysisType}.json`,
    payload: suggestionSet
  });
  upsertSuggestionSetRecord(paths.databasePath, paths.directory, suggestionSet);
  const completedRun = updateSmartAnalysisRunRecord(paths.databasePath, created.run.id, {
    suggestionSetId: suggestionSet.id,
    status: "completed",
    diagnostics: {
      ...created.run.diagnostics,
      artifactDirectory: resolveSmartArtifactDirectory(paths, created.run.id).absolutePath,
      artifactPath,
      notes: [`Generated ${suggestionSet.items.length} ${analysisType} suggestion(s).`]
    },
    completedAt: nowIso()
  });
  updateJobRecord(paths.databasePath, created.jobId, {
    status: "completed",
    progress: 1,
    step: "Completed",
    payload: {
      ...payload,
      analysisRunId: created.run.id,
      suggestionSetId: suggestionSet.id
    }
  });

  return {
    run: completedRun,
    suggestionSet
  };
}

function toSuggestionArray(
  suggestionSet: SmartSuggestionSet,
  suggestionIds?: string[]
): SmartSuggestionItem[] {
  if (!suggestionIds?.length) {
    return suggestionSet.items.filter((item) => item.status !== "rejected");
  }

  const selected = new Set(suggestionIds);
  return suggestionSet.items.filter(
    (item) => selected.has(item.id) && item.status !== "rejected"
  );
}

async function compilePlanFromSuggestionSet(input: {
  directory: string;
  timelineId: string;
  suggestionSetId: string;
  suggestionIds?: string[];
}): Promise<SmartEditPlan> {
  const { paths, document } = await loadAndMaybeMigrateProject(input.directory);

  if (document.timeline.id !== input.timelineId) {
    throw new WorkerError(
      "TIMELINE_NOT_FOUND",
      `Timeline ${input.timelineId} could not be found.`
    );
  }

  const suggestionSet = getSuggestionSet(paths.databasePath, input.suggestionSetId);

  if (!suggestionSet) {
    throw new WorkerError(
      "SUGGESTION_SET_NOT_FOUND",
      `Suggestion set ${input.suggestionSetId} could not be found.`
    );
  }

  const selectedSuggestions = toSuggestionArray(suggestionSet, input.suggestionIds);
  const plan = compileSmartEditPlan({
    timeline: document.timeline,
    suggestions: selectedSuggestions,
    suggestionSetId: suggestionSet.id
  });

  upsertSmartEditPlanRecord(paths.databasePath, paths.directory, plan);
  return plan;
}

export async function executeSmartCommand(
  input: ExecuteSmartCommandInput
): Promise<ExecuteSmartCommandResult> {
  const { paths, document } = await loadAndMaybeMigrateProject(input.directory);
  const command = input.command;

  try {
    switch (command.type) {
      case "AnalyzeSilence": {
        const result = await runSilenceAnalysis(paths.directory, command);

        return {
          snapshot: buildSmartSessionSnapshot(paths.directory, document.project.name),
          result: {
            ok: true,
            commandType: "AnalyzeSilence",
            run: result.run,
            suggestionSet: result.suggestionSet
          }
        };
      }

      case "AnalyzeWeakSegments": {
        const result = await runTranscriptAnalysis(
          paths.directory,
          "weak-segments",
          command.transcriptId,
          command.options ?? {},
          command
        );

        return {
          snapshot: buildSmartSessionSnapshot(paths.directory, document.project.name),
          result: {
            ok: true,
            commandType: "AnalyzeWeakSegments",
            run: result.run,
            suggestionSet: result.suggestionSet
          }
        };
      }

      case "FindFillerWords": {
        const result = await runTranscriptAnalysis(
          paths.directory,
          "filler-words",
          command.transcriptId,
          command.options ?? {},
          command
        );

        return {
          snapshot: buildSmartSessionSnapshot(paths.directory, document.project.name),
          result: {
            ok: true,
            commandType: "FindFillerWords",
            run: result.run,
            suggestionSet: result.suggestionSet
          }
        };
      }

      case "GenerateHighlightSuggestions": {
        const result = await runTranscriptAnalysis(
          paths.directory,
          "highlights",
          command.transcriptId,
          command.options ?? {},
          command
        );

        return {
          snapshot: buildSmartSessionSnapshot(paths.directory, document.project.name),
          result: {
            ok: true,
            commandType: "GenerateHighlightSuggestions",
            run: result.run,
            suggestionSet: result.suggestionSet
          }
        };
      }

      case "CompileEditPlan": {
        const plan = await compilePlanFromSuggestionSet({
          directory: paths.directory,
          timelineId: command.timelineId,
          suggestionSetId: command.suggestionSetId,
          suggestionIds: command.suggestionIds
        });

        return {
          snapshot: buildSmartSessionSnapshot(paths.directory, document.project.name),
          result: {
            ok: true,
            commandType: "CompileEditPlan",
            plan
          }
        };
      }

      case "ApplySuggestion":
      case "ApplySuggestionSet": {
        const plan = await compilePlanFromSuggestionSet({
          directory: paths.directory,
          timelineId: command.timelineId,
          suggestionSetId: command.suggestionSetId,
          suggestionIds:
            command.type === "ApplySuggestion" ? [command.suggestionId] : command.suggestionIds
        });

        if (plan.steps.length === 0) {
          return {
            snapshot: buildSmartSessionSnapshot(paths.directory, document.project.name),
            result: createFailure(
              command,
              "PLAN_COMPILATION_FAILED",
              "No applicable smart-edit steps were produced for the selected suggestion(s)."
            )
          };
        }

        for (const step of plan.steps) {
          const execution = await executeEditorCommand({
            directory: paths.directory,
            command: step.command
          });

          if (!execution.result.ok) {
            return {
              snapshot: buildSmartSessionSnapshot(paths.directory, document.project.name),
              result: createFailure(
                command,
                "PLAN_APPLICATION_FAILED",
                execution.result.error.message,
                execution.result.error.details
              )
            };
          }
        }

        const suggestionSet = getSuggestionSet(paths.databasePath, command.suggestionSetId);

        if (!suggestionSet) {
          return {
            snapshot: buildSmartSessionSnapshot(paths.directory, document.project.name),
            result: createFailure(
              command,
              "SUGGESTION_SET_NOT_FOUND",
              `Suggestion set ${command.suggestionSetId} could not be found after plan application.`
            )
          };
        }

        let updatedSet = suggestionSet;

        for (const suggestionId of plan.steps.map((step) => step.suggestionId)) {
          updatedSet = updateSuggestionStatus(updatedSet, suggestionId, "applied", plan.id);
        }

        upsertSuggestionSetRecord(paths.databasePath, paths.directory, updatedSet);
        const appliedPlan = markPlanApplied(plan);
        upsertSmartEditPlanRecord(paths.databasePath, paths.directory, appliedPlan);

        return {
          snapshot: buildSmartSessionSnapshot(paths.directory, document.project.name),
          result:
            command.type === "ApplySuggestion"
              ? {
                  ok: true,
                  commandType: "ApplySuggestion",
                  plan: appliedPlan,
                  appliedSuggestionIds: plan.steps.map((step) => step.suggestionId)
                }
              : {
                  ok: true,
                  commandType: "ApplySuggestionSet",
                  plan: appliedPlan,
                  appliedSuggestionIds: plan.steps.map((step) => step.suggestionId)
                }
        };
      }

      case "RejectSuggestion": {
        const suggestionSet = getSuggestionSet(paths.databasePath, command.suggestionSetId);

        if (!suggestionSet) {
          return {
            snapshot: buildSmartSessionSnapshot(paths.directory, document.project.name),
            result: createFailure(
              command,
              "SUGGESTION_SET_NOT_FOUND",
              `Suggestion set ${command.suggestionSetId} could not be found.`
            )
          };
        }

        const suggestion = getSuggestionById(
          [suggestionSet],
          suggestionSet.id,
          command.suggestionId
        );

        if (!suggestion) {
          return {
            snapshot: buildSmartSessionSnapshot(paths.directory, document.project.name),
            result: createFailure(
              command,
              "SUGGESTION_NOT_FOUND",
              `Suggestion ${command.suggestionId} could not be found.`
            )
          };
        }

        const updatedSet = updateSuggestionStatus(suggestionSet, suggestion.id, "rejected");
        upsertSuggestionSetRecord(paths.databasePath, paths.directory, updatedSet);

        return {
          snapshot: buildSmartSessionSnapshot(paths.directory, document.project.name),
          result: {
            ok: true,
            commandType: "RejectSuggestion",
            suggestionSet: updatedSet,
            suggestionId: suggestion.id
          }
        };
      }

      case "QuerySuggestionSet": {
        const suggestionSet = getSuggestionSet(paths.databasePath, command.suggestionSetId);

        if (!suggestionSet) {
          return {
            snapshot: buildSmartSessionSnapshot(paths.directory, document.project.name),
            result: createFailure(
              command,
              "SUGGESTION_SET_NOT_FOUND",
              `Suggestion set ${command.suggestionSetId} could not be found.`
            )
          };
        }

        return {
          snapshot: buildSmartSessionSnapshot(paths.directory, document.project.name),
          result: {
            ok: true,
            commandType: "QuerySuggestionSet",
            suggestionSet
          }
        };
      }

      case "InspectSuggestion": {
        const suggestionSet = getSuggestionSet(paths.databasePath, command.suggestionSetId);

        if (!suggestionSet) {
          return {
            snapshot: buildSmartSessionSnapshot(paths.directory, document.project.name),
            result: createFailure(
              command,
              "SUGGESTION_SET_NOT_FOUND",
              `Suggestion set ${command.suggestionSetId} could not be found.`
            )
          };
        }

        const suggestion = getSuggestionById(
          [suggestionSet],
          suggestionSet.id,
          command.suggestionId
        );

        if (!suggestion) {
          return {
            snapshot: buildSmartSessionSnapshot(paths.directory, document.project.name),
            result: createFailure(
              command,
              "SUGGESTION_NOT_FOUND",
              `Suggestion ${command.suggestionId} could not be found.`
            )
          };
        }

        return {
          snapshot: buildSmartSessionSnapshot(paths.directory, document.project.name),
          result: {
            ok: true,
            commandType: "InspectSuggestion",
            suggestion,
            suggestionSetId: suggestionSet.id
          }
        };
      }
    }
  } catch (error) {
    const workerError =
      error instanceof WorkerError ? error : new WorkerError("PLAN_COMPILATION_FAILED", error instanceof Error ? error.message : "Smart analysis failed.");
    const activeRun = listSmartAnalysisRuns(paths.databasePath).find(
      (run) => run.status === "queued" || run.status === "running"
    );

    if (activeRun) {
      updateAnalysisFailure(paths.databasePath, activeRun.id, activeRun.jobId, workerError);
    }

    return {
      snapshot: buildSmartSessionSnapshot(paths.directory, document.project.name),
      result: createFailure(
        command,
        (workerError.code as SmartCommandFailure["error"]["code"]) ?? "PLAN_COMPILATION_FAILED",
        workerError.message,
        workerError.details
      )
    };
  }
}

export async function retrySmartAnalysisRun(
  directory: string,
  analysisRunId: string
): Promise<ExecuteSmartCommandResult> {
  const paths = resolveProjectPaths(directory);
  const run = getSmartAnalysisRun(paths.databasePath, analysisRunId);

  if (!run) {
    throw new WorkerError(
      "SMART_ANALYSIS_RUN_NOT_FOUND",
      `Smart analysis run ${analysisRunId} could not be found.`
    );
  }

  let command: SmartCommand;

  switch (run.request.analysisType) {
    case "silence":
      if (!run.request.target.timelineId || !run.request.target.clipId) {
        throw new WorkerError(
          "INVALID_ANALYSIS_TARGET",
          "The interrupted silence analysis run no longer points at a valid clip target."
        );
      }
      command = {
        type: "AnalyzeSilence",
        timelineId: run.request.target.timelineId,
        clipId: run.request.target.clipId,
        options: run.request.options
      };
      break;
    case "weak-segments":
      if (!run.request.target.transcriptId) {
        throw new WorkerError(
          "INVALID_ANALYSIS_TARGET",
          "The interrupted weak-segment analysis run no longer points at a valid transcript."
        );
      }
      command = {
        type: "AnalyzeWeakSegments",
        transcriptId: run.request.target.transcriptId,
        options: run.request.options
      };
      break;
    case "filler-words":
      if (!run.request.target.transcriptId) {
        throw new WorkerError(
          "INVALID_ANALYSIS_TARGET",
          "The interrupted filler-word analysis run no longer points at a valid transcript."
        );
      }
      command = {
        type: "FindFillerWords",
        transcriptId: run.request.target.transcriptId,
        options: run.request.options
      };
      break;
    case "highlights":
      if (!run.request.target.transcriptId) {
        throw new WorkerError(
          "INVALID_ANALYSIS_TARGET",
          "The interrupted highlight analysis run no longer points at a valid transcript."
        );
      }
      command = {
        type: "GenerateHighlightSuggestions",
        transcriptId: run.request.target.transcriptId,
        options: run.request.options
      };
      break;
  }

  const result = await executeSmartCommand({
    directory,
    command
  });

  if (result.result.ok && "run" in result.result) {
    updateSmartAnalysisRunRecord(paths.databasePath, run.id, {
      recovery: markRecoveryHandled(run.recovery, {
        handledAt: nowIso(),
        replacementRunId: result.result.run.id
      })
    });
    updateJobRecord(paths.databasePath, run.jobId, {
      recovery: markRecoveryHandled(run.recovery, {
        handledAt: nowIso(),
        replacementRunId: result.result.run.id
      })
    });
  }

  return result;
}
