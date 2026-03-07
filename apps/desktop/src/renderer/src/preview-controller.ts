import { useSyncExternalStore } from "react";

import {
  getBuiltInCaptionTemplates,
  buildTimelineClipSequenceKey,
  clampPreviewPlayheadUs,
  type PreviewFrameSnapshot,
  type PreviewFrameSnapshotOptions,
  createInitialPreviewState,
  createPreviewLoadSignature,
  mapPlaybackClockToTimelineUs,
  mapTimelineClipToMediaSeconds,
  projectPreviewModeToQualityMode,
  resolveFrameStepUs,
  resolveTimelinePreviewCompositionForQuality,
  type PreviewCommand,
  type PreviewCommandFailure,
  type PreviewCommandResult,
  type PreviewCommandSuccess,
  type PreviewEngine,
  type PreviewError,
  type PreviewLoadTarget,
  type PreviewSelectionState,
  type PreviewSourceSelection,
  type PreviewState
} from "@clawcut/domain";
import type { EditorSessionSnapshot } from "@clawcut/ipc";

import {
  type PreviewBackendBinding,
  type PreviewBackendError,
  type PreviewAdapter
} from "./preview-backend";

interface PreviewScheduler {
  nowMs(): number;
  requestFrame(callback: FrameRequestCallback): number;
  cancelFrame(handle: number): void;
}

class BrowserPreviewScheduler implements PreviewScheduler {
  nowMs(): number {
    return performance.now();
  }

  requestFrame(callback: FrameRequestCallback): number {
    return window.requestAnimationFrame(callback);
  }

  cancelFrame(handle: number): void {
    window.cancelAnimationFrame(handle);
  }
}

function createFailure(
  command: PreviewCommand,
  error: PreviewError,
  state: PreviewState
): PreviewCommandFailure {
  return {
    ok: false,
    commandType: command.type,
    error,
    state
  };
}

function buildSuccess<Type extends PreviewCommandSuccess["commandType"]>(
  result: Extract<PreviewCommandSuccess, { commandType: Type }>
): Extract<PreviewCommandSuccess, { commandType: Type }> {
  return result;
}

function createBackendBinding(
  source: PreviewSourceSelection | null,
  targetTimeSeconds: number | null
): PreviewBackendBinding {
  return {
    source,
    targetTimeSeconds
  };
}

function createPreviewError(
  code: PreviewError["code"],
  message: string,
  details?: string,
  recoverable = true
): PreviewError {
  return {
    code,
    message,
    details,
    recoverable
  };
}

export function createPreviewLoadTarget(
  snapshot: EditorSessionSnapshot
): PreviewLoadTarget {
  return {
    directory: snapshot.directory,
    cacheRoot: snapshot.cacheRoot,
    timeline: snapshot.timeline,
    libraryItems: snapshot.libraryItems,
    captionTracks: snapshot.document.captions.tracks,
    captionTemplates: getBuiltInCaptionTemplates(),
    defaultQualityMode: projectPreviewModeToQualityMode(
      snapshot.document.settings.preview.defaultMode
    )
  };
}

export class PreviewController implements PreviewEngine {
  private state: PreviewState = createInitialPreviewState();

  private readonly listeners = new Set<(state: PreviewState) => void>();

  private readonly scheduler: PreviewScheduler;

  private backend: PreviewAdapter | null = null;

  private backendUnsubscribe: (() => void) | null = null;

  private loadTarget: PreviewLoadTarget | null = null;

  private loadTargetSignature: string | null = null;

  private lastCompositionKey: string | null = null;

  private lastPlaybackIntent = false;

  private animationFrameHandle: number | null = null;

  private transportAnchor: { nowMs: number; playheadUs: number } | null = null;

  private commandChain: Promise<PreviewCommandResult> | null = null;

  constructor(scheduler: PreviewScheduler = new BrowserPreviewScheduler()) {
    this.scheduler = scheduler;
  }

  attachBackend(backend: PreviewAdapter | null): void {
    this.backendUnsubscribe?.();
    this.backendUnsubscribe = null;
    this.backend = backend;

    if (backend) {
      this.backendUnsubscribe = backend.subscribeToErrors((error) => {
        void this.handleBackendError(error);
      });
    }
  }

  getPreviewState(): PreviewState {
    return this.state;
  }

