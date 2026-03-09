# Clawcut Architecture

## Core posture

Clawcut owns the editing model, the preview model, the transcript/caption model, the render model, and now the workflow model.

FFmpeg, ffprobe, and transcription runtimes are execution backends. They are never the source of truth.

After Stage 9 the system shape is:

- desktop UI
- OpenClaw plugin adapter
- local authenticated control transport
- schema-owned command/query layer
- workflow and brand-kit layer
- smart analysis and suggestion layer
- pure domain engines
- preview engine
- render compiler
- transcript and caption engine
- worker persistence, jobs, and media execution

The invariant remains:

- UI does not own business logic
- automation does not bypass business logic
- workflows do not bypass commands/jobs
- export does not bypass render plans

## Runtime boundaries

- `apps/desktop`
  - Electron shell
  - native dialogs
  - preload bridge
  - renderer UI
  - main-process local control server
  - renderer-local `PreviewEngine`
- `packages/ipc`
  - stable command/query schema registry
  - request/response contracts
  - capability and tool metadata
- `packages/domain`
  - versioned project schema
  - timeline entities and command engine
  - preview state/composition model
  - render plan/compiler model
  - transcript/caption/template model
  - smart suggestion/edit-plan model
  - workflow and brand-kit definitions
- `packages/media-worker`
  - project persistence
  - ingest, cache, relink
  - editor session
  - preview-related query support
  - export session
  - caption/transcription session
  - smart analysis session
  - workflow engine
  - SQLite and filesystem artifacts
- `packages/openclaw-plugin`
  - thin OpenClaw-facing manifest/config/tool adapter

## Canonical project model

The canonical document is now `ProjectDocumentV6`.

The project file owns:

- project identity and timestamps
- stable project settings
- media library
- timeline
- transcripts
- caption tracks and caption export defaults
- project-level branding default: `settings.branding.defaultBrandKitId`

The project file does not own:

- worker job rows
- export run rows
- transcription run rows
- smart suggestion run rows
- workflow runs
- local brand-kit library
- preview transport session state

Those remain worker-owned operational state.

## Stage 10 hardening posture

Stage 10 keeps the canonical project schema at `ProjectDocumentV6` and hardens the operational layer around it.

The main additions are:

- startup recovery for interrupted operational runs
- sequential SQLite migrations with explicit schema versions
- session-scoped diagnostics and request logging
- packaged-build validation for the macOS desktop app
- fixture-backed performance budgets

These are reliability features. They do not change the ownership boundary of the canonical editing model.

## Project and operational storage

Clawcut remains hybrid:

- `clawcut.project.json`
  - canonical user-owned document
  - versioned and migratable
- `.clawcut/project.db`
  - worker-owned operational state
  - ingest/export/transcription/smart/workflow rows
- `.clawcut/cache/`
  - deterministic derived media assets
- `.clawcut/exports/`
  - export job artifacts, logs, and verification
- `.clawcut/workflows/`
  - workflow-run artifacts, step payloads, and diagnostics

Stage 9 adds worker-owned tables for:

- `workflow_runs`
- `workflow_step_runs`
- `workflow_batch_items`
- `workflow_approvals`
- `workflow_artifacts`

Stage 10 extends operational storage with:

- sequential DB migrations up to schema version `2`
- `recovery_json` persisted on job/export/transcription/smart/workflow rows
- per-session log directories under the desktop user-data path

## Command/query schema as the primary contract

Clawcut’s external control surface is schema-first.

Every externally callable operation has:

- canonical name
- input schema
- result contract
- structured error contract
- safety class
- mutability class
- execution mode
- required scope

The schema layer is the product contract. Transport and plugin adapters consume it.

Stage 10 adds a diagnostics query surface on top of the same contract:

- `diagnostics.session`

That snapshot is machine-readable and returns:

- recoverable operational runs
- recent worker/control-surface failures
- migration status
- session log paths

## Local control transport

The local HTTP transport is secondary to the schema layer.

It exists for:

- OpenClaw adapter communication
- local automation scripts
- diagnostics
- event streaming

