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
});
