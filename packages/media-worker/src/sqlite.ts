import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import Database from "better-sqlite3";

export const DATABASE_SCHEMA_VERSION = 3;

const EMPTY_RECOVERY_JSON =
  '{"state":"none","interruptedAt":null,"reason":null,"recommendedAction":null,"handledAt":null,"dismissedAt":null,"replacementRunId":null}';

export interface DatabaseHandle {
  database: Database.Database;
  schemaVersion: number;
  migrated: boolean;
  close(): void;
}

interface DatabaseMigration {
  id: number;
  apply(database: Database.Database): void;
}

function ensureSchemaMetadata(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

function getCurrentSchemaVersion(database: Database.Database): number {
  ensureSchemaMetadata(database);

  const row = database
    .prepare(
      `
        SELECT value
        FROM schema_metadata
        WHERE key = 'schema_version'
      `
    )
    .get() as { value: string } | undefined;

  if (!row) {
    return 0;
  }

  const parsed = Number.parseInt(row.value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function setCurrentSchemaVersion(database: Database.Database, version: number): void {
  database
    .prepare(
      `
        INSERT INTO schema_metadata (key, value)
        VALUES ('schema_version', @value)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `
    )
    .run({
      value: String(version)
    });
}

function addColumnIfMissing(
  database: Database.Database,
  tableName: string,
  columnName: string,
  definition: string
): void {
  const columns = database
    .prepare(`PRAGMA table_info(${tableName})`)
    .all() as Array<{ name: string }>;

  if (columns.some((column) => column.name === columnName)) {
    return;
  }

  database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition};`);
}

const MIGRATIONS: DatabaseMigration[] = [
  {
    id: 1,
    apply(database) {
      database.exec(`
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

        CREATE TABLE IF NOT EXISTS smart_analysis_runs (
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

        CREATE TABLE IF NOT EXISTS smart_suggestion_sets (
          id TEXT PRIMARY KEY,
          project_directory TEXT NOT NULL,
          analysis_type TEXT NOT NULL,
          target_json TEXT NOT NULL,
          title TEXT NOT NULL,
          summary TEXT NOT NULL,
          warnings_json TEXT NOT NULL,
          items_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          completed_at TEXT
        );

        CREATE TABLE IF NOT EXISTS smart_edit_plans (
          id TEXT PRIMARY KEY,
          project_directory TEXT NOT NULL,
          timeline_id TEXT NOT NULL,
          suggestion_set_id TEXT,
          suggestion_ids_json TEXT NOT NULL,
          warnings_json TEXT NOT NULL,
          conflicts_json TEXT NOT NULL,
          steps_json TEXT NOT NULL,
          summary_json TEXT NOT NULL,
          status TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          applied_at TEXT
        );

        CREATE TABLE IF NOT EXISTS workflow_runs (
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

        CREATE TABLE IF NOT EXISTS workflow_step_runs (
          id TEXT PRIMARY KEY,
          workflow_run_id TEXT NOT NULL,
          batch_item_run_id TEXT,
          definition_id TEXT NOT NULL,
          kind TEXT NOT NULL,
          name TEXT NOT NULL,
          status TEXT NOT NULL,
          safety_class TEXT NOT NULL,
          mutability TEXT NOT NULL,
          execution TEXT NOT NULL,
          requires_approval INTEGER NOT NULL,
          child_job_id TEXT,
          warnings_json TEXT NOT NULL,
          output_summary_json TEXT NOT NULL,
          error_json TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          started_at TEXT,
          completed_at TEXT
        );

        CREATE TABLE IF NOT EXISTS workflow_batch_items (
          id TEXT PRIMARY KEY,
          workflow_run_id TEXT NOT NULL,
          target_clip_id TEXT NOT NULL,
          label TEXT NOT NULL,
          status TEXT NOT NULL,
          warnings_json TEXT NOT NULL,
          output_summary_json TEXT NOT NULL,
          error_json TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          started_at TEXT,
          completed_at TEXT
        );

        CREATE TABLE IF NOT EXISTS workflow_approvals (
          id TEXT PRIMARY KEY,
          workflow_run_id TEXT NOT NULL,
          step_run_id TEXT NOT NULL,
          batch_item_run_id TEXT,
          status TEXT NOT NULL,
          reason TEXT NOT NULL,
          summary TEXT NOT NULL,
          proposed_effects_json TEXT NOT NULL,
          artifact_ids_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          resolved_at TEXT
        );

        CREATE TABLE IF NOT EXISTS workflow_artifacts (
          id TEXT PRIMARY KEY,
          workflow_run_id TEXT NOT NULL,
          step_run_id TEXT,
          batch_item_run_id TEXT,
          kind TEXT NOT NULL,
          label TEXT NOT NULL,
          path TEXT,
          metadata_json TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
      `);
    }
  },
  {
    id: 2,
    apply(database) {
      addColumnIfMissing(database, "job_runs", "recovery_json", `TEXT NOT NULL DEFAULT '${EMPTY_RECOVERY_JSON}'`);
      addColumnIfMissing(database, "export_runs", "recovery_json", `TEXT NOT NULL DEFAULT '${EMPTY_RECOVERY_JSON}'`);
      addColumnIfMissing(database, "transcription_runs", "recovery_json", `TEXT NOT NULL DEFAULT '${EMPTY_RECOVERY_JSON}'`);
      addColumnIfMissing(database, "smart_analysis_runs", "recovery_json", `TEXT NOT NULL DEFAULT '${EMPTY_RECOVERY_JSON}'`);
      addColumnIfMissing(database, "workflow_runs", "recovery_json", `TEXT NOT NULL DEFAULT '${EMPTY_RECOVERY_JSON}'`);
    }
  },
  {
    id: 3,
    apply(database) {
      addColumnIfMissing(database, "workflow_runs", "profile_id", "TEXT");
      addColumnIfMissing(database, "workflow_runs", "schedule_id", "TEXT");
    }
  }
];

function applyMigrations(database: Database.Database): { schemaVersion: number; migrated: boolean } {
  const currentVersion = getCurrentSchemaVersion(database);
  let migrated = false;

  for (const migration of MIGRATIONS) {
    if (migration.id <= currentVersion) {
      continue;
    }

    const transaction = database.transaction(() => {
      migration.apply(database);
      setCurrentSchemaVersion(database, migration.id);
    });

    transaction();
    migrated = true;
  }

  const schemaVersion = getCurrentSchemaVersion(database);
  return {
    schemaVersion,
    migrated
  };
}

export function openProjectDatabase(databasePath: string): DatabaseHandle {
  mkdirSync(dirname(databasePath), { recursive: true });

  const database = new Database(databasePath);
  database.pragma("journal_mode = WAL");
  const migrationResult = applyMigrations(database);

  return {
    database,
    schemaVersion: migrationResult.schemaVersion,
    migrated: migrationResult.migrated,
    close() {
      database.close();
    }
  };
}
