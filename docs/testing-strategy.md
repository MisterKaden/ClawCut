# Testing Strategy

## Domain tests

Vitest covers the pure editing and schema layer:

- project document creation
- V1 -> V2 -> V3 migration
- timeline creation
- insert collision rules
- split math
- trim start and trim end math
- move across tracks
- ripple delete gap closing
- snapping to markers, clip edges, and playhead
- locked-track enforcement
- structured command failures

These tests are the main safety net for Stage 3 correctness because the command engine is shared by the renderer and future API callers.

## Worker integration tests

Worker tests now cover both Stage 2 media flows and Stage 3 session behavior:

- project persistence
- derived-asset registration
- ingest, proxy, thumbnail, waveform, and relink flows
- exact-duplicate import safety
- editor session command execution
- undo and redo stacks
- autosave of timeline edits
- editor session snapshot queries

The tests use temp project directories and local fixtures instead of relying on user media.

## Smoke tests

Smoke verification launches the built Electron app and drives the desktop shell through the typed API surface:

1. create a temp project
2. import a temp-copied sample video
3. wait for ingest and derived jobs to settle
4. verify metadata and waveform UI render
5. create the default timeline
6. insert linked media
7. move, split, trim, ripple delete, undo, and redo through the command gateway
8. reopen the project and verify the timeline persisted
9. capture a screenshot artifact

This keeps the smoke path focused on the highest-value integrated workflow without depending on fragile OS dialog automation for every edit.

## CI posture

CI should fail on regressions in:

- type safety
- lint
- pure command behavior
- worker media behavior
- worker editor-session behavior
- Electron smoke

The current workflow remains macOS-oriented because Electron plus local FFmpeg tooling should behave like the primary development environment.
