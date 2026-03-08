import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

import {
  brandKitSchema,
  createEmptyBrandKitCollection,
  getBuiltInBrandKits,
  normalizeBrandKitCollection,
  resolveBrandKit,
  type BrandKit
} from "@clawcut/domain";

import { WorkerError } from "./utils";

function resolveUserDataPath(): string {
  const explicit = process.env.CLAWCUT_USER_DATA_PATH?.trim();

  if (explicit) {
    return resolve(explicit);
  }

  return resolve(homedir(), ".clawcut");
}

function resolveBrandKitsPath(): string {
  return join(resolveUserDataPath(), "brand-kits.json");
}

async function loadUserBrandKits(): Promise<BrandKit[]> {
  const filePath = resolveBrandKitsPath();

  try {
    const contents = await readFile(filePath, "utf8");
    return normalizeBrandKitCollection(JSON.parse(contents)).items;
  } catch {
    return [];
  }
}

async function saveUserBrandKits(brandKits: BrandKit[]): Promise<void> {
  const filePath = resolveBrandKitsPath();
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(
    filePath,
    JSON.stringify(
      {
        ...createEmptyBrandKitCollection(),
        items: brandKits
      },
      null,
      2
    ),
    "utf8"
  );
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
  const next = [...existing];
  next[index] = parsed;
  await saveUserBrandKits(next);
  return parsed;
}
