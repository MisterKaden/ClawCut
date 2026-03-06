import { z } from "zod";

export const MEDIA_ITEM_KINDS = ["video", "audio", "unknown"] as const;
export const MEDIA_INGEST_STATUSES = [
  "pending",
  "indexing",
  "deriving",
  "ready",
  "warning",
  "failed",
  "missing"
] as const;
export const MEDIA_RELINK_STATUSES = ["linked", "missing", "relinked"] as const;
export const FINGERPRINT_STRATEGIES = [
  "partial-sha256",
  "full-sha256",
  "stat-only"
] as const;
export const DERIVED_ASSET_TYPES = ["thumbnail", "waveform", "proxy"] as const;
export const DERIVED_ASSET_STATUSES = ["pending", "ready", "failed", "stale"] as const;
export const RELINK_CONFIDENCES = ["exact", "probable", "unsafe"] as const;

export type MediaSourceType = "fixture" | "import";
export type MediaItemKind = (typeof MEDIA_ITEM_KINDS)[number];
export type MediaIngestStatus = (typeof MEDIA_INGEST_STATUSES)[number];
export type MediaRelinkStatus = (typeof MEDIA_RELINK_STATUSES)[number];
export type FingerprintStrategy = (typeof FINGERPRINT_STRATEGIES)[number];
export type DerivedAssetType = (typeof DERIVED_ASSET_TYPES)[number];
export type DerivedAssetStatus = (typeof DERIVED_ASSET_STATUSES)[number];
export type RelinkConfidence = (typeof RELINK_CONFIDENCES)[number];

export interface MediaSource {
  sourceType: MediaSourceType;
  originalPath: string;
  currentResolvedPath: string | null;
  normalizedOriginalPath: string;
  normalizedResolvedPath: string | null;
}

export interface MediaFingerprint {
  strategy: FingerprintStrategy;
  quickHash: string | null;
  fileSize: number | null;
  modifiedTimeMs: number | null;
  sampleSizeBytes: number;
}

export interface MediaErrorState {
  code: string;
  message: string;
  updatedAt: string;
}

export interface BaseStreamInfo {
  index: number;
  codecType: "video" | "audio" | "subtitle" | "data" | "unknown";
  codecName: string | null;
  durationMs: number | null;
  bitRate: number | null;
  timeBase: string | null;
  language: string | null;
  isDefault: boolean;
}

export interface VideoStreamInfo extends BaseStreamInfo {
  codecType: "video";
  width: number | null;
  height: number | null;
  pixelFormat: string | null;
  frameRate: number | null;
  rotation: number | null;
}

export interface AudioStreamInfo extends BaseStreamInfo {
  codecType: "audio";
  sampleRate: number | null;
  channelCount: number | null;
  channelLayout: string | null;
}

export interface SubtitleStreamInfo extends BaseStreamInfo {
  codecType: "subtitle";
}

export interface GenericStreamInfo extends BaseStreamInfo {
  codecType: "data" | "unknown";
}

export type MediaStreamInfo =
  | VideoStreamInfo
  | AudioStreamInfo
  | SubtitleStreamInfo
  | GenericStreamInfo;

export interface MediaMetadataSummary {
  kind: MediaItemKind;
  container: string | null;
  durationMs: number | null;
  bitRate: number | null;
  hasVideo: boolean;
  hasAudio: boolean;
  width: number | null;
  height: number | null;
  frameRate: number | null;
  pixelFormat: string | null;
  rotation: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  audioSampleRate: number | null;
  channelCount: number | null;
  streamSignature: string;
}

export interface DerivedAssetBase {
  id: string;
  type: DerivedAssetType;
  status: DerivedAssetStatus;
  relativePath: string;
  sourceRevision: string;
  presetKey: string;
  generatedAt: string | null;
  fileSize: number | null;
  errorMessage: string | null;
}

export interface ThumbnailAsset extends DerivedAssetBase {
  type: "thumbnail";
  width: number | null;
  height: number | null;
}

export interface WaveformAsset extends DerivedAssetBase {
  type: "waveform";
  bucketCount: number;
  durationMs: number | null;
  previewPeaks: number[];
}

export interface ProxyAsset extends DerivedAssetBase {
  type: "proxy";
  width: number | null;
  height: number | null;
  durationMs: number | null;
  container: string;
  videoCodec: string | null;
  audioCodec: string | null;
}

export type DerivedAsset = ThumbnailAsset | WaveformAsset | ProxyAsset;

export interface DerivedAssetSet {
  thumbnail: ThumbnailAsset | null;
  waveform: WaveformAsset | null;
  proxy: ProxyAsset | null;
}

export interface MediaItem {
  id: string;
  displayName: string;
  source: MediaSource;
  importTimestamp: string;
  lastSeenTimestamp: string | null;
  fileSize: number | null;
  fileModifiedTimeMs: number | null;
  fingerprint: MediaFingerprint;
  sourceRevision: string;
  metadataSummary: MediaMetadataSummary;
  streams: MediaStreamInfo[];
  ingestStatus: MediaIngestStatus;
  relinkStatus: MediaRelinkStatus;
  errorState: MediaErrorState | null;
  derivedAssets: DerivedAssetSet;
}

export interface RelinkResult {
  accepted: boolean;
  mediaItemId: string;
  confidence: RelinkConfidence;
  details: string[];
  previousPath: string | null;
  nextPath: string | null;
  requiresDerivedRefresh: boolean;
}

