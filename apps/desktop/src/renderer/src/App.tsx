import { startTransition, useEffect, useState } from "react";

import type {
  IndexedMediaAsset,
  ProjectWorkspaceSnapshot,
  ToolchainStatus
} from "@clawcut/ipc";

interface OperationState {
  kind: "idle" | "working" | "error";
  message: string | null;
}

function defaultProjectName(): string {
  return "Clawcut Session";
}

function toolStatusTone(available: boolean): string {
  return available ? "tool-pill tool-pill--ok" : "tool-pill tool-pill--warning";
}

function formatDuration(durationMs: number | null): string {
  if (durationMs === null) {
    return "Unknown";
  }

  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatDimensions(asset: IndexedMediaAsset | null): string {
  if (!asset?.probe?.width || !asset.probe.height) {
    return "Unknown";
  }

  return `${asset.probe.width} × ${asset.probe.height}`;
}

export function App() {
  const [projectDirectory, setProjectDirectory] = useState("");
  const [projectName, setProjectName] = useState(defaultProjectName);
  const [toolchain, setToolchain] = useState<ToolchainStatus | null>(null);
  const [snapshot, setSnapshot] = useState<ProjectWorkspaceSnapshot | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [operationState, setOperationState] = useState<OperationState>({
    kind: "idle",
    message: null
  });

  const selectedAsset =
    snapshot?.indexedMedia.find((asset) => asset.assetId === selectedAssetId) ?? null;

  useEffect(() => {
    void refreshToolchain();
  }, []);

  useEffect(() => {
    if (!snapshot) {
      setSelectedAssetId(null);
      return;
    }

    setSelectedAssetId(snapshot.indexedMedia[0]?.assetId ?? null);
  }, [snapshot]);

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

    startTransition(() => {
      setSnapshot(result);
    });
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

    startTransition(() => {
      setSnapshot(result);
    });
  }

  async function handleRegisterFixture(): Promise<void> {
    if (!snapshot) {
      return;
    }

    const result = await withOperation("Indexing bundled fixture…", async () =>
      window.clawcut.registerFixtureMedia({
        directory: snapshot.directory,
        fixtureId: "talking-head-sample"
      })
    );

    if (!result) {
      return;
    }

    startTransition(() => {
      setSnapshot(result);
    });
  }

  return (
    <main className="shell">
      <section className="hero">
        <div className="hero__topline">Clawcut / Stage 1 bootstrap</div>
        <div className="hero__grid" />
        <div className="hero__content">
          <div className="hero__copy">
            <p className="eyebrow">Own the edit model. Compile to FFmpeg.</p>
            <h1>Desktop editing architecture, not a pile of shell strings.</h1>
            <p className="lede">
              The app owns timeline semantics, project state, and future preview
              abstractions. Stage 1 proves the shell: project bootstrap, media
              indexing, worker isolation, and deterministic fixture inspection.
            </p>
          </div>

          <div className="control-card">
            <header className="control-card__header">
              <div>
                <p className="eyebrow eyebrow--muted">Project bootstrap</p>
                <h2>Start or reopen a local workspace</h2>
              </div>
              <button
                className="ghost-button"
                onClick={() => void refreshToolchain()}
                type="button"
              >
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

            <div className="status-strip">
              <div>
                <span className="status-strip__label">Worker state</span>
                <strong>
                  {operationState.kind === "working"
                    ? operationState.message
                    : "Ready for project IO"}
                </strong>
              </div>
              {operationState.kind === "error" && operationState.message ? (
                <p className="status-strip__error">{operationState.message}</p>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="dashboard">
        <article className="tooling-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow eyebrow--muted">Media engine health</p>
              <h2>FFmpeg discovery</h2>
            </div>
            <span className={toolchain?.status === "ok" ? "status-badge" : "status-badge status-badge--warning"}>
              {toolchain?.status === "ok" ? "Operational" : "Attention needed"}
            </span>
          </div>

          <div className="tool-list">
            {(["ffmpeg", "ffprobe"] as const).map((toolName) => {
              const tool = toolchain?.tools[toolName];

              return (
                <div
                  className="tool-card"
                  data-testid={`toolchain-status-${toolName}`}
                  key={toolName}
                >
                  <div className="tool-card__header">
                    <h3>{toolName}</h3>
                    <span className={toolStatusTone(Boolean(tool?.available))}>
                      {tool?.available ? "Detected" : "Missing"}
                    </span>
                  </div>
                  <p className="tool-card__path">{tool?.resolvedPath ?? "Unavailable"}</p>
                  <p className="tool-card__detail">{tool?.version ?? tool?.remediationHint ?? "Pending detection"}</p>
                </div>
              );
            })}
          </div>
        </article>

        <article className="workspace-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow eyebrow--muted">Project state</p>
              <h2 data-testid="workspace-header">
                {snapshot ? snapshot.document.project.name : "No project opened"}
              </h2>
            </div>
            <button
              className="primary-button"
              data-testid="register-fixture-button"
              disabled={!snapshot}
              onClick={() => void handleRegisterFixture()}
              type="button"
            >
              Register bundled fixture
            </button>
          </div>

          <div className="workspace-summary">
            <div>
              <span className="workspace-summary__label">Project file</span>
              <strong>{snapshot?.projectFilePath ?? "Awaiting project bootstrap"}</strong>
            </div>
            <div>
              <span className="workspace-summary__label">Media index</span>
              <strong>{snapshot?.databasePath ?? "SQLite cache will be created on demand"}</strong>
            </div>
          </div>

          <div className="workspace-grid">
            <div className="asset-list">
              <div className="asset-list__header">
                <h3>Indexed media</h3>
                <span>{snapshot?.indexedMedia.length ?? 0} assets</span>
              </div>

              {snapshot?.indexedMedia.length ? (
                snapshot.indexedMedia.map((asset) => (
                  <button
                    className={
                      asset.assetId === selectedAssetId
                        ? "asset-card asset-card--selected"
                        : "asset-card"
                    }
                    data-testid={`asset-card-${asset.assetId}`}
                    key={asset.assetId}
                    onClick={() => setSelectedAssetId(asset.assetId)}
                    type="button"
                  >
                    <span className="asset-card__eyebrow">{asset.sourceType}</span>
                    <strong>{asset.label}</strong>
                    <span>{formatDuration(asset.probe?.durationMs ?? null)}</span>
                  </button>
                ))
              ) : (
                <div className="empty-state">
                  <p>Register the bundled talking-head fixture to populate the first asset index.</p>
                </div>
              )}
            </div>

            <div
              className="metadata-panel"
              data-testid="metadata-panel"
            >
              <div className="metadata-panel__header">
                <div>
                  <p className="eyebrow eyebrow--muted">Metadata inspector</p>
                  <h3>{selectedAsset?.label ?? "No asset selected"}</h3>
                </div>
                <span className="tool-pill">
                  {selectedAsset?.probe?.container ?? "No probe yet"}
                </span>
              </div>

              <div className="metadata-grid">
                <div>
                  <span>Duration</span>
                  <strong data-testid="metadata-duration">
                    {formatDuration(selectedAsset?.probe?.durationMs ?? null)}
                  </strong>
                </div>
                <div>
                  <span>Dimensions</span>
                  <strong data-testid="metadata-dimensions">{formatDimensions(selectedAsset)}</strong>
                </div>
                <div>
                  <span>Video codec</span>
                  <strong>{selectedAsset?.probe?.videoCodec ?? "Unknown"}</strong>
                </div>
                <div>
                  <span>Audio codec</span>
                  <strong>{selectedAsset?.probe?.audioCodec ?? "Unknown"}</strong>
                </div>
                <div>
                  <span>Stream count</span>
                  <strong>{selectedAsset?.probe?.streamCount ?? 0}</strong>
                </div>
                <div>
                  <span>Asset path</span>
                  <strong>{selectedAsset?.originalPath ?? "Awaiting selection"}</strong>
                </div>
              </div>

              <div className="inspector-footer">
                <p>
                  Preview remains behind a placeholder backend in Stage 1. Timeline semantics,
                  render compilation, and caption editing layer on top of this contract later.
                </p>
              </div>
            </div>
          </div>
        </article>
      </section>
    </main>
  );
}
