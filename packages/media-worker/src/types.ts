import type { ClawcutApi } from "@clawcut/ipc";

export type MediaWorkerClient = ClawcutApi & {
  dispose(): Promise<void>;
};
