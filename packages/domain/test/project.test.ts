import { describe, expect, test } from "vitest";

import {
  PROJECT_SCHEMA_VERSION,
  createEmptyProjectDocument,
  migrateProjectDocument,
  registerMediaReference,
  serializeProjectDocument
} from "../src/index";

describe("project schema", () => {
  test("creates a valid stage 1 project document", () => {
    const project = createEmptyProjectDocument("Clawcut Session");

    expect(project.schemaVersion).toBe(PROJECT_SCHEMA_VERSION);
    expect(project.project.name).toBe("Clawcut Session");
    expect(project.timeline.tracks).toEqual([]);
  });

  test("migrates a valid document through the entrypoint", () => {
    const project = createEmptyProjectDocument("Migration Fixture");

    expect(migrateProjectDocument(JSON.parse(serializeProjectDocument(project)))).toEqual(project);
  });

  test("registers media references idempotently by asset id", () => {
    const project = createEmptyProjectDocument("Fixture");
    const next = registerMediaReference(project, {
      id: "asset-1",
      label: "Fixture Clip",
      originalPath: "/tmp/fixture.mp4",
      sourceType: "fixture",
      fixtureId: "talking-head-sample"
    });

    const replaced = registerMediaReference(next, {
      id: "asset-1",
      label: "Fixture Clip Revised",
      originalPath: "/tmp/fixture.mp4",
      sourceType: "fixture",
      fixtureId: "talking-head-sample"
    });

    expect(replaced.media).toHaveLength(1);
    expect(replaced.media[0]?.label).toBe("Fixture Clip Revised");
  });
});
