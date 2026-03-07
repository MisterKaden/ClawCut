# Clawcut Architecture

## Core posture

Clawcut owns the edit model and the preview model.

FFmpeg and ffprobe are execution backends. They remain outside the UI and outside the core editing semantics.

After Stage 7 the application shape is:

- UI
- local authenticated API
- typed command gateways
- pure domain engines
- preview engine
- render compiler
- transcript and caption engine
- project state, job system, and media worker

That is the path that later lets both the human editor and OpenClaw drive the same system safely.

## Runtime boundaries

- `apps/desktop`
  - Electron shell
  - native dialogs
  - preload bridge
  - local authenticated API gateway
  - renderer UI
  - renderer-local `PreviewEngine`
- `packages/ipc`
  - typed request and snapshot contracts for project, ingest, editor-session, export, and caption work
- `packages/domain`
  - project schema
  - timeline entities
  - media and job types
  - pure timeline command engine
  - pure preview command, state, and composition models
  - pure render compiler and export presets
  - transcript, caption, subtitle, and template models
- `packages/media-worker`
  - project persistence
  - editor session service
  - export session service
  - caption session service
  - ingest, derived assets, relink
  - ffprobe, ffmpeg, SQLite, cache IO

The renderer still never touches ffprobe, ffmpeg, SQLite, or project files directly.

## Stage 7 control layer

Stage 7 makes the shared command/query schema layer the primary automation contract and treats the local transport as a delivery mechanism.

Main pieces:

- shared schema registry in [control-schema.ts](/Users/winten/Developer/KPStudio/packages/ipc/src/control-schema.ts)
- thin OpenClaw adapter package in [packages/openclaw-plugin](/Users/winten/Developer/KPStudio/packages/openclaw-plugin)
- packaged plugin manifest in [openclaw.plugin.json](/Users/winten/Developer/KPStudio/packages/openclaw-plugin/openclaw.plugin.json)
- local authenticated HTTP transport in [local-api.ts](/Users/winten/Developer/KPStudio/apps/desktop/src/main/local-api.ts)

The registry owns:

- canonical operation names
- input schema
- output contract summaries
- safety classes
- mutability classes
- sync vs job semantics
- required scopes

The adapter package owns:

- manifest metadata and plugin config validation
- default read-only tool exposure
- explicit allowlists for mutating and high-impact tools

Transport:

- local HTTP server
- default bind `127.0.0.1`
- bearer-token auth for all control and discovery routes except health

Current routes:

- `GET /api/v1/health`
- `GET /api/v1/capabilities`
- `GET /api/v1/openclaw/tools`
- `GET /api/v1/openclaw/manifest`
- `GET /api/v1/events`
- `POST /api/v1/command`
- `POST /api/v1/query`

The transport does not bypass existing application services.

Request flow:

1. HTTP request reaches the main-process local API controller
2. auth and request-schema validation runs at the boundary
3. request maps to a typed command or typed query name
4. command/query dispatch calls the existing worker session services or preview bridge
5. response returns a structured envelope with `apiVersion`, `requestId`, `warnings`, and either `data` or a structured `error`

For lightweight push updates, the same controller also exposes an authenticated SSE stream. It currently emits `ready`, `jobs.snapshot`, and `heartbeat` events so OpenClaw can observe job, export-run, and transcription-run state without relying only on polling.

This keeps the desktop UI, local scripts, and OpenClaw above the same trusted command/query layer.

## Local API auth and safety

The Stage 7 control surface is local-by-default and authenticated-by-default.

Current safety model:

- bearer token required for all protected routes
- local token stored in app-local config and surfaced in the UI for trusted setup
- scope-gated operations:
  - `read`
  - `edit`
  - `preview`
  - `export`
  - `transcript`
  - `admin`
- mutating actions still pass through the same timeline, export, ingest, and caption validators as the UI path
- long-running operations return job-linked machine-readable state instead of blocking the request

This is intentionally not a public internet API. It is a controlled localhost automation surface for OpenClaw and other trusted local tools.

## Project storage

Clawcut remains hybrid:

