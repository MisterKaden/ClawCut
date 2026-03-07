import { z } from "zod";

import { generateId } from "./id";
import type { JobError, JobState } from "./jobs";

export const TRANSCRIPTION_PROVIDERS = ["faster-whisper"] as const;
export const TRANSCRIPTION_MODELS = ["tiny", "base", "small", "medium"] as const;
export const TRANSCRIPT_STATUSES = ["draft", "ready", "failed"] as const;
export const SUBTITLE_FORMATS = ["srt", "ass"] as const;
export const CAPTION_TEMPLATE_IDS = [
  "bottom-center-clean",
  "lower-third-boxed",
  "headline-top",
  "social-highlight",
  "karaoke-highlight",
  "quote-card"
] as const;
export const CAPTION_PLACEMENTS = [
  "bottom-center",
  "lower-third",
  "top-headline",
  "center-card"
] as const;
export const CAPTION_ALIGNMENTS = ["left", "center", "right"] as const;
export const CAPTION_LINE_BREAK_MODES = ["balanced", "preserve"] as const;
export const CAPTION_ACTIVE_WORD_STYLES = ["none", "highlight"] as const;

export type TranscriptionProvider = (typeof TRANSCRIPTION_PROVIDERS)[number];
export type TranscriptionModel = (typeof TRANSCRIPTION_MODELS)[number];
export type TranscriptStatus = (typeof TRANSCRIPT_STATUSES)[number];
export type SubtitleFormat = (typeof SUBTITLE_FORMATS)[number];
export type CaptionTemplateId = (typeof CAPTION_TEMPLATE_IDS)[number];
export type CaptionPlacement = (typeof CAPTION_PLACEMENTS)[number];
export type CaptionAlignment = (typeof CAPTION_ALIGNMENTS)[number];
export type CaptionLineBreakMode = (typeof CAPTION_LINE_BREAK_MODES)[number];
export type CaptionActiveWordStyle = (typeof CAPTION_ACTIVE_WORD_STYLES)[number];

export interface TranscriptionOptions {
  language: string | null;
  model: TranscriptionModel;
  wordTimestamps: boolean;
  initialPrompt: string | null;
  glossaryTerms: string[];
  normalizeText: boolean;
}

export interface TranscriptSourceRef {
  kind: "clip" | "media-item";
  timelineId: string | null;
  clipId: string | null;
  mediaItemId: string;
  sourceStartUs: number;
  sourceEndUs: number;
}

export interface TranscriptWord {
  id: string;
  index: number;
  text: string;
  startUs: number | null;
  endUs: number | null;
  confidence: number | null;
  punctuationRole: "leading" | "trailing" | "inline" | "none";
}

export interface TranscriptSegment {
  id: string;
  index: number;
  startUs: number;
  endUs: number;
  text: string;
  confidence: number | null;
  isUserEdited: boolean;
  words: TranscriptWord[];
}

export interface TranscriptEngineMetadata {
  provider: TranscriptionProvider;
  model: TranscriptionModel;
  wordTimestamps: boolean;
}

export interface Transcript {
  id: string;
  timelineId: string | null;
  source: TranscriptSourceRef;
  status: TranscriptStatus;
  language: string | null;
  engine: TranscriptEngineMetadata;
  createdAt: string;
  updatedAt: string;
  isUserEdited: boolean;
  confidence: number | null;
  rawArtifactPath: string | null;
  warnings: string[];
  segments: TranscriptSegment[];
}

export interface TranscriptCollection {
  items: Transcript[];
}

export interface CaptionSegmentWord {
  id: string;
  text: string;
  startUs: number | null;
  endUs: number | null;
  sourceTranscriptWordId: string | null;
}

export interface CaptionExportIntent {
  burnInByDefault: boolean;
  sidecarByDefault: boolean;
  sidecarFormat: SubtitleFormat;
}

export interface CaptionSegment {
  id: string;
  index: number;
  startUs: number;
  endUs: number;
  text: string;
  enabled: boolean;
  templateId: CaptionTemplateId | null;
  alignment: CaptionAlignment;
  placement: CaptionPlacement;
  sourceTranscriptSegmentId: string | null;
  sourceWordIds: string[];
  activeWordHighlight: boolean;
  activeWordStyle: CaptionActiveWordStyle;
  lineBreakMode: CaptionLineBreakMode;
  words: CaptionSegmentWord[];
}

export interface CaptionTrack {
  id: string;
  timelineId: string;
  sourceTranscriptId: string;
  name: string;
  templateId: CaptionTemplateId;
  enabled: boolean;
  segmentationStrategy: "transcript-segment";
  exportIntent: CaptionExportIntent;
  warnings: string[];
  createdAt: string;
  updatedAt: string;
  segments: CaptionSegment[];
}

export interface CaptionExportDefaults {
  burnInTrackId: string | null;
  sidecarFormat: SubtitleFormat;
  burnInEnabled: boolean;
}

export interface CaptionCollection {
  tracks: CaptionTrack[];
  templates: CaptionTemplateId[];
  exportDefaults: CaptionExportDefaults;
}

export interface CaptionTemplate {
  id: CaptionTemplateId;
  displayName: string;
  placement: CaptionPlacement;
  fontFamilyIntent: "sans" | "display" | "serif";
  fontScale: "small" | "medium" | "large" | "hero";
  fontWeight: 500 | 600 | 700 | 800;
  textColor: string;
  accentColor: string;
  backgroundStyle: "none" | "boxed" | "card" | "highlight";
  alignment: CaptionAlignment;
  safeZoneAnchor: "title-safe" | "action-safe";
  activeWordStyle: CaptionActiveWordStyle;
  animationIntent: "none" | "pop" | "slide-up" | "fade";
}

