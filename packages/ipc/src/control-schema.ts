import { z } from "zod";

import type {
  LocalApiCapabilities,
  LocalApiCaptionTrackGetInput,
  LocalApiCommandInputMap,
  LocalApiCommandName,
  LocalApiObjectSchema,
  LocalApiOperationDescriptor,
  LocalApiProjectSummary,
  LocalApiQueryInputMap,
  LocalApiQueryName,
  LocalApiScope,
  LocalApiTranscriptGetInput,
  LocalApiMediaInspectInput,
  OpenClawToolDefinition,
  OpenClawToolManifest
} from "./index";

interface CommandDefinition<Name extends LocalApiCommandName = LocalApiCommandName>
  extends LocalApiOperationDescriptor {
  kind: "command";
  parser: z.ZodType<LocalApiCommandInputMap[Name]>;
}

interface QueryDefinition<Name extends LocalApiQueryName = LocalApiQueryName>
  extends LocalApiOperationDescriptor {
  kind: "query";
  parser: z.ZodType<LocalApiQueryInputMap[Name]>;
}

export interface OpenClawToolInvocation {
  operationType: "command" | "query";
  name: LocalApiCommandName | LocalApiQueryName;
  input: unknown;
}

interface OpenClawToolDefinitionRecord {
  definition: OpenClawToolDefinition;
  parser: z.ZodType<unknown>;
  mapToInvocation: (input: unknown) => OpenClawToolInvocation;
}

function stringProperty(description: string, options: Partial<LocalApiObjectSchema["properties"][string]> = {}) {
  return {
    type: "string",
    description,
    ...options
  };
}

function integerProperty(
  description: string,
  options: Partial<LocalApiObjectSchema["properties"][string]> = {}
) {
  return {
    type: "integer",
    description,
    ...options
  };
}

function booleanProperty(
  description: string,
  options: Partial<LocalApiObjectSchema["properties"][string]> = {}
) {
  return {
    type: "boolean",
    description,
    ...options
  };
}

function enumProperty(values: string[], description: string) {
  return {
    type: "string",
    description,
    enum: values
  };
}

function arrayProperty(item: LocalApiObjectSchema["properties"][string], description: string) {
  return {
    type: "array",
    description,
    items: item
  };
}

function objectProperty(
  description: string,
  properties: Record<string, LocalApiObjectSchema["properties"][string]>,
  required: string[]
) {
  return {
    type: "object",
    description,
    properties,
    required
  };
}

function objectSchema(
  properties: Record<string, LocalApiObjectSchema["properties"][string]>,
  required: string[]
): LocalApiObjectSchema {
  return {
    type: "object",
    description: "Structured object input.",
    properties,
    required
  };
}

const nonEmptyString = z.string().min(1);
const nonNegativeInt = z.number().int().nonnegative();
const directorySchema = z.object({
  directory: nonEmptyString
});
const saveProjectSchema = directorySchema;
const mediaImportSchema = z.object({
  directory: nonEmptyString,
  paths: z.array(nonEmptyString).min(1)
});
const mediaRelinkSchema = z.object({
  directory: nonEmptyString,
  mediaItemId: nonEmptyString,
  candidatePath: nonEmptyString
});
const mediaInspectSchema: z.ZodType<LocalApiMediaInspectInput> = z.object({
  directory: nonEmptyString,
  mediaItemId: nonEmptyString
});
const transcriptGetSchema: z.ZodType<LocalApiTranscriptGetInput> = z.object({
  directory: nonEmptyString,
  transcriptId: nonEmptyString
});
const captionTrackGetSchema: z.ZodType<LocalApiCaptionTrackGetInput> = z.object({
  directory: nonEmptyString,
  captionTrackId: nonEmptyString
});
const retryJobSchema = z.object({
  directory: nonEmptyString,
  jobId: nonEmptyString
});
const cancelJobSchema = retryJobSchema;
const addTrackSchema = z.object({
  directory: nonEmptyString,
  timelineId: nonEmptyString,
  trackKind: z.enum(["video", "audio"]),
  name: nonEmptyString.optional(),
  index: nonNegativeInt.optional()
});
const createTimelineSchema = z.object({
  directory: nonEmptyString,
  timelineId: nonEmptyString
});
const insertClipSchema = z.object({
  directory: nonEmptyString,
  timelineId: nonEmptyString,
  trackId: nonEmptyString,
  mediaItemId: nonEmptyString,
  streamType: z.enum(["video", "audio"]),
  timelineStartUs: nonNegativeInt,
  sourceInUs: nonNegativeInt.optional(),
  sourceOutUs: nonNegativeInt.optional(),
  clipId: nonEmptyString.optional(),
  privilegedOverride: z.boolean().optional(),
  snapToTargets: z.boolean().optional()
});
const insertLinkedMediaSchema = z.object({
  directory: nonEmptyString,
  timelineId: nonEmptyString,
  mediaItemId: nonEmptyString,
  videoTrackId: nonEmptyString.nullable().optional(),
  audioTrackId: nonEmptyString.nullable().optional(),
  timelineStartUs: nonNegativeInt,
  sourceInUs: nonNegativeInt.optional(),
  sourceOutUs: nonNegativeInt.optional(),
  privilegedOverride: z.boolean().optional(),
  snapToTargets: z.boolean().optional()
});
const splitClipSchema = z.object({
  directory: nonEmptyString,
  timelineId: nonEmptyString,
  clipId: nonEmptyString,
  splitTimeUs: nonNegativeInt,
  rightClipId: nonEmptyString.optional(),
  privilegedOverride: z.boolean().optional(),
  snapToTargets: z.boolean().optional()
});
const trimClipStartSchema = z.object({
  directory: nonEmptyString,
  timelineId: nonEmptyString,
  clipId: nonEmptyString,
  newTimelineStartUs: nonNegativeInt,
  privilegedOverride: z.boolean().optional(),
  snapToTargets: z.boolean().optional()
});
const trimClipEndSchema = z.object({
  directory: nonEmptyString,
  timelineId: nonEmptyString,
  clipId: nonEmptyString,
  newTimelineEndUs: nonNegativeInt,
  privilegedOverride: z.boolean().optional(),
  snapToTargets: z.boolean().optional()
});
const moveClipSchema = z.object({
  directory: nonEmptyString,
  timelineId: nonEmptyString,
  clipId: nonEmptyString,
  targetTrackId: nonEmptyString.optional(),
  newTimelineStartUs: nonNegativeInt,
  privilegedOverride: z.boolean().optional(),
  snapToTargets: z.boolean().optional()
});
const clipOnlyEditorSchema = z.object({
  directory: nonEmptyString,
  timelineId: nonEmptyString,
  clipId: nonEmptyString
});
const trackLockSchema = z.object({
  directory: nonEmptyString,
  timelineId: nonEmptyString,
  trackId: nonEmptyString
});
const setPlayheadSchema = z.object({
  directory: nonEmptyString,
  timelineId: nonEmptyString,
  positionUs: nonNegativeInt,
  snapToTargets: z.boolean().optional()
});
const previewLoadSchema = z.object({
  directory: nonEmptyString,
  initialPlayheadUs: nonNegativeInt.optional(),
  preservePlayhead: z.boolean().optional()
});
const previewSeekSchema = z.object({
  positionUs: nonNegativeInt
});
const previewQualitySchema = z.object({
  qualityMode: z.enum(["fast", "standard", "accurate"])
});
const emptyObjectSchema = z.object({});
const transcriptionOptionsSchema = z
  .object({
    language: nonEmptyString.nullable().optional(),
    model: z.enum(["tiny", "base", "small", "medium"]).optional(),
    wordTimestamps: z.boolean().optional(),
    initialPrompt: nonEmptyString.nullable().optional(),
    glossaryTerms: z.array(nonEmptyString).optional(),
    normalizeText: z.boolean().optional()
  })
  .optional();