- `clawcut.project.json`
  - canonical project document
  - user-owned source of truth
- `.clawcut/project.db`
  - worker-owned operational state
  - job rows
  - derived-asset manifests
  - export runs
  - transcription runs
  - schema metadata
- `.clawcut/cache/`
  - deterministic media derivatives
  - proxy, waveform, thumbnail, and future preview-cache assets
- `.clawcut/exports/`
  - per-export worker artifacts
  - render plan JSON
  - FFmpeg spec JSON
  - development manifests with generated FFmpeg args in development-oriented runs
  - concat lists
  - snapshot manifests and still-frame captures
  - FFmpeg logs and verification JSON
- `exports/`
  - final user-facing export outputs

Undo and redo remain session-scoped. Preview session state is also session-scoped.

## Project document

The canonical document is now `ProjectDocumentV5`.

Stage 6 keeps preview, export session, and active transcription session state out of the project document. The persisted document owns:

- project identity and timestamps
- stable settings
- `library.items[]`
- `timeline`
- `transcripts.items[]`
- `captions.tracks[]`
- `captions.exportDefaults`

Preview transport state is intentionally not written to disk on every scrub or playback tick.

## Transcript and caption model

Stage 6 keeps caption data out of the Stage 3 audio and video track model.

The project document now stores:

- `transcripts.items[]`
  - editable transcript objects with source reference, provider metadata, language, warnings, segments, and word timing
- `captions.tracks[]`
  - timeline-associated caption tracks generated from transcripts
- `captions.templates[]`
  - the built-in template ids available for this project version
- `captions.exportDefaults`
  - default sidecar format plus the burn-in enabled flag and selected caption track

Transcript segments stay editable without destroying timing records. Segment text edits mark both the segment and transcript as user-edited while preserving original word timing data as source metadata.

Caption tracks are first-class objects with:

- track identity
- source transcript identity
- segmentation strategy
- template/style reference
- export intent
- ordered caption segments

Stage 6 caption generation is intentionally explicit:

- one caption segment per transcript segment
- deterministic line reflow
- word associations preserved when source word timing exists
- karaoke/highlight templates keep word references for preview-time active word highlighting

## Transcription architecture

Transcription runs through a dedicated worker-owned caption session.

Flow:

1. UI or automation submits a typed caption command
2. caption session resolves the clip and media item
3. FFmpeg extracts a deterministic mono WAV for the requested clip span
4. a replaceable transcription adapter runs
5. engine output is normalized into app-owned transcript types
6. transcript data persists into `clawcut.project.json`
7. transcription run state persists into SQLite and artifact files

The primary runtime adapter is Faster-Whisper, but the integration is replaceable. Tests and smoke use a deterministic fixture adapter so verification does not depend on live model downloads.

Transcription options currently support:

- explicit language or auto-detect
- model hint
- word timestamp preference
- initial prompt
- lightweight glossary terms for names, products, and custom vocabulary
- light text normalization

Glossary terms are merged into prompt guidance in the worker adapter so the transcription backend remains replaceable without changing the command surface.

## Caption commands and API

Stage 6 adds a separate command/query surface for transcript and caption workflows:

- `executeCaptionCommand({ directory, command })`
- `getCaptionSessionSnapshot({ directory })`

Major commands:

- `TranscribeClip`
- `CreateTranscript`
- `UpdateTranscriptSegment`
- `GenerateCaptionTrack`
- `RegenerateCaptionTrack`
- `ApplyCaptionTemplate`
- `UpdateCaptionSegment`
- `ExportSubtitleFile`
- `EnableBurnInCaptionsForExport`
- `QueryTranscriptStatus`
- `QueryCaptionTrackState`

`getCaptionSessionSnapshot(...)` also returns `transcriptSummaries[]`, which gives OpenClaw a compact machine-readable view of transcript timing, word-timing coverage, and caption-track coverage without forcing it to parse the entire editor state first.

This keeps transcript and caption behavior automation-ready for OpenClaw without burying business logic in React components.

## Active-word highlighting foundation

Stage 6 stores word timing and word linkage in the caption model and carries active-word metadata forward into preview overlays.

