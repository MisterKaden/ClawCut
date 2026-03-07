# OpenClaw Integration Foundation

## Goal

Stage 7 makes Clawcut usable as a local programmable media engine for OpenClaw.

The integration boundary is:

- explicit
- authenticated
- machine-readable
- layered above trusted Clawcut services

OpenClaw should not need to drive the desktop UI by simulating clicks or reading pixels to perform normal automation work.

## Discovery

OpenClaw discovers Clawcut capabilities through:

- `GET /api/v1/capabilities`
- `GET /api/v1/openclaw/tools`

These endpoints advertise:

- protocol version
- auth requirements
- supported command/query categories
- required scopes
- tool names
- input schema summaries
- output expectations

## Current tool surface

Stage 7 publishes tool definitions for:

- `clawcut.open_project`
- `clawcut.import_media`
- `clawcut.get_timeline`
- `clawcut.seek_preview`
- `clawcut.transcribe_clip`
- `clawcut.generate_captions`
- `clawcut.start_export`
- `clawcut.query_job`

These are intentionally mapped to underlying API command/query names instead of inventing a second tool-only execution layer.

## Example automation flow

Typical OpenClaw-compatible workflow:

1. call `clawcut.open_project`
2. query timeline or media state
3. call `clawcut.transcribe_clip`
4. poll `clawcut.query_job`
5. call `clawcut.generate_captions`
6. optionally control preview seek/load through preview commands
7. call `clawcut.start_export`
8. poll `clawcut.query_job` or `export.session`
9. inspect final output path and diagnostics

## Safety model

OpenClaw uses the same Clawcut safety rules as the UI:

- timeline edits still pass through the typed command engine
- preview control still passes through the preview bridge
- transcription still uses the caption session and job system
- export still uses the render compiler and export session
- filesystem-sensitive operations still require explicit validated inputs

This prevents OpenClaw from bypassing project validation rules simply because it is programmatic.

## Preview notes

Preview control is exposed through the local API, but the current runtime still depends on the active desktop session and renderer-backed preview adapter. That is enough for local automation, but it is not yet a headless render-preview backend.

## Jobs and polling

OpenClaw should treat long-running actions as asynchronous:

- import
- transcription
- export

Recommended polling paths:

- `jobs.get`
- `jobs.list`
- `captions.session`
- `export.session`

## Current limitations

- no remote or cloud-facing API
- no multi-user auth model
- preview requires a live desktop window
- event streaming is not implemented yet; polling is the supported integration model
- tool discovery is stable enough for local automation, not a final public plugin marketplace contract

## How later stages build on this

Stage 8 hardening should add:

- stronger diagnostics and request logging
- packaged-build validation for the local API path
- migration coverage for external payload compatibility
- performance budgets for automation-heavy workflows

Later smart-editing and OpenClaw orchestration stages can reuse the same authenticated tool and API boundary instead of introducing another control plane.