const transcribeClipSchema = z.object({
  directory: nonEmptyString,
  timelineId: nonEmptyString,
  clipId: nonEmptyString,
  options: transcriptionOptionsSchema
});
const updateTranscriptSegmentSchema = z.object({
  directory: nonEmptyString,
  transcriptId: nonEmptyString,
  segmentId: nonEmptyString,
  text: z.string()
});
const generateCaptionTrackSchema = z.object({
  directory: nonEmptyString,
  timelineId: nonEmptyString,
  transcriptId: nonEmptyString,
  templateId: z.enum([
    "bottom-center-clean",
    "lower-third-boxed",
    "headline-top",
    "social-highlight",
    "karaoke-highlight",
    "quote-card"
  ]),
  name: nonEmptyString.optional()
});
const captionTrackIdSchema = z.object({
  directory: nonEmptyString,
  captionTrackId: nonEmptyString
});
const applyCaptionTemplateSchema = z.object({
  directory: nonEmptyString,
  captionTrackId: nonEmptyString,
  templateId: z.enum([
    "bottom-center-clean",
    "lower-third-boxed",
    "headline-top",
    "social-highlight",
    "karaoke-highlight",
    "quote-card"
  ])
});
const updateCaptionSegmentSchema = z.object({
  directory: nonEmptyString,
  captionTrackId: nonEmptyString,
  segmentId: nonEmptyString,
  text: z.string(),
  startUs: nonNegativeInt.optional(),
  endUs: nonNegativeInt.optional(),
  enabled: z.boolean().optional()
});
const exportSubtitleSchema = z.object({
  directory: nonEmptyString,
  captionTrackId: nonEmptyString,
  format: z.enum(["srt", "ass"]),
  outputPath: nonEmptyString.nullable().optional()
});
const setBurnInSchema = z.object({
  directory: nonEmptyString,
  timelineId: nonEmptyString,
  captionTrackId: nonEmptyString.nullable(),
  enabled: z.boolean()
});
const smartSilenceAnalysisSchema = z.object({
  directory: nonEmptyString,
  timelineId: nonEmptyString,
  clipId: nonEmptyString,
  options: z
    .object({
      amplitudeThreshold: z.number().min(0).max(1).optional(),
      peakThreshold: z.number().min(0).max(1).optional(),
      minimumDurationUs: nonNegativeInt.optional()
    })
    .optional()
});
const smartWeakSegmentAnalysisSchema = z.object({
  directory: nonEmptyString,
  transcriptId: nonEmptyString,
  options: z
    .object({
      minimumDurationUs: nonNegativeInt.optional(),
      wordsPerSecondThreshold: z.number().positive().optional()
    })
    .optional()
});
const smartFillerAnalysisSchema = z.object({
  directory: nonEmptyString,
  transcriptId: nonEmptyString,
  options: z
    .object({
      vocabulary: z.array(nonEmptyString).optional(),
      paddingUs: nonNegativeInt.optional()
    })
    .optional()
});
const smartHighlightSchema = z.object({
  directory: nonEmptyString,
  transcriptId: nonEmptyString,
  options: z
    .object({
      minimumDurationUs: nonNegativeInt.optional(),
      maximumDurationUs: nonNegativeInt.optional(),
      keywordBoostTerms: z.array(nonEmptyString).optional(),
      minimumScore: z.number().min(0).max(1).optional()
    })
    .optional()
});
const smartCompilePlanSchema = z.object({
  directory: nonEmptyString,
  timelineId: nonEmptyString,
  suggestionSetId: nonEmptyString,
  suggestionIds: z.array(nonEmptyString).optional()
});
const smartApplySuggestionSchema = z.object({
  directory: nonEmptyString,
  timelineId: nonEmptyString,
  suggestionSetId: nonEmptyString,
  suggestionId: nonEmptyString
});
const smartApplySuggestionSetSchema = z.object({
  directory: nonEmptyString,
  timelineId: nonEmptyString,
  suggestionSetId: nonEmptyString,
  suggestionIds: z.array(nonEmptyString).optional()
});
const smartRejectSuggestionSchema = z.object({
  directory: nonEmptyString,
  suggestionSetId: nonEmptyString,
  suggestionId: nonEmptyString
});
const smartSuggestionSetQuerySchema = z.object({
  directory: nonEmptyString,
  suggestionSetId: nonEmptyString
});
const smartSuggestionQuerySchema = z.object({
  directory: nonEmptyString,
  suggestionSetId: nonEmptyString,
  suggestionId: nonEmptyString
});
const smartSuggestionPreviewSchema = smartSuggestionQuerySchema.extend({
  anchor: z.enum(["start", "midpoint", "end"]).optional()
});
const workflowTemplateIdSchema = z.enum([
  "captioned-export-v1",
  "smart-cleanup-v1",
  "short-clip-candidates-v1",
  "batch-caption-export-v1"
]);
const captionTemplateIdSchema = z.enum([
  "bottom-center-clean",
  "lower-third-boxed",
  "headline-top",
  "social-highlight",
  "karaoke-highlight",
  "quote-card"
]);
const exportPresetIdSchema = z.enum([
  "video-master-1080p",
  "video-share-720p",
  "audio-podcast-aac"
]);
const brandKitPayloadSchema = z.object({
  id: nonEmptyString,
  version: z.number().int().positive(),
  name: nonEmptyString,
  description: z.string(),
  captionTemplateId: captionTemplateIdSchema,
  captionStyleOverrides: z
    .object({
      placement: z.enum(["bottom-center", "lower-third", "top-headline", "center-card"]).optional(),
      alignment: z.enum(["left", "center", "right"]).optional(),
      fontFamilyIntent: z.enum(["sans", "display", "serif"]).optional(),
      fontScale: z.enum(["small", "medium", "large", "hero"]).optional(),
      fontWeight: z.union([z.literal(500), z.literal(600), z.literal(700), z.literal(800)]).optional(),
      textColor: nonEmptyString.optional(),
      accentColor: nonEmptyString.optional(),
      backgroundStyle: z.enum(["none", "boxed", "card", "highlight"]).optional(),
      activeWordStyle: z.enum(["none", "highlight", "underline"]).optional()
    })
    .default({}),
  safeZoneDefaults: z.object({
    anchor: z.enum(["title-safe", "action-safe"]),
    placement: z.enum(["bottom-center", "lower-third", "top-headline", "center-card"]),
    alignment: z.enum(["left", "center", "right"])
  }),
  exportPresetId: exportPresetIdSchema,
  logoWatermark: z.object({
    kind: z.enum(["none", "placeholder"]),
    label: z.string().nullable()
  }),
  introOutro: z.object({
    introPreset: z.string().nullable(),
    outroPreset: z.string().nullable()
  })
});
const workflowStartSchema = z.object({
  directory: nonEmptyString,
  templateId: workflowTemplateIdSchema,
  input: z.record(z.string(), z.unknown())
});
const workflowStartBatchSchema = z.object({
  directory: nonEmptyString,
  templateId: z.literal("batch-caption-export-v1"),
  input: z.record(z.string(), z.unknown())
});
const workflowRunSchema = z.object({
  directory: nonEmptyString,
  workflowRunId: nonEmptyString
});
const workflowRetryStepSchema = z.object({
  directory: nonEmptyString,
  workflowRunId: nonEmptyString,
  stepRunId: nonEmptyString
});
const workflowApprovalSchema = z.object({
  directory: nonEmptyString,
  workflowRunId: nonEmptyString,
  approvalId: nonEmptyString
});
const workflowTemplateQuerySchema = z.object({
  directory: nonEmptyString,
  workflowId: nonEmptyString
});
const workflowArtifactQuerySchema = z.object({
  directory: nonEmptyString,
  workflowRunId: nonEmptyString,
  artifactId: nonEmptyString
});
const brandKitCreateSchema = z.object({
  directory: nonEmptyString,
  brandKit: brandKitPayloadSchema
});
const brandKitUpdateSchema = z.object({
  directory: nonEmptyString,
  brandKitId: nonEmptyString,
  brandKit: brandKitPayloadSchema
});
const brandKitSetDefaultSchema = z.object({
  directory: nonEmptyString,
  brandKitId: nonEmptyString.nullable()
});
const exportRequestSchema = z.object({
  timelineId: nonEmptyString,
  exportMode: z.enum(["video", "audio", "frame"]).optional(),
  presetId: z
    .enum(["video-master-1080p", "video-share-720p", "audio-podcast-aac"])
    .optional(),
  outputPath: nonEmptyString.nullable().optional(),
  overwritePolicy: z.enum(["increment", "replace"]).optional(),
  captionBurnIn: z
    .object({
      enabled: z.boolean(),
      captionTrackId: nonEmptyString.nullable(),
      subtitleFormat: z.enum(["srt", "ass"]).optional()
    })
    .optional(),
  target: z
    .union([
      z.object({
        kind: z.literal("timeline")
      }),
      z.object({
        kind: z.literal("range"),
        startUs: nonNegativeInt,
        endUs: nonNegativeInt,
        label: nonEmptyString.nullable().optional()
      }),
      z.object({
        kind: z.literal("region"),
        regionId: nonEmptyString
      })
    ])
    .optional()
});
const exportRequestCommandSchema = z.object({
  directory: nonEmptyString,
  request: exportRequestSchema
});
const exportCancelSchema = z.object({
  directory: nonEmptyString,
  exportRunId: nonEmptyString
});
const exportCaptureSnapshotSchema = z.object({
  directory: nonEmptyString,
  request: z.union([
    z.object({
      sourceKind: z.literal("export-run"),
      exportRunId: nonEmptyString,
      positionUs: nonNegativeInt.nullable().optional()
    }),
    z.object({
      sourceKind: z.literal("timeline"),
      timelineId: nonEmptyString,
      positionUs: nonNegativeInt,
      presetId: z
        .enum(["video-master-1080p", "video-share-720p", "audio-podcast-aac"])
        .optional()
    })
  ])
});
const previewFrameSchema = z.object({
  options: z
    .object({
      maxWidth: z.number().int().positive().optional(),
      mimeType: z.enum(["image/png", "image/jpeg"]).optional(),
      quality: z.number().min(0).max(1).optional()
    })
    .optional()
});

