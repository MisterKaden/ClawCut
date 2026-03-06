# Clawcut Architecture

## Core posture

Clawcut owns the edit model and the preview model.

FFmpeg and ffprobe are execution backends. They remain outside the UI and outside the core editing semantics.

After Stage 4 the application shape is:

- UI
- typed command gateways
- pure domain engines
- preview engine
- project state, job system, and media worker

That is the path that later lets both the human editor and OpenClaw drive the same system safely.

## Runtime boundaries

- `apps/desktop`
  - Electron shell
  - native dialogs
  - preload bridge
  - renderer UI
  - renderer-local `PreviewEngine`
- `packages/ipc`
  - typed request and snapshot contracts for project, ingest, and editor-session work
- `packages/domain`
  - project schema
  - timeline entities
  - media and job types
  - pure timeline command engine
  - pure preview command, state, and composition models
- `packages/media-worker`
  - project persistence
  - editor session service
  - ingest, derived assets, relink
  - ffprobe, ffmpeg, SQLite, cache IO

The renderer still never touches ffprobe, ffmpeg, SQLite, or project files directly.

## Project storage

Clawcut remains hybrid:

- `clawcut.project.json`
  - canonical project document
  - user-owned source of truth
- `.clawcut/project.db`
  - worker-owned operational state
  - job rows
  - derived-asset manifests
  - schema metadata
- `.clawcut/cache/`
  - deterministic media derivatives
  - proxy, waveform, thumbnail, and future preview-cache assets

Undo and redo remain session-scoped. Preview session state is also session-scoped.

## Project document

The canonical document is still `ProjectDocumentV3`.

Stage 4 does not add new persisted preview objects yet. The persisted document still owns:

- project identity and timestamps
- stable settings
- `library.items[]`
- `timeline`

Preview transport state is intentionally not written to disk on every scrub or playback tick.

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

## Known Stage 4 limitations

- preview state is not yet bridged through the Electron main process
- same-track overwrite editing is still out of scope
- live multi-track audio mixing is not implemented
- selected-range accurate preview cache is a hook only
- frame stepping uses clip frame rate when available, otherwise a sane default
- viewer overlays are structured, but caption placeholder authoring is still a later stage
- final export compilation remains a Stage 5 concern
