import type {
  PreviewError,
  PreviewFrameSnapshot,
  PreviewFrameSnapshotOptions,
  PreviewSourceMode,
  PreviewSourceSelection
} from "@clawcut/domain";

export interface PreviewBackendBinding {
  source: PreviewSourceSelection | null;
  targetTimeSeconds: number | null;
}

export interface PreviewBackendState {
  video: PreviewBackendBinding;
  audio: PreviewBackendBinding;
  playbackRate: number;
  shouldPlay: boolean;
}

export interface PreviewBackendError {
  sourceKind: "video" | "audio";
  message: string;
  details?: string;
}

export interface PreviewBackendElements {
  videoElement: HTMLVideoElement | null;
  audioElement: HTMLAudioElement | null;
}

export interface PreviewAdapterSnapshotRequest {
  timelineId: string | null;
  playheadUs: number;
  clipId: string | null;
  sourceMode: PreviewSourceMode;
}

export interface PreviewAdapter {
  attachElements(elements: PreviewBackendElements): void;
  applyState(state: PreviewBackendState): Promise<void>;
  getMediaClockSeconds(sourceKind: "video" | "audio"): number | null;
  pause(): Promise<void>;
  captureFrameSnapshot(
    request: PreviewAdapterSnapshotRequest,
    options?: PreviewFrameSnapshotOptions
  ): Promise<PreviewFrameSnapshot>;
  subscribeToErrors(listener: (error: PreviewBackendError) => void): () => void;
  dispose(): void;
}

interface ManagedElementState {
  currentSourceUrl: string | null;
  currentTargetTimeSeconds: number | null;
}

function waitForEvent(
  element: HTMLMediaElement,
  successEvents: Array<keyof HTMLMediaElementEventMap>,
  timeoutMs: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeoutId = window.setTimeout(() => {
      cleanup();
      resolve();
    }, timeoutMs);

    const cleanup = (): void => {
      window.clearTimeout(timeoutId);

      for (const eventName of successEvents) {
        element.removeEventListener(eventName, handleSuccess);
      }

      element.removeEventListener("error", handleError);
    };

    const handleSuccess = (): void => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      resolve();
    };

    const handleError = (): void => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      reject(new Error("Media element reported an error while loading or seeking."));
    };

    for (const eventName of successEvents) {
      element.addEventListener(eventName, handleSuccess, { once: true });
    }

    element.addEventListener("error", handleError, { once: true });
  });
}

function clearMediaElement(element: HTMLMediaElement): void {
  element.pause();
  element.removeAttribute("src");
  element.load();
}

function createUnavailableSnapshot(
  request: PreviewAdapterSnapshotRequest,
  warning: string,
  error: PreviewError | null = null
): PreviewFrameSnapshot {
  return {
    status: error ? "error" : "unavailable",
    timelineId: request.timelineId,
    playheadUs: request.playheadUs,
    clipId: request.clipId,
    sourceMode: request.sourceMode,
    mimeType: null,
    width: null,
    height: null,
    dataUrl: null,
    warning,
    error
  };
}

export class HtmlMediaPreviewAdapter implements PreviewAdapter {
  private elements: PreviewBackendElements = {
    videoElement: null,
    audioElement: null
  };

  private videoState: ManagedElementState = {
    currentSourceUrl: null,
    currentTargetTimeSeconds: null
  };

  private audioState: ManagedElementState = {
    currentSourceUrl: null,
    currentTargetTimeSeconds: null
  };

  private errorListeners = new Set<(error: PreviewBackendError) => void>();

  attachElements(elements: PreviewBackendElements): void {
    this.elements = elements;

    if (elements.videoElement) {
      elements.videoElement.muted = true;
      elements.videoElement.playsInline = true;
      elements.videoElement.preload = "auto";
      elements.videoElement.addEventListener("error", () => {
        this.emitError({
          sourceKind: "video",
          message: "Video preview failed to load."
        });
      });
    }

    if (elements.audioElement) {
      elements.audioElement.preload = "auto";
      elements.audioElement.addEventListener("error", () => {
        this.emitError({
          sourceKind: "audio",
          message: "Audio preview failed to load."
        });
      });
    }
  }

  subscribeToErrors(listener: (error: PreviewBackendError) => void): () => void {
    this.errorListeners.add(listener);

    return () => {
      this.errorListeners.delete(listener);
    };
  }

  getMediaClockSeconds(sourceKind: "video" | "audio"): number | null {
    const element =
      sourceKind === "video" ? this.elements.videoElement : this.elements.audioElement;

    if (!element || !element.src) {
      return null;
    }

    return Number.isFinite(element.currentTime) ? element.currentTime : null;
  }

  async pause(): Promise<void> {
    this.elements.videoElement?.pause();
    this.elements.audioElement?.pause();
  }

