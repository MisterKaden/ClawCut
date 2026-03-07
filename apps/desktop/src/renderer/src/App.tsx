import { startTransition, useEffect, useEffectEvent, useState } from "react";

import type {
  CaptionCommand,
  DerivedAsset,
  EditorCommand,
  ExportPresetId,
  MediaItem,
  Job,
  TranscriptionOptions,
  WaveformAsset
} from "@clawcut/domain";
import { getTimelineEndUs } from "@clawcut/domain";
import type {
  LocalApiStatus,
  EditorSessionSnapshot,
  CaptionSessionSnapshot,
  ExecuteCaptionCommandResult,
  ExportSessionSnapshot,
  ExecuteEditorCommandResult,
  ExecuteExportCommandResult,
  ToolchainStatus
} from "@clawcut/ipc";

import { CaptionPanel } from "./caption-panel";
import { ExportPanel } from "./export-panel";
import { createPreviewLoadTarget, previewController } from "./preview-controller";
import { PreviewPanel } from "./preview-panel";
import { TimelineEditor } from "./timeline-editor";

interface OperationState {
  kind: "idle" | "working" | "error";
  message: string | null;
}

function defaultProjectName(): string {
  return "Clawcut Session";
}

function hasActiveWork(snapshot: EditorSessionSnapshot | null): boolean {
  if (!snapshot) {
    return false;
  }

  return snapshot.jobs.some(
    (job) => job.kind !== "export" && (job.status === "queued" || job.status === "running")
  );
}