export interface CaptionOverlayToken {
  id: string;
  text: string;
  active: boolean;
  startUs: number | null;
  endUs: number | null;
  sourceTranscriptWordId: string | null;
}

export interface CaptionPreviewOverlay {
  type: "caption";
  id: string;
  trackId: string;
  templateId: CaptionTemplateId;
  text: string;
  placement: CaptionPlacement;
  alignment: CaptionAlignment;
  backgroundStyle: CaptionTemplate["backgroundStyle"];
  activeWordHighlight: boolean;
  activeWordStyle: CaptionActiveWordStyle;
  tokens: CaptionOverlayToken[];
}

export interface TranscriptCoverageTrackSummary {
  trackId: string;
  trackName: string;
  templateId: CaptionTemplateId;
  segmentCount: number;
  enabledSegmentCount: number;
  coveredTranscriptSegmentCount: number;
  coverageRatio: number;
  activeWordStyle: CaptionActiveWordStyle;
}

export interface TranscriptSummary {
  transcriptId: string;
  timelineId: string | null;
  source: TranscriptSourceRef;
  status: TranscriptStatus;
  language: string | null;
  createdAt: string;
  updatedAt: string;
  isUserEdited: boolean;
  segmentCount: number;
  wordCount: number;
  timedWordCount: number;
  wordTimingCoverageRatio: number;
  startUs: number | null;
  endUs: number | null;
  durationUs: number | null;
  textPreview: string;
  captionCoverage: {
    trackCount: number;
    coveredSegmentCount: number;
    totalSegmentCount: number;
    coverageRatio: number;
    tracks: TranscriptCoverageTrackSummary[];
  };
}

export interface TranscriptionEngineWord {
  text: string;
  startUs: number | null;
  endUs: number | null;
  confidence: number | null;
}

export interface TranscriptionEngineSegment {
  startUs: number;
  endUs: number;
  text: string;
  confidence: number | null;
  words: TranscriptionEngineWord[];
}

export interface NormalizedTranscriptionResult {
  language: string | null;
  provider: TranscriptionProvider;
  model: TranscriptionModel;
  wordTimestamps: boolean;
  confidence: number | null;
  warnings: string[];
  segments: TranscriptionEngineSegment[];
}

export interface TranscriptionRequest {
  source: TranscriptSourceRef;
  options: TranscriptionOptions;
}

export interface TranscriptJobDiagnostics {
  warnings: string[];
  notes: string[];
  artifactDirectory: string | null;
  extractedAudioPath: string | null;
  rawArtifactPath: string | null;
  logPath: string | null;
}

export interface TranscriptionRun {
  id: string;
  jobId: string;
  transcriptId: string | null;
  projectDirectory: string;
  request: TranscriptionRequest;
  status: JobState;
  rawArtifactPath: string | null;
  diagnostics: TranscriptJobDiagnostics;
  error: JobError | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  retryOfRunId: string | null;
}

export interface SubtitleExportArtifact {
  captionTrackId: string;
  format: SubtitleFormat;
  outputPath: string;
}

export interface CaptionSessionSnapshot {
  directory: string;
  projectName: string;
  transcripts: Transcript[];
  transcriptSummaries: TranscriptSummary[];
  captionTracks: CaptionTrack[];
  templates: CaptionTemplate[];
  transcriptionRuns: TranscriptionRun[];
  activeTranscriptionJobId: string | null;
  lastError: JobError | null;
}

export type CaptionCommandType =
  | "TranscribeClip"
  | "CreateTranscript"
  | "UpdateTranscriptSegment"
  | "GenerateCaptionTrack"
  | "RegenerateCaptionTrack"
  | "ApplyCaptionTemplate"
  | "UpdateCaptionSegment"
  | "ExportSubtitleFile"
  | "EnableBurnInCaptionsForExport"
  | "QueryTranscriptStatus"
  | "QueryCaptionTrackState";

export type CaptionCommandErrorCode =
  | "TIMELINE_NOT_FOUND"
  | "CLIP_NOT_FOUND"
  | "MEDIA_ITEM_NOT_FOUND"
  | "TRANSCRIPT_NOT_FOUND"
  | "TRANSCRIPT_SEGMENT_NOT_FOUND"
  | "CAPTION_TRACK_NOT_FOUND"
  | "CAPTION_SEGMENT_NOT_FOUND"
  | "CAPTION_TEMPLATE_NOT_FOUND"
  | "NO_AUDIO_CONTENT"
  | "TRANSCRIPTION_ENGINE_UNAVAILABLE"
  | "TRANSCRIPTION_FAILED"
  | "INVALID_SUBTITLE_FORMAT"
  | "SUBTITLE_EXPORT_FAILED"
  | "INVALID_OUTPUT_PATH";

export interface CaptionCommandError {
  code: CaptionCommandErrorCode;
  message: string;
  details?: string;
}

export interface CaptionCommandFailure {
  ok: false;
  commandType: CaptionCommandType;
  error: CaptionCommandError;
}

export interface TranscribeClipCommand {
  type: "TranscribeClip";
  timelineId: string;
  clipId: string;
  options?: Partial<TranscriptionOptions>;
}

export interface CreateTranscriptCommand {
  type: "CreateTranscript";
  transcript: Transcript;
}

export interface UpdateTranscriptSegmentCommand {
  type: "UpdateTranscriptSegment";
  transcriptId: string;
  segmentId: string;
  text: string;
}

