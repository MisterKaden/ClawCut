import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
  createProject,
  openProject,
  registerFixtureMedia
} from "../src/project-repository";

describe("project repository", () => {
  test("creates and reopens a project", () => {
    const directory = mkdtempSync(join(tmpdir(), "clawcut-project-"));
    const created = createProject(directory, "Bootstrap Project");
    const reopened = openProject(directory);

    expect(created.document.project.name).toBe("Bootstrap Project");
    expect(reopened.projectFilePath.endsWith("clawcut.project.json")).toBe(true);
    expect(reopened.indexedMedia).toEqual([]);
  });

  test("registers fixture media and stores probe metadata", () => {
    const directory = mkdtempSync(join(tmpdir(), "clawcut-fixture-"));

    createProject(directory, "Fixture Project");
    const snapshot = registerFixtureMedia({
      directory,
      fixtureId: "talking-head-sample"
    });

    expect(snapshot.document.media).toHaveLength(1);
    expect(snapshot.indexedMedia[0]?.probe?.streamCount).toBeGreaterThan(0);
    expect(snapshot.indexedMedia[0]?.probe?.durationMs).toBeGreaterThan(0);
  });
});
