# Technical Decisions

## Workspace and build

- `pnpm` workspace instead of a heavier monorepo tool.
  - Reason: Stage 1 needs fast bootstrap, shared package boundaries, and simple root commands more than task orchestration.

## Desktop shell

- Electron + React + TypeScript.
  - Reason: clear main and preload boundaries, strong ecosystem support, and straightforward local smoke automation.

## Worker boundary

- Separate Node media-worker process instead of renderer-side execution.
  - Reason: keeps FFmpeg, ffprobe, and SQLite concerns away from UI code and preserves a migration path to a Rust worker later.

## Project storage

- Hybrid storage: `clawcut.project.json` plus `.clawcut/project.db`.
  - Reason: keep the canonical edit model human-inspectable and versioned while storing derived metadata in SQLite.

## UI direction

- Editorial-industrial visual language with serif display type and mono instrumentation details.
  - Reason: the product should feel intentional and tool-like rather than like a generic web dashboard.