const mediaSourceSchema = z.object({
  sourceType: z.enum(["fixture", "import"]),
  originalPath: z.string().min(1),
  currentResolvedPath: z.string().min(1).nullable(),
  normalizedOriginalPath: z.string().min(1),
  normalizedResolvedPath: z.string().min(1).nullable()
});

const mediaFingerprintSchema = z.object({
  strategy: z.enum(FINGERPRINT_STRATEGIES),
  quickHash: z.string().min(1).nullable(),
  fileSize: z.number().int().nonnegative().nullable(),
  modifiedTimeMs: z.number().nonnegative().nullable(),
  sampleSizeBytes: z.number().int().nonnegative()
});

const mediaErrorStateSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  updatedAt: z.string().datetime()
});

const baseStreamSchema = z.object({
  index: z.number().int().nonnegative(),
  codecType: z.enum(["video", "audio", "subtitle", "data", "unknown"]),
  codecName: z.string().min(1).nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  bitRate: z.number().nonnegative().nullable(),
  timeBase: z.string().min(1).nullable(),
  language: z.string().min(1).nullable(),
  isDefault: z.boolean()
});

const videoStreamSchema = baseStreamSchema.extend({
  codecType: z.literal("video"),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  pixelFormat: z.string().min(1).nullable(),
  frameRate: z.number().positive().nullable(),
  rotation: z.number().nullable()
});

const audioStreamSchema = baseStreamSchema.extend({
  codecType: z.literal("audio"),
  sampleRate: z.number().positive().nullable(),
  channelCount: z.number().int().positive().nullable(),
  channelLayout: z.string().min(1).nullable()
});

const subtitleStreamSchema = baseStreamSchema.extend({
  codecType: z.literal("subtitle")
});

const genericStreamSchema = baseStreamSchema.extend({
  codecType: z.enum(["data", "unknown"])
});

export const mediaStreamInfoSchema = z.discriminatedUnion("codecType", [
  videoStreamSchema,
  audioStreamSchema,
  subtitleStreamSchema,
  genericStreamSchema
]);

export const mediaMetadataSummarySchema = z.object({
  kind: z.enum(MEDIA_ITEM_KINDS),
  container: z.string().min(1).nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  bitRate: z.number().nonnegative().nullable(),
  hasVideo: z.boolean(),
  hasAudio: z.boolean(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  frameRate: z.number().positive().nullable(),
  pixelFormat: z.string().min(1).nullable(),
  rotation: z.number().nullable(),
  videoCodec: z.string().min(1).nullable(),
  audioCodec: z.string().min(1).nullable(),
  audioSampleRate: z.number().positive().nullable(),
  channelCount: z.number().int().positive().nullable(),
  streamSignature: z.string()
});

const derivedAssetBaseSchema = z.object({
  id: z.string().min(1),
  type: z.enum(DERIVED_ASSET_TYPES),
  status: z.enum(DERIVED_ASSET_STATUSES),
  relativePath: z.string().min(1),
  sourceRevision: z.string().min(1),
  presetKey: z.string().min(1),
  generatedAt: z.string().datetime().nullable(),
  fileSize: z.number().int().nonnegative().nullable(),
  errorMessage: z.string().min(1).nullable()
});

const thumbnailAssetSchema = derivedAssetBaseSchema.extend({
  type: z.literal("thumbnail"),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable()
});

const waveformAssetSchema = derivedAssetBaseSchema.extend({
  type: z.literal("waveform"),
  bucketCount: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative().nullable(),
  previewPeaks: z.array(z.number().min(0).max(1))
});

const proxyAssetSchema = derivedAssetBaseSchema.extend({
  type: z.literal("proxy"),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  container: z.string().min(1),
  videoCodec: z.string().min(1).nullable(),
  audioCodec: z.string().min(1).nullable()
});

export const derivedAssetSchema = z.discriminatedUnion("type", [
  thumbnailAssetSchema,
  waveformAssetSchema,
  proxyAssetSchema
]);

export const derivedAssetSetSchema = z.object({
  thumbnail: thumbnailAssetSchema.nullable(),
  waveform: waveformAssetSchema.nullable(),
  proxy: proxyAssetSchema.nullable()
});

export const mediaItemSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  source: mediaSourceSchema,
  importTimestamp: z.string().datetime(),
  lastSeenTimestamp: z.string().datetime().nullable(),
  fileSize: z.number().int().nonnegative().nullable(),
  fileModifiedTimeMs: z.number().nonnegative().nullable(),
  fingerprint: mediaFingerprintSchema,
  sourceRevision: z.string().min(1),
  metadataSummary: mediaMetadataSummarySchema,
  streams: z.array(mediaStreamInfoSchema),
  ingestStatus: z.enum(MEDIA_INGEST_STATUSES),
  relinkStatus: z.enum(MEDIA_RELINK_STATUSES),
  errorState: mediaErrorStateSchema.nullable(),
  derivedAssets: derivedAssetSetSchema
});

export function createEmptyMetadataSummary(): MediaMetadataSummary {
  return {
    kind: "unknown",
    container: null,
    durationMs: null,
    bitRate: null,
    hasVideo: false,
    hasAudio: false,
    width: null,
    height: null,
    frameRate: null,
    pixelFormat: null,
    rotation: null,
    videoCodec: null,
    audioCodec: null,
    audioSampleRate: null,
    channelCount: null,
    streamSignature: "unknown"
  };
}

export function createEmptyDerivedAssetSet(): DerivedAssetSet {
  return {
    thumbnail: null,
    waveform: null,
    proxy: null
  };
}