export interface GenerateCaptionTrackCommand {
  type: "GenerateCaptionTrack";
  timelineId: string;
  transcriptId: string;
  templateId: CaptionTemplateId;
  name?: string;
}

export interface RegenerateCaptionTrackCommand {
  type: "RegenerateCaptionTrack";
  captionTrackId: string;
}

export interface ApplyCaptionTemplateCommand {
  type: "ApplyCaptionTemplate";
  captionTrackId: string;
  templateId: CaptionTemplateId;
}

export interface UpdateCaptionSegmentCommand {
  type: "UpdateCaptionSegment";
  captionTrackId: string;
  segmentId: string;
  text: string;
  startUs?: number;
  endUs?: number;
  enabled?: boolean;
}

export interface ExportSubtitleFileCommand {
  type: "ExportSubtitleFile";
  captionTrackId: string;
  format: SubtitleFormat;
  outputPath?: string | null;
}

export interface EnableBurnInCaptionsForExportCommand {
  type: "EnableBurnInCaptionsForExport";
  timelineId: string;
  captionTrackId: string | null;
  enabled: boolean;
}

export interface QueryTranscriptStatusCommand {
  type: "QueryTranscriptStatus";
  transcriptId: string;
}

export interface QueryCaptionTrackStateCommand {
  type: "QueryCaptionTrackState";
  captionTrackId: string;
}

export type CaptionCommand =
  | TranscribeClipCommand
  | CreateTranscriptCommand
  | UpdateTranscriptSegmentCommand
  | GenerateCaptionTrackCommand
  | RegenerateCaptionTrackCommand
  | ApplyCaptionTemplateCommand
  | UpdateCaptionSegmentCommand
  | ExportSubtitleFileCommand
  | EnableBurnInCaptionsForExportCommand
  | QueryTranscriptStatusCommand
  | QueryCaptionTrackStateCommand;

export interface TranscribeClipResult {
  ok: true;
  commandType: "TranscribeClip";
  run: TranscriptionRun;
}

export interface CreateTranscriptResult {
  ok: true;
  commandType: "CreateTranscript";
  transcript: Transcript;
}

export interface UpdateTranscriptSegmentResult {
  ok: true;
  commandType: "UpdateTranscriptSegment";
  transcript: Transcript;
}

export interface GenerateCaptionTrackResult {
  ok: true;
  commandType: "GenerateCaptionTrack";
  captionTrack: CaptionTrack;
}

export interface RegenerateCaptionTrackResult {
  ok: true;
  commandType: "RegenerateCaptionTrack";
  captionTrack: CaptionTrack;
}

export interface ApplyCaptionTemplateResult {
  ok: true;
  commandType: "ApplyCaptionTemplate";
  captionTrack: CaptionTrack;
}

export interface UpdateCaptionSegmentResult {
  ok: true;
  commandType: "UpdateCaptionSegment";
  captionTrack: CaptionTrack;
}

export interface ExportSubtitleFileResult {
  ok: true;
  commandType: "ExportSubtitleFile";
  artifact: SubtitleExportArtifact;
}

export interface EnableBurnInCaptionsForExportResult {
  ok: true;
  commandType: "EnableBurnInCaptionsForExport";
  exportDefaults: CaptionExportDefaults;
}

export interface QueryTranscriptStatusResult {
  ok: true;
  commandType: "QueryTranscriptStatus";
  transcript: Transcript | null;
  summary: TranscriptSummary | null;
  run: TranscriptionRun | null;
}

export interface QueryCaptionTrackStateResult {
  ok: true;
  commandType: "QueryCaptionTrackState";
  captionTrack: CaptionTrack | null;
}

export type CaptionCommandSuccess =
  | TranscribeClipResult
  | CreateTranscriptResult
  | UpdateTranscriptSegmentResult
  | GenerateCaptionTrackResult
  | RegenerateCaptionTrackResult
  | ApplyCaptionTemplateResult
  | UpdateCaptionSegmentResult
  | ExportSubtitleFileResult
  | EnableBurnInCaptionsForExportResult
  | QueryTranscriptStatusResult
  | QueryCaptionTrackStateResult;

export type CaptionCommandResult = CaptionCommandSuccess | CaptionCommandFailure;

const transcriptionOptionsSchema = z.object({
  language: z.string().min(1).nullable(),
  model: z.enum(TRANSCRIPTION_MODELS),
  wordTimestamps: z.boolean(),
  initialPrompt: z.string().min(1).nullable(),
  glossaryTerms: z.array(z.string()),
  normalizeText: z.boolean()
});

const transcriptSourceRefSchema = z.object({
  kind: z.enum(["clip", "media-item"]),
  timelineId: z.string().min(1).nullable(),
  clipId: z.string().min(1).nullable(),
  mediaItemId: z.string().min(1),
  sourceStartUs: z.number().int().nonnegative(),
  sourceEndUs: z.number().int().nonnegative()
});

const transcriptWordSchema = z.object({
  id: z.string().min(1),
  index: z.number().int().nonnegative(),
  text: z.string(),
  startUs: z.number().int().nonnegative().nullable(),
  endUs: z.number().int().nonnegative().nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  punctuationRole: z.enum(["leading", "trailing", "inline", "none"])
});

const transcriptSegmentSchema = z.object({
  id: z.string().min(1),
  index: z.number().int().nonnegative(),
  startUs: z.number().int().nonnegative(),
  endUs: z.number().int().nonnegative(),
  text: z.string(),
  confidence: z.number().min(0).max(1).nullable(),
  isUserEdited: z.boolean(),
  words: z.array(transcriptWordSchema)
});

