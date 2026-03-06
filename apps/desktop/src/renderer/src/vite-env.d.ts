import type { ClawcutApi } from "@clawcut/ipc";

declare global {
  interface Window {
    clawcut: ClawcutApi;
  }
}

export {};
