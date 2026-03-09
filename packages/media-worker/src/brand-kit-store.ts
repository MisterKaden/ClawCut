import { access } from "node:fs/promises";

import {
  brandKitSchema,
  createEmptyBrandKitCollection,
  getBuiltInBrandKits,
  normalizeBrandKitCollection,
  resolveBrandKit,
  type BrandKit
} from "@clawcut/domain";

import { WorkerError } from "./utils";
import { readJsonStore, writeJsonStore } from "./user-data-store";

async function validateAssetPath(path: string | null, label: string): Promise<void> {
  if (!path) {
    return;
  }

  try {
    await access(path);
  } catch {
    throw new WorkerError("BRAND_KIT_INVALID", `${label} could not be found at ${path}.`);
  }
}

async function validateBrandKitAssets(brandKit: BrandKit): Promise<void> {
  if (brandKit.watermarkAsset.kind === "file") {
    await validateAssetPath(brandKit.watermarkAsset.absolutePath, "Brand-kit watermark asset");
  }

  if (brandKit.introAsset.kind === "file") {
    await validateAssetPath(brandKit.introAsset.absolutePath, "Brand-kit intro asset");
  }

  if (brandKit.outroAsset.kind === "file") {
    await validateAssetPath(brandKit.outroAsset.absolutePath, "Brand-kit outro asset");
  }

  if (brandKit.audioBed.kind === "file") {
    await validateAssetPath(brandKit.audioBed.absolutePath, "Brand-kit audio bed");
  }
}

async function loadUserBrandKits(): Promise<BrandKit[]> {
  return normalizeBrandKitCollection(
    await readJsonStore("brand-kits.json", createEmptyBrandKitCollection())
  ).items;
}

async function saveUserBrandKits(brandKits: BrandKit[]): Promise<void> {
  await writeJsonStore("brand-kits.json", {
    ...createEmptyBrandKitCollection(),
    items: brandKits
  });
}

export async function listBrandKits(): Promise<BrandKit[]> {
  return [...getBuiltInBrandKits(), ...(await loadUserBrandKits())];
}

export async function getBrandKit(brandKitId: string): Promise<BrandKit | null> {
  return resolveBrandKit(brandKitId, await listBrandKits());
}

export async function createUserBrandKit(input: unknown): Promise<BrandKit> {
  const candidate = input && typeof input === "object" ? input : {};
  const parsed = brandKitSchema.parse({
    ...candidate,
    source: "user"
  });
  await validateBrandKitAssets(parsed);
  const existing = await loadUserBrandKits();

  if (existing.some((brandKit) => brandKit.id === parsed.id)) {
    throw new WorkerError(
      "BRAND_KIT_INVALID",
      `Brand kit ${parsed.id} already exists.`
    );
  }

  await saveUserBrandKits([...existing, parsed]);
  return parsed;
}

export async function updateUserBrandKit(brandKitId: string, input: unknown): Promise<BrandKit> {
  const existing = await loadUserBrandKits();
  const index = existing.findIndex((brandKit) => brandKit.id === brandKitId);

  if (index === -1) {
    throw new WorkerError("BRAND_KIT_NOT_FOUND", `Brand kit ${brandKitId} could not be found.`);
  }

  const candidate = input && typeof input === "object" ? input : {};
  const parsed = brandKitSchema.parse({
    ...candidate,
    id: brandKitId,
    source: "user"
  });
  await validateBrandKitAssets(parsed);
  const next = [...existing];
  next[index] = parsed;
  await saveUserBrandKits(next);
  return parsed;
}
