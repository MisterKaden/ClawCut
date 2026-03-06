# Clawcut Roadmap

## Stage 1: Bootstrap

Status: complete

Acceptance criteria:

- app boots locally
- projects can be created and reopened
- ffmpeg and ffprobe detection surfaces success and failure states
- canonical project schema exists
- metadata inspection works
- build, typecheck, lint, tests, and smoke pass

## Stage 2: Media ingest, cache, and relink

Status: complete

Acceptance criteria:

- local files and folders can be imported
- ffprobe metadata is normalized into app-owned models and persisted
- thumbnails are generated for video
- waveform summaries are generated for audio-bearing media
- proxies are generated and tracked for video
- cache layout is deterministic and documented
- missing media is detected and visible in the UI
- relink flow safely updates media references
- job states, failures, and retries are surfaced
- tests and smoke cover the core ingest and relink path

## Stage 3: Timeline core

Status: complete

Acceptance criteria:

- project-owned timeline clips and tracks exist
- trim, split, move, ripple delete, and snapping work
- track locking works
- playhead movement works
- undo, redo, and autosave are wired to the timeline model
- timeline edits flow through the typed command engine
- internal command/query gateway exists for future OpenClaw work

## Stage 4: Preview

Acceptance criteria:

- `PreviewEngine` backs transport controls
- scrubbing and frame step work
- safe zones and overlay rendering are visible
- selected-range accurate preview cache exists behind the preview boundary

## Stage 5: Render compiler

Acceptance criteria:

- timeline IR compiles to deterministic FFmpeg job specs
- export presets exist
- progress, cancel, retry, and failure states are visible
- fixture-based output verification uses ffprobe checks

## Stage 6: Captions

Acceptance criteria:

- Whisper jobs produce editable word-timed transcript JSON
- glossary and initial-prompt input is supported
- caption editing and reusable templates exist
- sidecar subtitle and burned-in caption export both work

## Stage 7: Hardening

Acceptance criteria:

- crash recovery and project migrations are covered
- logs and diagnostics are inspectable
- packaged builds exist
- performance budgets and regression fixtures run in CI

## Stage 8: Beast mode

Acceptance criteria:

- transcript-based editing works
- silence-cut suggestions and brand kits exist
- batch export queue is usable
- extension surface is ready for plugins
