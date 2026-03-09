# Technical Decisions

## Core model ownership

- Clawcut owns the timeline schema, preview model, transcript/caption model, render plan, smart suggestion model, and workflow definitions.
  - Reason: OpenClaw integration and desktop UI must share one authoritative behavior path.

## Project storage

- Hybrid storage remains the baseline.
  - `clawcut.project.json` stores canonical user-authored state.
  - `.clawcut/project.db` stores operational state.
  - Reason: workflows, exports, smart analysis, and jobs are persistent and inspectable without turning operational history into canonical project content.

## Project schema version

- Stage 9 bumps the canonical document to `ProjectDocumentV6`.
  - Decision: add `settings.branding.defaultBrandKitId` and caption-track branding snapshots while keeping workflow runs out of the canonical document.

- Stage 10 keeps the canonical document at `ProjectDocumentV6`.
  - Reason: recovery, diagnostics, packaging, and migration hardening are operational changes and do not require a user-authored schema change.

## Operational schema and recovery

- SQLite now uses explicit sequential migrations.
  - Reason: operational-state upgrades need stable, testable version steps rather than implicit latest-schema creation.

- Interrupted jobs and operational runs become explicit recoverable records.
  - Reason: the desktop UI and OpenClaw need machine-readable retry/resume posture after crashes or forced shutdowns.

- Recovery remains operational only; undo/redo history stays session-scoped.
  - Reason: Stage 10 hardens jobs/runs without expanding into full UI session restore.

## Diagnostics and packaging

- Diagnostics are persisted as session-scoped JSONL logs linked from structured snapshots.
  - Reason: local automation and packaged validation need inspectable failure context without introducing a remote logging stack.

- Packaged validation is macOS-first and unsigned in Stage 10.
  - Reason: the immediate requirement is reliable local and CI packaging verification, not signing/notarization infrastructure.

- The current packaged worker validation path still uses the local Node runtime.
  - Reason: this is the reliable ABI match for the current unsigned packaged `better-sqlite3` flow.
  - Tradeoff: packaged validation proves the desktop artifact plus bundled worker path, but not yet a completely self-contained distribution runtime.

- Performance guardrails are fixture-backed test budgets, not standalone benchmarks.
  - Reason: Stage 10 needs regression detection for practical open/query/compile/transcription/workflow paths rather than noisy micro-benchmark numbers.

## Workflow engine design

- Built-in typed workflow templates instead of an ad hoc JSON DSL.
  - Reason: Stage 9 needs reusable, inspectable workflows now, but a user-authored DSL would expand scope and reduce safety.

- Workflow templates are versioned and shipped in domain code.
  - Reason: template ids must stay stable for OpenClaw and for future migration/compatibility work.

- Workflow execution is sequential in v1 even though step definitions carry dependency metadata.
  - Reason: sequential execution is simpler to reason about, easier to debug, and sufficient for current local automation needs.

- Workflow runs persist in SQLite, not the project document.
  - Reason: run history, step history, approvals, artifacts, and partial batch state are operational records, not canonical editing state.

## Approval boundaries

- Approval checkpoints are explicit workflow records, not inline booleans or UI state.
  - Reason: OpenClaw must be able to halt, inspect, and resume high-impact workflows programmatically.

- High-impact built-in workflow steps default to approval-aware behavior.
  - Reason: automated editing and export should remain reviewable and allowlist-friendly by default.

## Workflow safety model

- Workflow safety is aggregated from step safety.
  - Reason: tool manifests and allowlists need one reliable workflow-level safety profile.

- Read-only workflow inspection tools are available by default; start/approve/retry/resume tools remain optional and allowlist-friendly.
  - Reason: discovery should be easy, mutation should remain policy-aware.

## Brand kit storage

- Brand kits are stored locally in app data, not embedded wholesale in each project.
  - Reason: kits behave like reusable machine-local assets and should not bloat project documents.

- Applying a brand kit writes both a `brandKitId` and resolved style snapshot to caption tracks.
  - Reason: projects remain portable and renderable even if a local brand kit later disappears or changes.

## Brand kit scope

- Stage 11 extends brand kits into local export identity packs.
  - Included today: caption styling, safe-zone defaults, export preset references, watermark asset paths, intro asset paths, and outro asset paths.
  - Reason: workflows now need reusable, validated packaging assets without introducing a full marketplace or cloud asset system.

- Projects still store only the brand kit reference and resolved style snapshots.
  - Reason: project portability matters more than embedding machine-local asset catalogs into canonical project state.

## Workflow artifact model

- Workflow artifacts are first-class typed records.
  - Reason: OpenClaw and local automation should reason over artifacts directly instead of scraping logs.

- Artifacts are stored under `.clawcut/workflows/<workflowRunId>/`.
  - Reason: worker outputs stay inspectable, grouped by run, and easy to clean or archive later.

## Workflow audit and candidate review

- Workflow audit events are persisted operational records rather than inferred from logs.
  - Reason: OpenClaw and local operators need a shared machine-readable history of workflow state transitions, artifact creation, approvals, and candidate review activity.

- Candidate-package review is explicit operational state separate from export state.
  - Reason: “candidate discovered”, “candidate approved”, and “candidate exported” are distinct workflow facts and should stay independently queryable.

- Candidate-package preview remains a control-surface command, not a side effect hidden inside export/review actions.
  - Reason: reviewable automation requires an explicit inspect step before any higher-impact action such as export.

## Batch scope

- Stage 11 batch execution remains single-project only.
  - Reason: the step/run engine, approval model, schedule model, and artifact model can be validated without introducing cross-project coordination complexity.

- Partial batch failure is allowed and recorded.
  - Reason: one bad clip should not destroy the value of a larger batch run.

## Control surface posture

- The schema registry remains the primary automation contract.
  - Reason: HTTP routes and OpenClaw tools are delivery mechanisms, not the architecture.

- OpenClaw integration remains a thin adapter over Clawcut commands, queries, and workflow/session services.
  - Reason: business logic must remain app-owned.

## Scheduling and eventing

- Clawcut now ships a lightweight local scheduler that only instantiates normal workflow-profile runs.
  - Reason: Stage 11 needs reusable local automation hooks, but the scheduler must remain a thin trigger layer above the existing workflow engine.

- Scheduled workflow steps never bypass approval boundaries.
  - Reason: scheduled automation must preserve the same safety guarantees as direct UI or OpenClaw-triggered workflow starts.

- Workflow state participates in the existing lightweight local SSE stream instead of creating a second async system.
  - Reason: job and workflow observability should share one simple local mechanism for now.

## Current Stage 11 tradeoffs

- No custom workflow authoring yet.
  - Reason: built-in templates are enough to prove packaging and orchestration.

- No multi-project batch engine yet.
  - Reason: current priority is reliable local resumability and approval-aware execution inside one project.

- Workflow profiles and schedules are stored in app data, not in projects.
  - Reason: they are machine-local reusable automation assets rather than canonical editing content.
