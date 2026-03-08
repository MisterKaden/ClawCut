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

Status: complete

Acceptance criteria:

- `PreviewEngine` backs transport controls
- play, pause, seek, scrub, and frame step work through preview commands
- preview uses proxies intelligently and reports source mode explicitly
- safe zones and overlay rendering are visible
- sequential clip preview respects trims and gaps
- machine-readable preview state is queryable for future OpenClaw control
- selected-range accurate preview cache exists as an intentional hook behind the preview boundary

## Stage 5: Render compiler

Status: complete

Acceptance criteria:

- timeline IR compiles to deterministic FFmpeg job specs
- export presets exist
- bounded range or region export works through the same compiler path
- progress, cancel, retry, and failure states are visible
- representative still-frame snapshot capture exists for exports and timeline positions
- fixture-based output verification uses ffprobe checks

## Stage 6: Captions

Status: complete

Delivered:

- Whisper jobs produce editable word-timed transcript JSON
- glossary and initial-prompt input is supported
- transcript summaries and caption-coverage snapshots are queryable for future OpenClaw automation
- active-word highlighting metadata is preserved for karaoke/social caption styles
- caption editing and reusable templates exist
- sidecar subtitle and burned-in caption export both work

Current Stage 6 notes:

- transcript editing is segment-level for now
- caption grouping is one transcript segment at a time
- burn-in export keeps ASS artifacts and uses rasterized overlay fallback when local FFmpeg subtitle filters are unavailable

## Stage 7: Plugin-first local control and OpenClaw foundations

Status: complete

Acceptance criteria:

- shared command/query schema layer exists and is versioned
- local authenticated transport exists
- project, media, timeline, preview, export, transcript, caption, and job workflows are callable through typed command/query requests
- request and response envelopes are structured and versioned
- auth failures, validation failures, and scope failures are explicit
- safety classes and mutability classes are explicit
- capability discovery and OpenClaw tool discovery exist
- OpenClaw manifest export exists
- thin OpenClaw adapter package exists
- lightweight local event stream exists for job/export/transcription updates
- preview frame inspection is exposed through the automation surface
- long-running actions return machine-readable job-linked state
- UI surfaces the local API status and token

## Stage 8: Smart editing

Status: complete

Delivered:

- silence and dead-air analysis produces persisted suggestion sets
- filler-word detection is transcript-aware and timing-linked
- highlight candidate generation exists as an explainable heuristic workflow
- suggestion sets and edit plans are machine-readable and persisted
- dry-run edit-plan compilation exists before any mutation
- accepted suggestions apply through the existing command engine
- preview and OpenClaw can inspect and seek to suggestion ranges
- safety classes distinguish inspect, review, and apply paths

Current Stage 8 notes:

- smart analysis is heuristic and explainable, not autonomous
- transcript-based edits currently map to explicit range removals and review regions
- silence and highlight quality depends on waveform/transcript quality from earlier stages

## Stage 9: Hardening

Acceptance criteria:

- crash recovery and project migrations are covered
- logs and diagnostics are inspectable
- packaged builds exist
- performance budgets and regression fixtures run in CI

## Stage 10: Beast mode

Acceptance criteria:

- transcript-based editing works
- silence-cut suggestions and brand kits exist
- batch export queue is usable
- extension surface is ready for plugins
