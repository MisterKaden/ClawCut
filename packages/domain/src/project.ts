import { randomUUID } from "node:crypto";

import { z } from "zod";

export const PROJECT_SCHEMA_VERSION = 1;
export const PROJECT_FILE_NAME = "clawcut.project.json";
export const PROJECT_CACHE_DIRECTORY = ".clawcut";
export const PROJECT_DATABASE_NAME = "project.db";

export type ProjectSchemaVersion = typeof PROJECT_SCHEMA_VERSION;
export type MediaSourceType = "fixture" | "import";

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

export interface ProjectDocumentV1 {
  schemaVersion: ProjectSchemaVersion;
  project: ProjectIdentity;
  settings: ProjectSettingsV1;
  media: ProjectMediaReferenceV1[];
  timeline: TimelineRootV1;
}

const projectMediaReferenceSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  sourceType: z.enum(["fixture", "import"]),
  originalPath: z.string().min(1),
  fixtureId: z.string().min(1).optional(),
  addedAt: z.string().datetime()
});

const timelineTrackSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["video", "audio", "caption"]),
  name: z.string().min(1),
  clipIds: z.array(z.string())
});

const projectDocumentSchemaV1 = z.object({
  schemaVersion: z.literal(PROJECT_SCHEMA_VERSION),
  project: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime()
  }),
  settings: z.object({
    preview: z.object({
      defaultMode: z.literal("fast-proxy")
    }),
    captions: z.object({
      defaultTemplate: z.literal("bottom-clean")
    }),
    exports: z.object({
      defaultPreset: z.literal("social-1080p")
    })
  }),
  media: z.array(projectMediaReferenceSchema),
  timeline: z.object({
    id: z.string().min(1),
    tracks: z.array(timelineTrackSchema)
  })
});

function nowIso(): string {
  return new Date().toISOString();
}

export function createEmptyProjectDocument(projectName: string): ProjectDocumentV1 {
  const timestamp = nowIso();

  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    project: {
      id: randomUUID(),
      name: projectName,
      createdAt: timestamp,
      updatedAt: timestamp
    },
    settings: {
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
    media: [],
    timeline: {
      id: randomUUID(),
      tracks: []
    }
  };
}

export function parseProjectDocument(input: unknown): ProjectDocumentV1 {
  return projectDocumentSchemaV1.parse(input);
}

export function serializeProjectDocument(project: ProjectDocumentV1): string {
  return JSON.stringify(project, null, 2);
}

export function touchProjectDocument(project: ProjectDocumentV1): ProjectDocumentV1 {
  return {
    ...project,
    project: {
      ...project.project,
      updatedAt: nowIso()
    }
  };
}

export function registerMediaReference(
  project: ProjectDocumentV1,
  mediaReference: Omit<ProjectMediaReferenceV1, "addedAt">,
  timestamp: string = nowIso()
): ProjectDocumentV1 {
  const nextProject = touchProjectDocument(project);

  const withoutExisting = nextProject.media.filter((asset) => asset.id !== mediaReference.id);

  return {
    ...nextProject,
    media: [
      ...withoutExisting,
      {
        ...mediaReference,
        addedAt: timestamp
      }
    ]
  };
}