export const transcriptSchema = z.object({
  id: z.string().min(1),
  timelineId: z.string().min(1).nullable(),
  source: transcriptSourceRefSchema,
  status: z.enum(TRANSCRIPT_STATUSES),
  language: z.string().min(1).nullable(),
  engine: z.object({
    provider: z.enum(TRANSCRIPTION_PROVIDERS),
    model: z.enum(TRANSCRIPTION_MODELS),
    wordTimestamps: z.boolean()
  }),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  isUserEdited: z.boolean(),
  confidence: z.number().min(0).max(1).nullable(),
  rawArtifactPath: z.string().min(1).nullable(),
  warnings: z.array(z.string()),
  segments: z.array(transcriptSegmentSchema)
});

export const transcriptCollectionSchema = z.object({
  items: z.array(transcriptSchema)
});

const captionSegmentWordSchema = z.object({
  id: z.string().min(1),
  text: z.string(),
  startUs: z.number().int().nonnegative().nullable(),
  endUs: z.number().int().nonnegative().nullable(),
  sourceTranscriptWordId: z.string().min(1).nullable()
});

const captionExportIntentSchema = z.object({
  burnInByDefault: z.boolean(),
  sidecarByDefault: z.boolean(),
  sidecarFormat: z.enum(SUBTITLE_FORMATS)
});

const captionSegmentSchema = z.object({
  id: z.string().min(1),
  index: z.number().int().nonnegative(),
  startUs: z.number().int().nonnegative(),
  endUs: z.number().int().nonnegative(),
  text: z.string(),
  enabled: z.boolean(),
  templateId: z.enum(CAPTION_TEMPLATE_IDS).nullable(),
  alignment: z.enum(CAPTION_ALIGNMENTS),
  placement: z.enum(CAPTION_PLACEMENTS),
  sourceTranscriptSegmentId: z.string().min(1).nullable(),
  sourceWordIds: z.array(z.string().min(1)),
  activeWordHighlight: z.boolean(),
  activeWordStyle: z.enum(CAPTION_ACTIVE_WORD_STYLES).default("none"),
  lineBreakMode: z.enum(CAPTION_LINE_BREAK_MODES),
  words: z.array(captionSegmentWordSchema)
});

export const captionTrackSchema = z.object({
  id: z.string().min(1),
  timelineId: z.string().min(1),
  sourceTranscriptId: z.string().min(1),
  name: z.string().min(1),
  templateId: z.enum(CAPTION_TEMPLATE_IDS),
  enabled: z.boolean(),
  segmentationStrategy: z.literal("transcript-segment"),
  exportIntent: captionExportIntentSchema,
  warnings: z.array(z.string()),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  segments: z.array(captionSegmentSchema)
});

export const captionCollectionSchema = z.object({
  tracks: z.array(captionTrackSchema),
  templates: z.array(z.enum(CAPTION_TEMPLATE_IDS)),
  exportDefaults: z.object({
    burnInTrackId: z.string().min(1).nullable(),
    sidecarFormat: z.enum(SUBTITLE_FORMATS),
    burnInEnabled: z.boolean()
  })
});

export const BUILT_IN_CAPTION_TEMPLATES: CaptionTemplate[] = [
  {
    id: "bottom-center-clean",
    displayName: "Bottom Center Clean",
    placement: "bottom-center",
    fontFamilyIntent: "sans",
    fontScale: "medium",
    fontWeight: 700,
    textColor: "#ffffff",
    accentColor: "#f59e0b",
    backgroundStyle: "none",
    alignment: "center",
    safeZoneAnchor: "title-safe",
    activeWordStyle: "none",
    animationIntent: "none"
  },
  {
    id: "lower-third-boxed",
    displayName: "Lower Third Boxed",
    placement: "lower-third",
    fontFamilyIntent: "sans",
    fontScale: "medium",
    fontWeight: 700,
    textColor: "#ffffff",
    accentColor: "#111827",
    backgroundStyle: "boxed",
    alignment: "left",
    safeZoneAnchor: "title-safe",
    activeWordStyle: "none",
    animationIntent: "slide-up"
  },
  {
    id: "headline-top",
    displayName: "Headline Top",
    placement: "top-headline",
    fontFamilyIntent: "display",
    fontScale: "large",
    fontWeight: 800,
    textColor: "#111827",
    accentColor: "#f8fafc",
    backgroundStyle: "highlight",
    alignment: "center",
    safeZoneAnchor: "title-safe",
    activeWordStyle: "none",
    animationIntent: "pop"
  },
  {
    id: "social-highlight",
    displayName: "Social Highlight",
    placement: "bottom-center",
    fontFamilyIntent: "display",
    fontScale: "large",
    fontWeight: 800,
    textColor: "#ffffff",
    accentColor: "#ef4444",
    backgroundStyle: "highlight",
    alignment: "center",
    safeZoneAnchor: "title-safe",
    activeWordStyle: "none",
    animationIntent: "pop"
  },
  {
    id: "karaoke-highlight",
    displayName: "Karaoke Highlight",
    placement: "bottom-center",
    fontFamilyIntent: "sans",
    fontScale: "medium",
    fontWeight: 700,
    textColor: "#ffffff",
    accentColor: "#f59e0b",
    backgroundStyle: "boxed",
    alignment: "center",
    safeZoneAnchor: "title-safe",
    activeWordStyle: "highlight",
    animationIntent: "none"
  },
  {
    id: "quote-card",
    displayName: "Quote Card",
    placement: "center-card",
    fontFamilyIntent: "serif",
    fontScale: "hero",
    fontWeight: 700,
    textColor: "#ffffff",
    accentColor: "#111827",
    backgroundStyle: "card",
    alignment: "center",
    safeZoneAnchor: "action-safe",
    activeWordStyle: "none",
    animationIntent: "fade"
  } as CaptionTemplate
];

