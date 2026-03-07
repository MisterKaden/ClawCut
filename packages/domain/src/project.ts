import { z } from "zod";

import { generateId } from "./id";
import {
  createEmptyDerivedAssetSet,
  createEmptyMetadataSummary,
  mediaItemSchema,
  type MediaFingerprint,
  type MediaItem,
  type MediaSourceType
} from "./media";
import {
  CAPTION_TEMPLATE_IDS,
  createDefaultCaptionExportDefaults,
  captionCollectionSchema,
  createEmptyCaptionCollection,
  createEmptyTranscriptCollection,
  transcriptCollectionSchema,
  type CaptionExportDefaults,
  type CaptionTrack,
  type CaptionCollection,
  type CaptionTemplateId,
  type Transcript,
  type TranscriptCollection
} from "./captions";
import { PROJECT_PREVIEW_DEFAULT_MODES, type ProjectPreviewDefaultMode } from "./preview";
import { DEFAULT_EXPORT_PRESET_ID, EXPORT_PRESET_IDS, type ExportPresetId } from "./render";
import { createEmptyTimeline, timelineSchema, type Timeline } from "./timeline";

export const PROJECT_SCHEMA_VERSION = 5;
export const PROJECT_FILE_NAME = "clawcut.project.json";
export const PROJECT_CACHE_DIRECTORY = ".clawcut";
export const PROJECT_DATABASE_NAME = "project.db";

export type ProjectSchemaVersion = typeof PROJECT_SCHEMA_VERSION;

export interface ProjectIdentity {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectMediaReferenceV1 {
  id: string;
  label: string;
  sourceType: MediaSourceType;
  originalPath: string;
  fixtureId?: string;
  addedAt: string;
}

export interface TimelineTrackV1 {
  id: string;
  kind: "video" | "audio" | "caption";
  name: string;
  clipIds: string[];
}

export interface TimelineRootV1 {
  id: string;
  tracks: TimelineTrackV1[];
}

export interface ProjectSettingsV1 {
  ingest?: {
    proxyPreset?: "stage2-standard-proxy";
  };
  preview: {
    defaultMode: ProjectPreviewDefaultMode;
  };
  captions: {
    defaultTemplate: "bottom-clean";
  };
  exports: {
    defaultPreset: "social-1080p";
  };
}

export interface ProjectSettingsLegacy {
  ingest: {
    proxyPreset: "stage2-standard-proxy";
  };
  preview: {
    defaultMode: ProjectPreviewDefaultMode;
  };
  captions: {
    defaultTemplate: "bottom-clean";
  };
  exports: {
    defaultPreset: "social-1080p";
  };
}

export interface ProjectSettingsV2 {
  ingest: {
    proxyPreset: "stage2-standard-proxy";
  };
  preview: {
    defaultMode: ProjectPreviewDefaultMode;
  };
  captions: {
    defaultTemplate: CaptionTemplateId;
  };
  exports: {
    defaultPreset: ExportPresetId;
  };
}

export interface ProjectLibraryV2 {
  items: MediaItem[];
}

export interface ProjectDocumentV1 {
  schemaVersion: 1;
  project: ProjectIdentity;
  settings: ProjectSettingsV1;
  media: ProjectMediaReferenceV1[];
  timeline: TimelineRootV1;
}

export interface ProjectDocumentV2 {
  schemaVersion: 2;
  project: ProjectIdentity;
  settings: ProjectSettingsLegacy;
  library: ProjectLibraryV2;
  timeline: TimelineRootV1;
}

export interface ProjectDocumentLegacyV3 {
  schemaVersion: 3;
  project: ProjectIdentity;
  settings: ProjectSettingsLegacy;
  library: ProjectLibraryV2;
  timeline: Timeline;
}

export interface ProjectDocumentV4 {
  schemaVersion: 4;
  project: ProjectIdentity;
  settings: ProjectSettingsV2;
  library: ProjectLibraryV2;
  timeline: Timeline;
}

export interface ProjectDocumentLegacyV4 {
  schemaVersion: 4;
  project: ProjectIdentity;
  settings: Omit<ProjectSettingsV2, "captions"> & {
    captions: {
      defaultTemplate: "bottom-clean" | CaptionTemplateId;
    };
  };
  library: ProjectLibraryV2;
  timeline: Timeline;
}

export interface ProjectDocumentV5 {
  schemaVersion: typeof PROJECT_SCHEMA_VERSION;
  project: ProjectIdentity;
  settings: ProjectSettingsV2;
  library: ProjectLibraryV2;
  timeline: Timeline;
  transcripts: TranscriptCollection;
  captions: CaptionCollection;
}

export type ProjectDocumentV3 = ProjectDocumentV5;
export type ProjectDocumentV4Legacy = ProjectDocumentV4;
export type ProjectDocument = ProjectDocumentV5;

const projectMediaReferenceSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  sourceType: z.enum(["fixture", "import"]),
  originalPath: z.string().min(1),
  fixtureId: z.string().min(1).optional(),
  addedAt: z.string().datetime()
});