const COMMAND_DEFINITIONS: CommandDefinition[] = [
  {
    kind: "command",
    name: "project.create",
    category: "project",
    description: "Create a new ClawCut project directory and bootstrap project state.",
    requiredScopes: ["edit"],
    safetyClass: "high-impact",
    mutability: "write",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute path to the new project directory."),
        name: stringProperty("Optional project display name.", { nullable: true })
      },
      ["directory"]
    ),
    outputDescription: "Returns the initial project workspace snapshot.",
    parser: z.object({
      directory: nonEmptyString,
      name: nonEmptyString.optional()
    })
  },
  {
    kind: "command",
    name: "project.open",
    category: "project",
    description: "Open an existing project directory and refresh worker-owned state.",
    requiredScopes: ["read"],
    safetyClass: "mutating",
    mutability: "write",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute path to the ClawCut project directory.")
      },
      ["directory"]
    ),
    outputDescription: "Returns the refreshed project workspace snapshot.",
    parser: directorySchema
  },
  {
    kind: "command",
    name: "project.save",
    category: "project",
    description: "Confirm the current project has been persisted.",
    requiredScopes: ["edit"],
    safetyClass: "mutating",
    mutability: "write",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute path to the ClawCut project directory.")
      },
      ["directory"]
    ),
    outputDescription: "Returns project persistence confirmation metadata.",
    parser: saveProjectSchema
  },
  {
    kind: "command",
    name: "media.import",
    category: "media",
    description: "Import local media into the project and queue ingest jobs.",
    requiredScopes: ["edit"],
    safetyClass: "high-impact",
    mutability: "write",
    execution: "job",
    returnsJob: true,
    longRunning: true,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory."),
        paths: arrayProperty(stringProperty("Absolute file or folder path."), "Paths to import.")
      },
      ["directory", "paths"]
    ),
    outputDescription: "Returns accepted paths, queued job ids, and an updated snapshot.",
    parser: mediaImportSchema
  },
  {
    kind: "command",
    name: "media.relink",
    category: "media",
    description: "Relink a missing media item to a validated candidate path.",
    requiredScopes: ["edit"],
    safetyClass: "high-impact",
    mutability: "write",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory."),
        mediaItemId: stringProperty("ClawCut media item id."),
        candidatePath: stringProperty("Absolute candidate source path.")
      },
      ["directory", "mediaItemId", "candidatePath"]
    ),
    outputDescription: "Returns relink diagnostics and the updated project snapshot.",
    parser: mediaRelinkSchema
  },
  {
    kind: "command",
    name: "timeline.create",
    category: "timeline",
    description: "Create the project timeline if it has not been initialized yet.",
    requiredScopes: ["edit"],
    safetyClass: "mutating",
    mutability: "write",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory."),
        timelineId: stringProperty("Timeline id to initialize.")
      },
      ["directory", "timelineId"]
    ),
    outputDescription: "Returns the updated editor session snapshot and command result.",
    parser: createTimelineSchema
  },
  {
    kind: "command",
    name: "timeline.addTrack",
    category: "timeline",
    description: "Add a new video or audio track to the timeline.",
    requiredScopes: ["edit"],
    safetyClass: "mutating",
    mutability: "write",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory."),
        timelineId: stringProperty("Timeline id."),
        trackKind: enumProperty(["video", "audio"], "Track kind."),
        name: stringProperty("Optional user-facing track name.", { nullable: true }),
        index: integerProperty("Optional insert index.", { nullable: true })
      },
      ["directory", "timelineId", "trackKind"]
    ),
    outputDescription: "Returns the updated editor session snapshot and command result.",
    parser: addTrackSchema
  },
  {
    kind: "command",
    name: "timeline.insertClip",
    category: "timeline",
    description: "Insert a single clip on a specific track at a timeline position.",
    requiredScopes: ["edit"],
    safetyClass: "mutating",
    mutability: "write",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory."),
        timelineId: stringProperty("Timeline id."),
        trackId: stringProperty("Target track id."),
        mediaItemId: stringProperty("Source media item id."),
        streamType: enumProperty(["video", "audio"], "Clip stream type."),
        timelineStartUs: integerProperty("Timeline insert position in microseconds."),
        sourceInUs: integerProperty("Optional source in point.", { nullable: true }),
        sourceOutUs: integerProperty("Optional source out point.", { nullable: true }),
        clipId: stringProperty("Optional explicit clip id.", { nullable: true }),
        privilegedOverride: booleanProperty("Allow edits on locked tracks when true."),
        snapToTargets: booleanProperty("Enable snapping to nearby timeline edges.")
      },
      ["directory", "timelineId", "trackId", "mediaItemId", "streamType", "timelineStartUs"]
    ),
    outputDescription: "Returns the updated editor session snapshot and command result.",
    parser: insertClipSchema
  },
  {
    kind: "command",
    name: "timeline.insertLinkedMedia",
    category: "timeline",
    description: "Insert linked video and audio clips from one media item.",
    requiredScopes: ["edit"],
    safetyClass: "mutating",
    mutability: "write",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory."),
        timelineId: stringProperty("Timeline id."),
        mediaItemId: stringProperty("Source media item id."),
        videoTrackId: stringProperty("Optional target video track id.", { nullable: true }),
        audioTrackId: stringProperty("Optional target audio track id.", { nullable: true }),
        timelineStartUs: integerProperty("Timeline insert position in microseconds."),
        sourceInUs: integerProperty("Optional source in point.", { nullable: true }),
        sourceOutUs: integerProperty("Optional source out point.", { nullable: true }),
        privilegedOverride: booleanProperty("Allow edits on locked tracks when true."),
        snapToTargets: booleanProperty("Enable snapping to nearby timeline edges.")
      },
      ["directory", "timelineId", "mediaItemId", "timelineStartUs"]
    ),
    outputDescription: "Returns the updated editor session snapshot and command result.",
    parser: insertLinkedMediaSchema
  },
  {
    kind: "command",
    name: "timeline.splitClip",
    category: "timeline",
    description: "Split a clip into left and right segments at a timeline time.",
    requiredScopes: ["edit"],
    safetyClass: "mutating",
    mutability: "write",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory."),
        timelineId: stringProperty("Timeline id."),
        clipId: stringProperty("Clip id to split."),
        splitTimeUs: integerProperty("Split time in microseconds."),
        rightClipId: stringProperty("Optional explicit id for the right clip.", { nullable: true }),
        privilegedOverride: booleanProperty("Allow edits on locked tracks when true."),
        snapToTargets: booleanProperty("Enable snapping to nearby timeline edges.")
      },
      ["directory", "timelineId", "clipId", "splitTimeUs"]
    ),
    outputDescription: "Returns the updated editor session snapshot and command result.",
    parser: splitClipSchema
  },
  {
    kind: "command",
    name: "timeline.trimClipStart",
    category: "timeline",
    description: "Trim the start edge of a clip.",
    requiredScopes: ["edit"],
    safetyClass: "mutating",
    mutability: "write",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory."),
        timelineId: stringProperty("Timeline id."),
        clipId: stringProperty("Clip id to trim."),
        newTimelineStartUs: integerProperty("New start time in microseconds."),
        privilegedOverride: booleanProperty("Allow edits on locked tracks when true."),
        snapToTargets: booleanProperty("Enable snapping to nearby timeline edges.")
      },
      ["directory", "timelineId", "clipId", "newTimelineStartUs"]
    ),
    outputDescription: "Returns the updated editor session snapshot and command result.",
    parser: trimClipStartSchema
  },
  {
    kind: "command",
    name: "timeline.trimClipEnd",
    category: "timeline",
    description: "Trim the end edge of a clip.",
    requiredScopes: ["edit"],
    safetyClass: "mutating",
    mutability: "write",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory."),
        timelineId: stringProperty("Timeline id."),
        clipId: stringProperty("Clip id to trim."),
        newTimelineEndUs: integerProperty("New end time in microseconds."),
        privilegedOverride: booleanProperty("Allow edits on locked tracks when true."),
        snapToTargets: booleanProperty("Enable snapping to nearby timeline edges.")
      },
      ["directory", "timelineId", "clipId", "newTimelineEndUs"]
    ),
    outputDescription: "Returns the updated editor session snapshot and command result.",
    parser: trimClipEndSchema
  },
  {
    kind: "command",
    name: "timeline.moveClip",
    category: "timeline",
    description: "Move a clip earlier or later on the same or another track.",
    requiredScopes: ["edit"],
    safetyClass: "mutating",
    mutability: "write",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory."),
        timelineId: stringProperty("Timeline id."),
        clipId: stringProperty("Clip id to move."),
        targetTrackId: stringProperty("Optional destination track id.", { nullable: true }),
        newTimelineStartUs: integerProperty("Destination timeline start in microseconds."),
        privilegedOverride: booleanProperty("Allow edits on locked tracks when true."),
        snapToTargets: booleanProperty("Enable snapping to nearby timeline edges.")
      },
      ["directory", "timelineId", "clipId", "newTimelineStartUs"]
    ),
    outputDescription: "Returns the updated editor session snapshot and command result.",
    parser: moveClipSchema
  },
  {
    kind: "command",
    name: "timeline.rippleDeleteClip",
    category: "timeline",
    description: "Delete a clip and close the gap on its track.",
    requiredScopes: ["edit"],
    safetyClass: "mutating",
    mutability: "write",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory."),
        timelineId: stringProperty("Timeline id."),
        clipId: stringProperty("Clip id to delete.")
      },
      ["directory", "timelineId", "clipId"]
    ),
    outputDescription: "Returns the updated editor session snapshot and command result.",
    parser: clipOnlyEditorSchema
  },
  {
    kind: "command",
    name: "timeline.lockTrack",
    category: "timeline",
    description: "Lock a track against edits.",
    requiredScopes: ["edit"],
    safetyClass: "mutating",
    mutability: "write",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory."),
        timelineId: stringProperty("Timeline id."),
        trackId: stringProperty("Track id.")
      },
      ["directory", "timelineId", "trackId"]
    ),
    outputDescription: "Returns the updated editor session snapshot and command result.",
    parser: trackLockSchema
  },
  {
    kind: "command",
    name: "timeline.unlockTrack",
    category: "timeline",
    description: "Unlock a track for editing.",
    requiredScopes: ["edit"],
    safetyClass: "mutating",
    mutability: "write",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory."),
        timelineId: stringProperty("Timeline id."),
        trackId: stringProperty("Track id.")
      },
      ["directory", "timelineId", "trackId"]
    ),
    outputDescription: "Returns the updated editor session snapshot and command result.",
    parser: trackLockSchema
  },
  {
    kind: "command",
    name: "timeline.setPlayhead",
    category: "timeline",
    description: "Move the timeline playhead without affecting history.",
    requiredScopes: ["edit"],
    safetyClass: "mutating",
    mutability: "write",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory."),
        timelineId: stringProperty("Timeline id."),
        positionUs: integerProperty("Playhead position in microseconds."),
        snapToTargets: booleanProperty("Enable snapping to nearby timeline edges.")
      },
      ["directory", "timelineId", "positionUs"]
    ),
    outputDescription: "Returns the updated editor session snapshot and command result.",
    parser: setPlayheadSchema
  },
  {
    kind: "command",
    name: "timeline.undo",
    category: "timeline",
    description: "Undo the most recent reversible timeline command.",
    requiredScopes: ["edit"],
    safetyClass: "mutating",
    mutability: "write",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory."),
        timelineId: stringProperty("Timeline id.")
      },
      ["directory", "timelineId"]
    ),
    outputDescription: "Returns the updated editor session snapshot and command result.",
    parser: z.object({
      directory: nonEmptyString,
      timelineId: nonEmptyString
    })
  },
  {
    kind: "command",
    name: "timeline.redo",
    category: "timeline",
    description: "Redo the next reversible timeline command.",
    requiredScopes: ["edit"],
    safetyClass: "mutating",
    mutability: "write",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory."),
        timelineId: stringProperty("Timeline id.")
      },
      ["directory", "timelineId"]
    ),
    outputDescription: "Returns the updated editor session snapshot and command result.",
    parser: z.object({
      directory: nonEmptyString,
      timelineId: nonEmptyString
    })
  },
  {
    kind: "command",
    name: "preview.loadTimeline",
    category: "preview",
    description: "Load the current project timeline into the desktop preview session.",
    requiredScopes: ["preview"],
    safetyClass: "mutating",
    mutability: "write",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory."),
        initialPlayheadUs: integerProperty("Optional initial playhead position.", { nullable: true }),
        preservePlayhead: booleanProperty("Preserve the current preview playhead when possible.")
      },
      ["directory"]
    ),
    outputDescription: "Returns the updated preview state after loading the timeline.",
    legacyNames: ["preview.load-project-timeline"],
    parser: previewLoadSchema
  },
  {
    kind: "command",
    name: "preview.play",
    category: "preview",
    description: "Start preview playback in the active desktop session.",
    requiredScopes: ["preview"],
    safetyClass: "mutating",
    mutability: "write",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema({}, []),
    outputDescription: "Returns the updated preview state.",
    parser: emptyObjectSchema
  },
  {
    kind: "command",
    name: "preview.pause",
    category: "preview",
    description: "Pause preview playback in the active desktop session.",
    requiredScopes: ["preview"],
    safetyClass: "mutating",
    mutability: "write",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema({}, []),
    outputDescription: "Returns the updated preview state.",
    parser: emptyObjectSchema
  },
  {
    kind: "command",
    name: "preview.seek",
    category: "preview",
    description: "Seek preview to a timeline position in microseconds.",
    requiredScopes: ["preview"],
    safetyClass: "mutating",
    mutability: "write",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema(
      {
        positionUs: integerProperty("Target playhead position in microseconds.")
      },
      ["positionUs"]
    ),
    outputDescription: "Returns the updated preview state and resolved playhead.",
    parser: previewSeekSchema
  },
  {
    kind: "command",
    name: "preview.stepForward",
    category: "preview",
    description: "Step forward by one preview frame.",
    requiredScopes: ["preview"],
    safetyClass: "mutating",
    mutability: "write",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema({}, []),
    outputDescription: "Returns the updated preview state and frame step size.",
    parser: emptyObjectSchema
  },
  {
    kind: "command",
    name: "preview.stepBackward",
    category: "preview",
    description: "Step backward by one preview frame.",
    requiredScopes: ["preview"],
    safetyClass: "mutating",
    mutability: "write",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema({}, []),
    outputDescription: "Returns the updated preview state and frame step size.",
    parser: emptyObjectSchema
  },
  {
    kind: "command",
    name: "preview.setQuality",
    category: "preview",
    description: "Change the preview quality mode.",
    requiredScopes: ["preview"],
    safetyClass: "mutating",
    mutability: "write",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema(
      {
        qualityMode: enumProperty(["fast", "standard", "accurate"], "Preview quality mode.")
      },
      ["qualityMode"]
    ),
    outputDescription: "Returns the updated preview state.",
    parser: previewQualitySchema
  },
  {
    kind: "command",
    name: "transcript.transcribeClip",
    category: "transcript",
    description: "Queue transcription for a clip using the configured transcription adapter.",
    requiredScopes: ["transcript"],
    safetyClass: "high-impact",
    mutability: "write",
    execution: "job",
    returnsJob: true,
    longRunning: true,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory."),
        timelineId: stringProperty("Timeline id."),
        clipId: stringProperty("Clip id to transcribe."),
        options: objectProperty(
          "Optional transcription settings.",
          {
            language: stringProperty("Explicit language hint.", { nullable: true }),
            model: enumProperty(["tiny", "base", "small", "medium"], "Requested model size."),
            wordTimestamps: booleanProperty("Request word-level timestamps."),
            initialPrompt: stringProperty("Optional initial prompt.", { nullable: true }),
            glossaryTerms: arrayProperty(stringProperty("Glossary term."), "Custom vocabulary hints."),
            normalizeText: booleanProperty("Normalize transcription text output.")
          },
          []
        )
      },
      ["directory", "timelineId", "clipId"]
    ),
    outputDescription: "Returns the updated caption session snapshot and queued transcription run.",
    parser: transcribeClipSchema
  },
  {
    kind: "command",
    name: "transcript.updateSegment",
    category: "transcript",
    description: "Edit transcript segment text while preserving timing references.",
    requiredScopes: ["transcript"],
    safetyClass: "mutating",
    mutability: "write",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory."),
        transcriptId: stringProperty("Transcript id."),
        segmentId: stringProperty("Transcript segment id."),
        text: stringProperty("Updated transcript text.")
      },
      ["directory", "transcriptId", "segmentId", "text"]
    ),
    outputDescription: "Returns the updated caption session snapshot and transcript result.",
    parser: updateTranscriptSegmentSchema
  },
  {
    kind: "command",
    name: "captions.generateTrack",
    category: "captions",
    description: "Generate a caption track from a transcript.",
    requiredScopes: ["transcript"],
    safetyClass: "mutating",
    mutability: "write",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory."),
        timelineId: stringProperty("Timeline id."),
        transcriptId: stringProperty("Transcript id."),
        templateId: enumProperty(
          [
            "bottom-center-clean",
            "lower-third-boxed",
            "headline-top",
            "social-highlight",
            "karaoke-highlight",
            "quote-card"
          ],
          "Caption template id."
        ),
        name: stringProperty("Optional caption track name.", { nullable: true })
      },
      ["directory", "timelineId", "transcriptId", "templateId"]
    ),
    outputDescription: "Returns the updated caption session snapshot and caption track result.",
    parser: generateCaptionTrackSchema
  },
  {
    kind: "command",
    name: "captions.regenerateTrack",
    category: "captions",
    description: "Regenerate a caption track from its current transcript source.",
    requiredScopes: ["transcript"],
    safetyClass: "mutating",
    mutability: "write",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory."),
        captionTrackId: stringProperty("Caption track id.")
      },
      ["directory", "captionTrackId"]
    ),
    outputDescription: "Returns the updated caption session snapshot and caption track result.",
    parser: captionTrackIdSchema
  },
  {
    kind: "command",
    name: "captions.applyTemplate",
    category: "captions",
    description: "Apply a caption template to an existing caption track.",
    requiredScopes: ["transcript"],
    safetyClass: "mutating",
    mutability: "write",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory."),
        captionTrackId: stringProperty("Caption track id."),
        templateId: enumProperty(
          [
            "bottom-center-clean",
            "lower-third-boxed",
            "headline-top",
            "social-highlight",
            "karaoke-highlight",
            "quote-card"
          ],
          "Caption template id."
        )
      },
      ["directory", "captionTrackId", "templateId"]
    ),
    outputDescription: "Returns the updated caption session snapshot and caption track result.",
    parser: applyCaptionTemplateSchema
  },
  {
    kind: "command",
    name: "captions.updateSegment",
    category: "captions",
    description: "Edit caption text or timing for one caption segment.",
    requiredScopes: ["transcript"],
    safetyClass: "mutating",
    mutability: "write",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory."),
        captionTrackId: stringProperty("Caption track id."),
        segmentId: stringProperty("Caption segment id."),
        text: stringProperty("Updated caption text."),
        startUs: integerProperty("Optional updated start time.", { nullable: true }),
        endUs: integerProperty("Optional updated end time.", { nullable: true }),
        enabled: booleanProperty("Optional enabled state.")
      },
      ["directory", "captionTrackId", "segmentId", "text"]
    ),
    outputDescription: "Returns the updated caption session snapshot and caption track result.",
    parser: updateCaptionSegmentSchema
  },
  {
    kind: "command",
    name: "captions.exportSubtitles",
    category: "captions",
    description: "Export a caption track to a sidecar subtitle artifact.",
    requiredScopes: ["transcript"],
    safetyClass: "high-impact",
    mutability: "write",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory."),
        captionTrackId: stringProperty("Caption track id."),
        format: enumProperty(["srt", "ass"], "Subtitle export format."),
        outputPath: stringProperty("Optional explicit subtitle output path.", { nullable: true })
      },
      ["directory", "captionTrackId", "format"]
    ),
    outputDescription: "Returns the exported subtitle artifact metadata.",
    parser: exportSubtitleSchema
  },
  {
    kind: "command",
    name: "captions.setBurnIn",
    category: "captions",
    description: "Enable or disable caption burn-in defaults for exports.",
    requiredScopes: ["transcript"],
    safetyClass: "mutating",
    mutability: "write",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory."),
        timelineId: stringProperty("Timeline id."),
        captionTrackId: stringProperty("Caption track id or null to clear.", { nullable: true }),
        enabled: booleanProperty("Whether burn-in should be enabled by default.")
      },
      ["directory", "timelineId", "captionTrackId", "enabled"]
    ),
    outputDescription: "Returns updated caption export defaults.",
    parser: setBurnInSchema
  },
  {
    kind: "command",
    name: "smart.analyzeSilence",
    category: "smart",
    description: "Analyze a clip waveform for removable silence or dead air ranges.",
    requiredScopes: ["read"],
    safetyClass: "read-only",
    mutability: "read",
    execution: "job",
    returnsJob: true,
    longRunning: true,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory."),
        timelineId: stringProperty("Timeline id."),
        clipId: stringProperty("Clip id to analyze."),
        options: objectProperty(
          "Optional silence analysis tuning.",
          {
            amplitudeThreshold: {
              type: "number",
              description: "RMS threshold from 0 to 1."
            },
            peakThreshold: {
              type: "number",
              description: "Peak threshold from 0 to 1."
            },
            minimumDurationUs: integerProperty("Minimum removable silence duration in microseconds.")
          },
          []
        )
      },
      ["directory", "timelineId", "clipId"]
    ),
    outputDescription: "Returns the updated smart session snapshot with a silence suggestion set and analysis run.",
    parser: smartSilenceAnalysisSchema
  },
  {
    kind: "command",
    name: "smart.analyzeWeakSegments",
    category: "smart",
    description: "Analyze transcript timing density for weak or low-value segments.",
    requiredScopes: ["read"],
    safetyClass: "read-only",
    mutability: "read",
    execution: "job",
    returnsJob: true,
    longRunning: true,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory."),
        transcriptId: stringProperty("Transcript id."),
        options: objectProperty(
          "Optional density analysis tuning.",
          {
            minimumDurationUs: integerProperty("Minimum weak segment duration in microseconds."),
            wordsPerSecondThreshold: {
              type: "number",
              description: "Words-per-second threshold below which a segment is flagged."
            }
          },
          []
        )
      },
      ["directory", "transcriptId"]
    ),
    outputDescription: "Returns the updated smart session snapshot with weak-segment suggestions.",
    parser: smartWeakSegmentAnalysisSchema
  },
  {
    kind: "command",
    name: "smart.findFillerWords",
    category: "smart",
    description: "Analyze transcript content for timing-linked filler word opportunities.",
    requiredScopes: ["read"],
    safetyClass: "read-only",
    mutability: "read",
    execution: "job",
    returnsJob: true,
    longRunning: true,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory."),
        transcriptId: stringProperty("Transcript id."),
        options: objectProperty(
          "Optional filler-word tuning.",
          {
            vocabulary: arrayProperty(stringProperty("Filler term or phrase."), "Custom filler vocabulary."),
            paddingUs: integerProperty("Padding to keep around detected filler spans in microseconds.")
          },
          []
        )
      },
      ["directory", "transcriptId"]
    ),
    outputDescription: "Returns the updated smart session snapshot with filler-word suggestions.",
    parser: smartFillerAnalysisSchema
  },
  {
    kind: "command",
    name: "smart.generateHighlights",
    category: "smart",
    description: "Generate explainable highlight suggestions from transcript timing and keyword signals.",
    requiredScopes: ["read"],
    safetyClass: "read-only",
    mutability: "read",
    execution: "job",
    returnsJob: true,
    longRunning: true,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory."),
        transcriptId: stringProperty("Transcript id."),
        options: objectProperty(
          "Optional highlight scoring settings.",
          {
            minimumDurationUs: integerProperty("Minimum highlight duration in microseconds."),
            maximumDurationUs: integerProperty("Maximum highlight duration in microseconds."),
            keywordBoostTerms: arrayProperty(stringProperty("Highlight keyword."), "Keywords that boost highlight scores."),
            minimumScore: {
              type: "number",
              description: "Minimum score threshold from 0 to 1."
            }
          },
          []
        )
      },
      ["directory", "transcriptId"]
    ),
    outputDescription: "Returns the updated smart session snapshot with highlight suggestions.",
    parser: smartHighlightSchema
  },
  {
    kind: "command",
    name: "smart.compilePlan",
    category: "smart",
    description: "Compile accepted smart suggestions into an explicit, inspectable edit plan.",
    requiredScopes: ["read"],
    safetyClass: "read-only",
    mutability: "read",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory."),
        timelineId: stringProperty("Timeline id."),
        suggestionSetId: stringProperty("Suggestion set id."),
        suggestionIds: arrayProperty(stringProperty("Suggestion id."), "Optional subset of suggestions to compile.")
      },
      ["directory", "timelineId", "suggestionSetId"]
    ),
    outputDescription: "Returns a dry-run smart edit plan with command steps, conflicts, and predicted removals.",
    parser: smartCompilePlanSchema
  },
  {
    kind: "command",
    name: "smart.applySuggestion",
    category: "smart",
    description: "Apply one reviewed smart suggestion through the timeline command engine.",
    requiredScopes: ["edit"],
    safetyClass: "high-impact",
    mutability: "write",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory."),
        timelineId: stringProperty("Timeline id."),
        suggestionSetId: stringProperty("Suggestion set id."),
        suggestionId: stringProperty("Suggestion id.")
      },
      ["directory", "timelineId", "suggestionSetId", "suggestionId"]
    ),
    outputDescription: "Returns the applied smart plan and linked suggestion ids.",
    parser: smartApplySuggestionSchema
  },
  {
    kind: "command",
    name: "smart.applySuggestionSet",
    category: "smart",
    description: "Apply multiple reviewed smart suggestions through the timeline command engine.",
    requiredScopes: ["edit"],
    safetyClass: "high-impact",
    mutability: "write",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory."),
        timelineId: stringProperty("Timeline id."),
        suggestionSetId: stringProperty("Suggestion set id."),
        suggestionIds: arrayProperty(stringProperty("Suggestion id."), "Optional subset of suggestions to apply.")
      },
      ["directory", "timelineId", "suggestionSetId"]
    ),
    outputDescription: "Returns the applied smart plan and linked suggestion ids.",
    parser: smartApplySuggestionSetSchema
  },
  {
    kind: "command",
    name: "smart.rejectSuggestion",
    category: "smart",
    description: "Mark a smart suggestion as rejected without mutating the timeline.",
    requiredScopes: ["edit"],
    safetyClass: "mutating",
    mutability: "write",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory."),
        suggestionSetId: stringProperty("Suggestion set id."),
        suggestionId: stringProperty("Suggestion id.")
      },
      ["directory", "suggestionSetId", "suggestionId"]
    ),
    outputDescription: "Returns the updated suggestion set with the rejected status recorded.",
    parser: smartRejectSuggestionSchema
  },
  {
    kind: "command",
    name: "smart.seekPreviewToSuggestion",
    category: "smart",
    description: "Load or seek the preview session to a smart suggestion range for review.",
    requiredScopes: ["preview"],
    safetyClass: "mutating",
    mutability: "write",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory."),
        suggestionSetId: stringProperty("Suggestion set id."),
        suggestionId: stringProperty("Suggestion id."),
        anchor: enumProperty(
          ["start", "midpoint", "end"],
          "Which point inside the suggestion range should be used for preview seek."
        )
      },
      ["directory", "suggestionSetId", "suggestionId"]
    ),
    outputDescription:
      "Returns the resolved suggestion id, preview seek position, whether the timeline had to be loaded, and the resulting preview state.",
    parser: smartSuggestionPreviewSchema
  },
  {
    kind: "command",
    name: "workflow.start",
    category: "workflow",
    description: "Instantiate and queue a built-in workflow run.",
    requiredScopes: ["edit"],
    safetyClass: "high-impact",
    mutability: "write",
    execution: "job",
    returnsJob: true,
    longRunning: true,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory."),
        templateId: enumProperty(
          [
            "captioned-export-v1",
            "smart-cleanup-v1",
            "short-clip-candidates-v1",
            "batch-caption-export-v1"
          ],
          "Built-in workflow template id."
        ),
        input: objectProperty("Workflow input payload.", {}, [])
      },
      ["directory", "templateId", "input"]
    ),
    outputDescription: "Returns the updated workflow session snapshot and queued workflow run.",
    parser: workflowStartSchema
  },
  {
    kind: "command",
    name: "workflow.startBatch",
    category: "workflow",
    description: "Instantiate and queue a built-in batch workflow run.",
    requiredScopes: ["edit"],
    safetyClass: "high-impact",
    mutability: "write",
    execution: "job",
    returnsJob: true,
    longRunning: true,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory."),
        templateId: enumProperty(["batch-caption-export-v1"], "Batch workflow template id."),
        input: objectProperty("Batch workflow input payload.", {}, [])
      },
      ["directory", "templateId", "input"]
    ),
    outputDescription: "Returns the updated workflow session snapshot and queued batch workflow run.",
    parser: workflowStartBatchSchema
  },
  {
    kind: "command",
    name: "workflow.cancelRun",
    category: "workflow",
    description: "Cancel an active or queued workflow run.",
    requiredScopes: ["edit"],
    safetyClass: "high-impact",
    mutability: "write",
    execution: "job",
    returnsJob: true,
    longRunning: true,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory."),
        workflowRunId: stringProperty("Workflow run id.")
      },
      ["directory", "workflowRunId"]
    ),
    outputDescription: "Returns the updated workflow run state.",
    parser: workflowRunSchema
  },
  {
    kind: "command",
    name: "workflow.resumeRun",
    category: "workflow",
    description: "Resume a paused, failed, or approval-blocked workflow run.",
    requiredScopes: ["edit"],
    safetyClass: "high-impact",
    mutability: "write",
    execution: "job",
    returnsJob: true,
    longRunning: true,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory."),
        workflowRunId: stringProperty("Workflow run id.")
      },
      ["directory", "workflowRunId"]
    ),
    outputDescription: "Returns the updated workflow run state after re-queueing.",
    parser: workflowRunSchema
  },
  {
    kind: "command",
    name: "workflow.retryStep",
    category: "workflow",
    description: "Reset one failed workflow step and re-queue the workflow run.",
    requiredScopes: ["edit"],
    safetyClass: "high-impact",
    mutability: "write",
    execution: "job",
    returnsJob: true,
    longRunning: true,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory."),
        workflowRunId: stringProperty("Workflow run id."),
        stepRunId: stringProperty("Workflow step run id.")
      },
      ["directory", "workflowRunId", "stepRunId"]
    ),
    outputDescription: "Returns the updated workflow run state after step reset.",
    parser: workflowRetryStepSchema
  },
  {
    kind: "command",
    name: "workflow.approveStep",
    category: "workflow",
    description: "Approve a waiting workflow checkpoint and allow the run to continue.",
    requiredScopes: ["edit"],
    safetyClass: "high-impact",
    mutability: "write",
    execution: "job",
    returnsJob: true,
    longRunning: true,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory."),
        workflowRunId: stringProperty("Workflow run id."),
        approvalId: stringProperty("Approval id.")
      },
      ["directory", "workflowRunId", "approvalId"]
    ),
    outputDescription: "Returns the updated workflow run after approval.",
    parser: workflowApprovalSchema
  },
  {
    kind: "command",
    name: "workflow.rejectStep",
    category: "workflow",
    description: "Reject a waiting workflow checkpoint and halt the run.",
    requiredScopes: ["edit"],
    safetyClass: "high-impact",
    mutability: "write",
    execution: "job",
    returnsJob: true,
    longRunning: true,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory."),
        workflowRunId: stringProperty("Workflow run id."),
        approvalId: stringProperty("Approval id.")
      },
      ["directory", "workflowRunId", "approvalId"]
    ),
    outputDescription: "Returns the updated workflow run after rejection.",
    parser: workflowApprovalSchema
  },
  {
    kind: "command",
    name: "brandKits.create",
    category: "brand-kits",
    description: "Create a reusable local brand kit for caption and export workflows.",
    requiredScopes: ["edit"],
    safetyClass: "mutating",
    mutability: "write",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory."),
        brandKit: objectProperty("Brand kit definition.", {}, [])
      },
      ["directory", "brandKit"]
    ),
    outputDescription: "Returns the updated workflow session snapshot and created brand-kit id.",
    parser: brandKitCreateSchema
  },
  {
    kind: "command",
    name: "brandKits.update",
    category: "brand-kits",
    description: "Update a reusable local brand kit.",
    requiredScopes: ["edit"],
    safetyClass: "mutating",
    mutability: "write",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory."),
        brandKitId: stringProperty("Brand kit id."),
        brandKit: objectProperty("Brand kit definition.", {}, [])
      },
      ["directory", "brandKitId", "brandKit"]
    ),
    outputDescription: "Returns the updated workflow session snapshot and updated brand-kit id.",
    parser: brandKitUpdateSchema
  },
  {
    kind: "command",
    name: "brandKits.setDefault",
    category: "brand-kits",
    description: "Set or clear the project default brand kit.",
    requiredScopes: ["edit"],
    safetyClass: "mutating",
    mutability: "write",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory."),
        brandKitId: stringProperty("Brand kit id.", { nullable: true })
      },
      ["directory", "brandKitId"]
    ),
    outputDescription: "Returns the updated workflow session snapshot and project default brand-kit id.",
    parser: brandKitSetDefaultSchema
  },
  {
    kind: "command",
    name: "export.createRequest",
    category: "export",
    description: "Validate and normalize an export request without running FFmpeg.",
    requiredScopes: ["export"],
    safetyClass: "mutating",
    mutability: "write",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory."),
        request: objectProperty(
          "Structured export request.",
          {
            timelineId: stringProperty("Timeline id."),
            exportMode: enumProperty(["video", "audio", "frame"], "Requested export mode."),
            presetId: enumProperty(
              ["video-master-1080p", "video-share-720p", "audio-podcast-aac"],
              "Built-in preset id."
            ),
            outputPath: stringProperty("Optional explicit output path.", { nullable: true }),
            overwritePolicy: enumProperty(["increment", "replace"], "Output overwrite behavior.")
          },
          ["timelineId"]
        )
      },
      ["directory", "request"]
    ),
    outputDescription: "Returns the normalized export request.",
    parser: exportRequestCommandSchema
  },
  {
    kind: "command",
    name: "export.compilePlan",
    category: "export",
    description: "Compile a render plan and FFmpeg execution spec for a request.",
    requiredScopes: ["export"],
    safetyClass: "mutating",
    mutability: "write",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory."),
        request: objectProperty("Structured export request.", {}, [])
      },
      ["directory", "request"]
    ),
    outputDescription: "Returns the compiled render plan and FFmpeg execution spec.",
    parser: exportRequestCommandSchema
  },
  {
    kind: "command",
    name: "export.start",
    category: "export",
    description: "Start a deterministic export job for a timeline request.",
    requiredScopes: ["export"],
    safetyClass: "high-impact",
    mutability: "write",
    execution: "job",
    returnsJob: true,
    longRunning: true,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory."),
        request: objectProperty("Structured export request.", {}, [])
      },
      ["directory", "request"]
    ),
    outputDescription: "Returns the updated export session snapshot and queued export run.",
    parser: exportRequestCommandSchema
  },
  {
    kind: "command",
    name: "export.captureSnapshot",
    category: "export",
    description: "Capture a representative still from an export run or timeline position.",
    requiredScopes: ["export"],
    safetyClass: "mutating",
    mutability: "write",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory."),
        request: objectProperty(
          "Export frame snapshot request.",
          {
            sourceKind: enumProperty(["export-run", "timeline"], "Snapshot source kind.")
          },
          ["sourceKind"]
        )
      },
      ["directory", "request"]
    ),
    outputDescription: "Returns a structured export snapshot artifact reference.",
    parser: exportCaptureSnapshotSchema
  },
  {
    kind: "command",
    name: "export.cancel",
    category: "export",
    description: "Cancel an active export run.",
    requiredScopes: ["export"],
    safetyClass: "high-impact",
    mutability: "write",
    execution: "job",
    returnsJob: true,
    longRunning: true,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory."),
        exportRunId: stringProperty("Export run id to cancel.")
      },
      ["directory", "exportRunId"]
    ),
    outputDescription: "Returns the updated export session snapshot and export run state.",
    parser: exportCancelSchema
  },
  {
    kind: "command",
    name: "export.retry",
    category: "export",
    description: "Retry a failed export run as a fresh run.",
    requiredScopes: ["export"],
    safetyClass: "high-impact",
    mutability: "write",
    execution: "job",
    returnsJob: true,
    longRunning: true,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory."),
        exportRunId: stringProperty("Export run id to retry.")
      },
      ["directory", "exportRunId"]
    ),
    outputDescription: "Returns the updated export session snapshot and new export run state.",
    parser: exportCancelSchema
  },
  {
    kind: "command",
    name: "jobs.retry",
    category: "jobs",
    description: "Retry a failed ingest, export, or transcription job.",
    requiredScopes: ["edit"],
    safetyClass: "high-impact",
    mutability: "write",
    execution: "job",
    returnsJob: true,
    longRunning: true,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory."),
        jobId: stringProperty("ClawCut job id.")
      },
      ["directory", "jobId"]
    ),
    outputDescription: "Returns the updated project snapshot after retry scheduling.",
    parser: retryJobSchema
  },
  {
    kind: "command",
    name: "jobs.cancel",
    category: "jobs",
    description: "Cancel a supported long-running job.",
    requiredScopes: ["export"],
    safetyClass: "high-impact",
    mutability: "write",
    execution: "job",
    returnsJob: true,
    longRunning: true,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory."),
        jobId: stringProperty("ClawCut job id.")
      },
      ["directory", "jobId"]
    ),
    outputDescription: "Returns the updated job-linked export state when cancellation is supported.",
    parser: cancelJobSchema
  }
];