export const DEFAULT_CAPTION_TEMPLATE_ID: CaptionTemplateId = "bottom-center-clean";
export const DEFAULT_TRANSCRIPTION_OPTIONS: TranscriptionOptions = {
  language: null,
  model: "base",
  wordTimestamps: true,
  initialPrompt: null,
  glossaryTerms: [],
  normalizeText: true
};

function sanitizeCaptionText(text: string): string {
  return text.replace(/\r\n/gu, "\n").trim();
}

function normalizeGlossaryTerms(terms: string[]): string[] {
  return Array.from(
    new Set(
      terms
        .map((term) => term.trim())
        .filter((term) => term.length > 0)
    )
  );
}

function splitWords(text: string): string[] {
  return text
    .trim()
    .split(/\s+/u)
    .filter((token) => token.length > 0);
}

function balanceCaptionLines(text: string): string {
  const cleaned = sanitizeCaptionText(text);

  if (!cleaned || cleaned.includes("\n")) {
    return cleaned;
  }

  const words = splitWords(cleaned);

  if (words.length <= 4 || cleaned.length <= 28) {
    return cleaned;
  }

  let bestIndex = -1;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let index = 1; index < words.length; index += 1) {
    const left = words.slice(0, index).join(" ");
    const right = words.slice(index).join(" ");
    const score = Math.abs(left.length - right.length);

    if (score < bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }

  if (bestIndex === -1) {
    return cleaned;
  }

  return `${words.slice(0, bestIndex).join(" ")}\n${words.slice(bestIndex).join(" ")}`;
}

