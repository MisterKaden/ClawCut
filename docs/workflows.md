# Workflow Engine

## Purpose

Stage 9 packages Clawcut’s lower-level commands and jobs into reusable, approval-aware workflows.

The core rule is:

- workflow template
- resolved workflow run
- step execution through existing services

not:

- hidden workflow-only business logic

## Workflow templates

Workflow templates are built-in, versioned, typed definitions in the domain layer.

Current built-ins:

- `captioned-export-v1`
- `smart-cleanup-v1`
- `short-clip-candidates-v1`
- `batch-caption-export-v1`

Each template defines:

- `id`
- `name`
- `description`
- `version`
- `batchMode`
- `inputSchema`
- `steps`
- `expectedOutputs`
- `safetyProfile`

## Step model

Each workflow step declares:

- `kind`
- `name`
- `description`
- `dependsOn`
- `safetyClass`
- `mutability`
- `execution`
- `requiresApproval`
- optional `runIf`

Current step kinds:

- `transcribeClip`
- `generateCaptionTrack`
- `applyBrandKit`
- `exportSubtitles`
- `startExport`
- `analyzeSilence`
- `findFillerWords`
- `generateHighlights`
- `compileSmartPlan`
- `applySuggestionSet`
- `createRegionsFromSuggestions`
- `captureExportSnapshot`
- `approvalCheckpoint`

## Workflow run model

Workflow runs are worker-owned records with:

- top-level workflow status
- step runs
- optional batch item runs
- approval records
- artifact records
- warnings
- structured error
- parent workflow job id

Top-level statuses:

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

## Approval checkpoints

Approval is explicit and machine-readable.

When a step requires approval:

1. the engine persists a `WorkflowApproval`
2. the step becomes `waiting-approval`
3. the run becomes `waiting-approval`
4. execution stops
5. a later approve/reject command resumes or terminates the run

This keeps high-impact automation reviewable for both humans and OpenClaw.

## Batch model

Stage 9 batch workflows are limited to multiple target clip ids inside one project.

Properties:

- per-item run state is isolated
- partial failure is allowed
- aggregate warnings summarize batch failure counts
- artifact records can belong to the run and optionally to a batch item

Cross-project batch orchestration is intentionally deferred.

## Artifacts

Workflow artifacts are explicit typed outputs, not scraped log entries.

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

Artifacts live under `.clawcut/workflows/<workflowRunId>/` and are also recorded in SQLite.

## Built-in workflows

### `captioned-export-v1`

Purpose:

- transcribe a clip
- generate captions
- optionally apply a brand kit
- optionally export subtitles
- optionally pause for approval
- export final media

Typical use:

- talking-head captioned master export
- reviewable caption burn-in pipeline

### `smart-cleanup-v1`

Purpose:

- analyze silence
- analyze filler words
- compile a smart edit plan
- stop for approval
- apply the selected suggestion set

Typical use:

- reviewable dead-air cleanup
- transcript-aware cleanup with undo support

### `short-clip-candidates-v1`

Purpose:

- generate highlight suggestions
- optionally create timeline regions
- optionally capture review snapshots

Typical use:

- shortlist candidate moments before manual selection

### `batch-caption-export-v1`

Purpose:

- transcribe multiple target clips
- generate captions
- optionally apply a brand kit
- export subtitles and/or media per item

Typical use:

- repeatable local batch packaging for many clips inside one project

## OpenClaw exposure

Stage 9 adds higher-level workflow tools such as:

- `clawcut.list_workflows`
- `clawcut.inspect_workflow`
- `clawcut.start_workflow`
- `clawcut.start_batch_workflow`
- `clawcut.query_workflow_run`
- `clawcut.list_workflow_runs`
- `clawcut.list_pending_approvals`
- `clawcut.approve_workflow_step`
- `clawcut.reject_workflow_step`
- `clawcut.list_workflow_artifacts`
- `clawcut.inspect_workflow_artifact`

Read-only workflow inspection tools remain default-safe. Start/approve/retry/resume tools are allowlist-friendly by default.

## Scheduling posture

Clawcut does not ship a scheduler in Stage 9.

Instead, workflow starts are:

- deterministic
- schema-validated
- resumable
- queryable

This keeps the engine ready for OpenClaw-triggered cron/scheduled runs later without requiring a separate orchestration rewrite.

## Current limitations

- built-in templates only
- no custom workflow authoring
- sequential execution only
- single-project batch scope
- approval is explicit but simple; there is no richer multi-actor review system
