# Technical Decisions

## Workspace and build

- `pnpm` workspace instead of a heavier monorepo tool.
  - Reason: shared package boundaries and simple root verification scripts matter more than orchestration complexity at this stage.

## Desktop shell

- Electron + React + TypeScript.
  - Reason: strong process isolation, native dialog support for import and relink flows, and straightforward local smoke automation.

## Worker boundary

- Separate Node media-worker process instead of renderer-side execution.
  - Reason: ffprobe, ffmpeg, SQLite, and cache writes remain outside the UI and can later move behind a different implementation without changing the renderer contract.

## Project storage

- Hybrid storage: `clawcut.project.json` plus `.clawcut/project.db`.
  - Reason: keep the edit model human-inspectable and versioned while storing operational state in SQLite.

## Media identity

- Layered identity instead of path-only or full-file-hash-only identity.
  - Decision:
    - stable internal item ID
    - normalized path
    - file size and modified time
    - content-derived quick fingerprint over whole file or sampled windows
    - stream signature for fallback matching
  - Reason: relink and dedupe need more than paths, but ingest should not require expensive full hashing for every large source. Modified time remains a separate signal and is not mixed into the quick hash.

## Job model

- Typed local job runner with persisted rows instead of ad hoc async calls.
  - Reason: ingest, thumbnails, waveform generation, proxies, transcription, and export all want the same lifecycle concepts: queue, run, fail, retry, and poll.

## Timeline timebase

- Integer microseconds for the timeline model.
  - Reason: precise enough for editing semantics, deterministic in JSON, and simple to carry across command results and future compilers without float drift.

## Command architecture

- Every Stage 3 timeline edit goes through a typed command engine instead of renderer helpers.
  - Reason: the UI, smoke automation, and future OpenClaw control surface need one trustworthy path for validation, mutation, and error reporting.

## Undo/redo storage

- Stage 3 stores full before/after timeline snapshots in memory per project session.
  - Reason: this is the smallest reliable implementation that keeps undo and redo trustworthy while the timeline model is still stabilizing. Storage efficiency can come later.

## Internal API surface

- Start with a typed IPC command/query gateway instead of HTTP.
  - Decision:
    - `executeEditorCommand`
    - `getEditorSessionSnapshot`
  - Reason: this is enough to decouple React from editor logic immediately, while avoiding the scope and security work of a public local server before OpenClaw integration is ready.

## Preview control surface

- Keep Stage 4 preview control as a renderer-local typed command/query gateway.
  - Decision:
    - `window.clawcutPreview.executeCommand`
    - `window.clawcutPreview.getPreviewState`
    - `window.clawcutPreview.subscribeToPreviewState`
  - Reason: the current playback backend lives in the renderer, so this keeps the control path typed and automation-ready now without pretending the preview engine belongs in React state.

## Cache layout

- Deterministic cache rooted at `.clawcut/cache/media/<mediaItemId>/<sourceRevision>/`.
  - Reason: humans can inspect it, collisions stay low-risk, and source revision changes invalidate old derivatives naturally.
  - Additional rule: cache validity requires a ready manifest with matching preset and deterministic path, not just a file existing on disk.

## Worker launch

- Prefer a built worker bundle for desktop production builds and fall back to `tsx` + source execution in development.
  - Reason: removes a brittle production dependency on forking the TypeScript worker directly while preserving the current local development loop.

## Proxy preset

- One Stage 2 proxy preset: H.264/AAC MP4, `yuv420p`, `+faststart`, max dimension 960 px, max 30 fps.
  - Reason: boring but dependable defaults are better than premature tuning while ingest and cache semantics stabilize.

## Preview quality policy

- Three preview quality modes: `fast`, `standard`, and `accurate`.
  - Decision:
    - `fast` prefers proxies
    - `standard` prefers originals
    - `accurate` requires originals and leaves room for future selected-range accurate preview cache
  - Reason: preview needs an explicit reliability/performance policy rather than hidden heuristics.

## Preview backend

- Stage 4 uses a replaceable backend interface with an `HTMLVideoElement` plus `HTMLAudioElement` implementation.
  - Reason: it is reliable inside the current Electron shell, uses no new heavy dependency, and keeps the backend swappable when a libmpv-style or cached-preview backend becomes worth the integration cost.

## Preview adapter boundary

- Keep all runtime playback mechanics behind an explicit preview adapter boundary.
  - Decision:
    - `PreviewController` talks to a `PreviewAdapter`
    - the current adapter is `HtmlMediaPreviewAdapter`
    - future backends can replace the adapter without changing timeline or preview composition logic
  - Reason: backend swaps should stay isolated to the runtime playback layer, not force timeline or domain refactors.

## Preview frame inspection

- Add a small programmatic frame-snapshot foundation now.
  - Decision:
    - `window.clawcutPreview.captureFrameSnapshot(options?)`
    - adapter-level `captureFrameSnapshot(...)`
    - current implementation captures from the active video element when possible and returns structured unavailable/error results otherwise
  - Reason: OpenClaw will eventually need frame inspection without screen-driving the app.