const QUERY_DEFINITIONS: QueryDefinition[] = [
  {
    kind: "query",
    name: "system.toolchain",
    category: "system",
    description: "Return ffmpeg, ffprobe, and transcription readiness.",
    requiredScopes: ["read"],
    safetyClass: "read-only",
    mutability: "read",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema({}, []),
    outputDescription: "Returns the local toolchain status.",
    parser: emptyObjectSchema
  },
  {
    kind: "query",
    name: "project.summary",
    category: "project",
    description: "Return a compact machine-readable project summary.",
    requiredScopes: ["read"],
    safetyClass: "read-only",
    mutability: "read",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory.")
      },
      ["directory"]
    ),
    outputDescription: "Returns project identity, counts, and current timeline summary.",
    parser: directorySchema
  },
  {
    kind: "query",
    name: "project.snapshot",
    category: "project",
    description: "Return the canonical project workspace snapshot.",
    requiredScopes: ["read"],
    safetyClass: "read-only",
    mutability: "read",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory.")
      },
      ["directory"]
    ),
    outputDescription: "Returns the full project workspace snapshot.",
    parser: directorySchema
  },
  {
    kind: "query",
    name: "media.list",
    category: "media",
    description: "Return project media items and current jobs.",
    requiredScopes: ["read"],
    safetyClass: "read-only",
    mutability: "read",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory.")
      },
      ["directory"]
    ),
    outputDescription: "Returns media items and current jobs.",
    legacyNames: ["media.snapshot"],
    parser: directorySchema
  },
  {
    kind: "query",
    name: "media.inspect",
    category: "media",
    description: "Inspect a single media item.",
    requiredScopes: ["read"],
    safetyClass: "read-only",
    mutability: "read",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory."),
        mediaItemId: stringProperty("ClawCut media item id.")
      },
      ["directory", "mediaItemId"]
    ),
    outputDescription: "Returns the requested media item or null.",
    parser: mediaInspectSchema
  },
  {
    kind: "query",
    name: "timeline.get",
    category: "timeline",
    description: "Return the current editor session snapshot including timeline and history.",
    requiredScopes: ["read"],
    safetyClass: "read-only",
    mutability: "read",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory.")
      },
      ["directory"]
    ),
    outputDescription: "Returns the full editor session snapshot.",
    legacyNames: ["timeline.session"],
    parser: directorySchema
  },
  {
    kind: "query",
    name: "preview.state",
    category: "preview",
    description: "Return the current desktop preview state.",
    requiredScopes: ["preview"],
    safetyClass: "read-only",
    mutability: "read",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema({}, []),
    outputDescription: "Returns the current preview state.",
    parser: emptyObjectSchema
  },
  {
    kind: "query",
    name: "preview.frame-snapshot",
    category: "preview",
    description: "Capture a preview frame snapshot including inline image data when available.",
    requiredScopes: ["preview"],
    safetyClass: "read-only",
    mutability: "read",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema(
      {
        options: objectProperty(
          "Optional preview frame snapshot options.",
          {
            maxWidth: integerProperty("Maximum output width.", { nullable: true }),
            mimeType: enumProperty(["image/png", "image/jpeg"], "Requested image mime type."),
            quality: {
              type: "number",
              description: "JPEG quality from 0 to 1."
            }
          },
          []
        )
      },
      []
    ),
    outputDescription: "Returns the preview frame snapshot payload.",
    parser: previewFrameSchema
  },
  {
    kind: "query",
    name: "preview.frame-reference",
    category: "preview",
    description: "Return a structured preview frame reference without requiring inline image data.",
    requiredScopes: ["preview"],
    safetyClass: "read-only",
    mutability: "read",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema(
      {
        options: objectProperty("Optional preview frame snapshot options.", {}, [])
      },
      []
    ),
    outputDescription: "Returns timing, clip identity, source mode, dimensions, and warning/error state.",
    parser: previewFrameSchema
  },
  {
    kind: "query",
    name: "export.session",
    category: "export",
    description: "Return export runs, diagnostics, and output metadata for a project.",
    requiredScopes: ["read"],
    safetyClass: "read-only",
    mutability: "read",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory.")
      },
      ["directory"]
    ),
    outputDescription: "Returns the export session snapshot.",
    parser: directorySchema
  },
  {
    kind: "query",
    name: "transcript.get",
    category: "transcript",
    description: "Return transcript status, summary, and the latest run for a transcript.",
    requiredScopes: ["read"],
    safetyClass: "read-only",
    mutability: "read",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory."),
        transcriptId: stringProperty("Transcript id.")
      },
      ["directory", "transcriptId"]
    ),
    outputDescription: "Returns transcript, summary, and run state.",
    parser: transcriptGetSchema
  },
  {
    kind: "query",
    name: "captions.session",
    category: "captions",
    description: "Return transcript, caption, and transcription-run state for a project.",
    requiredScopes: ["read"],
    safetyClass: "read-only",
    mutability: "read",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory.")
      },
      ["directory"]
    ),
    outputDescription: "Returns the caption session snapshot.",
    parser: directorySchema
  },
  {
    kind: "query",
    name: "captions.track",
    category: "captions",
    description: "Return a single caption track state.",
    requiredScopes: ["read"],
    safetyClass: "read-only",
    mutability: "read",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory."),
        captionTrackId: stringProperty("Caption track id.")
      },
      ["directory", "captionTrackId"]
    ),
    outputDescription: "Returns the requested caption track state.",
    parser: captionTrackGetSchema
  },
  {
    kind: "query",
    name: "smart.session",
    category: "smart",
    description: "Return persisted smart suggestion sets, edit plans, and analysis runs for a project.",
    requiredScopes: ["read"],
    safetyClass: "read-only",
    mutability: "read",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory.")
      },
      ["directory"]
    ),
    outputDescription: "Returns the smart session snapshot.",
    parser: directorySchema
  },
  {
    kind: "query",
    name: "smart.suggestionSet",
    category: "smart",
    description: "Return one smart suggestion set.",
    requiredScopes: ["read"],
    safetyClass: "read-only",
    mutability: "read",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory."),
        suggestionSetId: stringProperty("Suggestion set id.")
      },
      ["directory", "suggestionSetId"]
    ),
    outputDescription: "Returns the requested suggestion set result.",
    parser: smartSuggestionSetQuerySchema
  },
  {
    kind: "query",
    name: "smart.suggestion",
    category: "smart",
    description: "Return one smart suggestion with confidence, rationale, and evidence.",
    requiredScopes: ["read"],
    safetyClass: "read-only",
    mutability: "read",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory."),
        suggestionSetId: stringProperty("Suggestion set id."),
        suggestionId: stringProperty("Suggestion id.")
      },
      ["directory", "suggestionSetId", "suggestionId"]
    ),
    outputDescription: "Returns the requested suggestion result.",
    parser: smartSuggestionQuerySchema
  },
  {
    kind: "query",
    name: "workflow.session",
    category: "workflow",
    description: "Return the workflow library, brand kits, workflow runs, and pending approvals for a project.",
    requiredScopes: ["read"],
    safetyClass: "read-only",
    mutability: "read",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory.")
      },
      ["directory"]
    ),
    outputDescription: "Returns the workflow session snapshot.",
    parser: directorySchema
  },
  {
    kind: "query",
    name: "workflow.list",
    category: "workflow",
    description: "List built-in workflow templates available in this ClawCut build.",
    requiredScopes: ["read"],
    safetyClass: "read-only",
    mutability: "read",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory.")
      },
      ["directory"]
    ),
    outputDescription: "Returns built-in workflow template definitions.",
    parser: directorySchema
  },
  {
    kind: "query",
    name: "workflow.inspect",
    category: "workflow",
    description: "Inspect one built-in workflow template and its inputs, safety profile, and expected outputs.",
    requiredScopes: ["read"],
    safetyClass: "read-only",
    mutability: "read",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory."),
        workflowId: stringProperty("Workflow template id.")
      },
      ["directory", "workflowId"]
    ),
    outputDescription: "Returns one workflow template or null when it is unavailable.",
    parser: workflowTemplateQuerySchema
  },
  {
    kind: "query",
    name: "workflow.runs",
    category: "workflow",
    description: "List persisted workflow runs for the project.",
    requiredScopes: ["read"],
    safetyClass: "read-only",
    mutability: "read",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory.")
      },
      ["directory"]
    ),
    outputDescription: "Returns all known workflow runs.",
    parser: directorySchema
  },
  {
    kind: "query",
    name: "workflow.run",
    category: "workflow",
    description: "Return a single workflow run including step, approval, batch, and artifact state.",
    requiredScopes: ["read"],
    safetyClass: "read-only",
    mutability: "read",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory."),
        workflowRunId: stringProperty("Workflow run id.")
      },
      ["directory", "workflowRunId"]
    ),
    outputDescription: "Returns one workflow run or null when it is unavailable.",
    parser: workflowRunSchema
  },
  {
    kind: "query",
    name: "workflow.approvals",
    category: "workflow",
    description: "List pending workflow approvals for the project.",
    requiredScopes: ["read"],
    safetyClass: "read-only",
    mutability: "read",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory.")
      },
      ["directory"]
    ),
    outputDescription: "Returns pending workflow approval records.",
    parser: directorySchema
  },
  {
    kind: "query",
    name: "workflow.artifacts",
    category: "workflow",
    description: "List explicit workflow artifacts for a workflow run.",
    requiredScopes: ["read"],
    safetyClass: "read-only",
    mutability: "read",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory."),
        workflowRunId: stringProperty("Workflow run id.")
      },
      ["directory", "workflowRunId"]
    ),
    outputDescription: "Returns workflow artifact records for the requested run.",
    parser: workflowRunSchema
  },
  {
    kind: "query",
    name: "workflow.artifact",
    category: "workflow",
    description: "Inspect one workflow artifact record.",
    requiredScopes: ["read"],
    safetyClass: "read-only",
    mutability: "read",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory."),
        workflowRunId: stringProperty("Workflow run id."),
        artifactId: stringProperty("Workflow artifact id.")
      },
      ["directory", "workflowRunId", "artifactId"]
    ),
    outputDescription: "Returns one workflow artifact record or null when it is unavailable.",
    parser: workflowArtifactQuerySchema
  },
  {
    kind: "query",
    name: "brandKits.list",
    category: "brand-kits",
    description: "List built-in and local reusable brand kits.",
    requiredScopes: ["read"],
    safetyClass: "read-only",
    mutability: "read",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory.")
      },
      ["directory"]
    ),
    outputDescription: "Returns all known brand kits resolved for the current environment.",
    parser: directorySchema
  },
  {
    kind: "query",
    name: "jobs.list",
    category: "jobs",
    description: "Return the current job list for a project.",
    requiredScopes: ["read"],
    safetyClass: "read-only",
    mutability: "read",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory.")
      },
      ["directory"]
    ),
    outputDescription: "Returns all known jobs for the project.",
    parser: directorySchema
  },
  {
    kind: "query",
    name: "jobs.get",
    category: "jobs",
    description: "Return a single job and related export/transcription details when available.",
    requiredScopes: ["read"],
    safetyClass: "read-only",
    mutability: "read",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    inputSchema: objectSchema(
      {
        directory: stringProperty("Absolute project directory."),
        jobId: stringProperty("ClawCut job id.")
      },
      ["directory", "jobId"]
    ),
    outputDescription: "Returns one job plus related export or transcription run details.",
    parser: retryJobSchema
  }
];

