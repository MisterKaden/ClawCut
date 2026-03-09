import { z } from "zod";

import {
  CAPTION_ACTIVE_WORD_STYLES,
  CAPTION_ALIGNMENTS,
  CAPTION_PLACEMENTS,
  CAPTION_TEMPLATE_IDS,
  type CaptionAlignment,
  type CaptionPlacement,
  type CaptionStyleOverrides,
  type CaptionTemplateId
} from "./captions";
import { EXPORT_PRESET_IDS, type ExportPresetId } from "./render";

export const BRAND_KIT_COLLECTION_VERSION = 1 as const;
export const BRAND_KIT_FONT_FAMILY_INTENTS = ["sans", "display", "serif"] as const;
export const BRAND_KIT_FONT_SCALES = ["small", "medium", "large", "hero"] as const;
export const BRAND_KIT_BACKGROUND_STYLES = ["none", "boxed", "card", "highlight"] as const;
export const BRAND_KIT_SAFE_ZONE_ANCHORS = ["title-safe", "action-safe"] as const;
export const BRAND_KIT_ASSET_KINDS = ["none", "file"] as const;
export const BRAND_KIT_WATERMARK_POSITIONS = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right"
] as const;

export type BrandKitFontFamilyIntent = (typeof BRAND_KIT_FONT_FAMILY_INTENTS)[number];
export type BrandKitFontScale = (typeof BRAND_KIT_FONT_SCALES)[number];
export type BrandKitBackgroundStyle = (typeof BRAND_KIT_BACKGROUND_STYLES)[number];
export type BrandKitSafeZoneAnchor = (typeof BRAND_KIT_SAFE_ZONE_ANCHORS)[number];
export type BrandKitAssetKind = (typeof BRAND_KIT_ASSET_KINDS)[number];
export type BrandKitWatermarkPosition = (typeof BRAND_KIT_WATERMARK_POSITIONS)[number];

export interface BrandKitSafeZoneDefaults {
  anchor: BrandKitSafeZoneAnchor;
  placement: CaptionPlacement;
  alignment: CaptionAlignment;
}

export interface BrandKitResolvedAsset {
  kind: BrandKitAssetKind;
  absolutePath: string | null;
  label: string | null;
}

export interface BrandKitWatermarkAsset extends BrandKitResolvedAsset {
  kind: "none" | "file";
  position: BrandKitWatermarkPosition;
  marginPx: number;
  opacity: number;
}

export interface BrandKitLayoutDefaults {
  safeZoneAnchor: BrandKitSafeZoneAnchor;
  placement: CaptionPlacement;
  alignment: CaptionAlignment;
}

export interface BrandKitExportPresetBundle {
  primaryPresetId: ExportPresetId;
  socialPresetId: ExportPresetId | null;
}

export interface BrandKit {
  id: string;
  version: number;
  name: string;
  description: string;
  captionTemplateId: CaptionTemplateId;
  captionStyleOverrides: CaptionStyleOverrides;
  safeZoneDefaults: BrandKitSafeZoneDefaults;
  exportPresetId: ExportPresetId;
  watermarkAsset: BrandKitWatermarkAsset;
  introAsset: BrandKitResolvedAsset;
  outroAsset: BrandKitResolvedAsset;
  audioBed: BrandKitResolvedAsset;
  layoutDefaults: BrandKitLayoutDefaults;
  exportPresetBundle: BrandKitExportPresetBundle;
  source: "built-in" | "user";
}

export interface BrandKitCollection {
  version: typeof BRAND_KIT_COLLECTION_VERSION;
  items: BrandKit[];
}

export const captionStyleOverridesSchema = z.object({
  placement: z.enum(CAPTION_PLACEMENTS).optional(),
  alignment: z.enum(CAPTION_ALIGNMENTS).optional(),
  fontFamilyIntent: z.enum(BRAND_KIT_FONT_FAMILY_INTENTS).optional(),
  fontScale: z.enum(BRAND_KIT_FONT_SCALES).optional(),
  fontWeight: z.union([z.literal(500), z.literal(600), z.literal(700), z.literal(800)]).optional(),
  textColor: z.string().min(1).optional(),
  accentColor: z.string().min(1).optional(),
  backgroundStyle: z.enum(BRAND_KIT_BACKGROUND_STYLES).optional(),
  activeWordStyle: z.enum(CAPTION_ACTIVE_WORD_STYLES).optional()
});

