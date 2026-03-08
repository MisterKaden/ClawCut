import { generateId } from "./id";
import {
  createEmptyRecoveryInfo,
  type JobError,
  type JobState,
  type RecoveryInfo
} from "./jobs";
import type { MediaItem } from "./media";
import type {
  Transcript,
  TranscriptSegment,
  TranscriptWord
} from "./captions";
import type {
  EditorCommand,
  EditorCommandError
} from "./editor";
import type { Timeline, TimelineClip, TimelineRegion } from "./timeline";
import { applyEditorCommand } from "./timeline-engine";
import { getTimelineClipEndUs, getTimelineEndUs } from "./timeline";

export const SMART_ANALYSIS_TYPES = [
  "silence",
  "weak-segments",
  "filler-words",
  "highlights"
] as const;
export const SMART_SUGGESTION_TYPES = [
  "silence",
  "weak-segment",
  "filler-word",
  "highlight"
] as const;
export const SMART_SUGGESTION_STATUSES = [
  "new",
  "reviewed",
  "accepted",
  "rejected",
  "applied"
] as const;
export const SMART_SUGGESTED_ACTIONS = [
  "ripple-delete-range",
  "create-region",
  "inspect"
] as const;

export type SmartAnalysisType = (typeof SMART_ANALYSIS_TYPES)[number];
export type SmartSuggestionType = (typeof SMART_SUGGESTION_TYPES)[number];
export type SmartSuggestionStatus = (typeof SMART_SUGGESTION_STATUSES)[number];
export type SmartSuggestedAction = (typeof SMART_SUGGESTED_ACTIONS)[number];

export interface SmartAnalysisTarget {
  kind: "clip" | "transcript" | "timeline-range";
  timelineId: string | null;
  clipId: string | null;
  transcriptId: string | null;
  mediaItemId: string | null;
  startUs: number | null;
  endUs: number | null;
}

export interface SmartSuggestionEvidence {
  kind:
    | "waveform"
    | "transcript-word"
    | "transcript-segment"
    | "speech-density"
    | "keyword"
    | "timing";
  summary: string;
  score: number | null;
}

export interface SmartSuggestionTarget {
  timelineId: string;
  clipId: string | null;
  mediaItemId: string | null;
  transcriptId: string | null;
  startUs: number;
  endUs: number;
}

export interface SmartSuggestionItem {
  id: string;
  setId: string;
  type: SmartSuggestionType;
  status: SmartSuggestionStatus;
  label: string;
  confidence: number;
  rationale: string[];
  evidence: SmartSuggestionEvidence[];
  suggestedAction: SmartSuggestedAction;
  previewable: boolean;
  reversible: boolean;
  target: SmartSuggestionTarget;
  planId: string | null;
  createdAt: string;
  updatedAt: string;
}

type DraftSuggestionItem = Omit<SmartSuggestionItem, "setId" | "createdAt" | "updatedAt">;

export interface SmartSuggestionSet {
  id: string;
  analysisType: SmartAnalysisType;
  target: SmartAnalysisTarget;
  title: string;
  summary: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  warnings: string[];
  items: SmartSuggestionItem[];
}

export interface SilenceAnalysisOptions {
  amplitudeThreshold: number;
  peakThreshold: number;
  minimumDurationUs: number;
}

export interface WeakSegmentAnalysisOptions {
  minimumDurationUs: number;
  wordsPerSecondThreshold: number;
}

export interface FillerWordAnalysisOptions {
  vocabulary: string[];
  paddingUs: number;
}

export interface HighlightAnalysisOptions {
  minimumDurationUs: number;
  maximumDurationUs: number;
  keywordBoostTerms: string[];
  minimumScore: number;
}

export interface WaveformEnvelopeLike {
  durationMs: number | null;
  bucketCount: number;
  peaks: number[];
  rms: number[];
}

export interface SmartAnalysisRequest {
  analysisType: SmartAnalysisType;
  target: SmartAnalysisTarget;
  options: Record<string, unknown>;
}

export interface SmartAnalysisDiagnostics {
  warnings: string[];
  notes: string[];
  artifactDirectory: string | null;
  artifactPath: string | null;
  logPath: string | null;
}

export interface SmartAnalysisRun {
  id: string;
  jobId: string;
  projectDirectory: string;
  suggestionSetId: string | null;
  request: SmartAnalysisRequest;
  status: JobState;
  diagnostics: SmartAnalysisDiagnostics;
  error: JobError | null;
  recovery: RecoveryInfo;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  retryOfRunId: string | null;
}

export interface SmartEditPlanStep {
  id: string;
  suggestionId: string;
  description: string;
  command: EditorCommand;
}

export interface SmartEditPlanConflict {
  suggestionId: string;
  code: EditorCommandError["code"] | "UNSUPPORTED_SUGGESTION";
  message: string;
}

