import {
  type EditorCommand,
  type EditorCommandContext,
  type EditorCommandError,
  type EditorCommandExecutionResult,
  type EditorCommandFailure,
  isEditorCommandFailure
} from "./editor";
import type { MediaItem } from "./media";
import {
  cloneTimeline,
  createTimelineClip,
  createTimelineTrack,
  DEFAULT_SNAP_TOLERANCE_US,
  getTimelineClipDurationUs,
  getTimelineClipEndUs,
  getTrackClips,
  type Timeline,
  type TimelineClip,
  type TimelineMarker,
  type TimelineStreamType,
  type TimelineTrack
} from "./timeline";

function createIdFactory(context: EditorCommandContext): () => string {
  if (context.generateId) {
    return context.generateId;
  }

  return () => globalThis.crypto.randomUUID();
}

function createError(
  code: EditorCommandError["code"],
  message: string,
  details?: string
): EditorCommandError {
  return {
    code,
    message,
    details
  };
}

function fail(
  command: EditorCommand,
  error: EditorCommandError
): EditorCommandFailure {
  return {
    ok: false,
    commandType: command.type,
    timelineId: "timelineId" in command ? command.timelineId : null,
    error
  };
}

function ensureTimeline(command: EditorCommand, timeline: Timeline): EditorCommandFailure | null {
  if ("timelineId" in command && command.timelineId !== timeline.id) {
    return fail(
      command,
      createError("TIMELINE_NOT_FOUND", `Timeline ${command.timelineId} could not be found.`)
    );
  }

  return null;
}

function getTrackById(
  command: EditorCommand,
  timeline: Timeline,
  trackId: string
): TimelineTrack | EditorCommandFailure {
  const track = timeline.tracksById[trackId];

  if (!track) {
    return fail(command, createError("TRACK_NOT_FOUND", `Track ${trackId} could not be found.`));
  }

  return track;
}

function getClipById(
  command: EditorCommand,
  timeline: Timeline,
  clipId: string
): TimelineClip | EditorCommandFailure {
  const clip = timeline.clipsById[clipId];

  if (!clip) {
    return fail(command, createError("CLIP_NOT_FOUND", `Clip ${clipId} could not be found.`));
  }

  return clip;
}

function getMediaItemById(
  command: EditorCommand,
  context: EditorCommandContext,
  mediaItemId: string
): MediaItem | EditorCommandFailure {
  const mediaItem = context.mediaItemsById[mediaItemId];

  if (!mediaItem) {
    return fail(
      command,
      createError("MEDIA_ITEM_NOT_FOUND", `Media item ${mediaItemId} could not be found.`)
    );
  }

  return mediaItem;
}

function trackSupportsStream(track: TimelineTrack, streamType: TimelineStreamType): boolean {
  return track.kind === streamType;
}

function mediaSupportsStream(mediaItem: MediaItem, streamType: TimelineStreamType): boolean {
  return streamType === "video"
    ? mediaItem.metadataSummary.hasVideo
    : mediaItem.metadataSummary.hasAudio;
}

function getMediaDurationUs(mediaItem: MediaItem): number | null {
  if (mediaItem.metadataSummary.durationMs === null) {
    return null;
  }

  return mediaItem.metadataSummary.durationMs * 1_000;
}

function sortTrackClipIds(timeline: Timeline, trackId: string): void {
  const track = timeline.tracksById[trackId];

  if (!track) {
    return;
  }

  track.clipIds = getTrackClips(timeline, trackId).map((clip) => clip.id);
}

function removeClipFromTrack(timeline: Timeline, trackId: string, clipId: string): void {
  const track = timeline.tracksById[trackId];

  if (!track) {
    return;
  }

  track.clipIds = track.clipIds.filter((entry) => entry !== clipId);
}

function addClipToTrack(timeline: Timeline, trackId: string, clipId: string): void {
  const track = timeline.tracksById[trackId];

  if (!track) {
    return;
  }

  if (!track.clipIds.includes(clipId)) {
    track.clipIds.push(clipId);
  }

  sortTrackClipIds(timeline, trackId);
}

function assertTrackEditable(
  command: EditorCommand,
  track: TimelineTrack,
  privilegedOverride: boolean | undefined
): EditorCommandFailure | null {
  if (track.locked && !privilegedOverride) {
    return fail(
      command,
      createError("TRACK_LOCKED", `Track ${track.name} is locked and cannot be edited.`)
    );
  }

  return null;
}

