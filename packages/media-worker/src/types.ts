import type { ClawcutApi } from "@clawcut/ipc";

export type MediaWorkerClient = Omit<
  ClawcutApi,
  "getLocalApiStatus" | "setLocalApiEnabled" | "regenerateLocalApiToken"
> & {
  dispose(): Promise<void>;
};