export interface SmartEditPlanSummary {
  predictedTimelineEndUs: number;
  predictedRemovedDurationUs: number;
  regionCountDelta: number;
}

export interface SmartEditPlan {
  id: string;
  timelineId: string;
  suggestionSetId: string | null;
  suggestionIds: string[];
  createdAt: string;
  updatedAt: string;
  appliedAt: string | null;
  warnings: string[];
  conflicts: SmartEditPlanConflict[];
  steps: SmartEditPlanStep[];
  summary: SmartEditPlanSummary;
  status: "draft" | "applied" | "failed";
}

export interface SmartSessionSnapshot {
  directory: string;
  projectName: string;
  suggestionSets: SmartSuggestionSet[];
  analysisRuns: SmartAnalysisRun[];
  editPlans: SmartEditPlan[];
  activeAnalysisJobId: string | null;
  lastError: JobError | null;
}

export type SmartCommandType =
  | "AnalyzeSilence"
  | "AnalyzeWeakSegments"
  | "FindFillerWords"
  | "GenerateHighlightSuggestions"
  | "CompileEditPlan"
  | "ApplySuggestion"
  | "ApplySuggestionSet"
  | "RejectSuggestion"
  | "QuerySuggestionSet"
  | "InspectSuggestion";

export type SmartCommandErrorCode =
  | "TIMELINE_NOT_FOUND"
  | "CLIP_NOT_FOUND"
  | "TRANSCRIPT_NOT_FOUND"
  | "MEDIA_ITEM_NOT_FOUND"
  | "WAVEFORM_NOT_FOUND"
  | "NO_AUDIO_CONTENT"
  | "SUGGESTION_SET_NOT_FOUND"
  | "SUGGESTION_NOT_FOUND"
  | "EDIT_PLAN_NOT_FOUND"
  | "PLAN_COMPILATION_FAILED"
  | "PLAN_APPLICATION_FAILED"
  | "INVALID_ANALYSIS_TARGET";

export interface SmartCommandError {
  code: SmartCommandErrorCode;
  message: string;
  details?: string;
}

export interface SmartCommandFailure {
  ok: false;
  commandType: SmartCommandType;
  error: SmartCommandError;
}

export interface AnalyzeSilenceCommand {
  type: "AnalyzeSilence";
  timelineId: string;
  clipId: string;
  options?: Partial<SilenceAnalysisOptions>;
}

export interface AnalyzeWeakSegmentsCommand {
  type: "AnalyzeWeakSegments";
  transcriptId: string;
  options?: Partial<WeakSegmentAnalysisOptions>;
}

export interface FindFillerWordsCommand {
  type: "FindFillerWords";
  transcriptId: string;
  options?: Partial<FillerWordAnalysisOptions>;
}

export interface GenerateHighlightSuggestionsCommand {
  type: "GenerateHighlightSuggestions";
  transcriptId: string;
  options?: Partial<HighlightAnalysisOptions>;
}

export interface CompileEditPlanCommand {
  type: "CompileEditPlan";
  timelineId: string;
  suggestionSetId: string;
  suggestionIds?: string[];
}

export interface ApplySuggestionCommand {
  type: "ApplySuggestion";
  timelineId: string;
  suggestionSetId: string;
  suggestionId: string;
}

export interface ApplySuggestionSetCommand {
  type: "ApplySuggestionSet";
  timelineId: string;
  suggestionSetId: string;
  suggestionIds?: string[];
}

export interface RejectSuggestionCommand {
  type: "RejectSuggestion";
  suggestionSetId: string;
  suggestionId: string;
}

export interface QuerySuggestionSetCommand {
  type: "QuerySuggestionSet";
  suggestionSetId: string;
}

export interface InspectSuggestionCommand {
  type: "InspectSuggestion";
  suggestionSetId: string;
  suggestionId: string;
}

export type SmartCommand =
  | AnalyzeSilenceCommand
  | AnalyzeWeakSegmentsCommand
  | FindFillerWordsCommand
  | GenerateHighlightSuggestionsCommand
  | CompileEditPlanCommand
  | ApplySuggestionCommand
  | ApplySuggestionSetCommand
  | RejectSuggestionCommand
  | QuerySuggestionSetCommand
  | InspectSuggestionCommand;

export interface AnalyzeSilenceResult {
  ok: true;
  commandType: "AnalyzeSilence";
  run: SmartAnalysisRun;
  suggestionSet: SmartSuggestionSet;
}

export interface AnalyzeWeakSegmentsResult {
  ok: true;
  commandType: "AnalyzeWeakSegments";
  run: SmartAnalysisRun;
  suggestionSet: SmartSuggestionSet;
}

export interface FindFillerWordsResult {
  ok: true;
  commandType: "FindFillerWords";
  run: SmartAnalysisRun;
  suggestionSet: SmartSuggestionSet;
}

