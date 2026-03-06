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

    INSERT INTO schema_metadata (key, value)
    VALUES ('schema_version', '2')
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