Current properties:

- binds to localhost by default
- bearer token auth is mandatory
- scope-gated commands and queries
- structured envelopes with request ids
- capability discovery
- machine-readable OpenClaw manifest export
- lightweight SSE updates for jobs and workflows

Stage 10 adds request-log persistence for the local transport. Request bodies are still redacted at the boundary where secrets or tokens could otherwise leak into logs.

## OpenClaw integration boundary

The OpenClaw adapter is intentionally thin.

It does not implement media, timeline, caption, export, or workflow logic. It only maps:

- OpenClaw tool names
- validated tool inputs
- Clawcut command/query names
- Clawcut result envelopes

This preserves one authoritative behavior path for:

- UI
- local automation
- OpenClaw

## Smart editing and workflow layering

Stage 8 established the smart editing pattern:

1. analyze
2. produce suggestions
3. compile edit plan
4. apply through commands

Stage 9 packages those primitives into reusable workflows:

1. resolve workflow template + inputs
2. instantiate workflow run
3. execute typed steps
4. halt at approval boundaries when required
5. resume/retry safely
6. persist artifacts and machine-readable outcomes

The workflow engine composes existing systems. It does not replace them.

## Recovery model

Recovery is worker-owned and runs before normal snapshot polling.

On project open or project-scoped session access, the worker scans interrupted operational rows:

- `job_runs`
- `export_runs`
- `transcription_runs`
- `smart_analysis_runs`
- `workflow_runs`

If a row was left in an active state such as `queued` or `running`, it is converted into a recoverable state with explicit metadata:

- recovery state
- suggested recovery action (`retry` or `resume`)
- reason
- timestamp

Recovery does not attempt to restore UI state or undo/redo history. It restores operational visibility and safe retry/resume posture only.

## Diagnostics and auditability

Stage 10 standardizes lightweight local diagnostics around per-session JSONL logs.

Current sources include:

- local transport request logs
- worker diagnostics for export/transcription/smart/workflow failures
- artifact-linked paths returned by diagnostics snapshots

The intended shape is:

- timestamp
- subsystem
- severity
- stable machine code/message
- related ids such as request/job/export/transcription/workflow

This is optimized for local debugging and OpenClaw/local automation triage rather than remote ops aggregation.

## Migration posture

Project documents continue to migrate through the domain-layer migration entrypoint.

Operational SQLite storage now uses explicit sequential migrations instead of opportunistic latest-schema creation. This keeps recovery and packaging changes versionable without coupling them to canonical project-file schema bumps.

Current SQLite schema version: `2`

## Packaged-build posture

Stage 10 validates unsigned macOS packaged builds in CI and locally.

Important current limitation:

- the packaged app ships a bundled worker entry and packaged dependencies, but the worker still executes under the local Node runtime for current unsigned/dev packaging

This is intentional for now because the packaged `better-sqlite3` dependency currently aligns reliably with the local Node ABI in the validated packaging path. The limitation is explicit and covered by the packaged smoke path.

## Workflow model

Built-in workflow templates are defined in domain code and are versioned, typed, and inspectable.

Stage 9 ships:

- `captioned-export-v1`
- `smart-cleanup-v1`
- `short-clip-candidates-v1`
- `batch-caption-export-v1`

Each template defines:

- id
- name
- version
- input schema
- ordered steps
- output expectations
- safety profile
- batch mode

Each step defines:

- bounded step kind
- safety class
- mutability
- execution mode
- dependency ordering
- optional `runIf`
- approval requirement

Current execution model is sequential topological execution with resumable step state.

## Workflow run model

Workflow runs are machine-readable operational records with:

- top-level run status
- step runs
- optional batch item runs
- approval records
- artifact records
- parent workflow job
- child export/transcription/analysis job references
- warnings and structured errors

Run statuses:

- `queued`
- `planning`
- `running`
- `waiting-approval`
- `completed`
- `failed`
- `cancelled`

Step and batch statuses:

- `pending`
- `running`
- `completed`
- `failed`
- `skipped`
- `waiting-approval`
- `cancelled`