export const brandKitSchema = z.object({
  id: z.string().min(1),
  version: z.number().int().positive(),
  name: z.string().min(1),
  description: z.string(),
  captionTemplateId: z.enum(CAPTION_TEMPLATE_IDS),
  captionStyleOverrides: captionStyleOverridesSchema,
  safeZoneDefaults: z.object({
    anchor: z.enum(BRAND_KIT_SAFE_ZONE_ANCHORS),
    placement: z.enum(CAPTION_PLACEMENTS),
    alignment: z.enum(CAPTION_ALIGNMENTS)
  }),
  exportPresetId: z.enum(EXPORT_PRESET_IDS),
  watermarkAsset: z.object({
    kind: z.enum(BRAND_KIT_ASSET_KINDS),
    absolutePath: z.string().min(1).nullable(),
    label: z.string().min(1).nullable(),
    position: z.enum(BRAND_KIT_WATERMARK_POSITIONS),
    marginPx: z.number().int().nonnegative(),
    opacity: z.number().min(0).max(1)
  }),
  introAsset: z.object({
    kind: z.enum(BRAND_KIT_ASSET_KINDS),
    absolutePath: z.string().min(1).nullable(),
    label: z.string().min(1).nullable()
  }),
  outroAsset: z.object({
    kind: z.enum(BRAND_KIT_ASSET_KINDS),
    absolutePath: z.string().min(1).nullable(),
    label: z.string().min(1).nullable()
  }),
  audioBed: z.object({
    kind: z.enum(BRAND_KIT_ASSET_KINDS),
    absolutePath: z.string().min(1).nullable(),
    label: z.string().min(1).nullable()
  }),
  layoutDefaults: z.object({
    safeZoneAnchor: z.enum(BRAND_KIT_SAFE_ZONE_ANCHORS),
    placement: z.enum(CAPTION_PLACEMENTS),
    alignment: z.enum(CAPTION_ALIGNMENTS)
  }),
  exportPresetBundle: z.object({
    primaryPresetId: z.enum(EXPORT_PRESET_IDS),
    socialPresetId: z.enum(EXPORT_PRESET_IDS).nullable()
  }),
  source: z.enum(["built-in", "user"])
});

export const brandKitCollectionSchema = z.object({
  version: z.literal(BRAND_KIT_COLLECTION_VERSION),
  items: z.array(brandKitSchema)
});

const BUILT_IN_BRAND_KITS: BrandKit[] = [
  {
    id: "clawcut-clean",
    version: 1,
    name: "Clawcut Clean",
    description: "Neutral talking-head captions with clean lower visual weight.",
    captionTemplateId: "bottom-center-clean",
    captionStyleOverrides: {
      fontFamilyIntent: "sans",
      fontScale: "medium",
      fontWeight: 700,
      textColor: "#F9F7F1",
      accentColor: "#F4A300",
      backgroundStyle: "none",
      alignment: "center",
      placement: "bottom-center",
      activeWordStyle: "none"
    },
    safeZoneDefaults: {
      anchor: "title-safe",
      placement: "bottom-center",
      alignment: "center"
    },
    exportPresetId: "video-master-1080p",
    watermarkAsset: {
      kind: "none",
      absolutePath: null,
      label: null,
      position: "top-right",
      marginPx: 48,
      opacity: 0.78
    },
    introAsset: {
      kind: "none",
      absolutePath: null,
      label: null
    },
    outroAsset: {
      kind: "none",
      absolutePath: null,
      label: null
    },
    audioBed: {
      kind: "none",
      absolutePath: null,
      label: null
    },
    layoutDefaults: {
      safeZoneAnchor: "title-safe",
      placement: "bottom-center",
      alignment: "center"
    },
    exportPresetBundle: {
      primaryPresetId: "video-master-1080p",
      socialPresetId: "video-share-720p"
    },
    source: "built-in"
  },
  {
    id: "clawcut-social-pop",
    version: 1,
    name: "Social Pop",
    description: "High-contrast social captions with active-word emphasis.",
    captionTemplateId: "social-highlight",
    captionStyleOverrides: {
      fontFamilyIntent: "display",
      fontScale: "large",
      fontWeight: 800,
      textColor: "#FFF8E8",
      accentColor: "#FF6B3D",
      backgroundStyle: "highlight",
      alignment: "center",
      placement: "bottom-center",
      activeWordStyle: "highlight"
    },
    safeZoneDefaults: {
      anchor: "title-safe",
      placement: "bottom-center",
      alignment: "center"
    },
    exportPresetId: "video-share-720p",
    watermarkAsset: {
      kind: "none",
      absolutePath: null,
      label: "Top-right logo",
      position: "top-right",
      marginPx: 40,
      opacity: 0.9
    },
    introAsset: {
      kind: "none",
      absolutePath: null,
      label: "Social intro"
    },
    outroAsset: {
      kind: "none",
      absolutePath: null,
      label: "Social outro"
    },
    audioBed: {
      kind: "none",
      absolutePath: null,
      label: null
    },
    layoutDefaults: {
      safeZoneAnchor: "title-safe",
      placement: "bottom-center",
      alignment: "center"
    },
    exportPresetBundle: {
      primaryPresetId: "video-share-720p",
      socialPresetId: "video-share-720p"
    },
    source: "built-in"
  }
];

export function getBuiltInBrandKits(): BrandKit[] {
  return BUILT_IN_BRAND_KITS.map((kit) => structuredClone(kit));
}

export function resolveBrandKit(
  brandKitId: string,
  brandKits: BrandKit[]
): BrandKit | null {
  const brandKit = brandKits.find((entry) => entry.id === brandKitId);
  return brandKit ? structuredClone(brandKit) : null;
}

export function createEmptyBrandKitCollection(): BrandKitCollection {
  return {
    version: BRAND_KIT_COLLECTION_VERSION,
    items: []
  };
}

export function normalizeBrandKitCollection(input: unknown): BrandKitCollection {
  if (!input) {
    return createEmptyBrandKitCollection();
  }

  const parsed = brandKitCollectionSchema.safeParse(input);

  if (parsed.success) {
    return parsed.data;
  }

  return createEmptyBrandKitCollection();
}
