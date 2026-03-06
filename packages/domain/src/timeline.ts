import { z } from "zod";

import { generateId } from "./id";

export const TIMELINE_TIME_UNIT = "microseconds" as const;
export const DEFAULT_SNAP_TOLERANCE_US = 100_000;

export type TimelineTimeUnit = typeof TIMELINE_TIME_UNIT;
export type TimelineTrackKind = "video" | "audio";
export type TimelineStreamType = "video" | "audio";

export interface TimelineClipTransform {
  positionX: number;
  positionY: number;
  scaleX: number;
  scaleY: number;
  rotationDeg: number;
  opacity: number;
}

export interface TimelineTrack {
  id: string;
  kind: TimelineTrackKind;
  name: string;
  locked: boolean;
  visible: boolean;
  muted: boolean;
  clipIds: string[];
}

export interface TimelineClip {
  id: string;
  trackId: string;
  mediaItemId: string;
  streamType: TimelineStreamType;
  sourceInUs: number;
  sourceOutUs: number;
  timelineStartUs: number;
  enabled: boolean;
  transform: TimelineClipTransform;
  speed: number;
  gainDb: number;
  tags: string[];
}

export interface TimelineMarker {
  id: string;
  positionUs: number;
  label: string;
}

export interface TimelineRegion {
  id: string;
  startUs: number;
  endUs: number;
  label: string;
}

export interface Timeline {
  id: string;
  timeUnit: TimelineTimeUnit;
  playheadUs: number;
  zoom: number;
  trackOrder: string[];
  tracksById: Record<string, TimelineTrack>;
  clipsById: Record<string, TimelineClip>;
  markers: TimelineMarker[];
  regions: TimelineRegion[];
  snapToleranceUs: number;
}

const timelineClipTransformSchema = z.object({
  positionX: z.number(),
  positionY: z.number(),
  scaleX: z.number().positive(),
  scaleY: z.number().positive(),
  rotationDeg: z.number(),
  opacity: z.number().min(0).max(1)
});

export const timelineTrackSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["video", "audio"]),
  name: z.string().min(1),
  locked: z.boolean(),
  visible: z.boolean(),
  muted: z.boolean(),
  clipIds: z.array(z.string().min(1))
});

export const timelineClipSchema = z.object({
  id: z.string().min(1),
  trackId: z.string().min(1),
  mediaItemId: z.string().min(1),
  streamType: z.enum(["video", "audio"]),
  sourceInUs: z.number().int().nonnegative(),
  sourceOutUs: z.number().int().nonnegative(),
  timelineStartUs: z.number().int().nonnegative(),
  enabled: z.boolean(),
  transform: timelineClipTransformSchema,
  speed: z.number().positive(),
  gainDb: z.number(),
  tags: z.array(z.string())
});

export const timelineMarkerSchema = z.object({
  id: z.string().min(1),
  positionUs: z.number().int().nonnegative(),
  label: z.string()
});

export const timelineRegionSchema = z.object({
  id: z.string().min(1),
  startUs: z.number().int().nonnegative(),
  endUs: z.number().int().nonnegative(),
  label: z.string()
});

export const timelineSchema = z.object({
  id: z.string().min(1),
  timeUnit: z.literal(TIMELINE_TIME_UNIT),
  playheadUs: z.number().int().nonnegative(),
  zoom: z.number().positive(),
  trackOrder: z.array(z.string().min(1)),
  tracksById: z.record(timelineTrackSchema),
  clipsById: z.record(timelineClipSchema),
  markers: z.array(timelineMarkerSchema),
  regions: z.array(timelineRegionSchema),
  snapToleranceUs: z.number().int().nonnegative()
});

export function createDefaultClipTransform(): TimelineClipTransform {
  return {
    positionX: 0,
    positionY: 0,
    scaleX: 1,
    scaleY: 1,
    rotationDeg: 0,
    opacity: 1
  };
}

export function createEmptyTimeline(id: string = generateId()): Timeline {
  return {
    id,
    timeUnit: TIMELINE_TIME_UNIT,
    playheadUs: 0,
    zoom: 1,
    trackOrder: [],
    tracksById: {},
    clipsById: {},
    markers: [],
    regions: [],
    snapToleranceUs: DEFAULT_SNAP_TOLERANCE_US
  };
}

export function cloneTimeline(timeline: Timeline): Timeline {
  return structuredClone(timeline);
}

export function createTimelineTrack(
  kind: TimelineTrackKind,
  name: string,
  id: string = generateId()
): TimelineTrack {
  return {
    id,
    kind,
    name,
    locked: false,
    visible: true,
    muted: false,
    clipIds: []
  };
}

export function createTimelineClip(
  input: Omit<TimelineClip, "id" | "enabled" | "transform" | "speed" | "gainDb" | "tags"> & {
    id?: string;
    enabled?: boolean;
    transform?: TimelineClipTransform;
    speed?: number;
    gainDb?: number;
    tags?: string[];
  }
): TimelineClip {
  return {
    id: input.id ?? generateId(),
    trackId: input.trackId,
    mediaItemId: input.mediaItemId,
    streamType: input.streamType,
    sourceInUs: input.sourceInUs,
    sourceOutUs: input.sourceOutUs,
    timelineStartUs: input.timelineStartUs,
    enabled: input.enabled ?? true,
    transform: input.transform ?? createDefaultClipTransform(),
    speed: input.speed ?? 1,
    gainDb: input.gainDb ?? 0,
    tags: input.tags ?? []
  };
}

export function getTimelineClipDurationUs(clip: TimelineClip): number {
  return Math.max(0, Math.round((clip.sourceOutUs - clip.sourceInUs) / clip.speed));
}

export function getTimelineClipEndUs(clip: TimelineClip): number {
  return clip.timelineStartUs + getTimelineClipDurationUs(clip);
}

export function getTimelineEndUs(timeline: Timeline): number {
  return Object.values(timeline.clipsById).reduce((maxEnd, clip) => {
    return Math.max(maxEnd, getTimelineClipEndUs(clip));
  }, 0);
}

export function getTrackClips(timeline: Timeline, trackId: string): TimelineClip[] {
  const track = timeline.tracksById[trackId];

  if (!track) {
    return [];
  }

  return track.clipIds
    .map((clipId) => timeline.clipsById[clipId])
    .filter((clip): clip is TimelineClip => Boolean(clip))
    .sort((left, right) => {
      if (left.timelineStartUs === right.timelineStartUs) {
        return left.id.localeCompare(right.id);
      }

      return left.timelineStartUs - right.timelineStartUs;
    });
}