Current structured hooks:

- caption segments retain ordered word timing records
- caption templates declare an `activeWordStyle`
- caption overlays expose token timing, source-word linkage, and active-state resolution at the playhead

Today that powers preview-time highlighting for karaoke-style captions. Later stages can reuse the same model for richer social and karaoke treatments without redesigning caption storage.

## Timeline model

Timeline time is stored as integer microseconds.

The Stage 3 timeline continues to own:

- `id`
- `timeUnit`
- `playheadUs`
- `zoom`
- `trackOrder`
- `tracksById`
- `clipsById`
- `markers`
- `regions`
- `snapToleranceUs`

Tracks own:

- `id`
- `kind`
- `name`
- `locked`
- `visible`
- `muted`
- `clipIds`

Clips own:

- `id`
- `trackId`
- `mediaItemId`
- `streamType`
- `sourceInUs`
- `sourceOutUs`
- `timelineStartUs`
- `enabled`
- `transform`
- `speed`
- `gainDb`
- `tags`

Derived values such as clip duration and clip end remain computed, not duplicated.

## Editing command engine

Stage 3 editing still flows through the worker-backed command path:

1. renderer submits a typed edit command
2. worker editor session loads the current project
3. pure domain engine validates and applies the command
4. worker persists the new timeline immediately
5. worker updates in-memory history when the command is reversible
6. caller receives a structured result plus a fresh editor session snapshot

This remains the only supported path for timeline mutation.

## Preview architecture

Stage 4 introduces a dedicated `PreviewEngine` subsystem.

The preview stack is split into three layers:

- pure preview composition in `packages/domain`
  - timeline -> active clip resolution
  - proxy vs original source selection
  - gap handling
  - overlay model generation
- renderer `PreviewController`
  - typed preview command handling
  - playback state transitions
  - command/query subscription surface
  - playhead synchronization
- replaceable playback backend
  - current implementation: `HTMLVideoElement` + `HTMLAudioElement`
  - future options: libmpv bridge, selected-range preview cache adapter, GPU compositor

The UI never owns playback logic. It sends preview commands and renders preview state.

## Preview session model

The preview engine owns explicit session state:

- loaded / unloaded
- playback status
  - `idle`
  - `paused`
  - `playing`
  - `buffering`
  - `error`
- current playhead
- current quality mode
  - `fast`
  - `standard`
  - `accurate`
- source mode
  - `proxy`
  - `original`
  - `mixed`
  - `gap`
  - `unavailable`
- active video and audio clip IDs
- current preview warning and error
- overlay model

This state is machine-readable and subscribable.

## Preview commands and API

Stage 4 preview control is command-driven through a renderer-local internal gateway:

- `LoadTimelinePreview`
- `UnloadTimelinePreview`
- `PlayPreview`
- `PausePreview`
- `SeekPreview`
- `SeekPreviewToClip`
- `StepPreviewFrameForward`
- `StepPreviewFrameBackward`
- `SetPreviewQuality`

Current query surface:

- `window.clawcutPreview.getPreviewState()`
- `window.clawcutPreview.subscribeToPreviewState(listener)`

This is intentionally local for now because the active backend is renderer-native. The command and state types are already isolated so a later main-process or OpenClaw bridge can wrap the same contract instead of rewriting preview logic.

Stage 7 wraps that same preview control path behind the main-process local API by using a preview bridge instead of duplicating playback logic in HTTP handlers.

Stage 7 also exposes two machine-readable preview inspection queries:

- `preview.frame-snapshot`
  - full structured snapshot including inline image data when available
- `preview.frame-reference`
  - lighter metadata-only reference for automation callers that only need timing, clip identity, source mode, dimensions, and error state

## Preview quality modes

Stage 4 preview quality strategy:

- `fast`
  - prefer Stage 2 proxies
  - fall back to originals when no proxy is available
  - best for scrubbing and rough review
- `standard`
  - prefer originals
  - fall back to proxies when originals are unavailable
  - default project mode for normal review
- `accurate`
  - original-only
  - explicit hook for future selected-range accurate preview cache
  - currently surfaces an error if originals are unavailable