export interface GenerateHighlightSuggestionsResult {
  ok: true;
  commandType: "GenerateHighlightSuggestions";
  run: SmartAnalysisRun;
  suggestionSet: SmartSuggestionSet;
}

export interface CompileEditPlanResult {
  ok: true;
  commandType: "CompileEditPlan";
  plan: SmartEditPlan;
}

export interface ApplySuggestionResult {
  ok: true;
  commandType: "ApplySuggestion";
  plan: SmartEditPlan;
  appliedSuggestionIds: string[];
}

export interface ApplySuggestionSetResult {
  ok: true;
  commandType: "ApplySuggestionSet";
  plan: SmartEditPlan;
  appliedSuggestionIds: string[];
}

export interface RejectSuggestionResult {
  ok: true;
  commandType: "RejectSuggestion";
  suggestionSet: SmartSuggestionSet;
  suggestionId: string;
}

export interface QuerySuggestionSetResult {
  ok: true;
  commandType: "QuerySuggestionSet";
  suggestionSet: SmartSuggestionSet;
}

export interface InspectSuggestionResult {
  ok: true;
  commandType: "InspectSuggestion";
  suggestion: SmartSuggestionItem;
  suggestionSetId: string;
}

export type SmartCommandSuccess =
  | AnalyzeSilenceResult
  | AnalyzeWeakSegmentsResult
  | FindFillerWordsResult
  | GenerateHighlightSuggestionsResult
  | CompileEditPlanResult
  | ApplySuggestionResult
  | ApplySuggestionSetResult
  | RejectSuggestionResult
  | QuerySuggestionSetResult
  | InspectSuggestionResult;

export type SmartCommandResult = SmartCommandSuccess | SmartCommandFailure;

export const DEFAULT_SILENCE_ANALYSIS_OPTIONS: SilenceAnalysisOptions = {
  amplitudeThreshold: 0.025,
  peakThreshold: 0.05,
  minimumDurationUs: 350_000
};

export const DEFAULT_WEAK_SEGMENT_ANALYSIS_OPTIONS: WeakSegmentAnalysisOptions = {
  minimumDurationUs: 900_000,
  wordsPerSecondThreshold: 1.25
};

export const DEFAULT_FILLER_WORD_ANALYSIS_OPTIONS: FillerWordAnalysisOptions = {
  vocabulary: ["um", "uh", "like", "you know", "sort of", "kind of"],
  paddingUs: 40_000
};

export const DEFAULT_HIGHLIGHT_ANALYSIS_OPTIONS: HighlightAnalysisOptions = {
  minimumDurationUs: 1_200_000,
  maximumDurationUs: 12_000_000,
  keywordBoostTerms: [
    "important",
    "best",
    "favorite",
    "secret",
    "tip",
    "mistake",
    "remember",
    "key",
    "must",
    "why",
    "how"
  ],
  minimumScore: 0.45
};

function nowIso(): string {
  return new Date().toISOString();
}

function createSuggestionTarget(input: {
  timelineId: string;
  clipId: string | null;
  mediaItemId: string | null;
  transcriptId: string | null;
  startUs: number;
  endUs: number;
}): SmartSuggestionTarget {
  return {
    timelineId: input.timelineId,
    clipId: input.clipId,
    mediaItemId: input.mediaItemId,
    transcriptId: input.transcriptId,
    startUs: Math.max(0, Math.round(input.startUs)),
    endUs: Math.max(0, Math.round(input.endUs))
  };
}

function mergeRanges(
  ranges: Array<{ startUs: number; endUs: number }>
): Array<{ startUs: number; endUs: number }> {
  const sorted = [...ranges]
    .filter((range) => range.endUs > range.startUs)
    .sort((left, right) => left.startUs - right.startUs);

  if (sorted.length === 0) {
    return [];
  }

  const merged = [sorted[0]];

  for (const range of sorted.slice(1)) {
    const current = merged[merged.length - 1];

    if (range.startUs <= current.endUs) {
      current.endUs = Math.max(current.endUs, range.endUs);
      continue;
    }

    merged.push({ ...range });
  }

  return merged;
}

function normalizeWordText(word: string): string {
  return word.toLowerCase().replace(/^[^a-z0-9']+|[^a-z0-9']+$/gu, "");
}

function escapeLabel(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}

export function createSmartAnalysisTarget(
  target: SmartAnalysisTarget
): SmartAnalysisTarget {
  return {
    ...target,
    startUs: target.startUs ?? null,
    endUs: target.endUs ?? null
  };
}