## Stage 4 synchronization target

- Treat Stage 4 sync as editor-grade preview sync, not export-grade accuracy.
  - Decision:
    - prioritize stable transport, correct clip resolution, and coherent proxy/original mapping
    - leave tighter accurate-preview guarantees to later selected-range cache work
  - Reason: this keeps the current system honest about what it can guarantee while still being reliable for real editing.

## Preview composition

- Resolve preview composition from the timeline and media library, not from ad hoc UI state.
  - Decision:
    - pure composition in the domain package resolves active clips, gaps, trims, proxy fallback, and overlays
    - renderer preview controller only owns transport and backend synchronization
  - Reason: OpenClaw later needs the same machine-readable preview semantics that the UI uses.

## Waveform representation

- Store a compact waveform envelope JSON on disk and a preview slice on the `WaveformAsset`.
  - Reason: the renderer needs a quick preview without gaining general filesystem access, but later stages still need a durable derived artifact that timeline views can reuse.

## Relink safety

- Relink accepts only `exact` or `probable` matches.
  - Reason: Stage 2 should preserve trust. Unsafe guesses are worse than asking the user to try another candidate.

## UI direction

- Editorial-industrial visual language with serif display type and mono instrumentation details.
  - Reason: the product should feel like a calm, deliberate editing tool rather than a generic dashboard or neon demo.

## Render compiler shape

- Stage 5 compiles timeline state into an app-owned render plan and then into typed FFmpeg execution specs.
  - Decision:
    - pure compiler lives in `packages/domain`
    - worker execution materializes filter scripts, segment renders, concat lists, and verification artifacts
    - UI only submits export commands and renders export state
  - Reason: raw FFmpeg command strings should remain an execution detail, not the product architecture.

## Export strategy

- Stage 5 uses a staged segment-render plus concat pipeline.
  - Decision:
    - slice the timeline at clip boundaries
    - render one temp segment per resolved span
    - concat finished segments into the final output
    - verify the output with file checks plus `ffprobe`
  - Reason: it is easier to inspect and debug than one monolithic filter graph, while leaving room for later captions, effects, and smarter composition.

## Export target policy

- Stage 5 supports full-timeline export, explicit in/out ranges, and region-based export when regions already exist in timeline state.
  - Reason: the timeline model already has enough structure to make bounded exports deterministic without introducing a second editing model.

## Development export artifacts

- Keep generated filter scripts, concat lists, FFmpeg specs, and a development manifest on disk during development-oriented runs.
  - Reason: export debugging is much faster when the exact generated artifacts and FFmpeg argument lists are inspectable after a failed or surprising render.

## Export source policy

- Final exports always use original media sources, never Stage 2 proxies.
  - Reason: proxies are preview infrastructure. Export correctness should not silently depend on reduced-fidelity derivatives.

## Export gap behavior

- Video gaps render black and audio gaps render silence.
  - Reason: implicit gap behavior is hard to debug and impossible to automate safely.

## Output naming

- Default outputs go under `<project>/exports` using deterministic auto-increment naming.
  - Decision:
    - `<project-slug>-<preset-slug>-001.<ext>`
    - increment instead of overwrite by default
    - explicit overwrite requires an intentional command flag
  - Reason: export should be safe by default and easy to inspect after the fact.

## Export queue policy

- Run one active export per project and queue additional requests.
  - Reason: this keeps FFmpeg execution predictable, simplifies cancellation, and produces stable machine-readable job state for future OpenClaw orchestration.

## Export snapshot foundation

- Add a typed snapshot command for both completed exports and selected timeline positions.
  - Decision:
    - completed exports can yield representative stills from final output media
    - timeline-position snapshots resolve through the same Stage 5 render rules and can fall back to a black placeholder frame when no visual clip is active
  - Reason: OpenClaw will eventually need a machine-readable visual verification hook without screen-driving the desktop app.

## Transcript and caption storage

- Stage 6 stores transcripts and caption tracks as app-owned project-document roots instead of mixing them into the Stage 3 audio/video track model.
  - Reason: caption workflows need to align to the timeline while remaining independently editable and exportable without destabilizing the core clip/track overlap rules.

## Transcription backend

- Wrap Faster-Whisper behind a worker-owned `TranscriptionAdapter`.
  - Decision:
    - runtime adapter targets Faster-Whisper
    - test and smoke use a deterministic fixture adapter
  - Reason: the product needs a real local transcription path, but CI and smoke cannot depend on live model downloads or machine-specific Python setups.

## Transcription guidance input

- Keep transcription guidance lightweight and request-scoped.
  - Decision:
    - `TranscriptionOptions` includes both `initialPrompt` and `glossaryTerms`
    - the worker composes glossary terms into backend prompt guidance
    - the command/API surface stays backend-agnostic
  - Reason: users need a practical way to improve recognition of names and product vocabulary now, but the product should not hard-wire project semantics to one transcription engine's prompt format.

