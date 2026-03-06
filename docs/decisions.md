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
