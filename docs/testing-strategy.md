# Testing Strategy

## Domain tests

Vitest covers the pure project, timeline, and preview logic:

- project document creation
- V1 -> V2 -> V3 migration
- timeline creation
- insert collision rules
- split, trim, move, and ripple-delete math
- snapping to markers, clip edges, and playhead
- locked-track enforcement
- preview composition
  - active clip resolution
  - gap handling
  - proxy vs original selection
  - trim-to-source mapping
  - overlay activation
  - frame-step sizing

These tests are the main safety net because the editing and preview semantics are shared by the UI and future programmatic callers.

## Worker integration tests

Worker tests cover Stage 2 media flows plus Stage 3 editing persistence:

- project persistence
- derived-asset registration
- ingest, proxy, thumbnail, waveform, and relink flows
- exact-duplicate import safety
- editor session command execution
- undo and redo stacks
- autosave of timeline edits
- editor session snapshot queries

The tests use temp project directories and local fixtures instead of relying on user media.

## Renderer preview tests

Renderer-side tests cover the Stage 4 preview engine without depending on real DOM media playback:

- preview state transitions
- command-driven load, seek, play, pause, and frame step
- quality-mode switching
- sequential clip resolution
- programmatic frame snapshot capture foundation
- structured preview errors when accurate preview cannot resolve a source

The `PreviewController` is tested with a fake scheduler and a fake backend so timing and transport behavior stay deterministic.

## Smoke tests

Smoke verification launches the built Electron app and drives the desktop shell through the typed control surfaces:

1. create a temp project
2. import a temp-copied sample video
3. wait for ingest and derived jobs to settle
4. verify metadata and waveform UI render
5. create the default timeline
6. insert linked media
7. split the initial clip into sequential segments
8. load the preview engine
9. verify fast mode prefers proxies
10. verify standard mode prefers originals
11. seek, play, pause, and frame-step through preview
12. reopen the project and verify the timeline persisted
13. capture a screenshot artifact

This keeps smoke focused on the highest-value integrated editor workflow while still avoiding fragile OS dialog automation for every interaction.

## CI posture

CI should fail on regressions in:

- type safety
- lint
- pure timeline behavior
- pure preview behavior
- worker media behavior
- worker editor-session behavior
- Electron smoke

The current workflow remains macOS-oriented because Electron plus local FFmpeg tooling should behave like the primary development environment.
