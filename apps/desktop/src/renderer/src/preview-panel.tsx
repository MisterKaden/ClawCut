import { useEffect, useRef, useState } from "react";

import { HtmlMediaPreviewAdapter } from "./preview-backend";
import { previewController, usePreviewState } from "./preview-controller";

function formatTimelineTime(valueUs: number): string {
  const totalSeconds = Math.max(0, Math.floor(valueUs / 1_000_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const frames = Math.floor((valueUs % 1_000_000) / 1_000);

  return `${minutes}:${seconds.toString().padStart(2, "0")}.${Math.floor(frames / 100)}`;
}

function previewModeLabel(mode: string): string {
  switch (mode) {
    case "fast":
      return "Fast";
    case "standard":
      return "Standard";
    case "accurate":
      return "Accurate";
    default:
      return mode;
  }
}

function sourceModeLabel(mode: string): string {
  switch (mode) {
    case "proxy":
      return "Proxy";
    case "original":
      return "Original";
    case "mixed":
      return "Mixed";
    case "gap":
      return "Gap";
    case "unavailable":
      return "Unavailable";
    default:
      return "Idle";
  }
}

export function PreviewPanel() {
  const previewState = usePreviewState();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [backend] = useState(() => new HtmlMediaPreviewAdapter());

  useEffect(() => {
    backend.attachElements({
      videoElement: videoRef.current,
      audioElement: audioRef.current
    });
    previewController.attachBackend(backend);

    return () => {
      previewController.attachBackend(null);
      backend.dispose();
    };
  }, [backend]);

  const isPlaying = previewState.playbackStatus === "playing";
  const hasVideo = previewState.loadedMedia.video !== null;
  const hasAudio = previewState.loadedMedia.audio !== null;
  const activeMarkers = previewState.overlays.markers.filter((marker) => marker.active);
  const activeRegions = previewState.overlays.regions.filter((region) => region.active);

  return (
    <section className="preview-panel" data-testid="preview-panel">
      <header className="panel-header">
        <div>
          <p className="eyebrow eyebrow--muted">Preview engine</p>
          <h2>Playback, scrubbing, overlays</h2>
        </div>
        <div className="preview-panel__meta">
          <span className="tone-chip">{previewModeLabel(previewState.qualityMode)}</span>
          <span className="tone-chip">{sourceModeLabel(previewState.sourceMode)}</span>
          <span className="tone-chip">{previewState.playbackStatus}</span>
        </div>
      </header>

      <div className="preview-viewer">
        <video
          className={hasVideo ? "preview-viewer__video" : "preview-viewer__video preview-viewer__video--hidden"}
          ref={videoRef}
        />
        <audio ref={audioRef} />
        <div className="preview-viewer__slate">
          {!previewState.loaded ? (
            <>
              <span>Preview idle</span>
              <strong>Load a project timeline to start previewing edits.</strong>
            </>
          ) : previewState.error ? (
            <>
              <span>Preview error</span>
              <strong>{previewState.error.message}</strong>
              {previewState.error.details ? <p>{previewState.error.details}</p> : null}
            </>
          ) : hasVideo ? null : hasAudio ? (
            <>
              <span>Audio preview</span>
              <strong>{previewState.loadedMedia.audio?.displayName ?? "Audio source active"}</strong>
            </>
          ) : previewState.sourceMode === "gap" ? (
            <>
              <span>Timeline gap</span>
              <strong>Black frame and silence at the current playhead.</strong>
            </>
          ) : (
            <>
              <span>No active source</span>
              <strong>Move the playhead onto a clip to preview media.</strong>
            </>
          )}
        </div>

        <div className="preview-overlay-layer">
          <div className="preview-safe-zone preview-safe-zone--action" />
          <div className="preview-safe-zone preview-safe-zone--title" />

          {previewState.overlays.selection ? (
            <div className="preview-overlay-chip preview-overlay-chip--selection">
              {previewState.overlays.selection.label}
            </div>
          ) : null}

          {activeMarkers.length > 0 ? (
            <div className="preview-overlay-list preview-overlay-list--top">
              {activeMarkers.map((marker) => (
                <span className="preview-overlay-chip" key={marker.markerId}>
                  Marker: {marker.label}
                </span>
              ))}
            </div>
          ) : null}

          {activeRegions.length > 0 ? (
            <div className="preview-overlay-list preview-overlay-list--bottom">
              {activeRegions.map((region) => (
                <span className="preview-overlay-chip" key={region.regionId}>
                  Region: {region.label}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="preview-transport">
        <div className="button-row">
          <button
            className="secondary-button"
            disabled={!previewState.loaded}
            onClick={() =>
              void previewController.executeCommand({
                type: "StepPreviewFrameBackward"
              })
            }
            type="button"
          >
            Step back
          </button>
          <button
            className="primary-button"
            data-testid="preview-play-toggle"
            disabled={!previewState.loaded}
            onClick={() =>
              void previewController.executeCommand({
                type: isPlaying ? "PausePreview" : "PlayPreview"
              })
            }
            type="button"
          >
            {isPlaying ? "Pause" : "Play"}
          </button>
          <button
            className="secondary-button"
            disabled={!previewState.loaded}
            onClick={() =>
              void previewController.executeCommand({
                type: "StepPreviewFrameForward"
              })
            }
            type="button"
          >
            Step forward
          </button>
        </div>

        <label className="field field--compact">
          <span>Quality</span>
          <select
            data-testid="preview-quality-select"
            disabled={!previewState.loaded}
            onChange={(event) =>
              void previewController.executeCommand({
                type: "SetPreviewQuality",
                qualityMode: event.currentTarget.value as "fast" | "standard" | "accurate"
              })
            }
            value={previewState.qualityMode}
          >
            <option value="fast">Fast preview</option>
            <option value="standard">Standard preview</option>
            <option value="accurate">Accurate preview</option>
          </select>
        </label>
      </div>

      <div className="preview-scrub">
        <div className="preview-scrub__time">
          <strong data-testid="preview-timecode">{formatTimelineTime(previewState.playheadUs)}</strong>
          <span>/ {formatTimelineTime(previewState.timelineEndUs)}</span>
        </div>
        <input
          className="preview-scrub__input"
          data-testid="preview-scrub-input"
          disabled={!previewState.loaded}
          max={Math.max(1, previewState.timelineEndUs)}
          min={0}
          onChange={(event) =>
            void previewController.executeCommand({
              type: "SeekPreview",
              positionUs: Number(event.currentTarget.value)
            })
          }
          step={1_000}
          type="range"
          value={Math.min(previewState.playheadUs, Math.max(1, previewState.timelineEndUs))}
        />
      </div>

      <div className="preview-status-grid">
        <div>
          <span className="meta-label">Video source</span>
          <strong>{previewState.loadedMedia.video?.displayName ?? "None"}</strong>
        </div>
        <div>
          <span className="meta-label">Audio source</span>
          <strong>{previewState.loadedMedia.audio?.displayName ?? "None"}</strong>
        </div>
        <div>
          <span className="meta-label">Active clips</span>
          <strong>
            {previewState.activeVideoClipId ?? "no video"} / {previewState.activeAudioClipId ?? "no audio"}
          </strong>
        </div>
        <div>
          <span className="meta-label">Warning</span>
          <strong>{previewState.warning ?? "None"}</strong>
        </div>
      </div>
    </section>
  );
}
