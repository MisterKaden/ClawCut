import { describe, expect, test } from "vitest";

import {
  PROJECT_SCHEMA_VERSION,
  createEmptyProjectDocument,
  createMediaItemFromLegacyReference,
  migrateProjectDocument,
  serializeProjectDocument
} from "../src/index";

describe("project schema", () => {
  test("creates a valid stage 1 project document", () => {
    const project = createEmptyProjectDocument("Clawcut Session");

    expect(project.schemaVersion).toBe(PROJECT_SCHEMA_VERSION);
    expect(project.project.name).toBe("Clawcut Session");
    expect(project.timeline.trackOrder).toEqual([]);
    expect(project.library.items).toEqual([]);
    expect(project.transcripts.items).toEqual([]);
    expect(project.captions.tracks).toEqual([]);
    expect(project.captions.exportDefaults.burnInEnabled).toBe(false);
  });

  test("migrates a valid document through the entrypoint", () => {
    const project = createEmptyProjectDocument("Migration Fixture");

    expect(migrateProjectDocument(JSON.parse(serializeProjectDocument(project)))).toEqual(project);
  });

  test("migrates legacy media references into stage 2 library items", () => {
    const legacyMediaItem = createMediaItemFromLegacyReference({
      id: "asset-1",
      label: "Fixture Clip",
      originalPath: "/tmp/fixture.mp4",
      sourceType: "fixture",
      addedAt: new Date().toISOString()
    });

    expect(legacyMediaItem.displayName).toBe("Fixture Clip");
    expect(legacyMediaItem.ingestStatus).toBe("warning");
    expect(legacyMediaItem.source.currentResolvedPath).toBe("/tmp/fixture.mp4");
  });

  test("migrates project fixtures from schema versions 1 through 6", () => {
    const project = createEmptyProjectDocument("Compat Fixture");
    const legacyLibraryItem = createMediaItemFromLegacyReference({
      id: "asset-1",
      label: "Fixture Clip",
      originalPath: "/tmp/fixture.mp4",
      sourceType: "import",
      addedAt: project.project.createdAt
    });
    const legacySettings = {
      ingest: {
        proxyPreset: "stage2-standard-proxy" as const
      },
      preview: {
        defaultMode: "standard" as const
      },
      captions: {
        defaultTemplate: "bottom-clean" as const
      },
      exports: {
        defaultPreset: "social-1080p" as const
      }
    };
    const modernSettingsWithoutBranding = {
      ingest: project.settings.ingest,
      preview: project.settings.preview,
      captions: project.settings.captions,
      exports: project.settings.exports
    };
    const currentDocumentWithLibrary = {
      ...project,
      library: {
        items: [legacyLibraryItem]
      }
    };
    const fixtures = [
      {
        schemaVersion: 1,
        document: {
          schemaVersion: 1 as const,
          project: project.project,
          settings: {
            preview: legacySettings.preview,
            captions: legacySettings.captions,
            exports: legacySettings.exports
          },
          media: [
            {
              id: "asset-1",
              label: "Fixture Clip",
              sourceType: "import" as const,
              originalPath: "/tmp/fixture.mp4",
              addedAt: project.project.createdAt
            }
          ],
          timeline: {
            id: project.timeline.id,
            tracks: []
          }
        }
      },
      {
        schemaVersion: 2,
        document: {
          schemaVersion: 2 as const,
          project: project.project,
          settings: legacySettings,
          library: {
            items: [legacyLibraryItem]
          },
          timeline: {
            id: project.timeline.id,
            tracks: []
          }
        }
      },
      {
        schemaVersion: 3,
        document: {
          schemaVersion: 3 as const,
          project: project.project,
          settings: legacySettings,
          library: {
            items: [legacyLibraryItem]
          },
          timeline: project.timeline
        }
      },
      {
        schemaVersion: 4,
        document: {
          schemaVersion: 4 as const,
          project: project.project,
          settings: modernSettingsWithoutBranding,
          library: {
            items: [legacyLibraryItem]
          },
          timeline: project.timeline
        }
      },
      {
        schemaVersion: 5,
        document: {
          schemaVersion: 5 as const,
          project: project.project,
          settings: modernSettingsWithoutBranding,
          library: {
            items: [legacyLibraryItem]
          },
          timeline: project.timeline,
          transcripts: project.transcripts,
          captions: project.captions
        }
      },
      {
        schemaVersion: 6,
        document: currentDocumentWithLibrary
      }
    ];

    for (const fixture of fixtures) {
      const migrated = migrateProjectDocument(fixture.document);

      expect(migrated.schemaVersion).toBe(PROJECT_SCHEMA_VERSION);
      expect(migrated.settings.branding.defaultBrandKitId).toBe(null);
      expect(migrated.library.items).toHaveLength(1);
    }
  });
});
