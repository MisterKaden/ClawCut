import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import Database from "better-sqlite3";

export interface DatabaseHandle {
  database: Database.Database;
  close(): void;
}

function applyMigrations(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS job_runs (
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

    CREATE TABLE IF NOT EXISTS derived_assets (
      id TEXT PRIMARY KEY,
      media_item_id TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      relative_path TEXT NOT NULL,
      source_revision TEXT NOT NULL,
      preset_key TEXT NOT NULL,
      generated_at TEXT,
      file_size INTEGER,
      error_message TEXT,
      metadata_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS export_runs (
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

    CREATE TABLE IF NOT EXISTS transcription_runs (
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

    INSERT INTO schema_metadata (key, value)
    VALUES ('schema_version', '4')
    ON CONFLICT(key) DO UPDATE SET value = excluded.value;
  `);
}

export function openProjectDatabase(databasePath: string): DatabaseHandle {
  mkdirSync(dirname(databasePath), { recursive: true });

  const database = new Database(databasePath);
  database.pragma("journal_mode = WAL");
  applyMigrations(database);

  return {
    database,
    close() {
      database.close();
    }
  };
}
