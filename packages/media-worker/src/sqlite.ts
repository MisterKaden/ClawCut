import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import Database from "better-sqlite3";

export interface DatabaseHandle {
  database: Database.Database;
  close(): void;
}

export function openProjectDatabase(databasePath: string): DatabaseHandle {
  mkdirSync(dirname(databasePath), { recursive: true });

  const database = new Database(databasePath);
  database.pragma("journal_mode = WAL");
  database.exec(`
    CREATE TABLE IF NOT EXISTS media_assets (
      asset_id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      original_path TEXT NOT NULL,
      source_type TEXT NOT NULL,
      fixture_id TEXT,
      added_at TEXT NOT NULL,
      probe_json TEXT
    );
  `);

  return {
    database,
    close() {
      database.close();
    }
  };
}
