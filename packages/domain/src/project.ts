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
import { createEmptyTimeline, timelineSchema, type Timeline } from "./timeline";

export const PROJECT_SCHEMA_VERSION = 3;
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
    defaultMode: "fast-proxy";
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
    defaultMode: "fast-proxy";
  };
  captions: {
    defaultTemplate: "bottom-clean";
  };
  exports: {
    defaultPreset: "social-1080p";
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
  settings: ProjectSettingsV2;
  library: ProjectLibraryV2;
  timeline: TimelineRootV1;
}

export interface ProjectDocumentV3 {
  schemaVersion: 3;
  project: ProjectIdentity;
  settings: ProjectSettingsV2;
  library: ProjectLibraryV2;
  timeline: Timeline;
}

export type ProjectDocument = ProjectDocumentV3;

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
    defaultMode: z.literal("fast-proxy")
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
    defaultMode: z.literal("fast-proxy")
  }),
  captions: z.object({
    defaultTemplate: z.literal("bottom-clean")
  }),
  exports: z.object({
    defaultPreset: z.literal("social-1080p")
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
  settings: settingsSchemaV2,
  library: librarySchema,
  timeline: z.object({
    id: z.string().min(1),
    tracks: z.array(timelineTrackSchemaV1)
  })
});

const projectDocumentSchemaV3 = z.object({
  schemaVersion: z.literal(PROJECT_SCHEMA_VERSION),
  project: identitySchema,
  settings: settingsSchemaV2,
  library: librarySchema,
  timeline: timelineSchema
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

export function createEmptyProjectDocument(projectName: string): ProjectDocumentV3 {
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
        defaultMode: "fast-proxy"
      },
      captions: {
        defaultTemplate: "bottom-clean"
      },
      exports: {
        defaultPreset: "social-1080p"
      }
    },
    library: {
      items: []
    },
    timeline: createEmptyTimeline()
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
): ProjectDocumentV3 {
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    project: legacyDocument.project,
    settings: legacyDocument.settings,
    library: legacyDocument.library,
    timeline: createEmptyTimeline(legacyDocument.timeline.id)
  };
}

export function parseProjectDocument(input: unknown): ProjectDocumentV3 {
  const parsedInput = z
    .union([projectDocumentSchemaV1, projectDocumentSchemaV2, projectDocumentSchemaV3])
    .parse(input);

  if (parsedInput.schemaVersion === 1) {
    return migrateProjectDocumentV2(migrateProjectDocumentV1(parsedInput));
  }

  if (parsedInput.schemaVersion === 2) {
    return migrateProjectDocumentV2(parsedInput);
  }

  return parsedInput;
}

export function serializeProjectDocument(project: ProjectDocumentV3): string {
  return JSON.stringify(project, null, 2);
}

export function touchProjectDocument(project: ProjectDocumentV3): ProjectDocumentV3 {
  return {
    ...project,
    project: {
      ...project.project,
      updatedAt: nowIso()
    }
  };
}

export function upsertMediaItem(
  project: ProjectDocumentV3,
  mediaItem: MediaItem
): ProjectDocumentV3 {
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
  project: ProjectDocumentV3,
  timeline: Timeline
): ProjectDocumentV3 {
  return touchProjectDocument({
    ...project,
    timeline
  });
}