const COMMAND_DEFINITION_MAP = new Map(COMMAND_DEFINITIONS.map((definition) => [definition.name, definition]));
const QUERY_DEFINITION_MAP = new Map(QUERY_DEFINITIONS.map((definition) => [definition.name, definition]));
const COMMAND_ALIAS_MAP = new Map<string, LocalApiCommandName>(
  COMMAND_DEFINITIONS.flatMap((definition) =>
    (definition.legacyNames ?? []).map(
      (alias) => [alias, definition.name as LocalApiCommandName] as const
    )
  )
);
const QUERY_ALIAS_MAP = new Map<string, LocalApiQueryName>(
  QUERY_DEFINITIONS.flatMap((definition) =>
    (definition.legacyNames ?? []).map(
      (alias) => [alias, definition.name as LocalApiQueryName] as const
    )
  )
);

const openProjectToolInputSchema = objectSchema(
  {
    directory: stringProperty("Absolute path to the ClawCut project directory.")
  },
  ["directory"]
);
const trimClipToolSchema = objectSchema(
  {
    directory: stringProperty("Absolute project directory."),
    timelineId: stringProperty("Timeline id."),
    clipId: stringProperty("Clip id to trim."),
    edge: enumProperty(["start", "end"], "Which clip edge to trim."),
    positionUs: integerProperty("New edge position in microseconds.")
  },
  ["directory", "timelineId", "clipId", "edge", "positionUs"]
);
const previewFrameToolSchema = objectSchema(
  {
    options: objectProperty(
      "Optional frame capture or frame reference preferences.",
      {
        maxWidth: integerProperty("Maximum output width.", { nullable: true }),
        mimeType: enumProperty(["image/png", "image/jpeg"], "Requested image mime type."),
        quality: {
          type: "number",
          description: "JPEG quality from 0 to 1."
        },
        includeImageData: booleanProperty(
          "When true, request the heavier preview.frame-snapshot payload instead of the lighter frame reference."
        )
      },
      []
    )
  },
  []
);

