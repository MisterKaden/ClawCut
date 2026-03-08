# Testing Strategy

## Domain tests

Vitest covers the pure domain model first.

Current domain coverage includes:

- project schema creation and migration through `ProjectDocumentV6`
- timeline command behavior and undo-safe edit math
- preview composition and quality/source resolution
- render-plan compilation and export target resolution
- transcript normalization and editable transcript behavior
- caption generation, template application, subtitle formatting, and burn-in hooks
- smart suggestion generation:
  - silence
  - filler words
  - highlights
- smart edit-plan compilation and rationale structure
- brand-kit schema validation and override merge behavior
- workflow template validation
- workflow safety-profile aggregation
- workflow dependency ordering and approval-step metadata

These tests are the main safety net for logic shared by:

- the desktop UI
- the local control surface
- the OpenClaw adapter
- future higher-level automation

## Worker integration tests

Worker tests cover real persistence and orchestration behavior with temp projects.

Current worker coverage includes:

- project persistence
- ingest, cache, relink, and derived-asset registration
- editor session execution and timeline persistence
- export queue lifecycle and verification
- transcription job lifecycle
- caption persistence and subtitle export
- smart analysis persistence and suggestion application
- workflow run lifecycle
- approval boundary behavior
- resume/retry semantics
- workflow artifact creation
- parent workflow job and child job linkage
- batch workflow partial-failure behavior
- local brand-kit store persistence and project default assignment

These tests intentionally exercise the worker-owned services instead of reproducing logic inside test helpers.

## Control and OpenClaw tests

The control surface is tested as a schema-first contract.

Current coverage includes:

- command/query schema descriptors
- safety and mutability classification
- allowlist/default exposure rules
- OpenClaw manifest generation
- OpenClaw adapter tool mapping
- authenticated local transport success/failure
- structured validation errors
- capability discovery
- SSE payload shape for jobs and workflows
- preview frame-reference queries
- workflow and brand-kit operation mapping

The goal is to keep OpenClaw and local automation on the same typed contract the UI already uses.

## Renderer tests

Renderer tests stay focused on renderer-owned behavior only:

- preview controller state transitions
- adapter-mediated playback control
- preview overlay resolution
- caption overlay activation
- workflow panel rendering and interaction wiring as needed

The renderer does not get to own domain logic, so domain behaviors are tested elsewhere.

## Smoke tests

Smoke verification launches the built Electron app and drives real end-to-end flows.

Current smoke coverage includes:

1. create a temp project
2. verify the local control surface comes up authenticated
3. verify unauthorized requests are rejected
4. verify capability and OpenClaw manifest/tool discovery
5. import sample media through the integration boundary
6. wait for ingest and derived assets to settle
7. create timeline and insert linked media
8. verify preview load, seek, play, pause, frame-step, and proxy/original switching
9. transcribe a clip with the fixture adapter
10. generate captions and verify preview-visible caption overlays
11. export subtitles
12. run video and audio exports plus output verification
13. capture export/timeline snapshots
14. run Stage 8 smart analysis, inspect suggestions, compile a plan, apply one suggestion, reject one suggestion, and undo
15. create a fresh workflow-oriented project for Stage 9
16. run `captioned-export-v1` end to end
17. run `smart-cleanup-v1` through approval, approval-aware resume, application, and undo verification
18. run `batch-caption-export-v1` over multiple clip targets
19. inspect workflow artifacts/results through the integration boundary
20. capture a screenshot artifact

The smoke path is intentionally fixture-driven and deterministic:

- fixture transcription adapter
- deterministic waveform override for the workflow cleanup path
- local temp projects only

## Verification posture per stage

For shipped work the verification bar remains:

- install dependencies when needed
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm smoke`

When workflow or transport architecture changes, update tests and smoke in the same change set.

## Current limitations

- Smoke is broad and therefore slower than unit/integration tests.
- Workflow smoke currently validates built-in templates only.
- The SSE stream is lightweight and polling-backed, so integration tests focus on envelope shape and emitted topics rather than strict event timing guarantees.
