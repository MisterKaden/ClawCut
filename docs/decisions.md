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

- Brand kits currently package caption styling, safe-zone defaults, and export preset references, with logo/watermark and intro/outro hooks preserved as placeholders.
  - Reason: this is enough to make workflows reusable now without building a full motion-graphics or asset-pack system.

## Workflow artifact model

- Workflow artifacts are first-class typed records.
  - Reason: OpenClaw and local automation should reason over artifacts directly instead of scraping logs.

- Artifacts are stored under `.clawcut/workflows/<workflowRunId>/`.
  - Reason: worker outputs stay inspectable, grouped by run, and easy to clean or archive later.

## Batch scope

- Stage 9 batch execution is single-project only.
  - Reason: the step/run engine, approval model, and artifact model can be validated without introducing cross-project coordination complexity.

- Partial batch failure is allowed and recorded.
  - Reason: one bad clip should not destroy the value of a larger batch run.

## Control surface posture

- The schema registry remains the primary automation contract.
  - Reason: HTTP routes and OpenClaw tools are delivery mechanisms, not the architecture.

- OpenClaw integration remains a thin adapter over Clawcut commands, queries, and workflow/session services.
  - Reason: business logic must remain app-owned.

## Eventing

- Workflow state participates in the existing lightweight local SSE stream instead of creating a second async system.
  - Reason: job and workflow observability should share one simple local mechanism for now.

## Current Stage 9 tradeoffs

- No custom workflow authoring yet.
  - Reason: built-in templates are enough to prove packaging and orchestration.

- No multi-project batch engine yet.
  - Reason: current priority is reliable local resumability and approval-aware execution inside one project.

- No internal scheduler in Clawcut.
  - Reason: OpenClaw or future orchestrators can trigger deterministic workflow runs without Clawcut owning a full scheduler.