## Stage 4 sync expectations

“Good enough” sync in Stage 4 means:

- the visible playhead, active clip resolution, and backend media clocks stay aligned closely enough for normal editing review and scrubbing
- clip boundaries, gaps, trims, and sequential clip transitions resolve correctly
- fast proxy preview preserves timeline semantics even when the decoded media differs from the original in resolution or capped frame rate
- seek and scrub behavior is predictable and stable across repeated commands

What Stage 4 does not promise:

- final-render equivalence
- effect-accurate compositing
- sample-perfect audio mixdown
- selected-range cached accurate preview

Proxy correctness in Stage 4 means:

- the right clip is chosen
- source in and source out mapping stays coherent
- the playhead lands on the expected timeline position
- preview may be visually approximate because proxies can differ from originals

Future accurate preview means:

- original-media-first decoding
- tighter AV sync guarantees
- selected-range preview cache or equivalent for harder cases
- a path toward export-parity spot checks

## Proxy usage

Preview source choice is explicit and deterministic:

- video and audio preview each resolve their own source
- fast mode uses proxy when the proxy is valid for that stream type
- standard prefers original media
- accurate refuses proxy fallback
- if video and audio resolve differently, preview reports `mixed`

This keeps proxy policy observable instead of implicit.

## Render compiler architecture

Stage 5 adds a worker-owned export path:

1. UI submits a typed export command
2. worker export session normalizes the request, export target, and preset
3. pure render compiler slices the timeline into render spans
4. pure FFmpeg-spec compiler converts spans into a staged segment render plan
5. worker materializes scripts, temp manifests, segment outputs, concat lists, and logs
6. worker verifies the final artifact and persists machine-readable export state

The domain compiler owns:

- preset validation
- clip trim resolution
- topmost visible video selection
- mixed audio contribution selection
- deterministic gap behavior
- serializable render plans and FFmpeg execution specs

The worker owns:

- output path resolution
- export queueing
- FFmpeg process execution
- progress parsing
- cancellation and retry
- final artifact verification

## Stage 5 visual and audio rules

Stage 5 export is intentionally conservative:

- the highest ordered visible video track with an active clip wins for each render span
- lower video tracks only show through during gaps on higher tracks
- active clips on unmuted audio tracks are mixed together for each span
- video gaps render black
- audio gaps render silence

Unsupported timeline features fail fast during compilation:

- clip speed other than `1`
- non-identity transforms
- non-default opacity
- future caption or effect objects that lack a Stage 5 render implementation

## Export presets and source policy

Built-in Stage 5 presets:

- `video-master-1080p`
- `video-share-720p`
- `audio-podcast-aac`

Exports always resolve original source media, not proxies. Proxies remain preview-only infrastructure.

Supported export targets:

- full timeline
- explicit in/out range
- timeline region when a region already exists in project state

The render plan records the resolved range explicitly so range exports stay deterministic and debuggable.

## Export outputs and artifacts

Per-export artifacts are written under `.clawcut/exports/<exportRunId>/`:

- `render-plan.json`
- `ffmpeg-spec.json`
- `development-manifest.json`
- per-segment filter scripts
- `segments.concat.txt`
- `ffmpeg.log`
- `ffmpeg-progress.log`
- `verification.json`
- `snapshots/snapshot-manifest.json`

When burn-in captions are enabled, the export artifact directory also records:

- `captions/burn-in.ass`
- `captions/plates/*.png`
- `captions/burn-in.ffmpeg-filter.txt`

Final outputs go under `<project>/exports/` with deterministic incrementing names:

- `<project-slug>-<preset-slug>-001.<ext>`

Explicit output paths are supported through the command API. Default behavior never silently overwrites an existing file.

## Export commands and API

Stage 5 export control is worker-backed and machine-readable:

- `CreateExportRequest`
- `CompileRenderPlan`
- `StartExport`
- `CaptureExportSnapshot`
- `CancelExport`
- `RetryExport`
- `QueryExportStatus`
- `ListExports`

Current query surface:

- `window.clawcut.getExportSessionSnapshot({ directory })`
- `window.clawcut.executeExportCommand({ directory, command })`

