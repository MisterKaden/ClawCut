# Workflow Engine

## Purpose

Stage 11 packages Clawcut’s lower-level commands and jobs into reusable, approval-aware workflows,
workflow profiles, local schedules, and candidate-package outputs.

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
- `social-candidate-package-v1`
- `transcript-range-package-v1`

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
- `compileCandidatePackages`
- `compileTranscriptRangeSelection`
- `exportCandidatePackage`
- `captureExportSnapshot`
- `approvalCheckpoint`

## Workflow profiles

Stage 11 adds reusable `WorkflowProfile` records stored in app data.

Profiles bind:

- built-in `templateId`
- reusable default inputs
- approval policy
- default brand kit
- default export preset
- optional step preferences
- compatibility metadata

Profiles are the higher-level reusable unit that OpenClaw and local operators should prefer over
raw template starts when they want repeatable behavior.

## Local schedules

Stage 11 adds a lightweight local schedule registry.

Schedules:

- live in app data
- point at a workflow profile
- store project path and target resolution strategy
- use interval triggers only in Stage 11
- never bypass approval boundaries
- remain local-only and intentionally lightweight

The scheduler loop only resolves due schedules into normal workflow-profile runs. It does not
implement a second orchestration engine.

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

Stage 11 batch workflows are limited to multiple target clip ids inside one project.

Properties:

- per-item run state is isolated
- partial failure is allowed
- aggregate warnings summarize batch failure counts
- artifact records can belong to the run and optionally to a batch item

Cross-project batch orchestration is intentionally deferred.

## Candidate packages

Stage 11 adds reviewable candidate-package artifacts for short-form and transcript-range workflows.

Candidate packages are typed records with:

- source kind
- start/end time
- transcript linkage
- optional suggestion linkage
- optional region/export linkage
- snapshot artifact references

They are created first, reviewed second, and only exported when explicitly requested.

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
- candidate-package
- candidate-export
- transcript-range-selection
- brand-asset
- schedule-report

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

### `social-candidate-package-v1`

Purpose:

- generate highlight suggestions
- compile candidate packages
- optionally create review regions
- optionally capture snapshots
- optionally export approved candidates

Typical use:

- shorts/social candidate review
- OpenClaw-assisted highlight packaging without hidden mutation

### `transcript-range-package-v1`

Purpose:

- select a transcript-linked range
- compile explicit packaging or export artifacts
- keep approval boundaries visible before mutation or export

Typical use:

- reusable transcript excerpt packaging
- review-first packaging for quoted or excerpted ranges

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

Stage 11 extends that with:

- `clawcut.list_workflow_profiles`
- `clawcut.inspect_workflow_profile`
- `clawcut.run_workflow_profile`
- `clawcut.list_schedules`
- `clawcut.inspect_schedule`
- `clawcut.create_schedule`
- `clawcut.pause_schedule`
- `clawcut.resume_schedule`
- `clawcut.generate_social_candidates`
- `clawcut.export_candidate_package`

Read-only discovery tools stay enabled by default.
Mutating profile, schedule, and candidate-export tools remain allowlist-friendly by default.

Read-only workflow inspection tools remain default-safe. Start/approve/retry/resume tools are allowlist-friendly by default.

## Scheduling posture

Stage 11 adds a lightweight local scheduler on top of the existing workflow engine.

The scheduler:

- stores definitions in app data
- resolves workflow profiles into normal workflow runs
- respects the same approval boundaries as direct workflow starts
- records last and next run state without becoming a second orchestration engine
- remains local-only and intentionally simple

Scheduled starts are still:

- deterministic
- schema-validated
- resumable
- queryable

This keeps Clawcut ready for OpenClaw-triggered cron or route-based orchestration later without splitting workflow logic across multiple systems.

## Current limitations

- built-in templates only
- no custom workflow authoring
- sequential execution only
- single-project batch scope
- approval is explicit but simple; there is no richer multi-actor review system
