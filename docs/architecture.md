# Clawcut Architecture

## Core posture

Clawcut owns the edit model.

FFmpeg and ffprobe remain execution backends. They are not the product architecture.

Stage 3 now enforces this application shape:

- UI
- typed command gateway
- command engine
- pure timeline domain
- project state, job system, and media worker

That same command path is now usable by the renderer and by future programmatic callers such as OpenClaw.

## Runtime boundaries

- `apps/desktop`
  - Electron shell
  - native dialogs
  - preload bridge
  - renderer state and UI only
- `packages/ipc`
  - typed request and snapshot contracts
  - shared IPC channel names
- `packages/domain`
  - project schema
  - timeline entities
  - command types
  - pure timeline command engine
  - history summary types
  - job base types
- `packages/media-worker`
  - project persistence
  - editor session service
  - undo/redo stacks
  - ingest, derived assets, relink
  - ffprobe, ffmpeg, SQLite, cache IO

The renderer still never touches ffprobe, ffmpeg, SQLite, or project files directly.

## Project storage

Clawcut remains hybrid:

- `clawcut.project.json`
  - canonical project document
  - user-owned source of truth
- `.clawcut/project.db`
  - worker-owned operational state
  - job rows
  - derived-asset manifests
  - schema metadata
- `.clawcut/cache/`
  - deterministic media derivatives

Stage 3 does not persist undo and redo stacks. History is session-scoped in memory.

## Project document

Stage 3 moves the canonical document to `ProjectDocumentV3`.

The document now contains:

- project identity and timestamps
- stable settings
- `library.items[]`
- `timeline`

The document always loads through a migration entrypoint.

Migration rules now are:

- V1 -> V2 upgrades legacy media references into Stage 2 media items
- V2 -> V3 preserves the media library and replaces the placeholder timeline root with an empty Stage 3 timeline

## Timeline model

Timeline time is stored as integer microseconds.

The Stage 3 timeline owns:

- `id`
- `timeUnit`
- `playheadUs`
- `zoom`
- `trackOrder`
- `tracksById`
- `clipsById`
- `markers`
- `regions`
- `snapToleranceUs`

Tracks own:

- `id`
- `kind`
- `name`
- `locked`
- `visible`
- `muted`
- `clipIds`

Clips own:

- `id`
- `trackId`
- `mediaItemId`
- `streamType`
- `sourceInUs`
- `sourceOutUs`
- `timelineStartUs`
- `enabled`
- `transform`
- `speed`
- `gainDb`
- `tags`

Derived values such as clip duration and clip end remain computed, not duplicated.

## Command engine

Every meaningful Stage 3 edit is a typed command.

Implemented command set:

- `CreateTimeline`
- `AddTrack`
- `InsertClip`
- `InsertLinkedMedia`
- `SplitClip`
- `TrimClipStart`
- `TrimClipEnd`
- `MoveClip`
- `RippleDeleteClip`
- `LockTrack`
- `UnlockTrack`
- `AddMarker`
- `RemoveMarker`
- `SetPlayhead`
- `Undo`
- `Redo`

Command flow:

1. renderer or caller submits a typed command
2. worker editor session loads the current project
3. pure domain engine validates and applies the command
4. worker persists the new timeline immediately when the command changes state
5. worker updates in-memory history when the command is reversible
6. caller receives a structured result plus a fresh editor session snapshot

## Domain rules

Stage 3 command validation enforces:

- no overlap on the same track
- track kind must match clip stream type
- locked tracks reject edits unless a future privileged override is supplied
- trim and split must stay inside source bounds
- snap decisions happen in the command engine, not the renderer

Snap targets currently include:

- playhead
- marker positions
- clip start edges
- clip end edges

Default snap tolerance is `100_000` microseconds.

## Undo and redo

Undo and redo live in the worker editor session service.

Stage 3 behavior:

- reversible commands store full before and after timeline snapshots
- `SetPlayhead` is explicitly non-reversible
- `Undo` swaps in the stored `beforeTimeline`
- `Redo` swaps in the stored `afterTimeline`
- undo and redo stacks clear redo on new reversible edits
- history is queryable through `EditorHistorySummary`

This is intentionally simple for Stage 3. It prioritizes trustworthy rollback over storage efficiency.

## Internal API foundation

The first internal programmatic control layer is now the typed IPC command gateway:

- `getEditorSessionSnapshot({ directory })`
- `executeEditorCommand({ directory, command })`

This is intentionally not a public HTTP API yet.

It is enough for:

- the renderer
- smoke automation
- future OpenClaw orchestration

Because the business logic now lives in shared domain rules plus the worker session layer, later callers do not need to reproduce editor semantics.

## Media library and Stage 2 carry-forward

Stage 2 systems remain intact under Stage 3:

- layered media identity
- ffprobe normalization
- deterministic thumbnail, waveform, and proxy generation
- deterministic cache layout
- missing-media detection and conservative relink
- persisted job rows and retry behavior

Timeline clips reference imported media items by `mediaItemId`. The timeline never owns raw source file semantics itself.

## Known Stage 3 limitations

- undo and redo are not persisted across restart
- same-track overwrite editing is not implemented
- ripple delete only closes gaps on the affected track
- direct manipulation is intentionally basic and correctness-first
- preview playback remains a Stage 4 concern
- export compilation remains a Stage 5 concern
