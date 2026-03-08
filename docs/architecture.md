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

## Brand kits

Stage 9 introduces reusable brand kits as local, versioned, app-owned style packs.

Brand kits live outside the project document in app-local storage and currently contain:

- caption template choice
- caption style overrides
- safe-zone defaults
- export preset reference
- logo/watermark placeholder hook
- intro/outro placeholder hook

Projects only keep:

- the default brand-kit id
- resolved style snapshot on caption tracks when applied

That keeps projects portable even if a user-defined local kit later disappears.

## Preview, captions, and export integration

Branding and workflow state do not bypass existing engines.

Current integration path:

- workflow step applies brand kit to caption track
- caption track stores `branding.brandKitId` plus resolved `styleOverrides`
- preview consumes caption track + style overrides
- subtitle export consumes caption track + style overrides
- burn-in export consumes caption track + style overrides through structured render hooks

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

Artifacts are linked to:

- workflow run
- optional step
- optional batch item

This makes higher-level automation inspectable and reusable.

## Batch model

Stage 9 batch processing is intentionally scoped:

- one project at a time
- multiple target clip ids inside that project
- per-item step execution and status
- partial failure allowed
- aggregate warnings and summary preserved

Cross-project workflow batching is explicitly deferred.

## Known Stage 9 limitations

- Workflow authoring is built-in only. There is no custom workflow DSL yet.
- Execution is sequential even though definitions carry dependency metadata.
- Approval is explicit but still polling/SSE-driven rather than a richer distributed event model.
- Brand kits are local to the current machine/app data, not shared assets.
- Batch runs are project-scoped, not multi-project orchestration.