const timelineTrackSchemaV1 = z.object({
  id: z.string().min(1),
  kind: z.enum(["video", "audio", "caption"]),
  name: z.string().min(1),
  clipIds: z.array(z.string())
});

const identitySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

const settingsSchemaV1 = z.object({
  preview: z.object({
    defaultMode: z.enum(PROJECT_PREVIEW_DEFAULT_MODES)
  }),
  captions: z.object({
    defaultTemplate: z.literal("bottom-clean")
  }),
  exports: z.object({
    defaultPreset: z.literal("social-1080p")
  })
});

const settingsSchemaLegacy = z.object({
  ingest: z.object({
    proxyPreset: z.literal("stage2-standard-proxy")
  }),
  preview: z.object({
    defaultMode: z.enum(PROJECT_PREVIEW_DEFAULT_MODES)
  }),
  captions: z.object({
    defaultTemplate: z.literal("bottom-clean")
  }),
  exports: z.object({
    defaultPreset: z.literal("social-1080p")
  })
});

const settingsSchemaV2 = z.object({
  ingest: z.object({
    proxyPreset: z.literal("stage2-standard-proxy")
  }),
  preview: z.object({
    defaultMode: z.enum(PROJECT_PREVIEW_DEFAULT_MODES)
  }),
  captions: z.object({
    defaultTemplate: z.enum(CAPTION_TEMPLATE_IDS)
  }),
  exports: z.object({
    defaultPreset: z.enum(EXPORT_PRESET_IDS)
  })
});

const settingsSchemaV2Migrating = z.object({
  ingest: z.object({
    proxyPreset: z.literal("stage2-standard-proxy")
  }),
  preview: z.object({
    defaultMode: z.enum(PROJECT_PREVIEW_DEFAULT_MODES)
  }),
  captions: z.object({
    defaultTemplate: z.union([z.literal("bottom-clean"), z.enum(CAPTION_TEMPLATE_IDS)])
  }),
  exports: z.object({
    defaultPreset: z.enum(EXPORT_PRESET_IDS)
  })
});

const librarySchema = z.object({
  items: z.array(mediaItemSchema)
});

const projectDocumentSchemaV1 = z.object({
  schemaVersion: z.literal(1),
  project: identitySchema,
  settings: settingsSchemaV1,
  media: z.array(projectMediaReferenceSchema),
  timeline: z.object({
    id: z.string().min(1),
    tracks: z.array(timelineTrackSchemaV1)
  })
});

const projectDocumentSchemaV2 = z.object({
  schemaVersion: z.literal(2),
  project: identitySchema,
  settings: settingsSchemaLegacy,
  library: librarySchema,
  timeline: z.object({
    id: z.string().min(1),
    tracks: z.array(timelineTrackSchemaV1)
  })
});

const projectDocumentSchemaV3Legacy = z.object({
  schemaVersion: z.literal(3),
  project: identitySchema,
  settings: settingsSchemaLegacy,
  library: librarySchema,
  timeline: timelineSchema
});

const projectDocumentSchemaV4 = z.object({
  schemaVersion: z.literal(4),
  project: identitySchema,
  settings: settingsSchemaV2Migrating,
  library: librarySchema,
  timeline: timelineSchema
});

const projectDocumentSchemaV5 = z.object({
  schemaVersion: z.literal(PROJECT_SCHEMA_VERSION),
  project: identitySchema,
  settings: settingsSchemaV2,
  library: librarySchema,
  timeline: timelineSchema,
  transcripts: transcriptCollectionSchema,
  captions: captionCollectionSchema
});

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeProjectPath(input: string): string {
  return input.replace(/\\/gu, "/");
}