  async captureFrameSnapshot(
    options: PreviewFrameSnapshotOptions = {}
  ): Promise<PreviewFrameSnapshot> {
    if (!this.state.loaded || !this.state.timelineId) {
      return {
        status: "unavailable",
        timelineId: null,
        playheadUs: this.state.playheadUs,
        clipId: null,
        sourceMode: this.state.sourceMode,
        mimeType: null,
        width: null,
        height: null,
        dataUrl: null,
        warning: "Load a timeline into preview before requesting frame snapshots.",
        error: null
      };
    }

    if (!this.backend) {
      return {
        status: "error",
        timelineId: this.state.timelineId,
        playheadUs: this.state.playheadUs,
        clipId: this.state.activeVideoClipId,
        sourceMode: this.state.sourceMode,
        mimeType: null,
        width: null,
        height: null,
        dataUrl: null,
        warning: null,
        error: createPreviewError(
          "PREVIEW_BACKEND_UNAVAILABLE",
          "Preview adapter is not attached for frame capture."
        )
      };
    }

    return this.backend.captureFrameSnapshot(
      {
        timelineId: this.state.timelineId,
        playheadUs: this.state.playheadUs,
        clipId: this.state.activeVideoClipId,
        sourceMode: this.state.sourceMode
      },
      options
    );
  }

  subscribeToPreviewState(listener: (state: PreviewState) => void): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  setSelection(selection: Partial<PreviewSelectionState>): void {
    this.state = {
      ...this.state,
      selection: {
        ...this.state.selection,
        ...selection
      }
    };
    void this.refreshComposition(false);
  }

  async executeCommand(command: PreviewCommand): Promise<PreviewCommandResult> {
    const run = async (): Promise<PreviewCommandResult> => {
      switch (command.type) {
        case "LoadTimelinePreview":
          return this.loadTimelinePreview(command);
        case "UnloadTimelinePreview":
          return this.unloadTimelinePreview(command);
        case "PlayPreview":
          return this.playPreview(command);
        case "PausePreview":
          return this.pausePreview(command);
        case "SeekPreview":
          return this.seekPreview(command);
        case "SeekPreviewToClip":
          return this.seekPreviewToClip(command);
        case "StepPreviewFrameForward":
          return this.stepPreview(command, 1);
        case "StepPreviewFrameBackward":
          return this.stepPreview(command, -1);
        case "SetPreviewQuality":
          return this.setPreviewQuality(command);
      }
    };

    const prior = this.commandChain;
    const next = prior ? prior.then(run, run) : run();
    this.commandChain = next;

    return next;
  }

  async dispose(): Promise<void> {
    this.stopPlaybackLoop();
    this.backendUnsubscribe?.();
    this.backendUnsubscribe = null;
    await this.backend?.pause();
    this.backend?.dispose();
    this.backend = null;
    this.loadTarget = null;
    this.loadTargetSignature = null;
    this.lastCompositionKey = null;
    this.lastPlaybackIntent = false;
    this.setState(createInitialPreviewState());
  }

