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

## Waveform representation

- Store a compact waveform envelope JSON on disk and a preview slice on the `WaveformAsset`.
  - Reason: the renderer needs a quick preview without gaining general filesystem access, but later stages still need a durable derived artifact that timeline views can reuse.

## Relink safety

- Relink accepts only `exact` or `probable` matches.
  - Reason: Stage 2 should preserve trust. Unsafe guesses are worse than asking the user to try another candidate.

## UI direction

- Editorial-industrial visual language with serif display type and mono instrumentation details.
  - Reason: the product should feel like a calm, deliberate editing tool rather than a generic dashboard or neon demo.
