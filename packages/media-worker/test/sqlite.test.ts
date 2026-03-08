import { mkdtempSync } from "node:fs";
import Database from "better-sqlite3";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { DATABASE_SCHEMA_VERSION, openProjectDatabase } from "../src/sqlite";

function createSchemaV1Database(databasePath: string): void {
  const database = new Database(databasePath);

  database.exec(`
    CREATE TABLE schema_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    INSERT INTO schema_metadata (key, value)
    VALUES ('schema_version', '1');

    CREATE TABLE job_runs (
      id TEXT PRIMARY KEY,
      project_directory TEXT NOT NULL,
      media_item_id TEXT,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      progress REAL NOT NULL,
      step TEXT NOT NULL,
      attempt_count INTEGER NOT NULL,
      error_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );

    CREATE TABLE export_runs (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      project_directory TEXT NOT NULL,
      timeline_id TEXT NOT NULL,
      status TEXT NOT NULL,
      export_mode TEXT NOT NULL,
      preset_id TEXT NOT NULL,
      output_path TEXT,
      artifact_directory TEXT,
      request_json TEXT NOT NULL,
      render_plan_json TEXT,
      ffmpeg_spec_json TEXT,
      verification_json TEXT,
      diagnostics_json TEXT NOT NULL,
      error_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      retry_of_run_id TEXT,
      cancellation_requested INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE transcription_runs (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      transcript_id TEXT,
      project_directory TEXT NOT NULL,
      request_json TEXT NOT NULL,
      status TEXT NOT NULL,
      raw_artifact_path TEXT,
      diagnostics_json TEXT NOT NULL,
      error_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      retry_of_run_id TEXT
    );

    CREATE TABLE smart_analysis_runs (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      suggestion_set_id TEXT,
      project_directory TEXT NOT NULL,
      request_json TEXT NOT NULL,
      status TEXT NOT NULL,
      diagnostics_json TEXT NOT NULL,
      error_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      retry_of_run_id TEXT
    );

    CREATE TABLE workflow_runs (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      project_directory TEXT NOT NULL,
      template_id TEXT NOT NULL,
      template_version INTEGER NOT NULL,
      status TEXT NOT NULL,
      input_json TEXT NOT NULL,
      safety_profile_json TEXT NOT NULL,
      warnings_json TEXT NOT NULL,
      error_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT
    );
  `);

  database.close();
}

describe("sqlite migrations", () => {
  test("upgrades stage 9 operational databases with recovery columns", () => {
    const directory = mkdtempSync(join(tmpdir(), "clawcut-sqlite-migration-"));
    const databasePath = join(directory, "project.db");
    createSchemaV1Database(databasePath);

    const handle = openProjectDatabase(databasePath);
    const exportColumns = handle.database
      .prepare("PRAGMA table_info(export_runs)")
      .all() as Array<{ name: string }>;
    const jobColumns = handle.database
      .prepare("PRAGMA table_info(job_runs)")
      .all() as Array<{ name: string }>;
    const workflowColumns = handle.database
      .prepare("PRAGMA table_info(workflow_runs)")
      .all() as Array<{ name: string }>;

    expect(handle.schemaVersion).toBe(DATABASE_SCHEMA_VERSION);
    expect(handle.migrated).toBe(true);
    expect(exportColumns.some((column) => column.name === "recovery_json")).toBe(true);
    expect(jobColumns.some((column) => column.name === "recovery_json")).toBe(true);
    expect(workflowColumns.some((column) => column.name === "recovery_json")).toBe(true);

    handle.close();
  });
});
