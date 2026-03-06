import { describe, expect, test } from "vitest";

import {
  applyEditorCommand,
  createEmptyDerivedAssetSet,
  createEmptyMetadataSummary,
  createEmptyTimeline,
  type EditorCommandExecutionResult,
  type EditorCommandFailure,
  type EditorCommand,
  type EditorCommandExecutionSuccess,
  type MediaItem
} from "../src/index";

function createMediaItem(
  overrides: Partial<MediaItem> & Pick<MediaItem, "id" | "displayName">
): MediaItem {
  const { id, displayName, ...rest } = overrides;
  const sourcePath = `/tmp/${overrides.displayName}`;

  return {
    id,
    displayName,
    source: {
      sourceType: "import",
      originalPath: sourcePath,
      currentResolvedPath: sourcePath,
      normalizedOriginalPath: sourcePath,
      normalizedResolvedPath: sourcePath
    },
    importTimestamp: new Date().toISOString(),
    lastSeenTimestamp: new Date().toISOString(),
    fileSize: 10,
    fileModifiedTimeMs: 10,
    fingerprint: {
      strategy: "partial-sha256",
      quickHash: `${overrides.id}-hash`,
      fileSize: 10,
      modifiedTimeMs: 10,
      sampleSizeBytes: 10
    },
    sourceRevision: `${overrides.id}-rev`,
    metadataSummary: {
      ...createEmptyMetadataSummary(),
      kind: "video",
      durationMs: 10_000,
      hasVideo: true,
      hasAudio: true,
      container: "mp4"
    },
    streams: [],
    ingestStatus: "ready",
    relinkStatus: "linked",
    errorState: null,
    derivedAssets: createEmptyDerivedAssetSet(),
    ...rest
  };
}

function unwrapSuccess<Type extends EditorCommandExecutionSuccess["commandType"]>(
  result: EditorCommandExecutionResult,
  commandType: Type
): Extract<EditorCommandExecutionSuccess, { commandType: Type }> {
  expect(result.ok).toBe(true);
  expect(result.commandType).toBe(commandType);
  return result as Extract<EditorCommandExecutionSuccess, { commandType: Type }>;
}

function execute(
  timeline: ReturnType<typeof createEmptyTimeline>,
  command: EditorCommand,
  mediaItems: MediaItem[]
): EditorCommandExecutionResult {
  return (
    applyEditorCommand(timeline, command, {
      mediaItemsById: Object.fromEntries(mediaItems.map((item) => [item.id, item]))
    })
  );
}

function unwrapFailure(result: EditorCommandExecutionResult): EditorCommandFailure {
  expect(result.ok).toBe(false);
  return result as EditorCommandFailure;
}