export function createSmartSuggestionSet(input: {
  analysisType: SmartAnalysisType;
  target: SmartAnalysisTarget;
  title: string;
  summary: string;
  warnings?: string[];
  items: DraftSuggestionItem[];
  id?: string;
  createdAt?: string;
}): SmartSuggestionSet {
  const timestamp = input.createdAt ?? nowIso();
  const setId = input.id ?? generateId();

  return {
    id: setId,
    analysisType: input.analysisType,
    target: createSmartAnalysisTarget(input.target),
    title: input.title,
    summary: input.summary,
    createdAt: timestamp,
    updatedAt: timestamp,
    completedAt: timestamp,
    warnings: input.warnings ?? [],
    items: input.items.map((item) => ({
      ...item,
      setId,
      createdAt: timestamp,
      updatedAt: timestamp
    }))
  };
}

function isDefined<T>(value: T | null): value is T {
  return value !== null;
}

export function updateSuggestionStatus(
  set: SmartSuggestionSet,
  suggestionId: string,
  status: SmartSuggestionStatus,
  planId: string | null = null
): SmartSuggestionSet {
  const timestamp = nowIso();

  return {
    ...set,
    updatedAt: timestamp,
    items: set.items.map((item) =>
      item.id === suggestionId
        ? {
            ...item,
            status,
            planId: planId ?? item.planId,
            updatedAt: timestamp
          }
        : item
    )
  };
}

export function createEmptySmartAnalysisDiagnostics(): SmartAnalysisDiagnostics {
  return {
    warnings: [],
    notes: [],
    artifactDirectory: null,
    artifactPath: null,
    logPath: null
  };
}

export function createSmartAnalysisRun(input: {
  jobId: string;
  projectDirectory: string;
  request: SmartAnalysisRequest;
  suggestionSetId?: string | null;
  id?: string;
  createdAt?: string;
}): SmartAnalysisRun {
  const timestamp = input.createdAt ?? nowIso();

  return {
    id: input.id ?? generateId(),
    jobId: input.jobId,
    projectDirectory: input.projectDirectory,
    suggestionSetId: input.suggestionSetId ?? null,
    request: input.request,
    status: "queued",
    diagnostics: createEmptySmartAnalysisDiagnostics(),
    error: null,
    recovery: createEmptyRecoveryInfo(),
    createdAt: timestamp,
    updatedAt: timestamp,
    startedAt: null,
    completedAt: null,
    retryOfRunId: null
  };
}

export function createSmartSessionSnapshot(input: SmartSessionSnapshot): SmartSessionSnapshot {
  return input;
}

export function analyzeSilenceFromWaveform(input: {
  timelineId: string;
  clip: TimelineClip;
  mediaItem: MediaItem;
  waveform: WaveformEnvelopeLike;
  transcriptId?: string | null;
  options?: Partial<SilenceAnalysisOptions>;
}): SmartSuggestionSet {
  const options = {
    ...DEFAULT_SILENCE_ANALYSIS_OPTIONS,
    ...(input.options ?? {})
  };
  const bucketCount = Math.min(
    input.waveform.bucketCount,
    input.waveform.rms.length,
    input.waveform.peaks.length
  );
  const clipDurationUs = Math.max(1, getTimelineClipEndUs(input.clip) - input.clip.timelineStartUs);
  const bucketDurationUs = Math.max(1, Math.round(clipDurationUs / Math.max(1, bucketCount)));
  const silenceRanges: Array<{ startBucket: number; endBucket: number }> = [];
  let activeStart: number | null = null;

  for (let index = 0; index < bucketCount; index += 1) {
    const rms = input.waveform.rms[index] ?? 0;
    const peak = input.waveform.peaks[index] ?? 0;
    const silent = rms <= options.amplitudeThreshold && peak <= options.peakThreshold;

    if (silent) {
      if (activeStart === null) {
        activeStart = index;
      }
      continue;
    }

    if (activeStart !== null) {
      silenceRanges.push({
        startBucket: activeStart,
        endBucket: index
      });
      activeStart = null;
    }
  }

  if (activeStart !== null) {
    silenceRanges.push({
      startBucket: activeStart,
      endBucket: bucketCount
    });
  }

  const items = silenceRanges
    .map((range, index) => {
      const startUs = input.clip.timelineStartUs + range.startBucket * bucketDurationUs;
      const endUs = input.clip.timelineStartUs + range.endBucket * bucketDurationUs;
      const durationUs = endUs - startUs;

      if (durationUs < options.minimumDurationUs) {
        return null;
      }

      const durationSeconds = durationUs / 1_000_000;
      const confidence = Math.min(0.98, Number((0.5 + durationSeconds / 4).toFixed(2)));

      return {
        id: generateId(),
        type: "silence" as const,
        status: "new" as const,
        label: `Dead air ${index + 1}`,
        confidence,
        rationale: [
          `Waveform stayed below the configured silence threshold for ${durationSeconds.toFixed(2)} seconds.`
        ],
        evidence: [
          {
            kind: "waveform" as const,
            summary: `RMS and peak buckets remained below ${options.amplitudeThreshold}/${options.peakThreshold}.`,
            score: confidence
          }
        ],
        suggestedAction: "ripple-delete-range" as const,
        previewable: true,
        reversible: true,
        target: createSuggestionTarget({
          timelineId: input.timelineId,
          clipId: input.clip.id,
          mediaItemId: input.mediaItem.id,
          transcriptId: input.transcriptId ?? null,
          startUs,
          endUs
        }),
        planId: null
      };
    })
    .filter(isDefined);

  return createSmartSuggestionSet({
    analysisType: "silence",
    target: {
      kind: "clip",
      timelineId: input.timelineId,
      clipId: input.clip.id,
      transcriptId: input.transcriptId ?? null,
      mediaItemId: input.mediaItem.id,
      startUs: input.clip.timelineStartUs,
      endUs: getTimelineClipEndUs(input.clip)
    },
    title: "Silence opportunities",
    summary: `${items.length} removable silence span${items.length === 1 ? "" : "s"} detected.`,
    warnings: items.length === 0 ? ["No silence span met the configured removal threshold."] : [],
    items
  });
}

