import type {
  CreateProjectInput,
  ExecuteCaptionCommandInput,
  ExecuteExportCommandInput,
  ExecuteEditorCommandInput,
  GetExportSessionSnapshotInput,
  GetEditorSessionSnapshotInput,
  GetCaptionSessionSnapshotInput,
  GetSmartSessionSnapshotInput,
  GetProjectSnapshotInput,
  ImportMediaPathsInput,
  OpenProjectInput,
  ProbeAssetInput,
  RefreshMediaHealthInput,
  RelinkMediaItemInput,
  RetryJobInput,
  ExecuteSmartCommandInput
} from "@clawcut/ipc";

import {
  executeCaptionCommand,
  getCaptionSessionSnapshot
} from "./caption-session";
import {
  executeEditorCommand,
  getEditorSessionSnapshot
} from "./editor-session";
import {
  executeExportCommand,
  getExportSessionSnapshot
} from "./export-session";
import {
  importMediaPaths,
  primeProjectJobs,
  relinkMediaItem,
  retryJob
} from "./ingest-service";
import {
  createProject,
  getProjectSnapshot,
  openProject,
  refreshMediaHealth
} from "./project-repository";
import { probeAsset } from "./probe";
import {
  executeSmartCommand,
  getSmartSessionSnapshot
} from "./smart-session";
import { detectToolchain } from "./toolchain";

export async function handleDetectToolchain() {
  return detectToolchain();
}

export async function handleCreateProject(input: CreateProjectInput) {
  return createProject(input.directory, input.name);
}

export async function handleOpenProject(input: OpenProjectInput) {
  const snapshot = await openProject(input.directory);
  await primeProjectJobs(input.directory);
  return snapshot;
}

export async function handleGetProjectSnapshot(input: GetProjectSnapshotInput) {
  return getProjectSnapshot(input.directory);
}

export async function handleGetEditorSessionSnapshot(
  input: GetEditorSessionSnapshotInput
) {
  return getEditorSessionSnapshot(input.directory);
}

export async function handleExecuteEditorCommand(input: ExecuteEditorCommandInput) {
  return executeEditorCommand(input);
}

export async function handleGetExportSessionSnapshot(
  input: GetExportSessionSnapshotInput
) {
  return getExportSessionSnapshot(input);
}

export async function handleExecuteExportCommand(input: ExecuteExportCommandInput) {
  return executeExportCommand(input);
}

export async function handleGetCaptionSessionSnapshot(
  input: GetCaptionSessionSnapshotInput
) {
  return getCaptionSessionSnapshot(input);
}

export async function handleExecuteCaptionCommand(input: ExecuteCaptionCommandInput) {
  return executeCaptionCommand(input);
}

export async function handleGetSmartSessionSnapshot(
  input: GetSmartSessionSnapshotInput
) {
  return getSmartSessionSnapshot(input);
}

export async function handleExecuteSmartCommand(input: ExecuteSmartCommandInput) {
  return executeSmartCommand(input);
}

export async function handleImportMediaPaths(input: ImportMediaPathsInput) {
  return importMediaPaths(input);
}

export async function handleRefreshMediaHealth(input: RefreshMediaHealthInput) {
  return refreshMediaHealth(input.directory);
}

export async function handleRelinkMediaItem(input: RelinkMediaItemInput) {
  return relinkMediaItem(input);
}

export async function handleRetryJob(input: RetryJobInput) {
  return retryJob(input);
}

export async function handleProbeAsset(input: ProbeAssetInput) {
  return probeAsset(input.assetPath);
}
