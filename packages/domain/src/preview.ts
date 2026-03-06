export type PreviewFidelityMode =
  | "fast-proxy"
  | "selected-range-cache"
  | "final-export-reference";

export interface PreviewSessionState {
  backendName: string;
  mode: PreviewFidelityMode;
  projectId: string | null;
}

export interface PreviewEngineProjectBinding {
  id: string;
  name: string;
}

export interface PreviewEngine {
  readonly backendName: string;
  setProject(project: PreviewEngineProjectBinding | null): Promise<void>;
  setMode(mode: PreviewFidelityMode): Promise<void>;
  getState(): PreviewSessionState;
  dispose(): Promise<void>;
}

export class PlaceholderPreviewEngine implements PreviewEngine {
  public readonly backendName = "placeholder";

  private state: PreviewSessionState = {
    backendName: this.backendName,
    mode: "fast-proxy",
    projectId: null
  };

  async setProject(project: PreviewEngineProjectBinding | null): Promise<void> {
    this.state = {
      ...this.state,
      projectId: project?.id ?? null
    };
  }

  async setMode(mode: PreviewFidelityMode): Promise<void> {
    this.state = {
      ...this.state,
      mode
    };
  }

  getState(): PreviewSessionState {
    return this.state;
  }

  async dispose(): Promise<void> {
    this.state = {
      ...this.state,
      projectId: null
    };
  }
}