  async captureFrameSnapshot(
    request: PreviewAdapterSnapshotRequest,
    options: PreviewFrameSnapshotOptions = {}
  ): Promise<PreviewFrameSnapshot> {
    const element = this.elements.videoElement;

    if (!element || !element.src) {
      return createUnavailableSnapshot(request, "No active video source is loaded for capture.");
    }

    if (element.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      return createUnavailableSnapshot(request, "Video frame data is not ready yet.");
    }

    if (!element.videoWidth || !element.videoHeight) {
      return createUnavailableSnapshot(request, "Video dimensions are not available for capture.");
    }

    const requestedMimeType = options.mimeType ?? "image/png";
    const maxWidth = Math.max(1, Math.round(options.maxWidth ?? element.videoWidth));
    const scaleFactor = Math.min(1, maxWidth / element.videoWidth);
    const targetWidth = Math.max(1, Math.round(element.videoWidth * scaleFactor));
    const targetHeight = Math.max(1, Math.round(element.videoHeight * scaleFactor));
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (!context) {
      return createUnavailableSnapshot(request, "Canvas capture is not available in this renderer.");
    }

    canvas.width = targetWidth;
    canvas.height = targetHeight;

    try {
      context.drawImage(element, 0, 0, targetWidth, targetHeight);

      return {
        status: "available",
        timelineId: request.timelineId,
        playheadUs: request.playheadUs,
        clipId: request.clipId,
        sourceMode: request.sourceMode,
        mimeType: requestedMimeType,
        width: targetWidth,
        height: targetHeight,
        dataUrl: canvas.toDataURL(requestedMimeType, options.quality),
        warning: null,
        error: null
      };
    } catch (error) {
      return createUnavailableSnapshot(request, "Video frame capture failed.", {
        code: "PREVIEW_BACKEND_FAILED",
        message: "Preview frame capture failed.",
        details: error instanceof Error ? error.message : undefined,
        recoverable: true
      });
    }
  }

  async applyState(state: PreviewBackendState): Promise<void> {
    await this.syncElement(
      this.elements.videoElement,
      this.videoState,
      state.video,
      state.playbackRate
    );
    await this.syncElement(
      this.elements.audioElement,
      this.audioState,
      state.audio,
      state.playbackRate
    );

    if (state.shouldPlay) {
      await this.startPlayback(this.elements.videoElement, state.video.source !== null, "video");
      await this.startPlayback(this.elements.audioElement, state.audio.source !== null, "audio");
      return;
    }

    await this.pause();
  }

  dispose(): void {
    if (this.elements.videoElement) {
      clearMediaElement(this.elements.videoElement);
    }

    if (this.elements.audioElement) {
      clearMediaElement(this.elements.audioElement);
    }

    this.errorListeners.clear();
    this.videoState = {
      currentSourceUrl: null,
      currentTargetTimeSeconds: null
    };
    this.audioState = {
      currentSourceUrl: null,
      currentTargetTimeSeconds: null
    };
  }

  private emitError(error: PreviewBackendError): void {
    for (const listener of this.errorListeners) {
      listener(error);
    }
  }

  private async syncElement(
    element: HTMLMediaElement | null,
    managedState: ManagedElementState,
    binding: PreviewBackendBinding,
    playbackRate: number
  ): Promise<void> {
    if (!element) {
      return;
    }

    element.playbackRate = playbackRate;

    if (!binding.source) {
      if (managedState.currentSourceUrl !== null) {
        clearMediaElement(element);
      }

      managedState.currentSourceUrl = null;
      managedState.currentTargetTimeSeconds = null;
      return;
    }

    if (managedState.currentSourceUrl !== binding.source.fileUrl) {
      element.pause();
      element.src = binding.source.fileUrl;
      element.load();
      await waitForEvent(element, ["loadedmetadata", "canplay"], 2_000);
      managedState.currentSourceUrl = binding.source.fileUrl;
      managedState.currentTargetTimeSeconds = null;
    }

    if (binding.targetTimeSeconds === null) {
      return;
    }

    if (
      managedState.currentTargetTimeSeconds !== null &&
      Math.abs(managedState.currentTargetTimeSeconds - binding.targetTimeSeconds) < 0.02
    ) {
      return;
    }

    if (!Number.isFinite(binding.targetTimeSeconds)) {
      return;
    }

    if (Math.abs(element.currentTime - binding.targetTimeSeconds) < 0.02) {
      managedState.currentTargetTimeSeconds = binding.targetTimeSeconds;
      return;
    }

    element.currentTime = Math.max(0, binding.targetTimeSeconds);
    managedState.currentTargetTimeSeconds = binding.targetTimeSeconds;
    await waitForEvent(element, ["seeked", "timeupdate"], 500);
  }

  private async startPlayback(
    element: HTMLMediaElement | null,
    enabled: boolean,
    sourceKind: "video" | "audio"
  ): Promise<void> {
    if (!element) {
      return;
    }

    if (!enabled || !element.src) {
      element.pause();
      return;
    }

    try {
      await element.play();
    } catch (error) {
      this.emitError({
        sourceKind,
        message: `${sourceKind === "video" ? "Video" : "Audio"} preview could not start.`,
        details: error instanceof Error ? error.message : undefined
      });
    }
  }
}

export type PreviewPlaybackBackend = PreviewAdapter;
export const HtmlMediaPreviewBackend = HtmlMediaPreviewAdapter;