export function analyzeWeakTranscriptSegments(input: {
  timelineId: string;
  clip: TimelineClip;
  transcript: Transcript;
  options?: Partial<WeakSegmentAnalysisOptions>;
}): SmartSuggestionSet {
  const options = {
    ...DEFAULT_WEAK_SEGMENT_ANALYSIS_OPTIONS,
    ...(input.options ?? {})
  };

  const items = input.transcript.segments
    .map((segment) => {
      const durationUs = Math.max(1, segment.endUs - segment.startUs);
      const wordCount = segment.words.length || segment.text.split(/\s+/u).filter(Boolean).length;
      const wordsPerSecond = wordCount / Math.max(0.1, durationUs / 1_000_000);

      if (durationUs < options.minimumDurationUs || wordsPerSecond >= options.wordsPerSecondThreshold) {
        return null;
      }

      const confidence = Math.min(
        0.9,
        Number((0.45 + (options.wordsPerSecondThreshold - wordsPerSecond) * 0.2).toFixed(2))
      );

      return {
        id: generateId(),
        type: "weak-segment" as const,
        status: "new" as const,
        label: `Weak segment ${segment.index + 1}`,
        confidence,
        rationale: [
          `This transcript span averages ${wordsPerSecond.toFixed(2)} words/sec, below the weak-segment threshold.`
        ],
        evidence: [
          {
            kind: "speech-density" as const,
            summary: `${wordCount} words across ${(durationUs / 1_000_000).toFixed(2)} seconds.`,
            score: Number(wordsPerSecond.toFixed(2))
          },
          {
            kind: "transcript-segment" as const,
            summary: escapeLabel(segment.text).slice(0, 140),
            score: segment.confidence
          }
        ],
        suggestedAction: "ripple-delete-range" as const,
        previewable: true,
        reversible: true,
        target: createSuggestionTarget({
          timelineId: input.timelineId,
          clipId: input.clip.id,
          mediaItemId: input.transcript.source.mediaItemId,
          transcriptId: input.transcript.id,
          startUs: input.clip.timelineStartUs + segment.startUs,
          endUs: input.clip.timelineStartUs + segment.endUs
        }),
        planId: null
      };
    })
    .filter(isDefined);

  return createSmartSuggestionSet({
    analysisType: "weak-segments",
    target: {
      kind: "transcript",
      timelineId: input.timelineId,
      clipId: input.clip.id,
      transcriptId: input.transcript.id,
      mediaItemId: input.transcript.source.mediaItemId,
      startUs: input.clip.timelineStartUs,
      endUs: getTimelineClipEndUs(input.clip)
    },
    title: "Weak transcript segments",
    summary: `${items.length} low-density segment${items.length === 1 ? "" : "s"} flagged for review.`,
    warnings: items.length === 0 ? ["No transcript span fell below the low-density threshold."] : [],
    items
  });
}

function buildPhraseList(vocabulary: string[]): string[][] {
  const normalized = vocabulary
    .map((entry) =>
      entry
        .split(/\s+/u)
        .map((part) => normalizeWordText(part))
        .filter(Boolean)
    )
    .filter((entry) => entry.length > 0)
    .sort((left, right) => right.length - left.length);

  return normalized.length > 0
    ? normalized
    : DEFAULT_FILLER_WORD_ANALYSIS_OPTIONS.vocabulary.map((entry) => entry.split(/\s+/u));
}