const OPENCLAW_TOOL_RECORDS: OpenClawToolDefinitionRecord[] = [
  createToolRecord({
    name: "clawcut.open_project",
    category: "project",
    description: "Open a ClawCut project directory.",
    operationType: "command",
    operationName: "project.open",
    requiredScopes: ["read"],
    safetyClass: "mutating",
    mutability: "write",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    availableByDefault: false,
    safetyNotes: ["Local filesystem access only.", "Project validation still runs inside ClawCut."],
    inputSchema: openProjectToolInputSchema,
    outputDescription: "Returns the refreshed project workspace snapshot."
  }),
  createToolRecord({
    name: "clawcut.get_project_summary",
    category: "project",
    description: "Inspect the current project summary.",
    operationType: "query",
    operationName: "project.summary",
    requiredScopes: ["read"],
    safetyClass: "read-only",
    mutability: "read",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    availableByDefault: true,
    safetyNotes: ["Read-only query."],
    inputSchema: openProjectToolInputSchema,
    outputDescription: "Returns project identity, counts, and current timeline information."
  }),
  createToolRecord({
    name: "clawcut.save_project",
    category: "project",
    description: "Confirm a project has been persisted.",
    operationType: "command",
    operationName: "project.save",
    requiredScopes: ["edit"],
    safetyClass: "mutating",
    mutability: "write",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    availableByDefault: false,
    safetyNotes: ["Writes project persistence metadata only through ClawCut."],
    inputSchema: openProjectToolInputSchema,
    outputDescription: "Returns project persistence confirmation metadata."
  }),
  createToolRecordFromOperation("clawcut.import_media", "media.import", false, ["Queues ingest jobs."]),
  createToolRecordFromOperation("clawcut.list_media", "media.list", true, ["Read-only query."]),
  createToolRecordFromOperation("clawcut.inspect_media", "media.inspect", true, ["Read-only query."]),
  createToolRecordFromOperation("clawcut.relink_media", "media.relink", false, [
    "High-impact mutation because it changes project media references."
  ]),
  createToolRecordFromOperation("clawcut.get_timeline", "timeline.get", true, ["Read-only query."]),
  createToolRecordFromOperation("clawcut.insert_clip", "timeline.insertClip", false, [
    "Timeline validation and overlap rules still run inside ClawCut."
  ]),
  createToolRecordFromOperation("clawcut.split_clip", "timeline.splitClip", false, [
    "Timeline validation still runs inside ClawCut."
  ]),
  createToolRecord({
    name: "clawcut.trim_clip",
    category: "timeline",
    description: "Trim either the start or end edge of a clip.",
    operationType: "command",
    operationName: "timeline.trimClip",
    requiredScopes: ["edit"],
    safetyClass: "mutating",
    mutability: "write",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    availableByDefault: false,
    safetyNotes: ["Timeline validation still runs inside ClawCut."],
    inputSchema: trimClipToolSchema,
    outputDescription: "Returns the updated editor session snapshot and trim result."
  }),
  createToolRecordFromOperation("clawcut.move_clip", "timeline.moveClip", false, [
    "Timeline validation and snapping still run inside ClawCut."
  ]),
  createToolRecordFromOperation("clawcut.load_preview", "preview.loadTimeline", false, [
    "Requires a live desktop preview session."
  ]),
  createToolRecordFromOperation("clawcut.seek_preview", "preview.seek", false, [
    "Acts on the current desktop preview session."
  ]),
  createToolRecordFromOperation("clawcut.get_preview_state", "preview.state", true, [
    "Read-only query."
  ]),
  createToolRecord({
    name: "clawcut.capture_preview_frame",
    category: "preview",
    description: "Inspect or capture the current preview frame.",
    operationType: "query",
    operationName: "preview.captureFrame",
    requiredScopes: ["preview"],
    safetyClass: "read-only",
    mutability: "read",
    execution: "sync",
    returnsJob: false,
    longRunning: false,
    availableByDefault: true,
    safetyNotes: ["Acts on the active local desktop preview session."],
    inputSchema: previewFrameToolSchema,
    outputDescription:
      "Returns a preview frame reference by default and can request a heavier snapshot payload when needed."
  }),
  createToolRecordFromOperation("clawcut.transcribe_clip", "transcript.transcribeClip", false, [
    "Starts a transcription job and returns job-linked state."
  ]),
  createToolRecordFromOperation("clawcut.get_transcript", "transcript.get", true, ["Read-only query."]),
  createToolRecordFromOperation("clawcut.generate_captions", "captions.generateTrack", false, [
    "Creates or updates caption tracks from transcript data."
  ]),
  createToolRecordFromOperation("clawcut.apply_caption_template", "captions.applyTemplate", false, [
    "Caption template validation still runs inside ClawCut."
  ]),
  createToolRecordFromOperation("clawcut.export_subtitles", "captions.exportSubtitles", false, [
    "Writes a sidecar subtitle artifact."
  ]),
  createToolRecordFromOperation("clawcut.analyze_silence", "smart.analyzeSilence", true, [
    "Read-only analysis. Produces reviewable suggestion artifacts without mutating the timeline."
  ]),
  createToolRecordFromOperation("clawcut.find_filler_words", "smart.findFillerWords", true, [
    "Read-only analysis. Uses explainable transcript heuristics."
  ]),
  createToolRecordFromOperation("clawcut.generate_highlight_suggestions", "smart.generateHighlights", true, [
    "Read-only analysis. Generates reviewable highlight candidates."
  ]),
  createToolRecordFromOperation("clawcut.list_suggestions", "smart.session", true, [
    "Read-only query."
  ]),
  createToolRecordFromOperation("clawcut.inspect_suggestion", "smart.suggestion", true, [
    "Read-only query."
  ]),
  createToolRecordFromOperation("clawcut.preview_suggestion", "smart.suggestion", true, [
    "Read-only suggestion inspection. Combine with preview seek tools for visual review."
  ]),
  createToolRecordFromOperation("clawcut.seek_preview_to_suggestion", "smart.seekPreviewToSuggestion", false, [
    "Loads the correct timeline if needed, then seeks the live desktop preview session to the suggestion range."
  ]),
  createToolRecordFromOperation("clawcut.compile_edit_plan", "smart.compilePlan", true, [
    "Compiles a dry-run plan without mutating the timeline."
  ]),
  createToolRecordFromOperation("clawcut.apply_suggestion", "smart.applySuggestion", false, [
    "High-impact operation. Applies timeline mutations through the ClawCut command engine."
  ]),
  createToolRecordFromOperation("clawcut.apply_suggestion_set", "smart.applySuggestionSet", false, [
    "High-impact operation. Applies multiple timeline mutations through the ClawCut command engine."
  ]),
  createToolRecordFromOperation("clawcut.reject_suggestion", "smart.rejectSuggestion", false, [
    "Mutates suggestion review state without changing the timeline."
  ]),
  createToolRecordFromOperation("clawcut.list_workflows", "workflow.list", true, [
    "Read-only query."
  ]),
  createToolRecordFromOperation("clawcut.inspect_workflow", "workflow.inspect", true, [
    "Read-only query."
  ]),
  createToolRecordFromOperation("clawcut.list_brand_kits", "brandKits.list", true, [
    "Read-only query."
  ]),
  createToolRecordFromOperation("clawcut.start_workflow", "workflow.start", false, [
    "Starts a high-impact workflow run built from existing ClawCut commands and jobs."
  ]),
  createToolRecordFromOperation("clawcut.start_batch_workflow", "workflow.startBatch", false, [
    "Starts a batch workflow run over multiple targets in one project."
  ]),
  createToolRecordFromOperation("clawcut.query_workflow_run", "workflow.run", true, [
    "Read-only query."
  ]),
  createToolRecordFromOperation("clawcut.list_workflow_runs", "workflow.runs", true, [
    "Read-only query."
  ]),
  createToolRecordFromOperation("clawcut.cancel_workflow_run", "workflow.cancelRun", false, [
    "High-impact operation. Cancels a queued or active workflow run."
  ]),
  createToolRecordFromOperation("clawcut.retry_workflow_step", "workflow.retryStep", false, [
    "High-impact operation. Requeues a failed workflow step."
  ]),
  createToolRecordFromOperation("clawcut.resume_workflow_run", "workflow.resumeRun", false, [
    "High-impact operation. Resumes a paused or approval-blocked workflow run."
  ]),
  createToolRecordFromOperation("clawcut.list_pending_approvals", "workflow.approvals", true, [
    "Read-only query."
  ]),
  createToolRecordFromOperation("clawcut.approve_workflow_step", "workflow.approveStep", false, [
    "High-impact operation. Explicitly crosses an approval boundary."
  ]),
  createToolRecordFromOperation("clawcut.reject_workflow_step", "workflow.rejectStep", false, [
    "High-impact operation. Rejects a waiting approval and halts the workflow."
  ]),
  createToolRecordFromOperation("clawcut.list_workflow_artifacts", "workflow.artifacts", true, [
    "Read-only query."
  ]),
  createToolRecordFromOperation("clawcut.inspect_workflow_artifact", "workflow.artifact", true, [
    "Read-only query."
  ]),
  createToolRecordFromOperation("clawcut.start_export", "export.start", false, [
    "Starts a long-running export job."
  ]),
  createToolRecordFromOperation("clawcut.query_job", "jobs.get", true, ["Read-only query."]),
  createToolRecordFromOperation("clawcut.list_jobs", "jobs.list", true, ["Read-only query."]),
  createToolRecordFromOperation("clawcut.cancel_job", "jobs.cancel", false, [
    "Only supported for job kinds ClawCut can cancel safely."
  ])
];