## Caption active-word metadata

- Preserve active-word behavior as typed model data instead of a renderer-only effect.
  - Decision:
    - caption segments keep word timing/linkage
    - templates and segments expose an `activeWordStyle`
    - preview overlays expose token timing and active-state resolution
  - Reason: karaoke/social caption styles need a structured foundation that later preview and render work can reuse without redesigning the caption model.

## Transcript summary surface

- Add compact transcript summaries alongside the full transcript snapshot.
  - Decision:
    - `getCaptionSessionSnapshot(...)` returns `transcriptSummaries`
    - `QueryTranscriptStatus` also returns a `summary`
  - Reason: OpenClaw should be able to inspect transcript timing, coverage, and caption linkage programmatically without always walking the full transcript tree first.

## Local API transport

- Stage 7 introduces a local HTTP API in the Electron main process instead of exposing worker internals directly.
  - Decision:
    - bind to `127.0.0.1` by default
    - keep the API above the existing worker command/query services and the preview bridge
    - keep the UI as just another client of the same business logic
  - Reason: OpenClaw needs a stable automation surface, but that surface should not bypass validation or project/session ownership rules already implemented in Clawcut.

## Local API authentication and scopes

- Require bearer-token authentication for all control and discovery endpoints except health.
  - Decision:
    - token stored in a local config file under the app data directory
    - local-only bind by default
    - scope model:
      - `read`
      - `edit`
      - `preview`
      - `export`
      - `transcript`
      - `admin`
  - Reason: the API is intentionally local, but OpenClaw and other callers still need an explicit trust boundary and scope-aware rejection for mutating or sensitive actions.

## Local API request envelope

- Use a stable command/query envelope instead of route-per-action payloads.
  - Decision:
    - `POST /api/v1/command` with `{ name, input }`
    - `POST /api/v1/query` with `{ name, input }`
    - every response includes:
      - `ok`
      - `apiVersion`
      - `requestId`
      - `name`
      - `warnings`
      - `data` or structured `error`
  - Reason: automation clients need one consistent machine-readable contract and a practical versioning stance before the control surface grows.

## OpenClaw plugin-first schema layer

- Make the shared command/query registry the authoritative Stage 7 integration contract, then let both the local transport and the OpenClaw adapter consume it.
  - Decision:
    - canonical operation metadata lives in `packages/ipc/src/control-schema.ts`
    - the OpenClaw adapter package consumes that registry directly
    - the adapter is packaged with `openclaw.plugin.json` plus a schema-validated config surface
    - only read-only tools are enabled by default; mutating and high-impact tools require explicit allowlisting
    - the local HTTP transport mirrors the same registry at `/api/v1/openclaw/tools` and `/api/v1/openclaw/manifest`
    - operations and tools explicitly declare safety class, mutability, and sync vs job behavior
  - Reason: OpenClaw should be able to discover what Clawcut can do without scraping docs or reverse-engineering UI affordances, and the local transport should not become the source of truth.

## Preview frame inspection for automation

- Keep both a rich preview-frame snapshot and a lighter metadata-only frame reference on the API surface.
  - Decision:
    - `preview.frame-snapshot` returns the current structured preview frame, including image data when available
    - `preview.frame-reference` strips that down to timing, clip identity, source mode, dimensions, and error/warning state
  - Reason: some automation callers need actual frame payloads, but many OpenClaw workflows only need a cheap structured reference to reason about current visual state.

## Local event stream

- Add a lightweight authenticated SSE stream for job-related updates.
  - Decision:
    - `GET /api/v1/events`
    - local, token-authenticated, scope-gated
    - current event types:
      - `ready`
      - `jobs.snapshot`
      - `heartbeat`
    - `jobs.snapshot` carries current jobs plus related export and transcription runs for the requested project directory
  - Reason: OpenClaw should not have to rely exclusively on polling for long-running media operations, but Stage 7 does not need a full durable message bus.

## Caption generation strategy

- Stage 6 groups captions one transcript segment at a time.
  - Reason: deterministic segment-level grouping is easy to inspect, preserves timing fidelity, and gives later stages a stable base for smarter regrouping without forcing heuristics now.

## Subtitle formats

- Stage 6 supports `SRT` and `ASS`.
  - Reason: `SRT` is the simplest broadly-compatible sidecar format, while `ASS` carries enough styling intent to serve as the structured burn-in asset.

## Caption burn-in strategy

- Generate ASS subtitle artifacts, but fall back to rasterized PNG caption plates for the final burn-in pass when FFmpeg subtitle/text filters are unavailable.
  - Decision:
    - `ASS` stays the canonical styled subtitle artifact
    - burn-in pass can use per-segment overlay plates plus a generated FFmpeg filter script
  - Reason: local FFmpeg builds vary widely. This keeps Stage 6 burn-in reliable without collapsing the architecture into UI-owned text rendering hacks.