function rangesOverlap(
  leftStartUs: number,
  leftEndUs: number,
  rightStartUs: number,
  rightEndUs: number
): boolean {
  return leftStartUs < rightEndUs && rightStartUs < leftEndUs;
}

function validateTrackPlacement(
  command: EditorCommand,
  timeline: Timeline,
  trackId: string,
  startUs: number,
  durationUs: number,
  excludeClipIds: Set<string>
): EditorCommandFailure | null {
  const endUs = startUs + durationUs;

  if (startUs < 0 || durationUs <= 0) {
    return fail(
      command,
      createError("INVALID_TIME_RANGE", "Clip placement requires a positive duration.")
    );
  }

  for (const clip of getTrackClips(timeline, trackId)) {
    if (excludeClipIds.has(clip.id)) {
      continue;
    }

    if (rangesOverlap(startUs, endUs, clip.timelineStartUs, getTimelineClipEndUs(clip))) {
      return fail(
        command,
        createError(
          "CLIP_OVERLAP",
          `Clip overlaps ${clip.id} on track ${trackId}.`
        )
      );
    }
  }

  return null;
}

function collectSnapTargets(
  timeline: Timeline,
  excludeClipIds: Set<string>
): number[] {
  const targets = new Set<number>([timeline.playheadUs]);

  for (const marker of timeline.markers) {
    targets.add(marker.positionUs);
  }

  for (const clip of Object.values(timeline.clipsById)) {
    if (excludeClipIds.has(clip.id)) {
      continue;
    }

    targets.add(clip.timelineStartUs);
    targets.add(getTimelineClipEndUs(clip));
  }

  return [...targets.values()].sort((left, right) => left - right);
}

function resolvePointSnap(
  timeline: Timeline,
  proposedUs: number,
  enabled: boolean,
  excludeClipIds: Set<string>
): { valueUs: number; snapDeltaUs: number | null } {
  if (!enabled) {
    return {
      valueUs: proposedUs,
      snapDeltaUs: null
    };
  }

  let bestDelta: number | null = null;

  for (const targetUs of collectSnapTargets(timeline, excludeClipIds)) {
    const delta = targetUs - proposedUs;

    if (Math.abs(delta) > timeline.snapToleranceUs) {
      continue;
    }

    if (bestDelta === null || Math.abs(delta) < Math.abs(bestDelta)) {
      bestDelta = delta;
    }
  }

  return {
    valueUs: proposedUs + (bestDelta ?? 0),
    snapDeltaUs: bestDelta
  };
}

function resolveRangeSnap(
  timeline: Timeline,
  proposedStartUs: number,
  durationUs: number,
  enabled: boolean,
  excludeClipIds: Set<string>
): { valueUs: number; snapDeltaUs: number | null } {
  if (!enabled) {
    return {
      valueUs: proposedStartUs,
      snapDeltaUs: null
    };
  }

  const proposedEndUs = proposedStartUs + durationUs;
  let bestDelta: number | null = null;

  for (const targetUs of collectSnapTargets(timeline, excludeClipIds)) {
    const deltas = [targetUs - proposedStartUs, targetUs - proposedEndUs];

    for (const delta of deltas) {
      if (Math.abs(delta) > timeline.snapToleranceUs) {
        continue;
      }

      if (bestDelta === null || Math.abs(delta) < Math.abs(bestDelta)) {
        bestDelta = delta;
      }
    }
  }

  return {
    valueUs: proposedStartUs + (bestDelta ?? 0),
    snapDeltaUs: bestDelta
  };
}

function nextTrackName(timeline: Timeline, kind: TimelineTrack["kind"]): string {
  const prefix = kind === "video" ? "V" : "A";
  const count = Object.values(timeline.tracksById).filter((track) => track.kind === kind).length;
  return `${prefix}${count + 1}`;
}

function buildSuccess<T extends EditorCommandExecutionResult & { ok: true }>(result: T): T {
  return result;
}