function createLegacyFingerprint(): MediaFingerprint {
  return {
    strategy: "stat-only",
    quickHash: null,
    fileSize: null,
    modifiedTimeMs: null,
    sampleSizeBytes: 0
  };
}

function migrateLegacyExportPreset(
  presetId: "social-1080p" | ExportPresetId | undefined
): ExportPresetId {
  if (!presetId || presetId === "social-1080p") {
    return DEFAULT_EXPORT_PRESET_ID;
  }

  return presetId;
}

function migrateLegacyCaptionTemplate(
  templateId: "bottom-clean" | CaptionTemplateId | undefined
): CaptionTemplateId {
  if (!templateId || templateId === "bottom-clean") {
    return "bottom-center-clean";
  }

  return templateId;
}

export function createMediaItemFromLegacyReference(
  mediaReference: ProjectMediaReferenceV1
): MediaItem {
  const normalizedPath = normalizeProjectPath(mediaReference.originalPath);

  return {
    id: mediaReference.id,
    displayName: mediaReference.label,
    source: {
      sourceType: mediaReference.sourceType,
      originalPath: mediaReference.originalPath,
      currentResolvedPath: mediaReference.originalPath,
      normalizedOriginalPath: normalizedPath,
      normalizedResolvedPath: normalizedPath
    },
    importTimestamp: mediaReference.addedAt,
    lastSeenTimestamp: null,
    fileSize: null,
    fileModifiedTimeMs: null,
    fingerprint: createLegacyFingerprint(),
    sourceRevision: `legacy-${mediaReference.id}`,
    metadataSummary: createEmptyMetadataSummary(),
    streams: [],
    ingestStatus: "warning",
    relinkStatus: "linked",
    errorState: null,
    derivedAssets: createEmptyDerivedAssetSet()
  };
}

export function createEmptyProjectDocument(projectName: string): ProjectDocumentV5 {
  const timestamp = nowIso();

  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    project: {
      id: generateId(),
      name: projectName,
      createdAt: timestamp,
      updatedAt: timestamp
    },
    settings: {
      ingest: {
        proxyPreset: "stage2-standard-proxy"
      },
      preview: {
        defaultMode: "standard"
      },
      captions: {
        defaultTemplate: "bottom-center-clean"
      },
      exports: {
        defaultPreset: DEFAULT_EXPORT_PRESET_ID
      }
    },
    library: {
      items: []
    },
    timeline: createEmptyTimeline(),
    transcripts: createEmptyTranscriptCollection(),
    captions: createEmptyCaptionCollection()
  };
}

export function migrateProjectDocumentV1(
  legacyDocument: ProjectDocumentV1
): ProjectDocumentV2 {
  return {
    schemaVersion: 2,
    project: legacyDocument.project,
    settings: {
      ingest: {
        proxyPreset: "stage2-standard-proxy"
      },
      preview: {
        defaultMode: legacyDocument.settings.preview.defaultMode
      },
      captions: {
        defaultTemplate: legacyDocument.settings.captions.defaultTemplate
      },
      exports: {
        defaultPreset: legacyDocument.settings.exports.defaultPreset
      }
    },
    library: {
      items: legacyDocument.media.map(createMediaItemFromLegacyReference)
    },
    timeline: legacyDocument.timeline
  };
}

export function migrateProjectDocumentV2(
  legacyDocument: ProjectDocumentV2
): ProjectDocumentV5 {
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    project: legacyDocument.project,
    settings: {
      ...legacyDocument.settings,
      captions: {
        defaultTemplate: migrateLegacyCaptionTemplate(legacyDocument.settings.captions.defaultTemplate)
      },
      exports: {
        defaultPreset: migrateLegacyExportPreset(legacyDocument.settings.exports.defaultPreset)
      }
    },
    library: legacyDocument.library,
    timeline: createEmptyTimeline(legacyDocument.timeline.id),
    transcripts: createEmptyTranscriptCollection(),
    captions: createEmptyCaptionCollection()
  };
}