export function analyzeTranscriptFillerWords(input: {
  timelineId: string;
  clip: TimelineClip;
  transcript: Transcript;
  options?: Partial<FillerWordAnalysisOptions>;
}): SmartSuggestionSet {
  const options = {
    ...DEFAULT_FILLER_WORD_ANALYSIS_OPTIONS,
    ...(input.options ?? {})
  };
  const phrases = buildPhraseList(options.vocabulary);
  const items: DraftSuggestionItem[] = [];

  for (const segment of input.transcript.segments) {
    const normalizedWords = segment.words.map((word) => normalizeWordText(word.text));

    for (let index = 0; index < normalizedWords.length; index += 1) {
      const phrase = phrases.find((entry) =>
        entry.every((token, tokenIndex) => normalizedWords[index + tokenIndex] === token)
      );

      if (!phrase) {
        continue;
      }

      const matchedWords = segment.words.slice(index, index + phrase.length);
      const firstTimedWord = matchedWords.find((word) => word.startUs !== null) ?? matchedWords[0];
      const lastTimedWord = [...matchedWords].reverse().find((word) => word.endUs !== null) ?? matchedWords.at(-1);

      if (!firstTimedWord || !lastTimedWord) {
        continue;
      }

      const startUs = Math.max(0, input.clip.timelineStartUs + (firstTimedWord.startUs ?? segment.startUs) - options.paddingUs);
      const endUs = Math.max(
        startUs + 1,
        input.clip.timelineStartUs + (lastTimedWord.endUs ?? segment.endUs) + options.paddingUs
      );
      const phraseText = phrase.join(" ");
      const confidence = Math.min(0.92, Number((0.55 + (phrase.length - 1) * 0.12).toFixed(2)));

      items.push({
        id: generateId(),
        type: "filler-word",
        status: "new",
        label: `Filler phrase: ${phraseText}`,
        confidence,
        rationale: [
          `Matched the configured filler vocabulary phrase "${phraseText}".`
        ],
        evidence: [
          {
            kind: "transcript-word",
            summary: matchedWords.map((word) => word.text).join(" "),
            score: confidence
          },
          {
            kind: "timing",
            summary: `Mapped to ${(endUs - startUs) / 1_000_000} seconds of timeline time.`,
            score: null
          }
        ],
        suggestedAction: "ripple-delete-range",
        previewable: true,
        reversible: true,
        target: createSuggestionTarget({
          timelineId: input.timelineId,
          clipId: input.clip.id,
          mediaItemId: input.transcript.source.mediaItemId,
          transcriptId: input.transcript.id,
          startUs,
          endUs
        }),
        planId: null
      });

      index += phrase.length - 1;
    }
  }

  return createSmartSuggestionSet({
    analysisType: "filler-words",
    target: {
      kind: "transcript",
      timelineId: input.timelineId,
      clipId: input.clip.id,
      transcriptId: input.transcript.id,
      mediaItemId: input.transcript.source.mediaItemId,
      startUs: input.clip.timelineStartUs,
      endUs: getTimelineClipEndUs(input.clip)
    },
    title: "Filler-word opportunities",
    summary: `${items.length} filler phrase${items.length === 1 ? "" : "s"} matched the configured vocabulary.`,
    warnings: items.length === 0 ? ["No filler vocabulary matches were found in the transcript."] : [],
    items
  });
}

function countWords(segment: TranscriptSegment): number {
  return segment.words.length || segment.text.split(/\s+/u).filter(Boolean).length;
}

function segmentScoreKeywords(segment: TranscriptSegment, keywords: string[]): number {
  const normalizedText = segment.text.toLowerCase();
  return keywords.some((keyword) => normalizedText.includes(keyword.toLowerCase())) ? 0.18 : 0;
}

function segmentScorePunctuation(segment: TranscriptSegment): number {
  return /[!?]/u.test(segment.text) ? 0.08 : 0;
}

