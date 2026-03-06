import type {
  CreateProjectInput,
  OpenProjectInput,
  ProbeAssetInput,
  RegisterFixtureMediaInput
} from "@clawcut/ipc";

import { createProject, openProject, registerFixtureMedia } from "./project-repository";
import { probeAsset } from "./probe";
import { detectToolchain } from "./toolchain";

export async function handleDetectToolchain() {
  return detectToolchain();
}

export async function handleCreateProject(input: CreateProjectInput) {
  return createProject(input.directory, input.name);
}

export async function handleOpenProject(input: OpenProjectInput) {
  return openProject(input.directory);
}

export async function handleRegisterFixtureMedia(input: RegisterFixtureMediaInput) {
  return registerFixtureMedia(input);
}

export async function handleProbeAsset(input: ProbeAssetInput) {
  return probeAsset(input.assetPath);
}