  private setState(nextState: PreviewState): void {
    this.state = nextState;

    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  private updateState(partial: Partial<PreviewState>): void {
    this.setState({
      ...this.state,
      ...partial
    });
  }

  private ensureLoaded(command: PreviewCommand): PreviewCommandFailure | null {
    if (!this.loadTarget || !this.state.loaded || !this.state.timelineId) {
      return createFailure(
        command,
        createPreviewError(
          "PREVIEW_NOT_LOADED",
          "Load a timeline into preview before sending transport commands."
        ),
        this.state
      );
    }

    return null;
  }

  private async loadTimelinePreview(
    command: Extract<PreviewCommand, { type: "LoadTimelinePreview" }>
  ): Promise<PreviewCommandResult> {
    const signature = createPreviewLoadSignature(command.target);
    const preservePlayhead =
      command.preservePlayhead !== false &&
      this.loadTarget?.timeline.id === command.target.timeline.id;
    const nextPlayheadUs = preservePlayhead
      ? clampPreviewPlayheadUs(command.target, this.state.playheadUs)
      : clampPreviewPlayheadUs(
          command.target,
          command.initialPlayheadUs ?? command.target.timeline.playheadUs
        );
    const nextQualityMode = this.state.loaded
      ? this.state.qualityMode
      : command.target.defaultQualityMode;
    const changed =
      signature !== this.loadTargetSignature ||
      nextPlayheadUs !== this.state.playheadUs ||
      nextQualityMode !== this.state.qualityMode;

    this.loadTarget = command.target;
    this.loadTargetSignature = signature;

    this.updateState({
      loaded: true,
      directory: command.target.directory,
      timelineId: command.target.timeline.id,
      qualityMode: nextQualityMode,
      playheadUs: nextPlayheadUs,
      timelineEndUs: clampPreviewPlayheadUs(
        {
          ...command.target,
          timeline: command.target.timeline
        },
        Number.MAX_SAFE_INTEGER
      ),
      playbackStatus: this.state.playbackStatus === "playing" ? "playing" : "paused",
      error: null,
      warning: null
    });

    await this.refreshComposition(true);

    return buildSuccess({
      ok: true,
      commandType: "LoadTimelinePreview",
      changed,
      timelineId: command.target.timeline.id,
      state: this.state
    });
  }

  private async unloadTimelinePreview(
    command: Extract<PreviewCommand, { type: "UnloadTimelinePreview" }>
  ): Promise<PreviewCommandResult> {
    void command;
    this.stopPlaybackLoop();
    await this.backend?.pause();
    await this.backend?.applyState({
      video: createBackendBinding(null, null),
      audio: createBackendBinding(null, null),
      playbackRate: 1,
      shouldPlay: false
    });
    this.loadTarget = null;
    this.loadTargetSignature = null;
    this.lastCompositionKey = null;
    this.lastPlaybackIntent = false;
    this.transportAnchor = null;
    this.setState(createInitialPreviewState());

    return buildSuccess({
      ok: true,
      commandType: "UnloadTimelinePreview",
      changed: true,
      state: this.state
    });
  }

  private async playPreview(
    command: Extract<PreviewCommand, { type: "PlayPreview" }>
  ): Promise<PreviewCommandResult> {
    const unloaded = this.ensureLoaded(command);

    if (unloaded) {
      return unloaded;
    }

    if (!this.backend) {
      return createFailure(
        command,
        createPreviewError(
          "PREVIEW_BACKEND_UNAVAILABLE",
          "Preview viewer is not attached yet."
        ),
        this.state
      );
    }

    this.updateState({
      playbackStatus: "buffering",
      error: null
    });
    this.transportAnchor = {
      nowMs: this.scheduler.nowMs(),
      playheadUs: this.state.playheadUs
    };
    await this.refreshComposition(true, "playing");
    this.updateState({
      playbackStatus: "playing"
    });
    this.startPlaybackLoop();

    return buildSuccess({
      ok: true,
      commandType: "PlayPreview",
      changed: true,
      state: this.state
    });
  }

  private async pausePreview(
    command: Extract<PreviewCommand, { type: "PausePreview" }>
  ): Promise<PreviewCommandResult> {
    const unloaded = this.ensureLoaded(command);

    if (unloaded) {
      return unloaded;
    }

    await this.pauseTransport();

    return buildSuccess({
      ok: true,
      commandType: "PausePreview",
      changed: true,
      state: this.state
    });
  }

  private async seekPreview(
    command: Extract<PreviewCommand, { type: "SeekPreview" }>
  ): Promise<PreviewCommandResult> {
    const unloaded = this.ensureLoaded(command);

    if (unloaded) {
      return unloaded;
    }

    if (!Number.isFinite(command.positionUs)) {
      return createFailure(
        command,
        createPreviewError("INVALID_PREVIEW_TIME", "Preview seek position must be numeric."),
        this.state
      );
    }

    const clampedPlayheadUs = clampPreviewPlayheadUs(this.loadTarget!, command.positionUs);
    const wasPlaying = this.state.playbackStatus === "playing";

    if (wasPlaying) {
      await this.pauseTransport();
    }

    this.updateState({
      playheadUs: clampedPlayheadUs,
      error: null
    });
    this.transportAnchor = {
      nowMs: this.scheduler.nowMs(),
      playheadUs: clampedPlayheadUs
    };
    await this.refreshComposition(true, wasPlaying ? "playing" : "paused");

    if (wasPlaying) {
      this.updateState({
        playbackStatus: "playing"
      });
      this.startPlaybackLoop();
    }

    return buildSuccess({
      ok: true,
      commandType: "SeekPreview",
      changed: true,
      playheadUs: this.state.playheadUs,
      state: this.state
    });
  }

  private async seekPreviewToClip(
    command: Extract<PreviewCommand, { type: "SeekPreviewToClip" }>
  ): Promise<PreviewCommandResult> {
    const unloaded = this.ensureLoaded(command);

    if (unloaded) {
      return unloaded;
    }

    const clip = this.loadTarget!.timeline.clipsById[command.clipId];

    if (!clip) {
      return createFailure(
        command,
        createPreviewError(
          "PREVIEW_CLIP_NOT_FOUND",
          `Clip ${command.clipId} could not be found in the loaded timeline.`
        ),
        this.state
      );
    }

    const seekResult = await this.seekPreview({
      type: "SeekPreview",
      positionUs: clip.timelineStartUs
    });

    if (!seekResult.ok) {
      return seekResult;
    }

    return buildSuccess({
      ok: true,
      commandType: "SeekPreviewToClip",
      changed: true,
      clipId: command.clipId,
      playheadUs: this.state.playheadUs,
      state: this.state
    });
  }

  private async stepPreview(
    command:
      | Extract<PreviewCommand, { type: "StepPreviewFrameForward" }>
      | Extract<PreviewCommand, { type: "StepPreviewFrameBackward" }>,
    direction: 1 | -1
  ): Promise<PreviewCommandResult> {
    const unloaded = this.ensureLoaded(command);

    if (unloaded) {
      return unloaded;
    }

    await this.pauseTransport();

    const frameStepUs = resolveFrameStepUs(
      this.loadTarget!,
      this.state.playheadUs,
      this.state.selection
    );
    const nextPlayheadUs = clampPreviewPlayheadUs(
      this.loadTarget!,
      this.state.playheadUs + frameStepUs * direction
    );

    this.updateState({
      playheadUs: nextPlayheadUs,
      error: null
    });
    this.transportAnchor = {
      nowMs: this.scheduler.nowMs(),
      playheadUs: nextPlayheadUs
    };
    await this.refreshComposition(true, "paused");

    return buildSuccess({
      ok: true,
      commandType: command.type,
      changed: true,
      playheadUs: this.state.playheadUs,
      frameStepUs,
      state: this.state
    });
  }

  private async setPreviewQuality(
    command: Extract<PreviewCommand, { type: "SetPreviewQuality" }>
  ): Promise<PreviewCommandResult> {
    const unloaded = this.ensureLoaded(command);

    if (unloaded) {
      return unloaded;
    }

    const changed = this.state.qualityMode !== command.qualityMode;

    this.updateState({
      qualityMode: command.qualityMode,
      error: null
    });
    await this.refreshComposition(changed, this.state.playbackStatus);

    return buildSuccess({
      ok: true,
      commandType: "SetPreviewQuality",
      changed,
      qualityMode: this.state.qualityMode,
      state: this.state
    });
  }

  private async pauseTransport(): Promise<void> {
    if (!this.loadTarget) {
      return;
    }

    const nextPlayheadUs = this.computePlaybackClockPlayheadUs();
    this.stopPlaybackLoop();
    this.transportAnchor = {
      nowMs: this.scheduler.nowMs(),
      playheadUs: nextPlayheadUs
    };
    this.updateState({
      playheadUs: nextPlayheadUs,
      playbackStatus: "paused"
    });
    await this.backend?.pause();
    await this.refreshComposition(true, "paused");
  }

  private async refreshComposition(
    forceBackendSync: boolean,
    playbackStatus: PreviewState["playbackStatus"] = this.state.playbackStatus
  ): Promise<void> {
    if (!this.loadTarget) {
      return;
    }

    const composition = resolveTimelinePreviewCompositionForQuality(
      this.loadTarget,
      this.state.playheadUs,
      this.state.selection,
      this.state.qualityMode
    );
    const compositionKey = buildTimelineClipSequenceKey(composition);
    const videoClip = composition.activeVideoClip
      ? this.loadTarget.timeline.clipsById[composition.activeVideoClip.clipId] ?? null
      : null;
    const audioClip = composition.activeAudioClip
      ? this.loadTarget.timeline.clipsById[composition.activeAudioClip.clipId] ?? null
      : null;
    const videoTargetTimeSeconds =
      videoClip && composition.videoSource
        ? mapTimelineClipToMediaSeconds(videoClip, composition.playheadUs)
        : null;
    const audioTargetTimeSeconds =
      audioClip && composition.audioSource
        ? mapTimelineClipToMediaSeconds(audioClip, composition.playheadUs)
        : null;
    const shouldPlay = playbackStatus === "playing";

    if (
      this.backend &&
      (
        forceBackendSync ||
        compositionKey !== this.lastCompositionKey ||
        shouldPlay !== this.lastPlaybackIntent
      )
    ) {
      await this.backend.applyState({
        video: createBackendBinding(composition.videoSource, videoTargetTimeSeconds),
        audio: createBackendBinding(composition.audioSource, audioTargetTimeSeconds),
        playbackRate: this.state.playbackRate,
        shouldPlay
      });
    }

    const previewError =
      composition.sourceMode === "unavailable"
        ? createPreviewError(
            "PREVIEW_SOURCE_UNAVAILABLE",
            "No usable preview source is available at the current playhead position.",
            composition.warning ?? undefined
          )
        : null;

    this.lastCompositionKey = compositionKey;
    this.lastPlaybackIntent = shouldPlay;
    this.setState({
      ...this.state,
      loaded: true,
      directory: this.loadTarget.directory,
      timelineId: this.loadTarget.timeline.id,
      timelineEndUs: clampPreviewPlayheadUs(this.loadTarget, Number.MAX_SAFE_INTEGER),
      playheadUs: composition.playheadUs,
      playbackStatus: previewError ? "error" : playbackStatus,
      sourceMode: composition.sourceMode,
      activeVideoClipId: composition.activeVideoClip?.clipId ?? null,
      activeAudioClipId: composition.activeAudioClip?.clipId ?? null,
      loadedMedia: {
        video: composition.videoSource,
        audio: composition.audioSource
      },
      overlays: composition.overlays,
      warning: composition.warning,
      error: previewError
    });
  }

  private computePlaybackClockPlayheadUs(): number {
    if (!this.loadTarget) {
      return this.state.playheadUs;
    }

    const audioClip =
      this.state.activeAudioClipId !== null
        ? this.loadTarget.timeline.clipsById[this.state.activeAudioClipId] ?? null
        : null;
    const videoClip =
      this.state.activeVideoClipId !== null
        ? this.loadTarget.timeline.clipsById[this.state.activeVideoClipId] ?? null
        : null;

    if (audioClip) {
      const audioClock = this.backend?.getMediaClockSeconds("audio") ?? null;

      if (audioClock !== null) {
        return clampPreviewPlayheadUs(
          this.loadTarget,
          mapPlaybackClockToTimelineUs(audioClip, audioClock)
        );
      }
    }

    if (videoClip) {
      const videoClock = this.backend?.getMediaClockSeconds("video") ?? null;

      if (videoClock !== null) {
        return clampPreviewPlayheadUs(
          this.loadTarget,
          mapPlaybackClockToTimelineUs(videoClip, videoClock)
        );
      }
    }

    if (this.transportAnchor) {
      const elapsedUs = Math.round(
        (this.scheduler.nowMs() - this.transportAnchor.nowMs) *
          1_000 *
          this.state.playbackRate
      );

      return clampPreviewPlayheadUs(
        this.loadTarget,
        this.transportAnchor.playheadUs + elapsedUs
      );
    }

    return this.state.playheadUs;
  }

  private startPlaybackLoop(): void {
    if (this.animationFrameHandle !== null) {
      return;
    }

    this.animationFrameHandle = this.scheduler.requestFrame(() => {
      this.animationFrameHandle = null;
      void this.handlePlaybackFrame();
    });
  }

  private stopPlaybackLoop(): void {
    if (this.animationFrameHandle === null) {
      return;
    }

    this.scheduler.cancelFrame(this.animationFrameHandle);
    this.animationFrameHandle = null;
  }

  private async handlePlaybackFrame(): Promise<void> {
    if (!this.loadTarget || this.state.playbackStatus !== "playing") {
      return;
    }

    const nextPlayheadUs = this.computePlaybackClockPlayheadUs();

    if (nextPlayheadUs >= this.state.timelineEndUs) {
      this.updateState({
        playheadUs: this.state.timelineEndUs
      });
      await this.pauseTransport();
      return;
    }

    this.transportAnchor = {
      nowMs: this.scheduler.nowMs(),
      playheadUs: nextPlayheadUs
    };
    this.updateState({
      playheadUs: nextPlayheadUs
    });
    await this.refreshComposition(false, "playing");
    this.startPlaybackLoop();
  }

  private async handleBackendError(error: PreviewBackendError): Promise<void> {
    this.stopPlaybackLoop();
    await this.backend?.pause();
    this.lastPlaybackIntent = false;

    this.updateState({
      playbackStatus: "error",
      error: createPreviewError(
        "PREVIEW_BACKEND_FAILED",
        error.message,
        error.details
      )
    });
  }
}

export const previewController = new PreviewController();

export function usePreviewState(): PreviewState {
  return useSyncExternalStore(
    (listener) => previewController.subscribeToPreviewState(listener),
    () => previewController.getPreviewState(),
    () => previewController.getPreviewState()
  );
}