export function generateHighlightSuggestionsFromTranscript(input: {
  timelineId: string;
  clip: TimelineClip;
  transcript: Transcript;
  options?: Partial<HighlightAnalysisOptions>;
}): SmartSuggestionSet {
  const options = {
    ...DEFAULT_HIGHLIGHT_ANALYSIS_OPTIONS,
    ...(input.options ?? {})
  };

  const items = input.transcript.segments
    .map((segment) => {
      const durationUs = Math.max(1, segment.endUs - segment.startUs);
      const durationSeconds = durationUs / 1_000_000;
      const wordDensity = countWords(segment) / Math.max(0.25, durationSeconds);
      const keywordBoost = segmentScoreKeywords(segment, options.keywordBoostTerms);
      const punctuationBoost = segmentScorePunctuation(segment);
      const durationFit =
        durationUs >= options.minimumDurationUs && durationUs <= options.maximumDurationUs ? 0.22 : 0;
      const densityScore = Math.min(0.45, wordDensity / 12);
      const confidence = Number(
        Math.min(0.98, densityScore + keywordBoost + punctuationBoost + durationFit).toFixed(2)
      );

      if (confidence < options.minimumScore) {
        return null;
      }

      return {
        id: generateId(),
        type: "highlight" as const,
        status: "new" as const,
        label: `Highlight candidate ${segment.index + 1}`,
        confidence,
        rationale: [
          `Speech density ${wordDensity.toFixed(2)} words/sec with ${keywordBoost > 0 ? "keyword emphasis" : "no keyword boost"} and ${punctuationBoost > 0 ? "expressive punctuation" : "neutral punctuation"}.`
        ],
        evidence: [
          {
            kind: "speech-density" as const,
            summary: `${countWords(segment)} words in ${durationSeconds.toFixed(2)} seconds.`,
            score: Number(wordDensity.toFixed(2))
          },
          {
            kind: "transcript-segment" as const,
            summary: escapeLabel(segment.text).slice(0, 160),
            score: segment.confidence
          },
          {
            kind: "keyword" as const,
            summary:
              keywordBoost > 0
                ? "Matched at least one highlight keyword."
                : "No highlight keyword matched; density carried the score.",
            score: keywordBoost > 0 ? keywordBoost : null
          }
        ],
        suggestedAction: "create-region" as const,
        previewable: true,
        reversible: true,
        target: createSuggestionTarget({
          timelineId: input.timelineId,
          clipId: input.clip.id,
          mediaItemId: input.transcript.source.mediaItemId,
          transcriptId: input.transcript.id,
          startUs: input.clip.timelineStartUs + segment.startUs,
          endUs: input.clip.timelineStartUs + segment.endUs
        }),
        planId: null
      };
    })
    .filter(isDefined)
    .sort((left, right) => right.confidence - left.confidence);

  return createSmartSuggestionSet({
    analysisType: "highlights",
    target: {
      kind: "transcript",
      timelineId: input.timelineId,
      clipId: input.clip.id,
      transcriptId: input.transcript.id,
      mediaItemId: input.transcript.source.mediaItemId,
      startUs: input.clip.timelineStartUs,
      endUs: getTimelineClipEndUs(input.clip)
    },
    title: "Highlight candidates",
    summary: `${items.length} highlight segment${items.length === 1 ? "" : "s"} scored above the explainable threshold.`,
    warnings: items.length === 0 ? ["No transcript segments met the current highlight threshold."] : [],
    items
  });
}

export function compileSmartEditPlan(input: {
  timeline: Timeline;
  suggestions: SmartSuggestionItem[];
  suggestionSetId?: string | null;
  generateId?: () => string;
}): SmartEditPlan {
  const createId = input.generateId ?? generateId;
  const timestamp = nowIso();
  let nextTimeline = structuredClone(input.timeline);
  const steps: SmartEditPlanStep[] = [];
  const conflicts: SmartEditPlanConflict[] = [];
  const warnings: string[] = [];

  const deletionSuggestions = input.suggestions
    .filter(
      (suggestion) =>
        suggestion.status !== "rejected" &&
        suggestion.type !== "highlight" &&
        suggestion.target.timelineId === input.timeline.id
    )
    .sort((left, right) => right.target.startUs - left.target.startUs);
  const highlightSuggestions = input.suggestions
    .filter(
      (suggestion) =>
        suggestion.status !== "rejected" &&
        suggestion.type === "highlight" &&
        suggestion.target.timelineId === input.timeline.id
    )
    .sort((left, right) => left.target.startUs - right.target.startUs);

  for (const suggestion of deletionSuggestions) {
    const command: EditorCommand = {
      type: "RippleDeleteRange",
      timelineId: input.timeline.id,
      startUs: suggestion.target.startUs,
      endUs: suggestion.target.endUs
    };
    const execution = applyEditorCommand(nextTimeline, command, {
      mediaItemsById: {}
    });

    if (!execution.ok) {
      conflicts.push({
        suggestionId: suggestion.id,
        code: execution.error.code,
        message: execution.error.message
      });
      continue;
    }

    nextTimeline = execution.nextTimeline;
    steps.push({
      id: createId(),
      suggestionId: suggestion.id,
      description: `Remove ${suggestion.type} range ${formatRangeLabel(suggestion.target.startUs, suggestion.target.endUs)}.`,
      command
    });
  }

  for (const suggestion of highlightSuggestions) {
    const command: EditorCommand = {
      type: "AddRegion",
      timelineId: input.timeline.id,
      startUs: suggestion.target.startUs,
      endUs: suggestion.target.endUs,
      label: suggestion.label
    };
    const execution = applyEditorCommand(nextTimeline, command, {
      mediaItemsById: {}
    });

    if (!execution.ok) {
      conflicts.push({
        suggestionId: suggestion.id,
        code: execution.error.code,
        message: execution.error.message
      });
      continue;
    }

    nextTimeline = execution.nextTimeline;
    steps.push({
      id: createId(),
      suggestionId: suggestion.id,
      description: `Create a highlight region for ${formatRangeLabel(
        suggestion.target.startUs,
        suggestion.target.endUs
      )}.`,
      command
    });
  }

  if (steps.length === 0 && conflicts.length === 0) {
    warnings.push("No applicable suggestions were available for plan compilation.");
  }

  const removedRanges = mergeRanges(
    deletionSuggestions
      .filter((suggestion) => steps.some((step) => step.suggestionId === suggestion.id))
      .map((suggestion) => ({
        startUs: suggestion.target.startUs,
        endUs: suggestion.target.endUs
      }))
  );
  const predictedRemovedDurationUs = removedRanges.reduce(
    (total, range) => total + (range.endUs - range.startUs),
    0
  );
  const regionCountBefore = input.timeline.regions.length;
  const regionCountAfter = nextTimeline.regions.length;

  return {
    id: createId(),
    timelineId: input.timeline.id,
    suggestionSetId: input.suggestionSetId ?? null,
    suggestionIds: input.suggestions.map((suggestion) => suggestion.id),
    createdAt: timestamp,
    updatedAt: timestamp,
    appliedAt: null,
    warnings,
    conflicts,
    steps,
    summary: {
      predictedTimelineEndUs: getTimelineEndUs(nextTimeline),
      predictedRemovedDurationUs,
      regionCountDelta: regionCountAfter - regionCountBefore
    },
    status: conflicts.length > 0 && steps.length === 0 ? "failed" : "draft"
  };
}