const OPENCLAW_TOOL_RECORD_MAP = new Map(
  OPENCLAW_TOOL_RECORDS.map((record) => [record.definition.name, record])
);

function createToolRecord(definition: OpenClawToolDefinition): OpenClawToolDefinitionRecord {
  let parser: z.ZodType<unknown>;
  let mapper: (input: unknown) => OpenClawToolInvocation;

  switch (definition.name) {
    case "clawcut.capture_preview_frame":
      parser = z.object({
        options: z
          .object({
            maxWidth: z.number().int().positive().optional(),
            mimeType: z.enum(["image/png", "image/jpeg"]).optional(),
            quality: z.number().min(0).max(1).optional(),
            includeImageData: z.boolean().optional()
          })
          .optional()
      });
      mapper = (input) => {
        const parsed = parser.parse(input) as {
          options?: {
            maxWidth?: number;
            mimeType?: "image/png" | "image/jpeg";
            quality?: number;
            includeImageData?: boolean;
          };
        };
        const includeImageData = parsed.options?.includeImageData ?? false;
        const options = parsed.options
          ? {
              maxWidth: parsed.options.maxWidth,
              mimeType: parsed.options.mimeType,
              quality: parsed.options.quality
            }
          : {};

        return {
          operationType: "query",
          name: includeImageData ? "preview.frame-snapshot" : "preview.frame-reference",
          input: Object.keys(options).length > 0 ? { options } : {}
        };
      };
      break;
    case "clawcut.trim_clip":
      parser = z.object({
        directory: nonEmptyString,
        timelineId: nonEmptyString,
        clipId: nonEmptyString,
        edge: z.enum(["start", "end"]),
        positionUs: nonNegativeInt
      });
      mapper = (input) => {
        const parsed = parser.parse(input) as {
          directory: string;
          timelineId: string;
          clipId: string;
          edge: "start" | "end";
          positionUs: number;
        };

        return parsed.edge === "start"
          ? {
              operationType: "command",
              name: "timeline.trimClipStart",
              input: {
                directory: parsed.directory,
                timelineId: parsed.timelineId,
                clipId: parsed.clipId,
                newTimelineStartUs: parsed.positionUs
              }
            }
          : {
              operationType: "command",
              name: "timeline.trimClipEnd",
              input: {
                directory: parsed.directory,
                timelineId: parsed.timelineId,
                clipId: parsed.clipId,
                newTimelineEndUs: parsed.positionUs
              }
            };
      };
      break;
    default:
      parser = z.object({}).passthrough();
      mapper = (input) => ({
        operationType: definition.operationType,
        name: definition.operationName as LocalApiCommandName | LocalApiQueryName,
        input: parser.parse(input)
      });
      break;
  }

  return {
    definition,
    parser,
    mapToInvocation: mapper
  };
}