describe("timeline engine", () => {
  test("creates a timeline, inserts linked media, and blocks same-track overlap", () => {
    const mediaItem = createMediaItem({
      id: "media-1",
      displayName: "talking-head.mp4"
    });
    const emptyTimeline = createEmptyTimeline("timeline-1");
    const created = unwrapSuccess(
      execute(emptyTimeline, { type: "CreateTimeline", timelineId: "timeline-1" }, [mediaItem]),
      "CreateTimeline"
    );
    const videoTrackId = created.createdTrackIds[0];
    const audioTrackId = created.createdTrackIds[1];
    const inserted = unwrapSuccess(execute(
      created.nextTimeline,
      {
        type: "InsertLinkedMedia",
        timelineId: "timeline-1",
        mediaItemId: mediaItem.id,
        videoTrackId,
        audioTrackId,
        timelineStartUs: 0
      },
      [mediaItem]
    ), "InsertLinkedMedia");

    expect(inserted.videoClipId).toBeTruthy();
    expect(inserted.audioClipId).toBeTruthy();
    expect(Object.keys(inserted.nextTimeline.clipsById)).toHaveLength(2);

    const overlap = applyEditorCommand(
      inserted.nextTimeline,
      {
        type: "InsertClip",
        timelineId: "timeline-1",
        trackId: videoTrackId,
        mediaItemId: mediaItem.id,
        streamType: "video",
        timelineStartUs: 1_000_000
      },
      {
        mediaItemsById: {
          [mediaItem.id]: mediaItem
        }
      }
    );

    expect(unwrapFailure(overlap).error.code).toBe("CLIP_OVERLAP");
  });

  test("splits, trims, and moves a clip across tracks", () => {
    const mediaItem = createMediaItem({
      id: "media-2",
      displayName: "lesson.mp4"
    });
    const created = unwrapSuccess(execute(createEmptyTimeline("timeline-2"), {
      type: "CreateTimeline",
      timelineId: "timeline-2"
    }, [mediaItem]), "CreateTimeline");
    const videoTrackId = created.createdTrackIds[0];
    const inserted = unwrapSuccess(execute(
      created.nextTimeline,
      {
        type: "InsertClip",
        timelineId: "timeline-2",
        trackId: videoTrackId,
        mediaItemId: mediaItem.id,
        streamType: "video",
        timelineStartUs: 0
      },
      [mediaItem]
    ), "InsertClip");
    const split = unwrapSuccess(execute(
      inserted.nextTimeline,
      {
        type: "SplitClip",
        timelineId: "timeline-2",
        clipId: inserted.clipId,
        splitTimeUs: 4_000_000
      },
      [mediaItem]
    ), "SplitClip");
    const trimmedLeft = unwrapSuccess(execute(
      split.nextTimeline,
      {
        type: "TrimClipStart",
        timelineId: "timeline-2",
        clipId: split.leftClipId,
        newTimelineStartUs: 1_000_000
      },
      [mediaItem]
    ), "TrimClipStart");
    const secondTrack = unwrapSuccess(execute(
      trimmedLeft.nextTimeline,
      {
        type: "AddTrack",
        timelineId: "timeline-2",
        trackKind: "video"
      },
      [mediaItem]
    ), "AddTrack");
    const moved = unwrapSuccess(execute(
      secondTrack.nextTimeline,
      {
        type: "MoveClip",
        timelineId: "timeline-2",
        clipId: split.rightClipId,
        targetTrackId: secondTrack.trackId,
        newTimelineStartUs: 5_000_000
      },
      [mediaItem]
    ), "MoveClip");
    const movedClip = moved.nextTimeline.clipsById[split.rightClipId];

    expect(trimmedLeft.timelineStartUs).toBe(1_000_000);
    expect(movedClip?.trackId).toBe(secondTrack.trackId);
    expect(movedClip?.timelineStartUs).toBe(5_000_000);
  });

  test("ripple delete closes the gap on the same track", () => {
    const mediaItem = createMediaItem({
      id: "media-3",
      displayName: "monologue.mp4"
    });
    const created = unwrapSuccess(execute(createEmptyTimeline("timeline-3"), {
      type: "CreateTimeline",
      timelineId: "timeline-3"
    }, [mediaItem]), "CreateTimeline");
    const videoTrackId = created.createdTrackIds[0];
    const first = unwrapSuccess(execute(
      created.nextTimeline,
      {
        type: "InsertClip",
        timelineId: "timeline-3",
        trackId: videoTrackId,
        mediaItemId: mediaItem.id,
        streamType: "video",
        timelineStartUs: 0,
        sourceOutUs: 2_000_000
      },
      [mediaItem]
    ), "InsertClip");
    const second = unwrapSuccess(execute(
      first.nextTimeline,
      {
        type: "InsertClip",
        timelineId: "timeline-3",
        trackId: videoTrackId,
        mediaItemId: mediaItem.id,
        streamType: "video",
        timelineStartUs: 3_000_000,
        sourceOutUs: 5_000_000
      },
      [mediaItem]
    ), "InsertClip");
    const deleted = unwrapSuccess(execute(
      second.nextTimeline,
      {
        type: "RippleDeleteClip",
        timelineId: "timeline-3",
        clipId: first.clipId
      },
      [mediaItem]
    ), "RippleDeleteClip");
    const shiftedClip = deleted.nextTimeline.clipsById[second.clipId];

    expect(deleted.shiftByUs).toBe(2_000_000);
    expect(shiftedClip?.timelineStartUs).toBe(1_000_000);
  });

  test("snaps inserts to the playhead and markers", () => {
    const mediaItem = createMediaItem({
      id: "media-4",
      displayName: "podcast.mp4"
    });
    const created = unwrapSuccess(execute(createEmptyTimeline("timeline-4"), {
      type: "CreateTimeline",
      timelineId: "timeline-4"
    }, [mediaItem]), "CreateTimeline");
    const marker = unwrapSuccess(execute(
      created.nextTimeline,
      {
        type: "AddMarker",
        timelineId: "timeline-4",
        positionUs: 2_000_000,
        label: "Chapter"
      },
      [mediaItem]
    ), "AddMarker");
    const playhead = unwrapSuccess(execute(
      marker.nextTimeline,
      {
        type: "SetPlayhead",
        timelineId: "timeline-4",
        positionUs: 6_000_000
      },
      [mediaItem]
    ), "SetPlayhead");
    const inserted = unwrapSuccess(execute(
      playhead.nextTimeline,
      {
        type: "InsertClip",
        timelineId: "timeline-4",
        trackId: created.createdTrackIds[0],
        mediaItemId: mediaItem.id,
        streamType: "video",
        timelineStartUs: 2_040_000
      },
      [mediaItem]
    ), "InsertClip");
    const moved = unwrapSuccess(execute(
      inserted.nextTimeline,
      {
        type: "MoveClip",
        timelineId: "timeline-4",
        clipId: inserted.clipId,
        newTimelineStartUs: 5_960_000
      },
      [mediaItem]
    ), "MoveClip");

    expect(inserted.timelineStartUs).toBe(2_000_000);
    expect(moved.timelineStartUs).toBe(6_000_000);
  });

  test("rejects edits on locked tracks", () => {
    const mediaItem = createMediaItem({
      id: "media-5",
      displayName: "voiceover.wav",
      metadataSummary: {
        ...createEmptyMetadataSummary(),
        kind: "audio",
        durationMs: 10_000,
        hasVideo: false,
        hasAudio: true,
        container: "wav"
      }
    });
    const created = unwrapSuccess(execute(createEmptyTimeline("timeline-5"), {
      type: "CreateTimeline",
      timelineId: "timeline-5"
    }, [mediaItem]), "CreateTimeline");
    const locked = unwrapSuccess(execute(
      created.nextTimeline,
      {
        type: "LockTrack",
        timelineId: "timeline-5",
        trackId: created.createdTrackIds[1]
      },
      [mediaItem]
    ), "LockTrack");
    const blocked = applyEditorCommand(
      locked.nextTimeline,
      {
        type: "InsertClip",
        timelineId: "timeline-5",
        trackId: created.createdTrackIds[1],
        mediaItemId: mediaItem.id,
        streamType: "audio",
        timelineStartUs: 0
      },
      {
        mediaItemsById: {
          [mediaItem.id]: mediaItem
        }
      }
    );

    expect(unwrapFailure(blocked).error.code).toBe("TRACK_LOCKED");
  });
});
