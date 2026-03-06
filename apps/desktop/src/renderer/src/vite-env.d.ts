import type { ClawcutApi } from "@clawcut/ipc";
import type { PreviewApi } from "@clawcut/domain";

declare global {
  interface Window {
    clawcut: ClawcutApi;
    clawcutPreview: PreviewApi;
  }
}

export {};