function detectPunctuationRole(text: string): TranscriptWord["punctuationRole"] {
  if (/^[("'[{]/u.test(text)) {
    return "leading";
  }

  if (/[,.!?;:)"'\]}]$/u.test(text)) {
    return "trailing";
  }

  return "none";
}

function computeAverageConfidence(values: Array<number | null>): number | null {
  const usable = values.filter((value): value is number => typeof value === "number");

  if (!usable.length) {
    return null;
  }

  return usable.reduce((sum, value) => sum + value, 0) / usable.length;
}

function createTranscriptPreviewText(transcript: Transcript): string {
  const preview = transcript.segments
    .map((segment) => segment.text)
    .join(" ")
    .replace(/\s+/gu, " ")
    .trim();

  if (preview.length <= 120) {
    return preview;
  }

  return `${preview.slice(0, 117).trimEnd()}...`;
}

export function getBuiltInCaptionTemplates(): CaptionTemplate[] {
  return BUILT_IN_CAPTION_TEMPLATES.map((template) => ({ ...template }));
}

export function resolveCaptionTemplate(
  templateId: CaptionTemplateId
): CaptionTemplate | null {
  const template = BUILT_IN_CAPTION_TEMPLATES.find((entry) => entry.id === templateId);
  return template ? { ...template } : null;
}

export function createEmptyTranscriptCollection(): TranscriptCollection {
  return {
    items: []
  };
}

export function createDefaultCaptionExportDefaults(): CaptionExportDefaults {
  return {
    burnInTrackId: null,
    sidecarFormat: "srt",
    burnInEnabled: false
  };
}

export function createEmptyCaptionCollection(): CaptionCollection {
  return {
    tracks: [],
    templates: [...CAPTION_TEMPLATE_IDS],
    exportDefaults: createDefaultCaptionExportDefaults()
  };
}

export function createTranscriptFromNormalizedResult(input: {
  id?: string;
  timelineId: string | null;
  source: TranscriptSourceRef;
  result: NormalizedTranscriptionResult;
  rawArtifactPath?: string | null;
  createdAt?: string;
}): Transcript {
  const createdAt = input.createdAt ?? new Date().toISOString();

  const segments = input.result.segments.map((segment, segmentIndex) => ({
    id: generateId(),
    index: segmentIndex,
    startUs: segment.startUs,
    endUs: segment.endUs,
    text: sanitizeCaptionText(segment.text),
    confidence: segment.confidence,
    isUserEdited: false,
    words: segment.words.map((word, wordIndex) => ({
      id: generateId(),
      index: wordIndex,
      text: word.text,
      startUs: word.startUs,
      endUs: word.endUs,
      confidence: word.confidence,
      punctuationRole: detectPunctuationRole(word.text)
    }))
  }));

  return transcriptSchema.parse({
    id: input.id ?? generateId(),
    timelineId: input.timelineId,
    source: input.source,
    status: "ready",
    language: input.result.language,
    engine: {
      provider: input.result.provider,
      model: input.result.model,
      wordTimestamps: input.result.wordTimestamps
    },
    createdAt,
    updatedAt: createdAt,
    isUserEdited: false,
    confidence:
      input.result.confidence ??
      computeAverageConfidence(segments.flatMap((segment) => [
        segment.confidence,
        ...segment.words.map((word) => word.confidence)
      ])),
    rawArtifactPath: input.rawArtifactPath ?? null,
    warnings: input.result.warnings,
    segments
  });
}

export function updateTranscriptSegmentText(
  transcript: Transcript,
  segmentId: string,
  text: string,
  updatedAt: string = new Date().toISOString()
): Transcript {
  return transcriptSchema.parse({
    ...transcript,
    updatedAt,
    isUserEdited: true,
    segments: transcript.segments.map((segment) =>
      segment.id === segmentId
        ? {
            ...segment,
            text: sanitizeCaptionText(text),
            isUserEdited: true
          }
        : segment
    )
  });
}

function createCaptionTrackName(transcript: Transcript): string {
  return transcript.source.kind === "clip" ? "Clip Captions" : "Transcript Captions";
}

function createCaptionSegmentWords(segment: TranscriptSegment): CaptionSegmentWord[] {
  return segment.words.map((word) => ({
    id: generateId(),
    text: word.text,
    startUs: word.startUs,
    endUs: word.endUs,
    sourceTranscriptWordId: word.id
  }));
}

function createCaptionSegmentFromTranscript(
  transcriptSegment: TranscriptSegment,
  template: CaptionTemplate,
  index: number
): CaptionSegment {
  const words = createCaptionSegmentWords(transcriptSegment);

  return {
    id: generateId(),
    index,
    startUs: transcriptSegment.startUs,
    endUs: transcriptSegment.endUs,
    text: balanceCaptionLines(transcriptSegment.text),
    enabled: true,
    templateId: template.id,
    alignment: template.alignment,
    placement: template.placement,
    sourceTranscriptSegmentId: transcriptSegment.id,
    sourceWordIds: words
      .map((word) => word.sourceTranscriptWordId)
      .filter((wordId): wordId is string => Boolean(wordId)),
    activeWordHighlight: template.activeWordStyle === "highlight",
    activeWordStyle: template.activeWordStyle,
    lineBreakMode: "balanced",
    words
  };
}

export function generateCaptionTrackFromTranscript(input: {
  timelineId: string;
  transcript: Transcript;
  templateId: CaptionTemplateId;
  name?: string;
  createdAt?: string;
}): CaptionTrack {
  const template = resolveCaptionTemplate(input.templateId);

  if (!template) {
    throw new Error(`Caption template ${input.templateId} is not available.`);
  }

  const createdAt = input.createdAt ?? new Date().toISOString();

  return captionTrackSchema.parse({
    id: generateId(),
    timelineId: input.timelineId,
    sourceTranscriptId: input.transcript.id,
    name: input.name?.trim() || createCaptionTrackName(input.transcript),
    templateId: template.id,
    enabled: true,
    segmentationStrategy: "transcript-segment",
    exportIntent: {
      burnInByDefault: false,
      sidecarByDefault: true,
      sidecarFormat: "srt"
    },
    warnings: [...input.transcript.warnings],
    createdAt,
    updatedAt: createdAt,
    segments: input.transcript.segments.map((segment, index) =>
      createCaptionSegmentFromTranscript(segment, template, index)
    )
  });
}

export function regenerateCaptionTrackFromTranscript(
  track: CaptionTrack,
  transcript: Transcript,
  updatedAt: string = new Date().toISOString()
): CaptionTrack {
  const template = resolveCaptionTemplate(track.templateId);

  if (!template) {
    throw new Error(`Caption template ${track.templateId} is not available.`);
  }

  return captionTrackSchema.parse({
    ...track,
    updatedAt,
    warnings: [...transcript.warnings],
    segments: transcript.segments.map((segment, index) =>
      createCaptionSegmentFromTranscript(segment, template, index)
    )
  });
}

export function applyCaptionTemplateToTrack(
  track: CaptionTrack,
  templateId: CaptionTemplateId,
  updatedAt: string = new Date().toISOString()
): CaptionTrack {
  const template = resolveCaptionTemplate(templateId);

  if (!template) {
    throw new Error(`Caption template ${templateId} is not available.`);
  }

  return captionTrackSchema.parse({
    ...track,
    templateId,
    updatedAt,
    segments: track.segments.map((segment) => ({
      ...segment,
      templateId,
      alignment: template.alignment,
      placement: template.placement,
      activeWordHighlight: template.activeWordStyle === "highlight",
      activeWordStyle: template.activeWordStyle
    }))
  });
}

export function updateCaptionSegmentOnTrack(
  track: CaptionTrack,
  segmentId: string,
  updates: {
    text: string;
    startUs?: number;
    endUs?: number;
    enabled?: boolean;
  },
  updatedAt: string = new Date().toISOString()
): CaptionTrack {
  return captionTrackSchema.parse({
    ...track,
    updatedAt,
    segments: track.segments.map((segment) =>
      segment.id === segmentId
        ? {
            ...segment,
            text: segment.lineBreakMode === "preserve"
              ? sanitizeCaptionText(updates.text)
              : balanceCaptionLines(updates.text),
            startUs: updates.startUs ?? segment.startUs,
            endUs: updates.endUs ?? segment.endUs,
            enabled: updates.enabled ?? segment.enabled
          }
        : segment
    )
  });
}

function formatSrtTimestamp(valueUs: number): string {
  const totalMs = Math.max(0, Math.round(valueUs / 1_000));
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const seconds = Math.floor((totalMs % 60_000) / 1_000);
  const milliseconds = totalMs % 1_000;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(milliseconds).padStart(3, "0")}`;
}

function formatAssTimestamp(valueUs: number): string {
  const totalCs = Math.max(0, Math.round(valueUs / 10_000));
  const hours = Math.floor(totalCs / 360_000);
  const minutes = Math.floor((totalCs % 360_000) / 6_000);
  const seconds = Math.floor((totalCs % 6_000) / 100);
  const centiseconds = totalCs % 100;

  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`;
}

function escapeAssText(text: string): string {
  return text
    .replace(/\\/gu, "\\\\")
    .replace(/\{/gu, "\\{")
    .replace(/\}/gu, "\\}")
    .replace(/\n/gu, "\\N");
}

function createAssKaraokeText(segment: CaptionSegment): string {
  if (
    (!segment.activeWordHighlight && segment.activeWordStyle !== "highlight") ||
    segment.words.length === 0
  ) {
    return escapeAssText(segment.text);
  }

  const tokens = segment.words.map((word, index) => {
    const startUs = word.startUs ?? segment.startUs;
    const endUs =
      word.endUs ??
      segment.words[index + 1]?.startUs ??
      segment.endUs;
    const centiseconds = Math.max(1, Math.round((Math.max(startUs, endUs) - startUs) / 10_000));

    return `{\\k${centiseconds}}${escapeAssText(word.text)}`;
  });

  return tokens.join(" ");
}

function resolveAssAlignment(placement: CaptionPlacement, alignment: CaptionAlignment): number {
  if (placement === "top-headline") {
    return alignment === "left" ? 7 : alignment === "right" ? 9 : 8;
  }

  if (placement === "center-card") {
    return alignment === "left" ? 4 : alignment === "right" ? 6 : 5;
  }

  return alignment === "left" ? 1 : alignment === "right" ? 3 : 2;
}

function resolveAssMargins(placement: CaptionPlacement): { marginV: number; marginL: number; marginR: number } {
  if (placement === "top-headline") {
    return { marginV: 64, marginL: 80, marginR: 80 };
  }

  if (placement === "lower-third") {
    return { marginV: 96, marginL: 72, marginR: 300 };
  }

  if (placement === "center-card") {
    return { marginV: 120, marginL: 120, marginR: 120 };
  }

  return { marginV: 72, marginL: 80, marginR: 80 };
}

function resolveTemplateFontSize(scale: CaptionTemplate["fontScale"]): number {
  switch (scale) {
    case "small":
      return 32;
    case "medium":
      return 44;
    case "large":
      return 58;
    case "hero":
      return 72;
  }
}

function hexToAssColor(hex: string): string {
  const normalized = hex.replace(/^#/u, "").padStart(6, "0").slice(0, 6);
  const red = normalized.slice(0, 2);
  const green = normalized.slice(2, 4);
  const blue = normalized.slice(4, 6);
  return `&H00${blue}${green}${red}`;
}

export function formatCaptionTrackAsSrt(track: CaptionTrack): string {
  return track.segments
    .filter((segment) => segment.enabled)
    .map(
      (segment, index) =>
        `${index + 1}\n${formatSrtTimestamp(segment.startUs)} --> ${formatSrtTimestamp(segment.endUs)}\n${segment.text}\n`
    )
    .join("\n");
}

export function formatCaptionTrackAsAss(
  track: CaptionTrack,
  template: CaptionTemplate
): string {
  const margins = resolveAssMargins(template.placement);
  const fontSize = resolveTemplateFontSize(template.fontScale);
  const alignment = resolveAssAlignment(template.placement, template.alignment);
  const hasBox = template.backgroundStyle === "boxed" || template.backgroundStyle === "card";

  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    "ScaledBorderAndShadow: yes",
    "PlayResX: 1920",
    "PlayResY: 1080",
    "",
    "[V4+ Styles]",
    "Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding",
    `Style: Default,Arial,${fontSize},${hexToAssColor(template.textColor)},${hexToAssColor(template.accentColor)},&H00101010,&H64000000,${template.fontWeight >= 700 ? -1 : 0},0,0,0,100,100,0,0,${hasBox ? 3 : 1},2,0,${alignment},${margins.marginL},${margins.marginR},${margins.marginV},1`,
    "",
    "[Events]",
    "Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text"
  ].join("\n");

  const lines = track.segments
    .filter((segment) => segment.enabled)
    .map((segment) => {
      return `Dialogue: 0,${formatAssTimestamp(segment.startUs)},${formatAssTimestamp(segment.endUs)},Default,,${margins.marginL},${margins.marginR},${margins.marginV},,${createAssKaraokeText(segment)}`;
    });

  return `${header}\n${lines.join("\n")}\n`;
}

export function resolveActiveCaptionOverlays(
  captionTracks: CaptionTrack[],
  templates: CaptionTemplate[],
  playheadUs: number
): CaptionPreviewOverlay[] {
  const templatesById = Object.fromEntries(templates.map((template) => [template.id, template]));

  return captionTracks
    .filter((track) => track.enabled)
    .flatMap((track) =>
      track.segments
        .filter(
          (segment) =>
            segment.enabled && segment.startUs <= playheadUs && playheadUs <= segment.endUs
        )
        .map((segment) => {
          const template = templatesById[segment.templateId ?? track.templateId] ?? templatesById[track.templateId];
          const tokens = segment.words.length
            ? segment.words.map((word) => ({
                id: word.id,
                text: word.text,
                startUs: word.startUs,
                endUs: word.endUs,
                sourceTranscriptWordId: word.sourceTranscriptWordId,
                active:
                  (segment.activeWordStyle === "highlight" || Boolean(segment.activeWordHighlight)) &&
                  word.startUs !== null &&
                  word.endUs !== null &&
                  word.startUs <= playheadUs &&
                  playheadUs <= word.endUs
              }))
            : splitWords(segment.text).map((word, index) => ({
                id: `${segment.id}:${index}`,
                text: word,
                startUs: null,
                endUs: null,
                sourceTranscriptWordId: null,
                active: false
              }));

          return {
            type: "caption" as const,
            id: segment.id,
            trackId: track.id,
            templateId: template?.id ?? track.templateId,
            text: segment.text,
            placement: segment.placement,
            alignment: segment.alignment,
            backgroundStyle: template?.backgroundStyle ?? "none",
            activeWordHighlight: segment.activeWordHighlight,
            activeWordStyle: segment.activeWordStyle,
            tokens
          };
        })
    );
}

export function createEmptyTranscriptDiagnostics(): TranscriptJobDiagnostics {
  return {
    warnings: [],
    notes: [],
    artifactDirectory: null,
    extractedAudioPath: null,
    rawArtifactPath: null,
    logPath: null
  };
}

export function composeTranscriptionPrompt(
  options: Pick<TranscriptionOptions, "initialPrompt" | "glossaryTerms">
): string | null {
  const initialPrompt = options.initialPrompt?.trim() || "";
  const glossaryTerms = normalizeGlossaryTerms(options.glossaryTerms);
  const parts: string[] = [];

  if (initialPrompt.length > 0) {
    parts.push(initialPrompt);
  }

  if (glossaryTerms.length > 0) {
    parts.push(`Prefer these names and terms exactly as written: ${glossaryTerms.join(", ")}.`);
  }

  return parts.length > 0 ? parts.join("\n\n") : null;
}

export function summarizeTranscript(
  transcript: Transcript,
  captionTracks: CaptionTrack[]
): TranscriptSummary {
  const wordCount = transcript.segments.reduce((sum, segment) => sum + segment.words.length, 0);
  const timedWordCount = transcript.segments.reduce(
    (sum, segment) =>
      sum +
      segment.words.filter((word) => word.startUs !== null && word.endUs !== null).length,
    0
  );
  const startUs =
    transcript.segments.length > 0
      ? Math.min(...transcript.segments.map((segment) => segment.startUs))
      : null;
  const endUs =
    transcript.segments.length > 0
      ? Math.max(...transcript.segments.map((segment) => segment.endUs))
      : null;
  const relatedTracks = captionTracks.filter((track) => track.sourceTranscriptId === transcript.id);
  const trackSummaries = relatedTracks.map((track) => {
    const coveredTranscriptSegmentIds = new Set(
      track.segments
        .map((segment) => segment.sourceTranscriptSegmentId)
        .filter((segmentId): segmentId is string => Boolean(segmentId))
    );

    return {
      trackId: track.id,
      trackName: track.name,
      templateId: track.templateId,
      segmentCount: track.segments.length,
      enabledSegmentCount: track.segments.filter((segment) => segment.enabled).length,
      coveredTranscriptSegmentCount: coveredTranscriptSegmentIds.size,
      coverageRatio:
        transcript.segments.length > 0
          ? coveredTranscriptSegmentIds.size / transcript.segments.length
          : 0,
      activeWordStyle:
        track.segments.find((segment) => segment.activeWordStyle === "highlight")?.activeWordStyle ??
        track.segments[0]?.activeWordStyle ??
        "none"
    } satisfies TranscriptCoverageTrackSummary;
  });
  const coveredSegmentIds = new Set(
    relatedTracks.flatMap((track) =>
      track.segments
        .map((segment) => segment.sourceTranscriptSegmentId)
        .filter((segmentId): segmentId is string => Boolean(segmentId))
    )
  );

  return {
    transcriptId: transcript.id,
    timelineId: transcript.timelineId,
    source: transcript.source,
    status: transcript.status,
    language: transcript.language,
    createdAt: transcript.createdAt,
    updatedAt: transcript.updatedAt,
    isUserEdited: transcript.isUserEdited,
    segmentCount: transcript.segments.length,
    wordCount,
    timedWordCount,
    wordTimingCoverageRatio: wordCount > 0 ? timedWordCount / wordCount : 0,
    startUs,
    endUs,
    durationUs: startUs !== null && endUs !== null ? Math.max(0, endUs - startUs) : null,
    textPreview: createTranscriptPreviewText(transcript),
    captionCoverage: {
      trackCount: relatedTracks.length,
      coveredSegmentCount: coveredSegmentIds.size,
      totalSegmentCount: transcript.segments.length,
      coverageRatio:
        transcript.segments.length > 0
          ? coveredSegmentIds.size / transcript.segments.length
          : 0,
      tracks: trackSummaries
    }
  };
}

export function summarizeTranscripts(
  transcripts: Transcript[],
  captionTracks: CaptionTrack[]
): TranscriptSummary[] {
  return transcripts.map((transcript) => summarizeTranscript(transcript, captionTracks));
}

export function normalizeTranscriptionOptions(
  input?: Partial<TranscriptionOptions>
): TranscriptionOptions {
  const parsed = transcriptionOptionsSchema.parse({
    ...DEFAULT_TRANSCRIPTION_OPTIONS,
    ...input,
    initialPrompt:
      typeof input?.initialPrompt === "string"
        ? input.initialPrompt.trim().length === 0
          ? null
          : input.initialPrompt
        : input?.initialPrompt ?? DEFAULT_TRANSCRIPTION_OPTIONS.initialPrompt,
    glossaryTerms: Array.isArray(input?.glossaryTerms) ? input.glossaryTerms : []
  });

  return {
    ...parsed,
    initialPrompt: parsed.initialPrompt?.trim() || null,
    glossaryTerms: normalizeGlossaryTerms(parsed.glossaryTerms)
  };
}
