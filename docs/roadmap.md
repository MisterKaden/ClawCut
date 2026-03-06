# Clawcut Roadmap

## Stage 1: Bootstrap

Acceptance criteria:

- app boots locally
- projects can be created and reopened
- ffmpeg and ffprobe detection surfaces success and failure states
- bundled fixture media can be registered
- metadata panel renders probed dimensions, duration, codecs, and stream count
- typecheck, lint, tests, build, and smoke pass

## Stage 2: Ingest and cache

Acceptance criteria:

- arbitrary media import works
- ffprobe indexing is persisted for imported media
- proxies, thumbnails, and waveforms are generated and invalidated deterministically
- missing media can be detected and relinked

## Stage 3: Timeline core

Acceptance criteria:

- tracks and clips can be created and manipulated
- trim, split, ripple delete, snapping, and zoom work
- playhead, undo or redo, autosave, and keyboard shortcuts are wired

## Stage 4: Preview

Acceptance criteria:

- preview engine abstraction backs transport controls
- scrubbing and frame step work
- safe zones and overlay rendering are visible
- selected-range accurate preview cache exists behind the preview boundary

## Stage 5: Render compiler

Acceptance criteria:

- timeline IR compiles to deterministic FFmpeg filter scripts and job specs
- export presets exist
- progress, cancel, and retry are surfaced
- fixture-based output verification uses ffprobe checks

## Stage 6: Captions

Acceptance criteria:

- Whisper jobs produce editable word-timed transcript JSON
- glossary or initial-prompt input is supported
- caption editing and reusable templates exist
- sidecar subtitle export and burned-in caption export both work

## Stage 7: Hardening

Acceptance criteria:

- crash recovery and project migrations are covered
- logs and diagnostics are inspectable
- packaged builds exist
- regression fixtures and performance budgets run in CI

## Stage 8: Beast mode

Acceptance criteria:

- transcript-based editing works
- silence-cut suggestions and brand kits exist
- batch export queue is usable
- the extension surface is ready for plugins
