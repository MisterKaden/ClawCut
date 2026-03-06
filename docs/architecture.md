# Clawcut Architecture

## Core posture

Clawcut owns the edit model. FFmpeg and ffprobe are execution backends, not the product architecture.

Stage 1 keeps that boundary explicit:

- `packages/domain` owns the versioned project schema, preview contract, and render IR placeholder.
- `packages/media-worker` owns FFmpeg, ffprobe, fixture probing, and SQLite-backed metadata.
- `apps/desktop` owns Electron shell concerns, typed IPC, and renderer state.

## Stage 1 runtime boundaries

- The renderer only talks to preload through typed IPC.
- Electron main orchestrates project lifecycle and the preview placeholder.
- The media worker runs in a separate Node process so media inspection and SQLite IO stay outside the renderer and outside UI components.
- Project data is hybrid:
  - `clawcut.project.json` is the canonical project document.
  - `.clawcut/project.db` stores derived asset metadata and cache-oriented state.

## Domain model

`ProjectDocumentV1` is the source of truth for user-authored state:

- schema version
- project identity and timestamps
- settings defaults
- media references
- empty but versioned timeline root

The project document always loads through a migration entrypoint even though Stage 1 only ships v1.

## Preview posture

Stage 1 ships a `PreviewEngine` interface plus a placeholder backend. This prevents the renderer and project lifecycle from depending directly on a specific playback stack before preview work begins.

## Export posture

Stage 1 does not render video, but it defines render IR ownership in the domain package so later stages can compile deterministic job specs and FFmpeg filter assets without reworking UI state.
