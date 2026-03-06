import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  PROJECT_CACHE_DIRECTORY,
  PROJECT_DATABASE_NAME,
  PROJECT_FILE_NAME,
  createEmptyProjectDocument,
  migrateProjectDocument,
  registerMediaReference,
  serializeProjectDocument
} from "@clawcut/domain";
import type {
  IndexedMediaAsset,
  ProjectWorkspaceSnapshot,
  RegisterFixtureMediaInput
} from "@clawcut/ipc";

import { probeAsset } from "./probe";
import { openProjectDatabase } from "./sqlite";
import { WorkerError, ensureAbsoluteDirectory } from "./utils";

interface ProjectPaths {
  directory: string;
  projectFilePath: string;
  databasePath: string;
}

const FIXTURE_ASSET_IDS: Record<RegisterFixtureMediaInput["fixtureId"], string> = {
  "talking-head-sample": "fixture-talking-head-sample"
};

const FIXTURE_FILE_NAMES: Record<RegisterFixtureMediaInput["fixtureId"], string> = {
  "talking-head-sample": "talking-head-sample.mp4"
};

function resolveProjectPaths(directory: string): ProjectPaths {
  const normalizedDirectory = resolve(ensureAbsoluteDirectory(directory));

  return {
    directory: normalizedDirectory,
    projectFilePath: join(normalizedDirectory, PROJECT_FILE_NAME),
    databasePath: join(normalizedDirectory, PROJECT_CACHE_DIRECTORY, PROJECT_DATABASE_NAME)
  };
}

function readIndexedMedia(databasePath: string): IndexedMediaAsset[] {
  const { database, close } = openProjectDatabase(databasePath);

  try {
    const statement = database.prepare(`
      SELECT
        asset_id,
        label,
        original_path,
        source_type,
        fixture_id,
        added_at,
        probe_json
      FROM media_assets
      ORDER BY added_at ASC
    `);

    const rows = statement.all() as Array<{
      asset_id: string;
      label: string;
      original_path: string;
      source_type: "fixture" | "import";
      fixture_id: string | null;
      added_at: string;
      probe_json: string | null;
    }>;

    return rows.map((row) => ({
      assetId: row.asset_id,
      label: row.label,
      originalPath: row.original_path,
      sourceType: row.source_type,
      fixtureId: row.fixture_id ?? undefined,
      addedAt: row.added_at,
      probe: row.probe_json ? (JSON.parse(row.probe_json) as IndexedMediaAsset["probe"]) : null
    }));
  } finally {
    close();
  }
}

function writeIndexedMedia(
  databasePath: string,
  asset: IndexedMediaAsset
): IndexedMediaAsset[] {
  const { database, close } = openProjectDatabase(databasePath);

  try {
    const statement = database.prepare(`
      INSERT INTO media_assets (
        asset_id,
        label,
        original_path,
        source_type,
        fixture_id,
        added_at,
        probe_json
      )
      VALUES (
        @asset_id,
        @label,
        @original_path,
        @source_type,
        @fixture_id,
        @added_at,
        @probe_json
      )
      ON CONFLICT(asset_id) DO UPDATE SET
        label = excluded.label,
        original_path = excluded.original_path,
        source_type = excluded.source_type,
        fixture_id = excluded.fixture_id,
        added_at = excluded.added_at,
        probe_json = excluded.probe_json
    `);

    statement.run({
      asset_id: asset.assetId,
      label: asset.label,
      original_path: asset.originalPath,
      source_type: asset.sourceType,
      fixture_id: asset.fixtureId ?? null,
      added_at: asset.addedAt,
      probe_json: asset.probe ? JSON.stringify(asset.probe) : null
    });

    return readIndexedMedia(databasePath);
  } finally {
    close();
  }
}

function loadSnapshot(paths: ProjectPaths): ProjectWorkspaceSnapshot {
  const projectFileContents = readFileSync(paths.projectFilePath, "utf8");
  const document = migrateProjectDocument(JSON.parse(projectFileContents));

  return {
    directory: paths.directory,
    projectFilePath: paths.projectFilePath,
    databasePath: paths.databasePath,
    document,
    indexedMedia: readIndexedMedia(paths.databasePath)
  };
}

export function createProject(directory: string, name?: string): ProjectWorkspaceSnapshot {
  const paths = resolveProjectPaths(directory);
  mkdirSync(paths.directory, { recursive: true });
  mkdirSync(join(paths.directory, PROJECT_CACHE_DIRECTORY), { recursive: true });

  try {
    readFileSync(paths.projectFilePath, "utf8");
    throw new WorkerError(
      "PROJECT_EXISTS",
      `A Clawcut project already exists at ${paths.projectFilePath}.`
    );
  } catch (error) {
    if (error instanceof WorkerError) {
      throw error;
    }
  }

  const document = createEmptyProjectDocument(name?.trim() || "Clawcut Session");
  writeFileSync(paths.projectFilePath, serializeProjectDocument(document), "utf8");
  openProjectDatabase(paths.databasePath).close();

  return loadSnapshot(paths);
}

export function openProject(directory: string): ProjectWorkspaceSnapshot {
  const paths = resolveProjectPaths(directory);

  try {
    return loadSnapshot(paths);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new WorkerError(
        "PROJECT_NOT_FOUND",
        `No Clawcut project was found in ${paths.directory}.`,
        `Expected ${paths.projectFilePath}.`
      );
    }

    throw error;
  }
}

export function registerFixtureMedia(
  input: RegisterFixtureMediaInput
): ProjectWorkspaceSnapshot {
  const paths = resolveProjectPaths(input.directory);
  const snapshot = loadSnapshot(paths);
  const fixtureFileName = FIXTURE_FILE_NAMES[input.fixtureId];
  const fixturePath = join(process.cwd(), "fixtures", "media", fixtureFileName);
  const probe = probeAsset(fixturePath);
  const assetId = FIXTURE_ASSET_IDS[input.fixtureId];

  const nextDocument = registerMediaReference(snapshot.document, {
    id: assetId,
    label: probe.displayName,
    originalPath: fixturePath,
    sourceType: "fixture",
    fixtureId: input.fixtureId
  });

  writeFileSync(paths.projectFilePath, serializeProjectDocument(nextDocument), "utf8");

  writeIndexedMedia(paths.databasePath, {
    assetId,
    label: probe.displayName,
    originalPath: fixturePath,
    sourceType: "fixture",
    fixtureId: input.fixtureId,
    addedAt:
      nextDocument.media.find((mediaReference) => mediaReference.id === assetId)?.addedAt ??
      new Date().toISOString(),
    probe
  });

  return loadSnapshot(paths);
}
