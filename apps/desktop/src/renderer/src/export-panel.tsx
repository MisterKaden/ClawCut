import type { ExportPresetId, ExportRun } from "@clawcut/domain";
import type {
  CaptionSessionSnapshot,
  EditorSessionSnapshot,
  ExportSessionSnapshot
} from "@clawcut/ipc";

interface ExportPanelProps {
  snapshot: EditorSessionSnapshot | null;
  exportSnapshot: ExportSessionSnapshot | null;
  captionSnapshot: CaptionSessionSnapshot | null;
  selectedPresetId: ExportPresetId | null;
  selectedTargetKey: string;
  selectedBurnInTrackId: string | null;
  burnInCaptionsEnabled: boolean;
  customRangeStartSeconds: string;
  customRangeEndSeconds: string;
  onSelectPreset: (presetId: ExportPresetId) => void;
  onSelectTargetKey: (targetKey: string) => void;
  onChangeBurnInTrackId: (trackId: string | null) => void;
  onChangeBurnInEnabled: (enabled: boolean) => void;
  onChangeCustomRangeStartSeconds: (value: string) => void;
  onChangeCustomRangeEndSeconds: (value: string) => void;
  onStartExport: () => void;
  onCancelExport: (exportRunId: string) => void;
  onRetryExport: (exportRunId: string) => void;
}

function formatExportMode(mode: ExportRun["exportMode"]): string {
  switch (mode) {
    case "video":
      return "Video";
    case "audio":
      return "Audio";
    case "frame":
      return "Frame";
  }
}

function formatExportStatus(status: ExportRun["status"]): string {
  switch (status) {
    case "queued":
      return "Queued";
    case "preparing":
      return "Preparing";
    case "compiling":
      return "Compiling";
    case "rendering":
      return "Rendering";
    case "finalizing":
      return "Finalizing";
    case "verifying":
      return "Verifying";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
  }
}

function exportToneClass(status: ExportRun["status"]): string {
  switch (status) {
    case "completed":
      return "tone-chip tone-chip--ok";
    case "failed":
      return "tone-chip tone-chip--danger";
    case "cancelled":
      return "tone-chip tone-chip--warning";
    case "queued":
    case "preparing":
    case "compiling":
    case "rendering":
    case "finalizing":
    case "verifying":
      return "tone-chip tone-chip--progress";
  }
}