function formatDuration(durationMs: number | null): string {
  if (durationMs === null) {
    return "Unknown";
  }

  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatFileSize(bytes: number | null): string {
  if (bytes === null) {
    return "Unknown";
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatDate(timestamp: string | null): string {
  if (!timestamp) {
    return "Unknown";
  }

  return new Date(timestamp).toLocaleString();
}

function formatDimensions(item: MediaItem | null): string {
  if (!item?.metadataSummary.width || !item.metadataSummary.height) {
    return "Unknown";
  }

  return `${item.metadataSummary.width} × ${item.metadataSummary.height}`;
}

function formatFrameRate(value: number | null): string {
  if (!value) {
    return "Unknown";
  }

  return `${value.toFixed(value < 10 ? 2 : 1)} fps`;
}

function formatStatusLabel(status: MediaItem["ingestStatus"]): string {
  switch (status) {
    case "pending":
      return "Pending";
    case "indexing":
      return "Indexing";
    case "deriving":
      return "Deriving";
    case "ready":
      return "Ready";
    case "warning":
      return "Warning";
    case "failed":
      return "Failed";
    case "missing":
      return "Missing";
  }
}

function formatDerivedLabel(type: DerivedAsset["type"]): string {
  switch (type) {
    case "thumbnail":
      return "Poster";
    case "waveform":
      return "Waveform";
    case "proxy":
      return "Proxy";
  }
}

function toneClassForTool(available: boolean | undefined): string {
  return available ? "tone-chip tone-chip--ok" : "tone-chip tone-chip--warning";
}

function toneClassForMediaStatus(status: MediaItem["ingestStatus"]): string {
  switch (status) {
    case "ready":
      return "tone-chip tone-chip--ok";
    case "warning":
      return "tone-chip tone-chip--warning";
    case "failed":
    case "missing":
      return "tone-chip tone-chip--danger";
    case "indexing":
    case "deriving":
    case "pending":
      return "tone-chip tone-chip--progress";
  }
}

function toneClassForJob(job: Job): string {
  switch (job.status) {
    case "completed":
      return "tone-chip tone-chip--ok";
    case "failed":
      return "tone-chip tone-chip--danger";
    case "cancelled":
      return "tone-chip tone-chip--warning";
    case "queued":
    case "running":
      return "tone-chip tone-chip--progress";
  }
}

function resolveCacheAssetAbsolutePath(
  snapshot: EditorSessionSnapshot,
  relativePath: string
): string {
  return `${snapshot.cacheRoot}/${relativePath}`.replace(/\\/gu, "/");
}

function toFileUrl(absolutePath: string): string {
  return encodeURI(`file://${absolutePath}`);
}

function getThumbnailUrl(
  snapshot: EditorSessionSnapshot | null,
  item: MediaItem
): string | null {
  const thumbnail = item.derivedAssets.thumbnail;

  if (!snapshot || !thumbnail || thumbnail.status !== "ready") {
    return null;
  }

  return toFileUrl(resolveCacheAssetAbsolutePath(snapshot, thumbnail.relativePath));
}

function getWaveformAsset(item: MediaItem | null): WaveformAsset | null {
  const waveform = item?.derivedAssets.waveform;

  if (!waveform || waveform.type !== "waveform") {
    return null;
  }

  return waveform;
}

function getDerivedAssets(item: MediaItem | null): DerivedAsset[] {
  if (!item) {
    return [];
  }

  return [item.derivedAssets.thumbnail, item.derivedAssets.waveform, item.derivedAssets.proxy].filter(
    (asset): asset is DerivedAsset => asset !== null
  );
}

function extractDroppedPaths(event: React.DragEvent<HTMLElement>): string[] {
  const files = Array.from(event.dataTransfer.files) as Array<File & { path?: string }>;
  return files
    .map((file) => file.path ?? "")
    .filter((path) => path.length > 0);
}

function createWaveformPath(points: number[]): string {
  if (points.length === 0) {
    return "";
  }

  return points
    .map((value, index) => {
      const x = (index / Math.max(1, points.length - 1)) * 100;
      const y = 50 - value * 42;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function createWaveformMirrorPath(points: number[]): string {
  if (points.length === 0) {
    return "";
  }

  return points
    .map((value, index) => {
      const x = (index / Math.max(1, points.length - 1)) * 100;
      const y = 50 + value * 42;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

export function App() {
  const [projectDirectory, setProjectDirectory] = useState("");
  const [projectName, setProjectName] = useState(defaultProjectName);
  const [toolchain, setToolchain] = useState<ToolchainStatus | null>(null);
  const [localApiStatus, setLocalApiStatus] = useState<LocalApiStatus | null>(null);
  const [snapshot, setSnapshot] = useState<EditorSessionSnapshot | null>(null);
  const [exportSnapshot, setExportSnapshot] = useState<ExportSessionSnapshot | null>(null);
  const [captionSnapshot, setCaptionSnapshot] = useState<CaptionSessionSnapshot | null>(null);
  const [selectedExportPresetId, setSelectedExportPresetId] = useState<ExportPresetId | null>(null);
  const [selectedExportTargetKey, setSelectedExportTargetKey] = useState("timeline");
  const [customRangeStartSeconds, setCustomRangeStartSeconds] = useState("0");
  const [customRangeEndSeconds, setCustomRangeEndSeconds] = useState("0");
  const [selectedBurnInCaptionTrackId, setSelectedBurnInCaptionTrackId] = useState<string | null>(null);
  const [burnInCaptionsEnabled, setBurnInCaptionsEnabled] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [operationState, setOperationState] = useState<OperationState>({
    kind: "idle",
    message: null
  });
  const [importFeedback, setImportFeedback] = useState<string | null>(null);

  const selectedItem =
    snapshot?.libraryItems.find((item) => item.id === selectedItemId) ?? snapshot?.libraryItems[0] ?? null;
  const mediaJobs = snapshot?.jobs.filter((job) => job.kind !== "export") ?? [];
  const activeJobs =
    mediaJobs.filter((job) => job.status === "queued" || job.status === "running");
  const failedJobs =
    mediaJobs.filter((job) => job.status === "failed" || job.status === "cancelled");
  const waveformAsset = getWaveformAsset(selectedItem);

  useEffect(() => {
    void refreshToolchain();
    void refreshLocalApiStatus();
  }, []);

  useEffect(() => {
    if (!snapshot) {
      setExportSnapshot(null);
      setCaptionSnapshot(null);
      setSelectedExportPresetId(null);
      setSelectedExportTargetKey("timeline");
      setCustomRangeStartSeconds("0");
      setCustomRangeEndSeconds("0");
      setSelectedBurnInCaptionTrackId(null);
      setBurnInCaptionsEnabled(false);
      setSelectedItemId(null);
      setSelectedTrackId(null);
      setSelectedClipId(null);
      return;
    }

    if (selectedItemId && snapshot.libraryItems.some((item) => item.id === selectedItemId)) {
      return;
    }

    setSelectedItemId(snapshot.libraryItems[0]?.id ?? null);
  }, [selectedItemId, snapshot]);

  useEffect(() => {
    if (!exportSnapshot) {
      return;
    }

    if (
      selectedExportPresetId &&
      exportSnapshot.presets.some((preset) => preset.id === selectedExportPresetId)
    ) {
      return;
    }

    setSelectedExportPresetId(exportSnapshot.defaultPresetId);
  }, [exportSnapshot, selectedExportPresetId]);

  useEffect(() => {
    if (!captionSnapshot) {
      return;
    }

    const defaultTrackId = captionSnapshot.captionTracks[0]?.id ?? null;

    setSelectedBurnInCaptionTrackId(
      snapshot?.document.captions.exportDefaults.burnInTrackId ??
        defaultTrackId
    );
    setBurnInCaptionsEnabled(
      snapshot?.document.captions.exportDefaults.burnInEnabled ?? false
    );
  }, [captionSnapshot, snapshot]);

  useEffect(() => {
    if (!snapshot) {
      return;
    }

    if (
      selectedExportTargetKey.startsWith("region:") &&
      !snapshot.timeline.regions.some((region) => `region:${region.id}` === selectedExportTargetKey)
    ) {
      setSelectedExportTargetKey("timeline");
    }
  }, [selectedExportTargetKey, snapshot]);

  useEffect(() => {
    if (!snapshot) {
      return;
    }

    const timelineEndSeconds = (getTimelineEndUs(snapshot.timeline) / 1_000_000).toFixed(2);

    if (customRangeEndSeconds === "0") {
      setCustomRangeEndSeconds(timelineEndSeconds);
    }
  }, [customRangeEndSeconds, snapshot]);

  useEffect(() => {
    if (!snapshot) {
      void previewController.executeCommand({
        type: "UnloadTimelinePreview"
      });
      return;
    }

    void previewController.executeCommand({
      type: "LoadTimelinePreview",
      target: createPreviewLoadTarget(snapshot),
      preservePlayhead: true
    });
  }, [snapshot]);

  useEffect(() => {
    previewController.setSelection({
      selectedClipId,
      selectedTrackId
    });
  }, [selectedClipId, selectedTrackId]);

  const refreshSnapshotSilently = useEffectEvent(async (directory: string) => {
    try {
      await loadEditorSession(directory);
    } catch {
      // Keep the visible state stable during background polling.
    }
  });

  const refreshExportSnapshotSilently = useEffectEvent(async (directory: string) => {
    try {
      await loadExportSession(directory);
    } catch {
      // Keep the visible state stable during background polling.
    }
  });

  const refreshCaptionSnapshotSilently = useEffectEvent(async (directory: string) => {
    try {
      await loadCaptionSession(directory);
    } catch {
      // Keep the visible state stable during background polling.
    }
  });

  useEffect(() => {
    if (!snapshot) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void refreshSnapshotSilently(snapshot.directory);
    }, 1_250);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [snapshot, refreshSnapshotSilently]);

  useEffect(() => {
    if (!exportSnapshot) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void refreshExportSnapshotSilently(exportSnapshot.directory);
    }, 1_250);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [exportSnapshot, refreshExportSnapshotSilently]);

  useEffect(() => {
    if (!captionSnapshot) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void refreshCaptionSnapshotSilently(captionSnapshot.directory);
    }, 1_250);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [captionSnapshot, refreshCaptionSnapshotSilently]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void refreshLocalApiStatus();
    }, 2_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  async function refreshToolchain(): Promise<void> {
    try {
      const nextToolchain = await window.clawcut.detectToolchain();
      setToolchain(nextToolchain);
    } catch (error) {
      setOperationState({
        kind: "error",
        message: error instanceof Error ? error.message : "Toolchain detection failed."
      });
    }
  }

  async function refreshLocalApiStatus(): Promise<void> {
    try {
      const nextStatus = await window.clawcut.getLocalApiStatus();
      startTransition(() => {
        setLocalApiStatus(nextStatus);
      });
    } catch {
      // Keep the visible UI stable if the main-process local API controller is unavailable.
    }
  }

  async function loadEditorSession(directory: string): Promise<EditorSessionSnapshot> {
    const nextSnapshot = await window.clawcut.getEditorSessionSnapshot({ directory });
    startTransition(() => {
      setSnapshot(nextSnapshot);
    });
    return nextSnapshot;
  }

  async function loadExportSession(directory: string): Promise<ExportSessionSnapshot> {
    const nextExportSnapshot = await window.clawcut.getExportSessionSnapshot({ directory });
    startTransition(() => {
      setExportSnapshot(nextExportSnapshot);
    });
    return nextExportSnapshot;
  }

  async function loadCaptionSession(directory: string): Promise<CaptionSessionSnapshot> {
    const nextCaptionSnapshot = await window.clawcut.getCaptionSessionSnapshot({ directory });
    startTransition(() => {
      setCaptionSnapshot(nextCaptionSnapshot);
    });
    return nextCaptionSnapshot;
  }

  async function withOperation<T>(
    message: string,
    task: () => Promise<T>
  ): Promise<T | undefined> {
    setOperationState({
      kind: "working",
      message
    });

    try {
      const result = await task();
      setOperationState({
        kind: "idle",
        message: null
      });
      return result;
    } catch (error) {
      setOperationState({
        kind: "error",
        message: error instanceof Error ? error.message : "An unexpected error occurred."
      });
      return undefined;
    }
  }

  async function handleCreateProject(): Promise<void> {
    const result = await withOperation("Creating project shell…", async () =>
      window.clawcut.createProject({
        directory: projectDirectory,
        name: projectName
      })
    );

    if (!result) {
      return;
    }

    setImportFeedback(null);
    await Promise.all([
      loadEditorSession(result.directory),
      loadExportSession(result.directory),
      loadCaptionSession(result.directory)
    ]);
  }

  async function handleOpenProject(): Promise<void> {
    const result = await withOperation("Opening project…", async () =>
      window.clawcut.openProject({
        directory: projectDirectory
      })
    );

    if (!result) {
      return;
    }

    setImportFeedback(null);
    await Promise.all([
      loadEditorSession(result.directory),
      loadExportSession(result.directory),
      loadCaptionSession(result.directory)
    ]);
  }

  async function handleImportPaths(paths: string[]): Promise<void> {
    if (!snapshot || paths.length === 0) {
      return;
    }

    const result = await withOperation("Queueing media ingest…", async () =>
      window.clawcut.importMediaPaths({
        directory: snapshot.directory,
        paths
      })
    );

    if (!result) {
      return;
    }

    setImportFeedback(
      result.acceptedPaths.length > 0
        ? `Queued ${result.acceptedPaths.length} media item${result.acceptedPaths.length === 1 ? "" : "s"} for ingest.`
        : "No supported media files were accepted."
    );
    await Promise.all([
      loadEditorSession(result.snapshot.directory),
      loadExportSession(result.snapshot.directory),
      loadCaptionSession(result.snapshot.directory)
    ]);
  }

  async function handleImportClick(): Promise<void> {
    const picked = await withOperation("Selecting media paths…", async () =>
      window.clawcut.pickImportPaths({ mode: "import" })
    );

    if (!picked || picked.paths.length === 0) {
      return;
    }

    await handleImportPaths(picked.paths);
  }

  async function handleRefreshHealth(): Promise<void> {
    if (!snapshot) {
      return;
    }

    const result = await withOperation("Refreshing media health…", async () =>
      window.clawcut.refreshMediaHealth({
        directory: snapshot.directory
      })
    );

    if (!result) {
      return;
    }

    await Promise.all([
      loadEditorSession(result.directory),
      loadExportSession(result.directory),
      loadCaptionSession(result.directory)
    ]);
  }

  async function handleRetryJob(jobId: string): Promise<void> {
    if (!snapshot) {
      return;
    }

    const result = await withOperation("Retrying job…", async () =>
      window.clawcut.retryJob({
        directory: snapshot.directory,
        jobId
      })
    );

    if (!result) {
      return;
    }

    await Promise.all([
      loadEditorSession(result.directory),
      loadExportSession(result.directory),
      loadCaptionSession(result.directory)
    ]);
  }

  async function handleRelinkSelected(): Promise<void> {
    if (!snapshot || !selectedItem) {
      return;
    }

    const picked = await withOperation("Selecting replacement media…", async () =>
      window.clawcut.pickImportPaths({ mode: "relink" })
    );

    const candidatePath = picked?.paths[0];

    if (!candidatePath) {
      return;
    }

    const result = await withOperation("Relinking missing media…", async () =>
      window.clawcut.relinkMediaItem({
        directory: snapshot.directory,
        mediaItemId: selectedItem.id,
        candidatePath
      })
    );

    if (!result) {
      return;
    }

    setImportFeedback(result.result.details.join(" "));
    setSelectedItemId(selectedItem.id);
    await Promise.all([
      loadEditorSession(result.snapshot.directory),
      loadExportSession(result.snapshot.directory),
      loadCaptionSession(result.snapshot.directory)
    ]);
  }

  async function handleExecuteEditorCommand(
    command: EditorCommand,
    message: string
  ): Promise<ExecuteEditorCommandResult | null> {
    if (!snapshot) {
      return null;
    }

    const result = await withOperation(message, async () =>
      window.clawcut.executeEditorCommand({
        directory: snapshot.directory,
        command
      })
    );

    if (!result) {
      return null;
    }

    startTransition(() => {
      setSnapshot(result.snapshot);
    });

    return result;
  }

  async function handleExecuteExportCommand(
    command: Parameters<typeof window.clawcut.executeExportCommand>[0]["command"],
    message: string
  ): Promise<ExecuteExportCommandResult | null> {
    if (!snapshot) {
      return null;
    }

    const result = await withOperation(message, async () =>
      window.clawcut.executeExportCommand({
        directory: snapshot.directory,
        command
      })
    );

    if (!result) {
      return null;
    }

    startTransition(() => {
      setExportSnapshot(result.snapshot);
    });

    return result;
  }

  async function handleExecuteCaptionCommand(
    command: CaptionCommand,
    message: string
  ): Promise<ExecuteCaptionCommandResult | null> {
    if (!snapshot) {
      return null;
    }

    const result = await withOperation(message, async () =>
      window.clawcut.executeCaptionCommand({
        directory: snapshot.directory,
        command
      })
    );

    if (!result) {
      return null;
    }

    startTransition(() => {
      setCaptionSnapshot(result.snapshot);
    });
    await loadEditorSession(snapshot.directory);

    return result;
  }

  async function handleTranscribeClip(
    options?: Partial<Pick<TranscriptionOptions, "initialPrompt" | "glossaryTerms">>
  ): Promise<void> {
    if (!snapshot) {
      return;
    }

    const clipId =
      selectedClipId ??
      Object.values(snapshot.timeline.clipsById).find((clip) => clip.streamType === "video")?.id ??
      Object.values(snapshot.timeline.clipsById)[0]?.id;

    if (!clipId) {
      setImportFeedback("Select or create a clip on the timeline before requesting transcription.");
      return;
    }

    const result = await handleExecuteCaptionCommand(
      {
        type: "TranscribeClip",
        timelineId: snapshot.timeline.id,
        clipId,
        options
      },
      "Queueing transcription…"
    );

    if (result?.result.ok && result.result.commandType === "TranscribeClip") {
      setImportFeedback("Queued clip transcription.");
    }
  }

  async function handleStartExport(): Promise<void> {
    if (!snapshot || !selectedExportPresetId) {
      return;
    }

    let target:
      | {
          kind: "timeline";
        }
      | {
          kind: "range";
          startUs: number;
          endUs: number;
          label?: string;
        }
      | {
          kind: "region";
          regionId: string;
        } = {
          kind: "timeline"
        };

    if (selectedExportTargetKey === "range") {
      const startUs = Math.round(Number(customRangeStartSeconds) * 1_000_000);
      const endUs = Math.round(Number(customRangeEndSeconds) * 1_000_000);

      if (!Number.isFinite(startUs) || !Number.isFinite(endUs) || endUs <= startUs) {
        setImportFeedback("Custom export range must have a valid in/out span.");
        return;
      }

      target = {
        kind: "range",
        startUs,
        endUs,
        label: "Custom range"
      };
    } else if (selectedExportTargetKey.startsWith("region:")) {
      target = {
        kind: "region",
        regionId: selectedExportTargetKey.replace(/^region:/u, "")
      };
    }

    const result = await handleExecuteExportCommand(
      {
        type: "StartExport",
        request: {
          timelineId: snapshot.timeline.id,
          presetId: selectedExportPresetId,
          target
        }
      },
      "Queueing export…"
    );

    if (!result) {
      return;
    }

    setImportFeedback(
      result.result.ok && result.result.commandType === "StartExport"
        ? `Queued export for ${result.result.exportRun.presetId}.`
        : importFeedback
    );
  }

  async function handleCancelExport(exportRunId: string): Promise<void> {
    await handleExecuteExportCommand(
      {
        type: "CancelExport",
        exportRunId
      },
      "Cancelling export…"
    );
  }

  async function handleSetLocalApiEnabled(enabled: boolean): Promise<void> {
    const result = await withOperation(
      enabled ? "Starting local API…" : "Stopping local API…",
      async () => window.clawcut.setLocalApiEnabled({ enabled })
    );

    if (!result) {
      return;
    }

    startTransition(() => {
      setLocalApiStatus(result);
    });
  }

  async function handleRegenerateLocalApiToken(): Promise<void> {
    const result = await withOperation("Rotating local API token…", async () =>
      window.clawcut.regenerateLocalApiToken()
    );

    if (!result) {
      return;
    }

    startTransition(() => {
      setLocalApiStatus(result);
    });
    setImportFeedback("Generated a new local API token for trusted automation clients.");
  }

  async function handleRetryExport(exportRunId: string): Promise<void> {
    await handleExecuteExportCommand(
      {
        type: "RetryExport",
        exportRunId
      },
      "Retrying export…"
    );
  }

  async function handleEnableBurnIn(enabled: boolean, captionTrackId: string | null): Promise<void> {
    if (!snapshot) {
      return;
    }

    const result = await handleExecuteCaptionCommand(
      {
        type: "EnableBurnInCaptionsForExport",
        timelineId: snapshot.timeline.id,
        captionTrackId,
        enabled
      },
      enabled ? "Updating burn-in caption defaults…" : "Disabling burn-in captions…"
    );

    if (result?.result.ok && result.result.commandType === "EnableBurnInCaptionsForExport") {
      setBurnInCaptionsEnabled(result.result.exportDefaults.burnInEnabled);
      setSelectedBurnInCaptionTrackId(result.result.exportDefaults.burnInTrackId);
    }
  }

  function handleDrop(event: React.DragEvent<HTMLElement>): void {
    event.preventDefault();
    const paths = extractDroppedPaths(event);
    void handleImportPaths(paths);
  }

  return (
    <main className="shell">
      <section className="hero">
        <div className="hero__backdrop" />
        <div className="hero__masthead">
          <div>
            <p className="eyebrow">Clawcut / Stage 7 OpenClaw integration</p>
            <h1>Run Clawcut as a local, authenticated media engine for OpenClaw and trusted tools.</h1>
            <p className="lede">
              Stage 7 keeps the command, preview, export, transcript, and caption foundations intact
              while promoting the shared command/query schema to the primary integration contract.
              The local transport and the OpenClaw plugin adapter both sit on top of that same
              trusted control layer instead of inventing separate business logic.
            </p>
          </div>

          <div className="hero__tooling">
            {(["ffmpeg", "ffprobe", "transcription"] as const).map((toolName) => {
              const tool = toolchain?.tools[toolName];

              return (
                <div
                  className="tool-card"
                  data-testid={`toolchain-status-${toolName}`}
                  key={toolName}
                >
                  <div className="tool-card__header">
                    <span>{toolName}</span>
                    <span className={toneClassForTool(tool?.available)}>
                      {tool?.available ? "Detected" : "Missing"}
                    </span>
                  </div>
                  <strong>{tool?.resolvedPath ?? "Unavailable"}</strong>
                  <p>{tool?.version ?? tool?.remediationHint ?? "Pending detection."}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="hero__grid">
          <section className="project-card">
            <header className="panel-header">
              <div>
                <p className="eyebrow eyebrow--muted">Project bootstrap</p>
                <h2>Start or reopen a workspace</h2>
              </div>
              <button className="ghost-button" onClick={() => void refreshToolchain()} type="button">
                Refresh toolchain
              </button>
            </header>

            <label className="field">
              <span>Project directory</span>
              <input
                data-testid="project-directory-input"
                onChange={(event) => setProjectDirectory(event.target.value)}
                placeholder="/absolute/path/to/project-folder"
                type="text"
                value={projectDirectory}
              />
            </label>

            <label className="field">
              <span>Project name</span>
              <input
                data-testid="project-name-input"
                onChange={(event) => setProjectName(event.target.value)}
                type="text"
                value={projectName}
              />
            </label>

            <div className="button-row">
              <button
                className="primary-button"
                data-testid="create-project-button"
                onClick={() => void handleCreateProject()}
                type="button"
              >
                Create project
              </button>
              <button
                className="secondary-button"
                data-testid="open-project-button"
                onClick={() => void handleOpenProject()}
                type="button"
              >
                Open project
              </button>
            </div>

            <div className="status-panel">
              <span className="status-panel__label">Worker state</span>
              <strong>
                {operationState.kind === "working"
                  ? operationState.message
                  : "Ready for project, ingest, command-driven edits, and preview playback"}
              </strong>
              {operationState.kind === "error" && operationState.message ? (
                <p className="status-panel__error">{operationState.message}</p>
              ) : null}
              {importFeedback ? <p className="status-panel__hint">{importFeedback}</p> : null}
            </div>
          </section>

          <section className="status-board">
            <header className="panel-header">
              <div>
                <p className="eyebrow eyebrow--muted">Workspace snapshot</p>
                <h2 data-testid="workspace-header">
                  {snapshot ? snapshot.document.project.name : "No project opened"}
                </h2>
              </div>
              <span className={snapshot ? "tone-chip tone-chip--ok" : "tone-chip"}>
                {snapshot ? "Project ready" : "Awaiting project"}
              </span>
            </header>

            <div className="status-board__grid">
              <div>
                <span className="meta-label">Project file</span>
                <strong>{snapshot?.projectFilePath ?? "Project file will appear after bootstrap"}</strong>
              </div>
              <div>
                <span className="meta-label">Library cache</span>
                <strong>{snapshot?.cacheRoot ?? "Cache root is created with the project"}</strong>
              </div>
              <div>
                <span className="meta-label">Library items</span>
                <strong>{snapshot?.libraryItems.length ?? 0}</strong>
              </div>
              <div>
                <span className="meta-label">Job queue</span>
                <strong>{snapshot?.jobs.length ?? 0}</strong>
              </div>
            </div>
          </section>
        </div>

        <section className="status-board local-api-panel" data-testid="local-api-panel">
          <header className="panel-header">
            <div>
              <p className="eyebrow eyebrow--muted">Local control transport</p>
              <h2>Authenticated OpenClaw bridge</h2>
            </div>
            <span
              className={
                localApiStatus?.state === "running"
                  ? "tone-chip tone-chip--ok"
                  : localApiStatus?.state === "starting"
                    ? "tone-chip tone-chip--progress"
                    : localApiStatus?.state === "error"
                      ? "tone-chip tone-chip--danger"
                      : "tone-chip"
              }
            >
              {localApiStatus?.state ?? "Unavailable"}
            </span>
          </header>

          <div className="status-board__grid">
            <div>
              <span className="meta-label">Base URL</span>
              <strong data-testid="local-api-base-url">
                {localApiStatus?.baseUrl ?? "Local API is currently stopped"}
              </strong>
            </div>
            <div>
              <span className="meta-label">Bind</span>
              <strong>{localApiStatus ? `${localApiStatus.bindAddress}:${localApiStatus.port ?? "n/a"}` : "Pending"}</strong>
            </div>
            <div>
              <span className="meta-label">Auth scopes</span>
              <strong>{localApiStatus?.scopes.join(", ") ?? "Pending"}</strong>
            </div>
            <div>
              <span className="meta-label">OpenClaw tools</span>
              <strong>{localApiStatus?.openClawTools.length ?? 0}</strong>
            </div>
          </div>

          <label className="field local-api-panel__token">
            <span>Bearer token</span>
            <input
              data-testid="local-api-token"
              readOnly
              type="text"
              value={localApiStatus?.token ?? ""}
            />
          </label>

          <div className="button-row button-row--tight">
            <button
              className="secondary-button"
              onClick={() => void handleSetLocalApiEnabled(!(localApiStatus?.enabled ?? false))}
              type="button"
            >
              {localApiStatus?.enabled ? "Disable API" : "Enable API"}
            </button>
            <button
              className="ghost-button"
              onClick={() => void handleRegenerateLocalApiToken()}
              type="button"
            >
              Regenerate token
            </button>
          </div>

          <p className="status-panel__hint">
            Use the bearer token with the local HTTP transport for authenticated automation. The
            shared OpenClaw tool registry is mirrored at
            {" "}
            <code>/api/v1/openclaw/tools</code>
            {", "}
            the machine-readable manifest is served at
            {" "}
            <code>/api/v1/openclaw/manifest</code>
            {", "}
            and the local event stream is available at
            {" "}
            <code>{localApiStatus?.eventStream.path ?? "/api/v1/events"}</code>
            {" "}
            when the transport is running.
          </p>

          {localApiStatus?.recentRequests.length ? (
            <div className="local-api-panel__requests">
              {localApiStatus.recentRequests.slice(0, 4).map((entry) => (
                <div className="local-api-request" key={entry.requestId}>
                  <div className="local-api-request__header">
                    <strong>{entry.name}</strong>
                    <span className={entry.status === "ok" ? "tone-chip tone-chip--ok" : "tone-chip tone-chip--danger"}>
                      {entry.status}
                    </span>
                  </div>
                  <p>
                    {entry.operationType} · {entry.durationMs} ms · {entry.requestId}
                  </p>
                </div>
              ))}
            </div>
          ) : null}

          {localApiStatus?.lastError ? (
            <p className="status-panel__error">
              {localApiStatus.lastError.code}: {localApiStatus.lastError.message}
            </p>
          ) : null}
        </section>
      </section>

      <PreviewPanel />

      <section className="workspace">
        <article
          className="library-panel"
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
        >
          <header className="panel-header">
            <div>
              <p className="eyebrow eyebrow--muted">Media library</p>
              <h2>Library, ingest, relink</h2>
            </div>
            <div className="button-row button-row--tight">
              <button
                className="primary-button"
                data-testid="import-media-button"
                disabled={!snapshot}
                onClick={() => void handleImportClick()}
                type="button"
              >
                Import media
              </button>
              <button
                className="secondary-button"
                data-testid="refresh-health-button"
                disabled={!snapshot}
                onClick={() => void handleRefreshHealth()}
                type="button"
              >
                Refresh health
              </button>
            </div>
          </header>

          <div className="dropzone">
            <div>
              <span className="dropzone__label">Local ingest</span>
              <strong>Drop files or folders here, or use the native picker.</strong>
            </div>
            <p>
              Imported media still flows through the Stage 2 worker pipeline for
              fingerprinting, ffprobe normalization, derived assets, and safe relink.
            </p>
          </div>

          <div className="library-summary">
            <span className="tone-chip">{activeJobs.length} active</span>
            <span className="tone-chip">{failedJobs.length} failed</span>
            <span className="tone-chip">
              {snapshot?.libraryItems.filter((item) => item.relinkStatus === "missing").length ?? 0} missing
            </span>
          </div>

          <div className="library-grid" data-testid="media-library-grid">
            {snapshot?.libraryItems.length ? (
              snapshot.libraryItems.map((item) => {
                const thumbnailUrl = getThumbnailUrl(snapshot, item);

                return (
                  <button
                    className={selectedItem?.id === item.id ? "media-card media-card--selected" : "media-card"}
                    data-testid={`media-card-${item.id}`}
                    key={item.id}
                    onClick={() => setSelectedItemId(item.id)}
                    type="button"
                  >
                    <div className="media-card__poster">
                      {thumbnailUrl ? (
                        <img alt="" src={thumbnailUrl} />
                      ) : (
                        <div className="media-card__placeholder">
                          <span>{item.metadataSummary.kind === "audio" ? "AUDIO" : "MEDIA"}</span>
                        </div>
                      )}
                    </div>
                    <div className="media-card__body">
                      <div className="media-card__header">
                        <strong>{item.displayName}</strong>
                        <span className={toneClassForMediaStatus(item.ingestStatus)}>
                          {formatStatusLabel(item.ingestStatus)}
                        </span>
                      </div>
                      <p>{item.source.currentResolvedPath ?? item.source.originalPath}</p>
                      <div className="media-card__meta">
                        <span>{formatDuration(item.metadataSummary.durationMs)}</span>
                        <span>{formatFileSize(item.fileSize)}</span>
                        <span>{item.metadataSummary.container ?? "Unknown container"}</span>
                      </div>
                      {item.relinkStatus === "missing" ? (
                        <div className="media-card__alert" data-testid="missing-indicator">
                          Source file missing. Select and relink a replacement.
                        </div>
                      ) : null}
                      {item.errorState ? <div className="media-card__note">{item.errorState.message}</div> : null}
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="empty-panel">
                <strong>No media imported yet.</strong>
                <p>Import footage here first. Once the library is ready, Stage 3 commands can place those assets onto tracks.</p>
              </div>
            )}
          </div>
        </article>

        <aside className="inspector-panel" data-testid="metadata-panel">
          <header className="panel-header">
            <div>
              <p className="eyebrow eyebrow--muted">Inspector</p>
              <h2>{selectedItem ? selectedItem.displayName : "Select a media item"}</h2>
            </div>
            {selectedItem ? (
              <span className={toneClassForMediaStatus(selectedItem.ingestStatus)}>
                {formatStatusLabel(selectedItem.ingestStatus)}
              </span>
            ) : null}
          </header>

          {selectedItem ? (
            <>
              <div className="inspector-summary">
                <div>
                  <span className="meta-label">Resolved path</span>
                  <strong>{selectedItem.source.currentResolvedPath ?? "Missing"}</strong>
                </div>
                <div>
                  <span className="meta-label">Fingerprint</span>
                  <strong>{selectedItem.fingerprint.quickHash?.slice(0, 16) ?? "Unavailable"}</strong>
                </div>
              </div>

              <div className="inspector-grid">
                <div>
                  <span className="meta-label">Duration</span>
                  <strong data-testid="metadata-duration">
                    {formatDuration(selectedItem.metadataSummary.durationMs)}
                  </strong>
                </div>
                <div>
                  <span className="meta-label">Dimensions</span>
                  <strong data-testid="metadata-dimensions">{formatDimensions(selectedItem)}</strong>
                </div>
                <div>
                  <span className="meta-label">Frame rate</span>
                  <strong>{formatFrameRate(selectedItem.metadataSummary.frameRate)}</strong>
                </div>
                <div>
                  <span className="meta-label">File size</span>
                  <strong>{formatFileSize(selectedItem.fileSize)}</strong>
                </div>
                <div>
                  <span className="meta-label">Container</span>
                  <strong>{selectedItem.metadataSummary.container ?? "Unknown"}</strong>
                </div>
                <div>
                  <span className="meta-label">Last seen</span>
                  <strong>{formatDate(selectedItem.lastSeenTimestamp)}</strong>
                </div>
              </div>

              <div className="inspector-section">
                <div className="inspector-section__header">
                  <h3>Derived assets</h3>
                  {selectedItem.relinkStatus === "missing" ? (
                    <button
                      className="primary-button"
                      data-testid="relink-button"
                      onClick={() => void handleRelinkSelected()}
                      type="button"
                    >
                      Relink media
                    </button>
                  ) : null}
                </div>
                <div className="derived-grid">
                  {getDerivedAssets(selectedItem).length ? (
                    getDerivedAssets(selectedItem).map((asset) => (
                      <div className="derived-card" key={asset.id}>
                        <div className="derived-card__header">
                          <strong>{formatDerivedLabel(asset.type)}</strong>
                          <span className={asset.status === "ready" ? "tone-chip tone-chip--ok" : asset.status === "failed" ? "tone-chip tone-chip--danger" : "tone-chip tone-chip--progress"}>
                            {asset.status}
                          </span>
                        </div>
                        <p>{asset.relativePath}</p>
                        <span className="derived-card__meta">
                          {asset.fileSize !== null ? formatFileSize(asset.fileSize) : "Pending size"}
                        </span>
                        {asset.errorMessage ? <span className="derived-card__warning">{asset.errorMessage}</span> : null}
                      </div>
                    ))
                  ) : (
                    <div className="empty-inline">No derived assets registered yet.</div>
                  )}
                </div>
              </div>

              <div className="inspector-section">
                <div className="inspector-section__header">
                  <h3>Waveform preview</h3>
                  <span className="tone-chip">
                    {waveformAsset?.bucketCount ?? 0} buckets
                  </span>
                </div>
                {waveformAsset?.previewPeaks.length ? (
                  <svg
                    className="waveform"
                    data-testid="metadata-waveform"
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                  >
                    <path d={createWaveformPath(waveformAsset.previewPeaks)} />
                    <path d={createWaveformMirrorPath(waveformAsset.previewPeaks)} />
                  </svg>
                ) : (
                  <div className="empty-inline">Waveform preview will appear after audio analysis completes.</div>
                )}
              </div>

              <div className="inspector-section">
                <div className="inspector-section__header">
                  <h3>Streams</h3>
                  <span className="tone-chip">{selectedItem.streams.length} streams</span>
                </div>
                <div className="stream-list">
                  {selectedItem.streams.map((stream) => (
                    <div className="stream-row" key={`${selectedItem.id}-stream-${stream.index}`}>
                      <strong>
                        {stream.codecType} #{stream.index}
                      </strong>
                      <span>
                        {stream.codecName ?? "unknown codec"}
                        {stream.codecType === "video" && "width" in stream && stream.width && stream.height
                          ? ` · ${stream.width}×${stream.height}`
                          : ""}
                        {stream.codecType === "audio" && "channelCount" in stream && stream.channelCount
                          ? ` · ${stream.channelCount}ch`
                          : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="empty-panel empty-panel--inspector">
              <strong>No media selected.</strong>
              <p>Choose an imported item to inspect normalized metadata, derived assets, waveform summary, and missing-media state.</p>
            </div>
          )}
        </aside>
      </section>

      <TimelineEditor
        onExecuteCommand={handleExecuteEditorCommand}
        selectedMediaItem={selectedItem}
        selectedTrackId={selectedTrackId}
        selectedClipId={selectedClipId}
        onSelectTrack={setSelectedTrackId}
        onSelectClip={(clipId, trackId) => {
          setSelectedClipId(clipId);
          setSelectedTrackId(trackId);
        }}
        snapshot={snapshot}
      />

      <CaptionPanel
        captionSnapshot={captionSnapshot}
        onApplyCaptionTemplate={(captionTrackId, templateId) =>
          void handleExecuteCaptionCommand(
            {
              type: "ApplyCaptionTemplate",
              captionTrackId,
              templateId
            },
            "Applying caption template…"
          )
        }
        onExportSubtitle={(captionTrackId, format) =>
          void handleExecuteCaptionCommand(
            {
              type: "ExportSubtitleFile",
              captionTrackId,
              format
            },
            `Exporting ${format.toUpperCase()} subtitles…`
          )
        }
        onGenerateCaptionTrack={(transcriptId, templateId) =>
          void handleExecuteCaptionCommand(
            {
              type: "GenerateCaptionTrack",
              timelineId: snapshot?.timeline.id ?? "",
              transcriptId,
              templateId
            },
            "Generating caption track…"
          )
        }
        onRegenerateCaptionTrack={(captionTrackId) =>
          void handleExecuteCaptionCommand(
            {
              type: "RegenerateCaptionTrack",
              captionTrackId
            },
            "Regenerating caption track…"
          )
        }
        onTranscribeClip={(options) => void handleTranscribeClip(options)}
        onUpdateCaptionSegment={(captionTrackId, segmentId, text) =>
          void handleExecuteCaptionCommand(
            {
              type: "UpdateCaptionSegment",
              captionTrackId,
              segmentId,
              text
            },
            "Updating caption segment…"
          )
        }
        onUpdateTranscriptSegment={(transcriptId, segmentId, text) =>
          void handleExecuteCaptionCommand(
            {
              type: "UpdateTranscriptSegment",
              transcriptId,
              segmentId,
              text
            },
            "Updating transcript segment…"
          )
        }
        selectedClipId={selectedClipId}
        snapshot={snapshot}
      />

      <ExportPanel
        burnInCaptionsEnabled={burnInCaptionsEnabled}
        captionSnapshot={captionSnapshot}
        customRangeEndSeconds={customRangeEndSeconds}
        customRangeStartSeconds={customRangeStartSeconds}
        exportSnapshot={exportSnapshot}
        onChangeBurnInTrackId={(trackId) => {
          setSelectedBurnInCaptionTrackId(trackId);
          void handleEnableBurnIn(burnInCaptionsEnabled, trackId);
        }}
        onChangeCustomRangeEndSeconds={setCustomRangeEndSeconds}
        onChangeCustomRangeStartSeconds={setCustomRangeStartSeconds}
        onChangeBurnInEnabled={(enabled) => {
          setBurnInCaptionsEnabled(enabled);
          void handleEnableBurnIn(enabled, selectedBurnInCaptionTrackId);
        }}
        onCancelExport={(exportRunId) => void handleCancelExport(exportRunId)}
        onSelectTargetKey={setSelectedExportTargetKey}
        onRetryExport={(exportRunId) => void handleRetryExport(exportRunId)}
        onSelectPreset={setSelectedExportPresetId}
        onStartExport={() => void handleStartExport()}
        selectedBurnInTrackId={selectedBurnInCaptionTrackId}
        selectedTargetKey={selectedExportTargetKey}
        selectedPresetId={selectedExportPresetId}
        snapshot={snapshot}
      />

      <section className="jobs-panel" data-testid="job-strip">
        <header className="panel-header">
          <div>
            <p className="eyebrow eyebrow--muted">Job activity</p>
            <h2>Ingest queue and background media work</h2>
          </div>
          <span className={hasActiveWork(snapshot) ? "tone-chip tone-chip--progress" : "tone-chip"}>
            {activeJobs.length > 0 ? `${activeJobs.length} active` : "Idle"}
          </span>
        </header>

        <div className="jobs-grid">
          {snapshot?.jobs.length ? (
            snapshot.jobs.slice(0, 10).map((job) => (
              <div className="job-card" key={job.id}>
                <div className="job-card__header">
                  <strong>{job.kind}</strong>
                  <span className={toneClassForJob(job)}>{job.status}</span>
                </div>
                <p>{job.step}</p>
                <div className="job-card__footer">
                  <span>{Math.round(job.progress * 100)}%</span>
                  {job.errorMessage ? <span className="job-card__error">{job.errorMessage}</span> : null}
                  {(job.status === "failed" || job.status === "cancelled") && snapshot ? (
                    <button
                      className="ghost-button ghost-button--small"
                      onClick={() => void handleRetryJob(job.id)}
                      type="button"
                    >
                      Retry
                    </button>
                  ) : null}
                </div>
              </div>
            ))
          ) : (
            <div className="empty-panel empty-panel--jobs">
              <strong>No queued work.</strong>
              <p>The local job runner will list ingest, derived asset, transcription, and recovery work here.</p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