export function migrateProjectDocumentV3(
  legacyDocument: ProjectDocumentLegacyV3
): ProjectDocumentV5 {
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    project: legacyDocument.project,
    settings: {
      ...legacyDocument.settings,
      captions: {
        defaultTemplate: migrateLegacyCaptionTemplate(legacyDocument.settings.captions.defaultTemplate)
      },
      exports: {
        defaultPreset: migrateLegacyExportPreset(legacyDocument.settings.exports.defaultPreset)
      }
    },
    library: legacyDocument.library,
    timeline: legacyDocument.timeline,
    transcripts: createEmptyTranscriptCollection(),
    captions: createEmptyCaptionCollection()
  };
}

export function migrateProjectDocumentV4(
  legacyDocument: ProjectDocumentLegacyV4
): ProjectDocumentV5 {
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    project: legacyDocument.project,
    settings: {
      ...legacyDocument.settings,
      captions: {
        defaultTemplate: migrateLegacyCaptionTemplate(legacyDocument.settings.captions.defaultTemplate)
      }
    },
    library: legacyDocument.library,
    timeline: legacyDocument.timeline,
    transcripts: createEmptyTranscriptCollection(),
    captions: createEmptyCaptionCollection()
  };
}

export function parseProjectDocument(input: unknown): ProjectDocumentV5 {
  const parsedInput = z
    .union([
      projectDocumentSchemaV1,
      projectDocumentSchemaV2,
      projectDocumentSchemaV3Legacy,
      projectDocumentSchemaV4,
      projectDocumentSchemaV5
    ])
    .parse(input);

  if (parsedInput.schemaVersion === 1) {
    return migrateProjectDocumentV2(migrateProjectDocumentV1(parsedInput));
  }

  if (parsedInput.schemaVersion === 2) {
    return migrateProjectDocumentV2(parsedInput);
  }

  if (parsedInput.schemaVersion === 3) {
    return migrateProjectDocumentV3(parsedInput);
  }

  if (parsedInput.schemaVersion === 4) {
    return migrateProjectDocumentV4(parsedInput);
  }

  return parsedInput;
}

export function serializeProjectDocument(project: ProjectDocumentV5): string {
  return JSON.stringify(project, null, 2);
}

export function touchProjectDocument(project: ProjectDocumentV5): ProjectDocumentV5 {
  return {
    ...project,
    project: {
      ...project.project,
      updatedAt: nowIso()
    }
  };
}

export function upsertMediaItem(
  project: ProjectDocumentV5,
  mediaItem: MediaItem
): ProjectDocumentV5 {
  const nextProject = touchProjectDocument(project);
  const withoutExisting = nextProject.library.items.filter((asset) => asset.id !== mediaItem.id);

  return {
    ...nextProject,
    library: {
      items: [...withoutExisting, mediaItem]
    }
  };
}

export function replaceProjectTimeline(
  project: ProjectDocumentV5,
  timeline: Timeline
): ProjectDocumentV5 {
  return touchProjectDocument({
    ...project,
    timeline
  });
}

export function upsertTranscript(
  project: ProjectDocumentV5,
  transcript: Transcript
): ProjectDocumentV5 {
  const nextProject = touchProjectDocument(project);
  const items = nextProject.transcripts.items.filter((entry) => entry.id !== transcript.id);

  return {
    ...nextProject,
    transcripts: {
      items: [...items, transcript]
    }
  };
}

export function upsertCaptionTrack(
  project: ProjectDocumentV5,
  captionTrack: CaptionTrack
): ProjectDocumentV5 {
  const nextProject = touchProjectDocument(project);
  const tracks = nextProject.captions.tracks.filter((entry) => entry.id !== captionTrack.id);

  return {
    ...nextProject,
    captions: {
      ...nextProject.captions,
      tracks: [...tracks, captionTrack]
    }
  };
}

export function setCaptionExportDefaults(
  project: ProjectDocumentV5,
  exportDefaults: Partial<CaptionExportDefaults>
): ProjectDocumentV5 {
  const nextProject = touchProjectDocument(project);

  return {
    ...nextProject,
    captions: {
      ...nextProject.captions,
      exportDefaults: {
        ...(nextProject.captions.exportDefaults ?? createDefaultCaptionExportDefaults()),
        ...exportDefaults
      }
    }
  };
}