This keeps export automation-ready for OpenClaw without adding a public local server yet.

Snapshot capture is intentionally command-driven:

- capture a representative still from a completed export output
- capture a frame from a selected timeline position using Stage 5 source-selection rules
- return a typed artifact record with source identity, position, output path, and placeholder-frame status

## Export verification

Successful export is not assumed blindly. Stage 5 verifies:

- output file exists
- output file size is non-zero
- `ffprobe` can inspect the file
- container and stream shape match the preset intent
- duration is within a small tolerance of the compiled timeline range

Verification failure is distinct from FFmpeg execution failure and remains visible in export state.

## Stage 6 caption preview and export

Preview and export now consume structured caption state instead of placeholder overlay arrays.

Preview composition resolves active caption overlays from:

- the active caption track list
- built-in template metadata
- the current preview playhead

Preview surfaces currently support:

- caption placement
- text alignment
- basic background box/card treatments
- active-word highlighting in karaoke-style templates when word timing exists

Export supports two subtitle paths:

- sidecar export
  - `SRT`
  - `ASS`
- burn-in export
  - Clawcut always generates ASS subtitle artifacts for inspection and reuse
  - on FFmpeg builds with subtitle/text filters unavailable, Clawcut rasterizes caption plates to PNG and overlays them in the final burn-in pass

This keeps the caption model and export hooks structured even when the local FFmpeg build is lean.

## OpenClaw integration boundary

Stage 7 exposes OpenClaw through a plugin-first adapter instead of hard-wiring automation into renderer components.

The thin adapter package publishes machine-safe tool definitions for:

- projects
- media
- timeline editing
- preview control and frame inspection
- transcription and captions
- export and job observation

The local transport mirrors that same contract at:

- `GET /api/v1/openclaw/tools`
- `GET /api/v1/openclaw/manifest`

Each tool definition includes:

- stable tool name
- description
- canonical operation name
- safety class
- mutability class
- sync vs job semantics
- required scopes
- input schema summary
- output expectations
- safety notes

This gives OpenClaw a deterministic discovery layer while keeping actual business logic in the worker sessions and preview engine.

## Preview composition rules

At a given playhead position:

- video preview chooses the highest visible active video track
- audio preview chooses the highest unmuted active audio track
- trims are respected by mapping timeline time back into source time
- gaps preview as black and silence
- markers and regions become overlay data
- safe zones are always available through the overlay model
- selected clip state becomes overlay state
- caption placeholder arrays and transform guide arrays already exist in the overlay model for later stages

Stage 4 does not implement a full compositor or multi-track audio mix yet.

## Backend strategy

Stage 4 backend choice is pragmatic:

- visible `HTMLVideoElement` for picture
- hidden `HTMLAudioElement` for sound
- both driven by the `PreviewController`
- autoplay policy relaxed in Electron so local smoke and internal command playback remain stable

Reason:

- no new heavy dependency
- reliable local playback inside the current Electron shell
- backend remains replaceable behind the `PreviewPlaybackBackend` interface

## Stage 2 carry-forward

Stage 2 systems remain intact under Stage 4:

- layered media identity
- ffprobe normalization
- deterministic thumbnail, waveform, and proxy generation
- deterministic cache layout
- missing-media detection and conservative relink
- persisted job rows and retry behavior

Timeline clips still reference imported media items by `mediaItemId`. Preview composes from that media library state instead of inventing a separate source graph.

## Known Stage 7 limitations

- the local API is intentionally localhost-only and not designed for remote access
- the preview bridge depends on an active desktop window and current renderer preview backend
- the token/scope model is practical and local, not multi-user or cloud-oriented
- same-track overwrite editing is still out of scope
- live multi-track audio mixing is not implemented
- selected-range accurate preview cache is a hook only
- frame stepping uses clip frame rate when available, otherwise a sane default
- transcript editing is limited to segment text edits
- caption grouping is still one caption per transcript segment
- burn-in fallback currently rasterizes whole caption segments, not per-word animated highlight timing
- WebVTT and richer caption authoring tools remain later-stage work