export function ExportPanel({
  snapshot,
  exportSnapshot,
  captionSnapshot,
  selectedPresetId,
  selectedTargetKey,
  selectedBurnInTrackId,
  burnInCaptionsEnabled,
  customRangeStartSeconds,
  customRangeEndSeconds,
  onSelectPreset,
  onSelectTargetKey,
  onChangeBurnInTrackId,
  onChangeBurnInEnabled,
  onChangeCustomRangeStartSeconds,
  onChangeCustomRangeEndSeconds,
  onStartExport,
  onCancelExport,
  onRetryExport
}: ExportPanelProps) {
  const selectedPreset =
    exportSnapshot?.presets.find((preset) => preset.id === selectedPresetId) ?? null;
  const exportRuns = exportSnapshot?.exportRuns ?? [];
  const activeRun = exportRuns.find((run) =>
    ["queued", "preparing", "compiling", "rendering", "finalizing", "verifying"].includes(run.status)
  ) ?? null;
  const canExport = Boolean(snapshot) && Object.keys(snapshot?.timeline.clipsById ?? {}).length > 0;
  const regions = snapshot?.timeline.regions ?? [];
  const isCustomRange = selectedTargetKey === "range";
  const captionTracks = captionSnapshot?.captionTracks ?? [];

  return (
    <section className="export-panel" data-testid="export-panel">
      <header className="panel-header">
        <div>
          <p className="eyebrow eyebrow--muted">Render compiler</p>
          <h2>Deterministic export queue</h2>
        </div>
        <span className={activeRun ? "tone-chip tone-chip--progress" : "tone-chip"}>
          {activeRun ? formatExportStatus(activeRun.status) : "Idle"}
        </span>
      </header>

      <div className="export-panel__grid">
        <div className="export-controls">
          <label className="field">
            <span>Preset</span>
            <select
              data-testid="export-preset-select"
              disabled={!exportSnapshot}
              onChange={(event) => onSelectPreset(event.target.value as ExportPresetId)}
              value={selectedPresetId ?? ""}
            >
              <option disabled value="">
                Select export preset
              </option>
              {exportSnapshot?.presets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Scope</span>
            <select
              data-testid="export-target-select"
              disabled={!snapshot}
              onChange={(event) => onSelectTargetKey(event.target.value)}
              value={selectedTargetKey}
            >
              <option value="timeline">Full timeline</option>
              <option value="range">Custom range</option>
              {regions.map((region) => (
                <option key={region.id} value={`region:${region.id}`}>
                  Region: {region.label || "Untitled"}
                </option>
              ))}
            </select>
          </label>

          {isCustomRange ? (
            <div className="export-range-grid">
              <label className="field">
                <span>In (seconds)</span>
                <input
                  data-testid="export-range-start"
                  inputMode="decimal"
                  onChange={(event) => onChangeCustomRangeStartSeconds(event.target.value)}
                  type="number"
                  value={customRangeStartSeconds}
                />
              </label>
              <label className="field">
                <span>Out (seconds)</span>
                <input
                  data-testid="export-range-end"
                  inputMode="decimal"
                  onChange={(event) => onChangeCustomRangeEndSeconds(event.target.value)}
                  type="number"
                  value={customRangeEndSeconds}
                />
              </label>
            </div>
          ) : null}

          <div className="export-summary-card">
            <span className="meta-label">Destination</span>
            <strong>{exportSnapshot?.outputRoot ?? "Open a project to enable export output paths."}</strong>
            <p>
              {selectedPreset
                ? `${selectedPreset.name} writes ${selectedPreset.extension.toUpperCase()} files with safe auto-increment naming and inspectable build artifacts.`
                : "Exports land in the project exports folder with deterministic auto-increment naming."}
            </p>
          </div>

          <div className="export-burnin-card">
            <label className="field field--checkbox">
              <input
                checked={burnInCaptionsEnabled}
                disabled={captionTracks.length === 0}
                onChange={(event) => onChangeBurnInEnabled(event.target.checked)}
                type="checkbox"
              />
              <span>Burn in captions on final export</span>
            </label>

            <label className="field field--compact">
              <span>Caption track</span>
              <select
                disabled={!burnInCaptionsEnabled || captionTracks.length === 0}
                onChange={(event) => onChangeBurnInTrackId(event.target.value || null)}
                value={selectedBurnInTrackId ?? ""}
              >
                <option value="">No caption track selected</option>
                {captionTracks.map((track) => (
                  <option key={track.id} value={track.id}>
                    {track.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="button-row">
            <button
              className="primary-button"
              data-testid="start-export-button"
              disabled={!canExport || !selectedPresetId}
              onClick={onStartExport}
              type="button"
            >
              Start export
            </button>
            {activeRun ? (
              <button
                className="secondary-button"
                data-testid="cancel-export-button"
                onClick={() => onCancelExport(activeRun.id)}
                type="button"
              >
                Cancel active export
              </button>
            ) : null}
          </div>

          {!snapshot ? (
            <div className="empty-inline">
              Open a project first. Export uses the worker-owned render compiler, not UI-side FFmpeg calls.
            </div>
          ) : Object.keys(snapshot.timeline.clipsById).length === 0 ? (
            <div className="empty-inline">
              Build a timeline before exporting. Stage 5 compiles the project timeline into a render plan and FFmpeg job spec.
            </div>
          ) : null}
        </div>

        <div className="export-runs">
          {exportRuns.length ? (
            exportRuns.slice(0, 8).map((run) => (
              <article className="export-run-card" data-testid={`export-run-${run.id}`} key={run.id}>
                <div className="export-run-card__header">
                  <div>
                    <strong>{run.outputPath?.split("/").at(-1) ?? run.presetId}</strong>
                    <span>{formatExportMode(run.exportMode)}</span>
                  </div>
                  <span className={exportToneClass(run.status)}>{formatExportStatus(run.status)}</span>
                </div>

                <div className="export-run-card__meta">
                  <span>{run.outputPath ?? "Output path pending"}</span>
                  <span>{run.presetId}</span>
                </div>

                <p className="export-run-card__progress">
                  {run.error?.message ??
                    run.verification?.errorMessage ??
                    run.diagnostics.notes.at(-1) ??
                    "Export diagnostics will appear here."}
                </p>

                <div className="export-run-card__footer">
                  <span>{run.status === "completed" ? "Verified" : formatExportStatus(run.status)}</span>
                  <div className="button-row button-row--tight">
                    {["queued", "preparing", "compiling", "rendering", "finalizing", "verifying"].includes(
                      run.status
                    ) ? (
                      <button
                        className="ghost-button ghost-button--small"
                        onClick={() => onCancelExport(run.id)}
                        type="button"
                      >
                        Cancel
                      </button>
                    ) : null}
                    {run.status === "failed" || run.status === "cancelled" ? (
                      <button
                        className="ghost-button ghost-button--small"
                        onClick={() => onRetryExport(run.id)}
                        type="button"
                      >
                        Retry
                      </button>
                    ) : null}
                  </div>
                </div>
              </article>
            ))
          ) : (
            <div className="empty-panel empty-panel--jobs">
              <strong>No export runs yet.</strong>
              <p>
                Start with a built-in preset. Clawcut will compile a render plan, render segment artifacts, and verify the output.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
