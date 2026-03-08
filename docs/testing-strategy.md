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
- smart editing
  - silence detection normalization from waveform envelopes
  - filler-word heuristic detection and timing linkage
  - weak-segment and highlight suggestion output shape
  - suggestion scoring, rationale, and evidence structure
  - dry-run edit-plan compilation
  - range-delete and region-plan command generation

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
- smart analysis job lifecycle
- smart suggestion persistence and edit-plan persistence
- suggestion application through the editor command engine
- undo after smart-plan application
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
- canonical operation-schema validation
- command dispatch for project, export, and caption operations
- query dispatch for timeline, preview, preview-frame inspection, and job state
- capability discovery, OpenClaw tool discovery, and OpenClaw manifest discovery
- OpenClaw plugin adapter mapping
- authenticated SSE event-stream updates
- job-detail queries resolve related export and transcription runs
- smart session queries and suggestion inspection
- smart preview-seek command mapping for suggestion review

These tests run against the real local API server class on an ephemeral localhost port with fake worker and preview bridges.

## Smoke tests

Smoke verification launches the built Electron app and drives the desktop shell through the typed control surfaces:

1. create a temp project
2. wait for the local API to report a running authenticated control surface
3. verify unauthenticated capability requests are rejected
4. verify authenticated capabilities, OpenClaw tool discovery, and OpenClaw manifest discovery
5. verify the thin OpenClaw adapter can read the manifest
6. open the project through the local control surface
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
16. verify the authenticated local event stream emits `ready` and `jobs.snapshot`
17. query timeline state through the OpenClaw adapter or local transport
18. inspect the current preview frame through the local API
19. transcribe the selected clip through the OpenClaw adapter using the fixture transcription adapter
20. verify transcription job details are queryable through the local API
21. generate a caption track through the OpenClaw adapter
22. load preview and seek through the local API, then verify a preview caption overlay appears
23. export an SRT sidecar through the local API
24. enable burn-in captions through the local API
25. queue a burn-in video export through the OpenClaw adapter and verify the output is probeable
26. query export job progress through the OpenClaw adapter or local transport
27. capture a still frame from the completed export through the local API
28. queue an audio export through the local API and verify the output contains audio
29. capture a still frame from a selected timeline position through the local API
30. run silence analysis through the OpenClaw adapter
31. inspect and seek to a suggestion through the OpenClaw adapter
32. compile a dry-run smart edit plan
33. apply one smart suggestion and verify the timeline shortens
34. reject one smart suggestion and verify its review state persists
35. undo the smart edit and verify the timeline restores
36. reopen the project and verify the timeline persisted
37. capture a screenshot artifact

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
