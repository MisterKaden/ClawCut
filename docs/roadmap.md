# Clawcut Roadmap

## Stage 1: Bootstrap

Status: complete

Delivered:

- desktop shell
- project create/open flow
- FFmpeg/ffprobe detection
- canonical project schema
- basic metadata flow

## Stage 2: Media ingest, cache, and relink

Status: complete

Delivered:

- media import and normalized metadata
- thumbnails, waveform summaries, proxies
- deterministic cache layout
- missing-media detection and relink
- ingest/retry/status UI and tests

## Stage 3: Timeline core

Status: complete

Delivered:

- command-driven timeline model
- clip insert/split/trim/move/ripple delete/snap
- track locking
- undo/redo
- timeline persistence
- internal command/query gateway

## Stage 4: Preview

Status: complete

Delivered:

- `PreviewEngine` abstraction
- play/pause/seek/scrub/frame-step
- preview quality modes
- overlay model
- machine-readable preview state
- preview inspection foundations

## Stage 5: Render compiler and export

Status: complete

Delivered:

- app-owned render plan / IR
- structured FFmpeg execution specs
- video/audio export presets
- deterministic export artifacts
- verification via file checks and ffprobe
- export snapshots and bounded export targets

## Stage 6: Transcripts and captions

Status: complete

Delivered:

- transcription adapter layer
- editable transcript model with word timing
- caption tracks and templates
- subtitle export
- burn-in caption hooks
- command-driven caption workflows

## Stage 7: Plugin-first control and OpenClaw integration

Status: complete

Delivered:

- stable command/query schema layer
- safety and mutability classification
- local authenticated transport
- OpenClaw-compatible plugin boundary
- tool manifest export
- preview inspection and event-stream foundations

## Stage 8: Smart editing

Status: complete

Delivered:

- silence analysis
- filler-word analysis
- highlight suggestion generation
- persisted suggestion sets and edit plans
- dry-run before apply
- apply/reject flows through existing command paths

## Stage 9: Workflows, brand kits, and approval-aware orchestration

Status: complete

Acceptance criteria:

- reusable workflow definition system exists
- workflow runs are persisted and machine-readable
- approval/checkpoint flow exists for high-impact steps
- brand kits exist and can be applied through workflows
- built-in workflow templates ship
- batch workflows work inside one project
- workflow artifacts are explicit and inspectable
- OpenClaw-facing higher-level workflow tools exist
- workflow safety classification remains explicit
- docs, tests, and smoke cover the shipped flow

Delivered:

- built-in templates:
  - `captioned-export-v1`
  - `smart-cleanup-v1`
  - `short-clip-candidates-v1`
  - `batch-caption-export-v1`
- resumable workflow-run engine
- approval queue and resume/reject flow
- workflow artifact tracking
- local brand-kit store plus project default brand-kit reference
- workflow and brand-kit OpenClaw tools
- Stage 9 desktop workflow panel

Current Stage 9 notes:

- workflow authoring is built-in only
- batch scope is one project at a time
- execution is sequential, not parallel

## Stage 10: Hardening

Delivered:

- crash recovery and interruption handling are stronger
- project/document and workflow migrations have broader coverage
- packaged-build validation covers preview, export, captions, and workflows
- diagnostics and audit logs are easier to inspect
- performance budgets exist for preview, export, transcription, smart analysis, and workflows
- regression fixtures run in CI

Delivered details:

- startup recovery for interrupted job/export/transcription/smart/workflow runs
- explicit SQLite operational migrations through schema version `2`
- diagnostics snapshot and in-app recovery panel
- session-scoped worker/request log paths in diagnostics output
- macOS packaged build scripts plus packaged smoke coverage
- packaged-verify CI job
- fixture-backed latency budgets for open/query/seek/compile/transcription/workflow snapshot paths

Current Stage 10 notes:

- packaged validation is macOS-first and unsigned
- the packaged worker still uses the local Node runtime in the validated path
- undo/redo remains session-scoped; Stage 10 does not add full UI session restore

## Stage 11: Workflow profiles, scheduling, and social packaging

Status: complete

Acceptance criteria:

- reusable workflow profiles exist and are machine-readable
- local schedules can start workflow-profile runs without bypassing approvals
- brand kits can package watermark and intro/outro assets through structured export hooks
- transcript-range and social candidate packaging workflows exist
- workflow/profile/schedule OpenClaw tools exist
- batch packaging remains reviewable and project-scoped
- docs, tests, and smoke cover the shipped flow

Delivered:

- reusable `WorkflowProfile` records stored in app data
- reusable `WorkflowSchedule` records and a lightweight main-process scheduler
- extended brand kits with watermark, intro, and outro asset references
- structured export `brandPackaging` flow through render plan and worker execution
- built-in workflows:
  - `social-candidate-package-v1`
  - `transcript-range-package-v1`
- candidate-package artifact generation and export
- OpenClaw/profile/schedule tool coverage and SSE workflow updates
- Stage 11 desktop workflow/profile/schedule UI

Current Stage 11 notes:

- workflow authoring is still built-in/profile-based only
- scheduling is local-only and intentionally lightweight
- batch scope remains one project at a time
- brand assets are validated local paths, not shared cloud assets

## Stage 12: Beast mode

Status: complete

Acceptance criteria:

- deeper audit/history and automation observability exist for workflow-heavy local automation
- candidate packages are reviewable before export and their review state is machine-readable
- workflow audit/history is queryable and exposed through the OpenClaw-facing control surface
- preview inspection can jump directly to candidate-package ranges for review
- docs, tests, and smoke cover the shipped review/audit workflow

Delivered:

- persisted `WorkflowAuditEvent` records in operational storage
- workflow-session snapshots now include audit events ordered newest first
- candidate packages now carry explicit review state:
  - `new`
  - `shortlisted`
  - `approved`
  - `rejected`
  - `exported`
- explicit `ReviewWorkflowCandidatePackage` command path
- local control and OpenClaw surface additions:
  - `workflow.auditEvents`
  - `workflow.seekPreviewToCandidatePackage`
  - `workflow.reviewCandidatePackage`
  - `clawcut.list_candidate_packages`
  - `clawcut.inspect_candidate_package`
  - `clawcut.list_workflow_audit_events`
  - `clawcut.seek_preview_to_candidate_package`
  - `clawcut.review_candidate_package`
- desktop workflow UI for:
  - candidate review notes/status
  - previewing candidate-package ranges
  - recent workflow audit history

Current Stage 12 notes:

- workflow audit is optimized for local automation observability, not remote ops aggregation
- candidate review is project-local operational state, not canonical timeline content
- preview seeking for candidate review still relies on the live desktop preview backend
