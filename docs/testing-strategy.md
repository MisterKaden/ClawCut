# Testing Strategy

## Domain tests

Vitest covers the pure project, timeline, preview, transcript/caption, and render-compiler logic:

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
- render compilation
  - span slicing across gaps and trims
  - explicit range and region target resolution
  - topmost visible video resolution
  - mixed audio contribution resolution
  - preset validation and unsupported-feature failures
- transcript normalization
  - word-level timing storage
  - glossary normalization and prompt guidance composition
  - transcript text editing without timing loss
- caption generation
  - transcript-to-caption mapping
  - template application
  - SRT/ASS formatting
  - preview overlay activation and active-word highlighting
  - transcript summary and caption coverage reporting

These tests are the main safety net because the editing and preview semantics are shared by the UI and future programmatic callers.

## Worker integration tests

Worker tests cover Stage 2 media flows plus Stage 3 editing persistence, Stage 5 export execution, and Stage 6 transcription/caption workflows:

- project persistence
- derived-asset registration
- ingest, proxy, thumbnail, waveform, and relink flows
- exact-duplicate import safety
- editor session command execution
- undo and redo stacks
- autosave of timeline edits
- editor session snapshot queries
- export queue lifecycle
- successful video export plus ffprobe verification
- successful audio-only export plus ffprobe verification
- transcription job lifecycle
- deterministic fixture-backed transcription
- transcription guidance request handling
- engine-unavailable failure and retry
- caption-track persistence and subtitle export
- burn-in export with caption artifacts
- range export duration verification
- development-manifest and concat artifact persistence
- snapshot capture from completed export output
- snapshot capture from a selected timeline position
- missing-media export failure
- invalid destination failure
- cancellation and retry

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

## Local API tests

Stage 7 adds HTTP-level tests around the authenticated local control surface:

- unauthenticated requests rejected with structured auth errors
- malformed request envelopes rejected with structured validation errors
- scope enforcement for mutating and privileged actions
- command dispatch for project, export, and caption operations
- query dispatch for timeline, preview, and job state
- capability discovery and OpenClaw tool-manifest discovery
- job-detail queries resolve related export and transcription runs

These tests run against the real local API server class on an ephemeral localhost port with fake worker and preview bridges.

## Smoke tests

Smoke verification launches the built Electron app and drives the desktop shell through the typed control surfaces:

1. create a temp project
2. wait for the local API to report a running authenticated control surface
3. verify unauthenticated capability requests are rejected
4. verify authenticated capabilities and OpenClaw tool discovery
5. open the project through the local API
6. import a temp-copied sample video through the local API
7. wait for ingest and derived jobs to settle through the local API
8. verify metadata and waveform UI render
9. create the default timeline
10. insert linked media
11. split the initial clip into sequential segments
12. load the preview engine
13. verify fast mode prefers proxies
14. verify standard mode prefers originals
15. seek, play, pause, and frame-step through preview
16. query timeline state through the local API
17. transcribe the selected clip through the local API using the fixture transcription adapter
18. verify transcription job details are queryable through the local API
19. generate a caption track through the local API
20. load preview and seek through the local API, then verify a preview caption overlay appears
21. export an SRT sidecar through the local API
22. enable burn-in captions through the local API
23. queue a burn-in video export through the local API and verify the output is probeable
24. query export job progress through the local API
25. capture a still frame from the completed export through the local API
26. queue an audio export through the local API and verify the output contains audio
27. capture a still frame from a selected timeline position through the local API
28. reopen the project and verify the timeline persisted
29. capture a screenshot artifact

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