function insertClipInternal(
  command: EditorCommand,
  timeline: Timeline,
  context: EditorCommandContext,
  input: {
    trackId: string;
    mediaItemId: string;
    streamType: TimelineStreamType;
    timelineStartUs: number;
    sourceInUs?: number;
    sourceOutUs?: number;
    clipId?: string;
    privilegedOverride?: boolean;
    snapToTargets?: boolean;
  }
): { clip: TimelineClip; snapDeltaUs: number | null } | EditorCommandFailure {
  const track = getTrackById(command, timeline, input.trackId);

  if (isEditorCommandFailure(track)) {
    return track;
  }

  const lockedError = assertTrackEditable(command, track, input.privilegedOverride);

  if (lockedError) {
    return lockedError;
  }

  if (!trackSupportsStream(track, input.streamType)) {
    return fail(
      command,
      createError(
        "TRACK_KIND_MISMATCH",
        `Track ${track.name} does not accept ${input.streamType} clips.`
      )
    );
  }

  const mediaItem = getMediaItemById(command, context, input.mediaItemId);

  if (isEditorCommandFailure(mediaItem)) {
    return mediaItem;
  }

  if (!mediaSupportsStream(mediaItem, input.streamType)) {
    return fail(
      command,
      createError(
        "UNSUPPORTED_MEDIA_STREAM",
        `${mediaItem.displayName} does not expose a ${input.streamType} stream.`
      )
    );
  }

  const mediaDurationUs = getMediaDurationUs(mediaItem);

  if (mediaDurationUs === null) {
    return fail(
      command,
      createError(
        "INVALID_SOURCE_RANGE",
        `${mediaItem.displayName} does not have a usable media duration yet.`
      )
    );
  }

  const sourceInUs = Math.max(0, Math.round(input.sourceInUs ?? 0));
  const sourceOutUs = Math.round(input.sourceOutUs ?? mediaDurationUs);

  if (
    sourceInUs < 0 ||
    sourceOutUs <= sourceInUs ||
    sourceOutUs > mediaDurationUs
  ) {
    return fail(
      command,
      createError("INVALID_SOURCE_RANGE", "Clip source bounds fall outside the media item.")
    );
  }

  const clip = createTimelineClip({
    id: input.clipId,
    trackId: track.id,
    mediaItemId: mediaItem.id,
    streamType: input.streamType,
    sourceInUs,
    sourceOutUs,
    timelineStartUs: Math.max(0, Math.round(input.timelineStartUs))
  });
  const clipDurationUs = getTimelineClipDurationUs(clip);
  const snapResolution = resolveRangeSnap(
    timeline,
    clip.timelineStartUs,
    clipDurationUs,
    input.snapToTargets ?? true,
    new Set<string>()
  );

  clip.timelineStartUs = snapResolution.valueUs;

  const overlapError = validateTrackPlacement(
    command,
    timeline,
    track.id,
    clip.timelineStartUs,
    clipDurationUs,
    new Set<string>()
  );

  if (overlapError) {
    return overlapError;
  }

  timeline.clipsById[clip.id] = clip;
  addClipToTrack(timeline, track.id, clip.id);

  return {
    clip,
    snapDeltaUs: snapResolution.snapDeltaUs
  };
}