export function markPlanApplied(plan: SmartEditPlan): SmartEditPlan {
  const timestamp = nowIso();

  return {
    ...plan,
    status: "applied",
    appliedAt: timestamp,
    updatedAt: timestamp
  };
}

export function getSuggestionSetById(
  suggestionSets: SmartSuggestionSet[],
  suggestionSetId: string
): SmartSuggestionSet | null {
  return suggestionSets.find((entry) => entry.id === suggestionSetId) ?? null;
}

export function getSuggestionById(
  suggestionSets: SmartSuggestionSet[],
  suggestionSetId: string,
  suggestionId: string
): SmartSuggestionItem | null {
  return (
    suggestionSets
      .find((entry) => entry.id === suggestionSetId)
      ?.items.find((entry) => entry.id === suggestionId) ?? null
  );
}

export function getTranscriptWordCount(transcript: Transcript): number {
  return transcript.segments.reduce((total, segment) => total + countWords(segment), 0);
}

export function getTranscriptTimedWordCount(transcript: Transcript): number {
  return transcript.segments.reduce(
    (total, segment) =>
      total + segment.words.filter((word) => word.startUs !== null && word.endUs !== null).length,
    0
  );
}

export function mapTranscriptRangeToTimelineRange(input: {
  clip: TimelineClip;
  startUs: number;
  endUs: number;
}): { startUs: number; endUs: number } {
  return {
    startUs: input.clip.timelineStartUs + input.startUs,
    endUs: input.clip.timelineStartUs + input.endUs
  };
}

export function isSmartSuggestionInspectable(
  suggestion: SmartSuggestionItem
): boolean {
  return suggestion.previewable;
}

export function createHighlightRegionLabel(suggestion: SmartSuggestionItem): string {
  return escapeLabel(suggestion.label) || "Highlight";
}

export function formatRangeLabel(startUs: number, endUs: number): string {
  return `${(startUs / 1_000_000).toFixed(2)}s–${(endUs / 1_000_000).toFixed(2)}s`;
}

export function findTranscriptSegmentAtTime(
  transcript: Transcript,
  timeUs: number
): TranscriptSegment | null {
  return (
    transcript.segments.find((segment) => timeUs >= segment.startUs && timeUs < segment.endUs) ??
    null
  );
}

export function findTranscriptWordAtTime(
  transcript: Transcript,
  timeUs: number
): TranscriptWord | null {
  for (const segment of transcript.segments) {
    const word =
      segment.words.find(
        (candidate) =>
          candidate.startUs !== null &&
          candidate.endUs !== null &&
          timeUs >= candidate.startUs &&
          timeUs < candidate.endUs
      ) ?? null;

    if (word) {
      return word;
    }
  }

  return null;
}

export function suggestionAppliesToClip(
  suggestion: SmartSuggestionItem,
  clipId: string
): boolean {
  return suggestion.target.clipId === clipId;
}

export function suggestionToRegion(
  suggestion: SmartSuggestionItem,
  regionId: string = generateId()
): TimelineRegion {
  return {
    id: regionId,
    startUs: suggestion.target.startUs,
    endUs: suggestion.target.endUs,
    label: createHighlightRegionLabel(suggestion)
  };
}