## Approval boundaries

Approval is a first-class workflow concept, not an inline UI flag.

High-impact steps such as:

- applying smart edit plans
- export start
- future relink/overwrite flows

can require approval.

When reached, the workflow engine:

- persists a `WorkflowApproval`
- marks the run and step `waiting-approval`
- records proposed effects and linked artifacts
- waits for explicit approve/reject commands

This is the core safety boundary that later allows OpenClaw to orchestrate workflow planning without silently mutating projects.

## Workflow audit and candidate review

Stage 12 adds a second workflow-safety layer on top of approvals:

- persisted workflow audit events
- explicit candidate-package review state
- previewable candidate-package ranges

Workflow audit events are operational records, not canonical editing state. They exist so local
automation and OpenClaw can inspect:

- when a run was created
- how step status changed
- which artifacts were produced
- when approvals were created/resolved
- when a candidate package was reviewed or exported

Candidate-package review state is also operational:

- `new`
- `shortlisted`
- `approved`
- `rejected`
- `exported`

This keeps “analysis found a candidate”, “a reviewer accepted the candidate”, and “the candidate
was actually exported” as separate, machine-readable facts.

## Brand kits

Stage 11 extends brand kits into reusable local packaging packs.

Brand kits live outside the project document in app-local storage and currently contain:

- caption template choice
- caption style overrides
- safe-zone defaults
- export preset reference
- watermark asset path
- intro asset path
- outro asset path
- layout defaults
- export preset bundle metadata

Projects only keep:

- the default brand-kit id
- resolved style snapshot on caption tracks when applied

That keeps projects portable even if a user-defined local kit later disappears or its local assets move.

## Preview, captions, and export integration

Branding and workflow state do not bypass existing engines.

Current integration path:

- workflow step applies brand kit to caption track
- caption track stores `branding.brandKitId` plus resolved `styleOverrides`
- preview consumes caption track + style overrides
- subtitle export consumes caption track + style overrides
- burn-in export consumes caption track + style overrides through structured render hooks

For Stage 11 packaging workflows:

- workflow/export planning resolves `brandPackaging`
- export runtime validates intro/outro/watermark asset paths in the worker
- intro and outro assets are transcoded into preset-compatible intermediates
- watermark overlays are applied as a worker-owned FFmpeg stage
- development manifests record these packaging steps for debugging

## Workflow profiles and schedules

Stage 11 adds two machine-local reusable automation layers on top of built-in workflow templates.

Workflow profiles:

- bind a built-in `templateId` to reusable defaults
- carry approval policy, brand-kit defaults, export defaults, and optional-step preferences
- are stored in app data rather than projects

Workflow schedules:

- also live in app data
- point at workflow profiles
- resolve targets inside one project
- trigger normal workflow-profile runs through a lightweight main-process scheduler
- never bypass approval boundaries or workflow validation

The scheduler is intentionally a thin trigger loop, not a second orchestration engine.

## Artifact model

Workflow artifacts are explicit records, not scraped logs.

Current artifact kinds:

- transcript
- caption track
- subtitle
- export
- suggestion set
- edit plan
- snapshot
- regions
- diagnostic
- candidate-package
- candidate-export
- transcript-range-selection
- brand-asset
- schedule-report

Artifacts are linked to:

- workflow run
- optional step
- optional batch item

This makes higher-level automation inspectable and reusable.

## Batch model

Stage 11 batch processing is intentionally scoped:

- one project at a time
- multiple target clip ids inside that project
- per-item step execution and status
- partial failure allowed
- aggregate warnings and summary preserved

Cross-project workflow batching is explicitly deferred.

## Known Stage 11 limitations

- Workflow authoring is still built-in/profile-based only. There is no custom workflow DSL yet.
- Execution is sequential even though definitions carry dependency metadata.
- Approval is explicit but still polling/SSE-driven rather than a richer distributed event model.
- Brand kits are local to the current machine/app data, not shared assets.
- Batch runs are project-scoped, not multi-project orchestration.
- Scheduling is local-only and lightweight, not a distributed scheduler.