export function applyEditorCommand(
  timeline: Timeline,
  command: EditorCommand,
  context: EditorCommandContext
): EditorCommandExecutionResult {
  const timelineError = ensureTimeline(command, timeline);

  if (timelineError) {
    return timelineError;
  }

  const nextTimeline = cloneTimeline(timeline);
  const generateId = createIdFactory(context);

  switch (command.type) {
    case "CreateTimeline": {
      if (nextTimeline.trackOrder.length > 0 || Object.keys(nextTimeline.clipsById).length > 0) {
        return fail(
          command,
          createError(
            "TIMELINE_ALREADY_INITIALIZED",
            "Timeline already contains tracks or clips."
          )
        );
      }

      const videoTrack = createTimelineTrack("video", "V1", generateId());
      const audioTrack = createTimelineTrack("audio", "A1", generateId());
      nextTimeline.tracksById[videoTrack.id] = videoTrack;
      nextTimeline.tracksById[audioTrack.id] = audioTrack;
      nextTimeline.trackOrder = [videoTrack.id, audioTrack.id];

      return buildSuccess({
        ok: true,
        commandType: "CreateTimeline",
        timelineId: nextTimeline.id,
        historyEntryId: null,
        changed: true,
        touchedClipIds: [],
        touchedTrackIds: [videoTrack.id, audioTrack.id],
        snapDeltaUs: null,
        createdTrackIds: [videoTrack.id, audioTrack.id],
        nextTimeline,
        reversible: true,
        historyLabel: "Create timeline"
      });
    }

    case "AddTrack": {
      const track = createTimelineTrack(
        command.trackKind,
        command.name?.trim() || nextTrackName(nextTimeline, command.trackKind),
        generateId()
      );
      const index = Math.max(0, Math.min(command.index ?? nextTimeline.trackOrder.length, nextTimeline.trackOrder.length));

      nextTimeline.tracksById[track.id] = track;
      nextTimeline.trackOrder.splice(index, 0, track.id);

      return buildSuccess({
        ok: true,
        commandType: "AddTrack",
        timelineId: nextTimeline.id,
        historyEntryId: null,
        changed: true,
        touchedClipIds: [],
        touchedTrackIds: [track.id],
        snapDeltaUs: null,
        trackId: track.id,
        index,
        nextTimeline,
        reversible: true,
        historyLabel: `Add ${track.kind} track`
      });
    }

    case "InsertClip": {
      const inserted = insertClipInternal(command, nextTimeline, context, {
        trackId: command.trackId,
        mediaItemId: command.mediaItemId,
        streamType: command.streamType,
        timelineStartUs: command.timelineStartUs,
        sourceInUs: command.sourceInUs,
        sourceOutUs: command.sourceOutUs,
        clipId: command.clipId ?? generateId(),
        privilegedOverride: command.privilegedOverride,
        snapToTargets: command.snapToTargets
      });

      if (isEditorCommandFailure(inserted)) {
        return inserted;
      }

      return buildSuccess({
        ok: true,
        commandType: "InsertClip",
        timelineId: nextTimeline.id,
        historyEntryId: null,
        changed: true,
        touchedClipIds: [inserted.clip.id],
        touchedTrackIds: [inserted.clip.trackId],
        snapDeltaUs: inserted.snapDeltaUs,
        clipId: inserted.clip.id,
        trackId: inserted.clip.trackId,
        timelineStartUs: inserted.clip.timelineStartUs,
        nextTimeline,
        reversible: true,
        historyLabel: `Insert ${inserted.clip.streamType} clip`
      });
    }

    case "InsertLinkedMedia": {
      const mediaItem = getMediaItemById(command, context, command.mediaItemId);

      if (isEditorCommandFailure(mediaItem)) {
        return mediaItem;
      }

      const mediaDurationUs = getMediaDurationUs(mediaItem);

      if (mediaDurationUs === null) {
        return fail(
          command,
          createError(
            "INVALID_SOURCE_RANGE",
            `${mediaItem.displayName} does not have a usable media duration yet.`
          )
        );
      }

      const sourceInUs = Math.max(0, Math.round(command.sourceInUs ?? 0));
      const sourceOutUs = Math.round(command.sourceOutUs ?? mediaDurationUs);

      if (sourceOutUs <= sourceInUs || sourceOutUs > mediaDurationUs) {
        return fail(
          command,
          createError("INVALID_SOURCE_RANGE", "Linked media source bounds are invalid.")
        );
      }

      const clipDurationUs = Math.max(0, sourceOutUs - sourceInUs);
      const snapResolution = resolveRangeSnap(
        nextTimeline,
        command.timelineStartUs,
        clipDurationUs,
        command.snapToTargets ?? true,
        new Set<string>()
      );
      let videoClipId: string | null = null;
      let audioClipId: string | null = null;
      const touchedTrackIds: string[] = [];
      const touchedClipIds: string[] = [];

      if (mediaItem.metadataSummary.hasVideo) {
        if (!command.videoTrackId) {
          return fail(
            command,
            createError("TRACK_NOT_FOUND", "A video track is required for linked video insert.")
          );
        }

        const insertedVideo = insertClipInternal(command, nextTimeline, context, {
          trackId: command.videoTrackId,
          mediaItemId: command.mediaItemId,
          streamType: "video",
          timelineStartUs: snapResolution.valueUs,
          sourceInUs,
          sourceOutUs,
          clipId: generateId(),
          privilegedOverride: command.privilegedOverride,
          snapToTargets: false
        });

        if (isEditorCommandFailure(insertedVideo)) {
          return insertedVideo;
        }

        videoClipId = insertedVideo.clip.id;
        touchedTrackIds.push(insertedVideo.clip.trackId);
        touchedClipIds.push(insertedVideo.clip.id);
      }

      if (mediaItem.metadataSummary.hasAudio) {
        if (!command.audioTrackId) {
          return fail(
            command,
            createError("TRACK_NOT_FOUND", "An audio track is required for linked audio insert.")
          );
        }

        const insertedAudio = insertClipInternal(command, nextTimeline, context, {
          trackId: command.audioTrackId,
          mediaItemId: command.mediaItemId,
          streamType: "audio",
          timelineStartUs: snapResolution.valueUs,
          sourceInUs,
          sourceOutUs,
          clipId: generateId(),
          privilegedOverride: command.privilegedOverride,
          snapToTargets: false
        });

        if (isEditorCommandFailure(insertedAudio)) {
          return insertedAudio;
        }

        audioClipId = insertedAudio.clip.id;
        touchedTrackIds.push(insertedAudio.clip.trackId);
        touchedClipIds.push(insertedAudio.clip.id);
      }

      if (!videoClipId && !audioClipId) {
        return fail(
          command,
          createError(
            "UNSUPPORTED_MEDIA_STREAM",
            `${mediaItem.displayName} does not have video or audio streams available for insertion.`
          )
        );
      }

      return buildSuccess({
        ok: true,
        commandType: "InsertLinkedMedia",
        timelineId: nextTimeline.id,
        historyEntryId: null,
        changed: true,
        touchedClipIds,
        touchedTrackIds,
        snapDeltaUs: snapResolution.snapDeltaUs,
        videoClipId,
        audioClipId,
        nextTimeline,
        reversible: true,
        historyLabel: "Insert linked media"
      });
    }

    case "SplitClip": {
      const clip = getClipById(command, nextTimeline, command.clipId);

      if (isEditorCommandFailure(clip)) {
        return clip;
      }

      const track = getTrackById(command, nextTimeline, clip.trackId);

      if (isEditorCommandFailure(track)) {
        return track;
      }

      const lockedError = assertTrackEditable(command, track, command.privilegedOverride);

      if (lockedError) {
        return lockedError;
      }

      const splitResolution = resolvePointSnap(
        nextTimeline,
        command.splitTimeUs,
        command.snapToTargets ?? true,
        new Set<string>([clip.id])
      );
      const splitTimeUs = splitResolution.valueUs;
      const clipEndUs = getTimelineClipEndUs(clip);

      if (splitTimeUs <= clip.timelineStartUs || splitTimeUs >= clipEndUs) {
        return fail(
          command,
          createError("INVALID_TIME_RANGE", "Split time must fall inside the clip bounds.")
        );
      }

      const sourceDeltaUs = Math.round((splitTimeUs - clip.timelineStartUs) * clip.speed);
      const rightClipId = command.rightClipId ?? generateId();
      const leftClip: TimelineClip = {
        ...clip,
        sourceOutUs: clip.sourceInUs + sourceDeltaUs
      };
      const rightClip: TimelineClip = {
        ...clip,
        id: rightClipId,
        sourceInUs: clip.sourceInUs + sourceDeltaUs,
        timelineStartUs: splitTimeUs
      };

      nextTimeline.clipsById[leftClip.id] = leftClip;
      nextTimeline.clipsById[rightClip.id] = rightClip;
      addClipToTrack(nextTimeline, track.id, rightClip.id);

      return buildSuccess({
        ok: true,
        commandType: "SplitClip",
        timelineId: nextTimeline.id,
        historyEntryId: null,
        changed: true,
        touchedClipIds: [leftClip.id, rightClip.id],
        touchedTrackIds: [track.id],
        snapDeltaUs: splitResolution.snapDeltaUs,
        leftClipId: leftClip.id,
        rightClipId: rightClip.id,
        splitTimeUs,
        nextTimeline,
        reversible: true,
        historyLabel: "Split clip"
      });
    }

    case "TrimClipStart": {
      const clip = getClipById(command, nextTimeline, command.clipId);

      if (isEditorCommandFailure(clip)) {
        return clip;
      }

      const track = getTrackById(command, nextTimeline, clip.trackId);

      if (isEditorCommandFailure(track)) {
        return track;
      }

      const lockedError = assertTrackEditable(command, track, command.privilegedOverride);

      if (lockedError) {
        return lockedError;
      }

      const snapResolution = resolvePointSnap(
        nextTimeline,
        command.newTimelineStartUs,
        command.snapToTargets ?? true,
        new Set<string>([clip.id])
      );
      const nextStartUs = snapResolution.valueUs;
      const oldEndUs = getTimelineClipEndUs(clip);

      if (nextStartUs < 0 || nextStartUs >= oldEndUs) {
        return fail(
          command,
          createError("INVALID_TIME_RANGE", "Trim start must remain before the clip end.")
        );
      }

      const sourceDeltaUs = Math.round((nextStartUs - clip.timelineStartUs) * clip.speed);
      const nextSourceInUs = clip.sourceInUs + sourceDeltaUs;

      if (nextSourceInUs < 0 || nextSourceInUs >= clip.sourceOutUs) {
        return fail(
          command,
          createError("INVALID_SOURCE_RANGE", "Trim start exceeds the available source range.")
        );
      }

      clip.timelineStartUs = nextStartUs;
      clip.sourceInUs = nextSourceInUs;

      const overlapError = validateTrackPlacement(
        command,
        nextTimeline,
        track.id,
        clip.timelineStartUs,
        getTimelineClipDurationUs(clip),
        new Set<string>([clip.id])
      );

      if (overlapError) {
        return overlapError;
      }

      return buildSuccess({
        ok: true,
        commandType: "TrimClipStart",
        timelineId: nextTimeline.id,
        historyEntryId: null,
        changed: true,
        touchedClipIds: [clip.id],
        touchedTrackIds: [track.id],
        snapDeltaUs: snapResolution.snapDeltaUs,
        clipId: clip.id,
        timelineStartUs: clip.timelineStartUs,
        timelineEndUs: getTimelineClipEndUs(clip),
        sourceInUs: clip.sourceInUs,
        sourceOutUs: clip.sourceOutUs,
        nextTimeline,
        reversible: true,
        historyLabel: "Trim clip start"
      });
    }

    case "TrimClipEnd": {
      const clip = getClipById(command, nextTimeline, command.clipId);

      if (isEditorCommandFailure(clip)) {
        return clip;
      }

      const track = getTrackById(command, nextTimeline, clip.trackId);

      if (isEditorCommandFailure(track)) {
        return track;
      }

      const lockedError = assertTrackEditable(command, track, command.privilegedOverride);

      if (lockedError) {
        return lockedError;
      }

      const snapResolution = resolvePointSnap(
        nextTimeline,
        command.newTimelineEndUs,
        command.snapToTargets ?? true,
        new Set<string>([clip.id])
      );
      const nextEndUs = snapResolution.valueUs;

      if (nextEndUs <= clip.timelineStartUs) {
        return fail(
          command,
          createError("INVALID_TIME_RANGE", "Trim end must remain after the clip start.")
        );
      }

      const timelineDeltaUs = getTimelineClipEndUs(clip) - nextEndUs;
      const sourceDeltaUs = Math.round(timelineDeltaUs * clip.speed);
      const nextSourceOutUs = clip.sourceOutUs - sourceDeltaUs;

      if (nextSourceOutUs <= clip.sourceInUs) {
        return fail(
          command,
          createError("INVALID_SOURCE_RANGE", "Trim end exceeds the available source range.")
        );
      }

      clip.sourceOutUs = nextSourceOutUs;

      const overlapError = validateTrackPlacement(
        command,
        nextTimeline,
        track.id,
        clip.timelineStartUs,
        getTimelineClipDurationUs(clip),
        new Set<string>([clip.id])
      );

      if (overlapError) {
        return overlapError;
      }

      return buildSuccess({
        ok: true,
        commandType: "TrimClipEnd",
        timelineId: nextTimeline.id,
        historyEntryId: null,
        changed: true,
        touchedClipIds: [clip.id],
        touchedTrackIds: [track.id],
        snapDeltaUs: snapResolution.snapDeltaUs,
        clipId: clip.id,
        timelineStartUs: clip.timelineStartUs,
        timelineEndUs: getTimelineClipEndUs(clip),
        sourceInUs: clip.sourceInUs,
        sourceOutUs: clip.sourceOutUs,
        nextTimeline,
        reversible: true,
        historyLabel: "Trim clip end"
      });
    }

    case "MoveClip": {
      const clip = getClipById(command, nextTimeline, command.clipId);

      if (isEditorCommandFailure(clip)) {
        return clip;
      }

      const sourceTrack = getTrackById(command, nextTimeline, clip.trackId);

      if (isEditorCommandFailure(sourceTrack)) {
        return sourceTrack;
      }

      const targetTrack = getTrackById(
        command,
        nextTimeline,
        command.targetTrackId ?? clip.trackId
      );

      if (isEditorCommandFailure(targetTrack)) {
        return targetTrack;
      }

      const sourceLockError = assertTrackEditable(
        command,
        sourceTrack,
        command.privilegedOverride
      );

      if (sourceLockError) {
        return sourceLockError;
      }

      const targetLockError = assertTrackEditable(
        command,
        targetTrack,
        command.privilegedOverride
      );

      if (targetLockError) {
        return targetLockError;
      }

      if (!trackSupportsStream(targetTrack, clip.streamType)) {
        return fail(
          command,
          createError(
            "TRACK_KIND_MISMATCH",
            `Track ${targetTrack.name} does not accept ${clip.streamType} clips.`
          )
        );
      }

      const snapResolution = resolveRangeSnap(
        nextTimeline,
        command.newTimelineStartUs,
        getTimelineClipDurationUs(clip),
        command.snapToTargets ?? true,
        new Set<string>([clip.id])
      );
      const nextStartUs = snapResolution.valueUs;
      const overlapError = validateTrackPlacement(
        command,
        nextTimeline,
        targetTrack.id,
        nextStartUs,
        getTimelineClipDurationUs(clip),
        new Set<string>([clip.id])
      );

      if (overlapError) {
        return overlapError;
      }

      if (sourceTrack.id !== targetTrack.id) {
        removeClipFromTrack(nextTimeline, sourceTrack.id, clip.id);
        clip.trackId = targetTrack.id;
        addClipToTrack(nextTimeline, targetTrack.id, clip.id);
      }

      clip.timelineStartUs = nextStartUs;
      sortTrackClipIds(nextTimeline, clip.trackId);

      return buildSuccess({
        ok: true,
        commandType: "MoveClip",
        timelineId: nextTimeline.id,
        historyEntryId: null,
        changed: true,
        touchedClipIds: [clip.id],
        touchedTrackIds:
          sourceTrack.id === targetTrack.id ? [targetTrack.id] : [sourceTrack.id, targetTrack.id],
        snapDeltaUs: snapResolution.snapDeltaUs,
        clipId: clip.id,
        trackId: clip.trackId,
        timelineStartUs: clip.timelineStartUs,
        nextTimeline,
        reversible: true,
        historyLabel: "Move clip"
      });
    }

    case "RippleDeleteClip": {
      const clip = getClipById(command, nextTimeline, command.clipId);

      if (isEditorCommandFailure(clip)) {
        return clip;
      }

      const track = getTrackById(command, nextTimeline, clip.trackId);

      if (isEditorCommandFailure(track)) {
        return track;
      }

      const lockedError = assertTrackEditable(command, track, command.privilegedOverride);

      if (lockedError) {
        return lockedError;
      }

      const shiftByUs = getTimelineClipDurationUs(clip);
      const shiftedClipIds: string[] = [];

      for (const candidate of getTrackClips(nextTimeline, track.id)) {
        if (candidate.timelineStartUs > clip.timelineStartUs) {
          candidate.timelineStartUs = Math.max(0, candidate.timelineStartUs - shiftByUs);
          shiftedClipIds.push(candidate.id);
        }
      }

      delete nextTimeline.clipsById[clip.id];
      removeClipFromTrack(nextTimeline, track.id, clip.id);

      return buildSuccess({
        ok: true,
        commandType: "RippleDeleteClip",
        timelineId: nextTimeline.id,
        historyEntryId: null,
        changed: true,
        touchedClipIds: shiftedClipIds,
        touchedTrackIds: [track.id],
        snapDeltaUs: null,
        deletedClipId: clip.id,
        shiftedClipIds,
        shiftByUs,
        nextTimeline,
        reversible: true,
        historyLabel: "Ripple delete clip"
      });
    }

    case "LockTrack": {
      const track = getTrackById(command, nextTimeline, command.trackId);

      if (isEditorCommandFailure(track)) {
        return track;
      }

      track.locked = true;

      return buildSuccess({
        ok: true,
        commandType: "LockTrack",
        timelineId: nextTimeline.id,
        historyEntryId: null,
        changed: true,
        touchedClipIds: [],
        touchedTrackIds: [track.id],
        snapDeltaUs: null,
        trackId: track.id,
        nextTimeline,
        reversible: true,
        historyLabel: "Lock track"
      });
    }

    case "UnlockTrack": {
      const track = getTrackById(command, nextTimeline, command.trackId);

      if (isEditorCommandFailure(track)) {
        return track;
      }

      track.locked = false;

      return buildSuccess({
        ok: true,
        commandType: "UnlockTrack",
        timelineId: nextTimeline.id,
        historyEntryId: null,
        changed: true,
        touchedClipIds: [],
        touchedTrackIds: [track.id],
        snapDeltaUs: null,
        trackId: track.id,
        nextTimeline,
        reversible: true,
        historyLabel: "Unlock track"
      });
    }

    case "AddMarker": {
      const snapResolution = resolvePointSnap(
        nextTimeline,
        command.positionUs,
        command.snapToTargets ?? false,
        new Set<string>()
      );
      const marker: TimelineMarker = {
        id: command.markerId ?? generateId(),
        positionUs: snapResolution.valueUs,
        label: command.label
      };

      nextTimeline.markers = [...nextTimeline.markers, marker].sort(
        (left, right) => left.positionUs - right.positionUs
      );

      return buildSuccess({
        ok: true,
        commandType: "AddMarker",
        timelineId: nextTimeline.id,
        historyEntryId: null,
        changed: true,
        touchedClipIds: [],
        touchedTrackIds: [],
        snapDeltaUs: snapResolution.snapDeltaUs,
        marker,
        nextTimeline,
        reversible: true,
        historyLabel: "Add marker"
      });
    }

    case "RemoveMarker": {
      const hasMarker = nextTimeline.markers.some((marker) => marker.id === command.markerId);

      if (!hasMarker) {
        return fail(
          command,
          createError("MARKER_NOT_FOUND", `Marker ${command.markerId} could not be found.`)
        );
      }

      nextTimeline.markers = nextTimeline.markers.filter(
        (marker) => marker.id !== command.markerId
      );

      return buildSuccess({
        ok: true,
        commandType: "RemoveMarker",
        timelineId: nextTimeline.id,
        historyEntryId: null,
        changed: true,
        touchedClipIds: [],
        touchedTrackIds: [],
        snapDeltaUs: null,
        markerId: command.markerId,
        nextTimeline,
        reversible: true,
        historyLabel: "Remove marker"
      });
    }

    case "SetPlayhead": {
      const snapResolution = resolvePointSnap(
        nextTimeline,
        command.positionUs,
        command.snapToTargets ?? false,
        new Set<string>()
      );

      nextTimeline.playheadUs = Math.max(0, snapResolution.valueUs);

      return buildSuccess({
        ok: true,
        commandType: "SetPlayhead",
        timelineId: nextTimeline.id,
        historyEntryId: null,
        changed: true,
        touchedClipIds: [],
        touchedTrackIds: [],
        snapDeltaUs: snapResolution.snapDeltaUs,
        playheadUs: nextTimeline.playheadUs,
        nextTimeline,
        reversible: false,
        historyLabel: null
      });
    }

    case "Undo":
    case "Redo":
      return fail(
        command,
        createError(
          "COMMAND_NOT_SUPPORTED",
          `${command.type} must be handled by the editor session service.`
        )
      );
  }
}

export function createTimelineMediaMap(mediaItems: MediaItem[]): Record<string, MediaItem> {
  return Object.fromEntries(mediaItems.map((item) => [item.id, item]));
}

export function getTimelineSnapToleranceUs(timeline: Timeline): number {
  return timeline.snapToleranceUs || DEFAULT_SNAP_TOLERANCE_US;
}
