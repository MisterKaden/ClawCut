import type { BrowserWindow } from "electron";

import {
  getBuiltInCaptionTemplates,
  projectPreviewModeToQualityMode,
  type PreviewCommand,
  type PreviewCommandResult,
  type PreviewFrameSnapshot,
  type PreviewFrameSnapshotOptions,
  type PreviewState
} from "@clawcut/domain";
import type { EditorSessionSnapshot } from "@clawcut/ipc";

export interface PreviewBridge {
  executeCommand(command: PreviewCommand): Promise<PreviewCommandResult>;
  getPreviewState(): Promise<PreviewState>;
  captureFrameSnapshot(options?: PreviewFrameSnapshotOptions): Promise<PreviewFrameSnapshot>;
  loadProjectTimeline(input: {
    snapshot: EditorSessionSnapshot;
    initialPlayheadUs?: number;
    preservePlayhead?: boolean;
  }): Promise<PreviewCommandResult>;
}

function serializeForRenderer(value: unknown): string {
  return JSON.stringify(value).replace(/</gu, "\\u003c");
}

export function createPreviewBridge(getWindow: () => BrowserWindow | null): PreviewBridge {
  async function invokeRenderer<TValue>(expression: string): Promise<TValue> {
    const window = getWindow();

    if (!window || window.isDestroyed()) {
      throw new Error("Preview control is unavailable because the desktop window is not ready.");
    }

    return window.webContents.executeJavaScript(expression, true) as Promise<TValue>;
  }

  return {
    executeCommand(command) {
      return invokeRenderer<PreviewCommandResult>(
        `window.clawcutPreview.executeCommand(${serializeForRenderer(command)})`
      );
    },
    getPreviewState() {
      return invokeRenderer<PreviewState>("window.clawcutPreview.getPreviewState()");
    },
    captureFrameSnapshot(options = {}) {
      return invokeRenderer<PreviewFrameSnapshot>(
        `window.clawcutPreview.captureFrameSnapshot(${serializeForRenderer(options)})`
      );
    },
    loadProjectTimeline(input) {
      const target = {
        directory: input.snapshot.directory,
        cacheRoot: input.snapshot.cacheRoot,
        timeline: input.snapshot.timeline,
        libraryItems: input.snapshot.libraryItems,
        captionTracks: input.snapshot.document.captions.tracks,
        captionTemplates: getBuiltInCaptionTemplates(),
        defaultQualityMode: projectPreviewModeToQualityMode(
          input.snapshot.document.settings.preview.defaultMode
        )
      };

      return invokeRenderer<PreviewCommandResult>(
        `window.clawcutPreview.executeCommand(${serializeForRenderer({
          type: "LoadTimelinePreview",
          target,
          initialPlayheadUs: input.initialPlayheadUs,
          preservePlayhead: input.preservePlayhead
        })})`
      );
    }
  };
}