function createToolRecordFromOperation(
  toolName: string,
  operationName: LocalApiCommandName | LocalApiQueryName,
  availableByDefault: boolean,
  safetyNotes: string[]
): OpenClawToolDefinitionRecord {
  const definition = getLocalApiOperationDescriptor(operationName);

  if (!definition) {
    throw new Error(`Cannot create OpenClaw tool ${toolName} because ${operationName} is not registered.`);
  }

  return createToolRecord({
    name: toolName,
    category: definition.category,
    description: definition.description,
    operationType: definition.kind,
    operationName: definition.name,
    requiredScopes: definition.requiredScopes,
    safetyClass: definition.safetyClass,
    mutability: definition.mutability,
    execution: definition.execution,
    returnsJob: definition.returnsJob,
    longRunning: definition.longRunning,
    availableByDefault,
    safetyNotes,
    inputSchema: definition.inputSchema,
    outputDescription: definition.outputDescription
  });
}

export const LOCAL_API_COMMAND_DEFINITIONS: LocalApiOperationDescriptor[] = COMMAND_DEFINITIONS.map(
  (definition) => stripParser(definition)
);

export const LOCAL_API_QUERY_DEFINITIONS: LocalApiOperationDescriptor[] = QUERY_DEFINITIONS.map(
  (definition) => stripParser(definition)
);

export const OPENCLAW_TOOL_DEFINITIONS: OpenClawToolDefinition[] = OPENCLAW_TOOL_RECORDS.map(
  (record) => record.definition
);

export function getDefaultOpenClawToolNames(): string[] {
  return OPENCLAW_TOOL_DEFINITIONS.filter((tool) => tool.availableByDefault).map((tool) => tool.name);
}

export function getOptionalOpenClawToolNames(): string[] {
  return OPENCLAW_TOOL_DEFINITIONS.filter((tool) => !tool.availableByDefault).map((tool) => tool.name);
}

export function resolveLocalApiCommandName(name: string): LocalApiCommandName | null {
  if (COMMAND_DEFINITION_MAP.has(name as LocalApiCommandName)) {
    return name as LocalApiCommandName;
  }

  return COMMAND_ALIAS_MAP.get(name) ?? null;
}

export function resolveLocalApiQueryName(name: string): LocalApiQueryName | null {
  if (QUERY_DEFINITION_MAP.has(name as LocalApiQueryName)) {
    return name as LocalApiQueryName;
  }

  return QUERY_ALIAS_MAP.get(name) ?? null;
}

export function getLocalApiOperationDescriptor(
  name: LocalApiCommandName | LocalApiQueryName
): LocalApiOperationDescriptor | null {
  return COMMAND_DEFINITION_MAP.get(name as LocalApiCommandName) ??
    QUERY_DEFINITION_MAP.get(name as LocalApiQueryName) ??
    null;
}

export function parseLocalApiCommandInput<Name extends LocalApiCommandName>(
  name: Name,
  input: unknown
): LocalApiCommandInputMap[Name] {
  const definition = COMMAND_DEFINITION_MAP.get(name);

  if (!definition) {
    throw new Error(`Unsupported command ${name}`);
  }

  return definition.parser.parse(input) as LocalApiCommandInputMap[Name];
}

export function parseLocalApiQueryInput<Name extends LocalApiQueryName>(
  name: Name,
  input: unknown
): LocalApiQueryInputMap[Name] {
  const definition = QUERY_DEFINITION_MAP.get(name);

  if (!definition) {
    throw new Error(`Unsupported query ${name}`);
  }

  return definition.parser.parse(input) as LocalApiQueryInputMap[Name];
}

export function createLocalApiCapabilities(scopes: LocalApiScope[]): LocalApiCapabilities {
  return {
    apiVersion: "v1",
    protocolVersion: "1",
    localOnly: true,
    auth: {
      required: true,
      scheme: "bearer",
      headerName: "Authorization",
      tokenPrefix: "Bearer",
      scopes
    },
    endpoints: {
      health: "/api/v1/health",
      capabilities: "/api/v1/capabilities",
      openClawTools: "/api/v1/openclaw/tools",
      openClawManifest: "/api/v1/openclaw/manifest",
      command: "/api/v1/command",
      query: "/api/v1/query",
      events: "/api/v1/events"
    },
    commands: LOCAL_API_COMMAND_DEFINITIONS,
    queries: LOCAL_API_QUERY_DEFINITIONS,
    features: {
      localControlTransport: true,
      openClawPlugin: true,
      project: true,
      media: true,
      timeline: true,
      smartEditing: true,
      workflows: true,
      brandKits: true,
      preview: true,
      previewInspection: true,
      export: true,
      transcript: true,
      captions: true,
      jobs: true,
      openClawTools: true,
      openClawManifest: true,
      eventStream: true
    }
  };
}

export function createOpenClawToolManifest(capabilities: LocalApiCapabilities): OpenClawToolManifest {
  return {
    manifestVersion: "1",
    apiVersion: "v1",
    protocolVersion: "1",
    generatedAt: new Date().toISOString(),
    localOnly: true,
    auth: capabilities.auth,
    capabilityAvailability: capabilities.features,
    toolExposure: {
      defaultEnabled: getDefaultOpenClawToolNames(),
      optionalAllowlist: getOptionalOpenClawToolNames()
    },
    endpoints: {
      capabilities: capabilities.endpoints.capabilities,
      openClawTools: capabilities.endpoints.openClawTools,
      openClawManifest: capabilities.endpoints.openClawManifest,
      command: capabilities.endpoints.command,
      query: capabilities.endpoints.query,
      events: capabilities.endpoints.events
    },
    tools: OPENCLAW_TOOL_DEFINITIONS
  };
}

export function getOpenClawToolDefinition(name: string): OpenClawToolDefinition | null {
  return OPENCLAW_TOOL_RECORD_MAP.get(name)?.definition ?? null;
}

export function mapOpenClawToolInvocation(name: string, input: unknown): OpenClawToolInvocation | null {
  const record = OPENCLAW_TOOL_RECORD_MAP.get(name);

  if (!record) {
    return null;
  }

  return record.mapToInvocation(input);
}

export function parseOpenClawToolInput(name: string, input: unknown): unknown {
  const record = OPENCLAW_TOOL_RECORD_MAP.get(name);

  if (!record) {
    throw new Error(`Unsupported OpenClaw tool ${name}`);
  }

  return record.parser.parse(input);
}

export function buildProjectSummary(input: {
  directory: string;
  projectFilePath: string;
  projectName: string;
  timelineId: string;
  mediaItemCount: number;
  jobCount: number;
  transcriptCount: number;
  captionTrackCount: number;
  exportRunCount: number;
}): LocalApiProjectSummary {
  return {
    directory: input.directory,
    projectFilePath: input.projectFilePath,
    projectName: input.projectName,
    timelineId: input.timelineId,
    mediaItemCount: input.mediaItemCount,
    jobCount: input.jobCount,
    transcriptCount: input.transcriptCount,
    captionTrackCount: input.captionTrackCount,
    exportRunCount: input.exportRunCount
  };
}

function stripParser(definition: CommandDefinition | QueryDefinition): LocalApiOperationDescriptor {
  const { parser, ...descriptor } = definition;
  void parser;
  return descriptor;
}
