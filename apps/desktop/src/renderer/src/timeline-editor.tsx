import {
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
  type MouseEvent as ReactMouseEvent
} from "react";

import type {
  ExecuteEditorCommandResult,
  EditorSessionSnapshot
} from "@clawcut/ipc";
import type { EditorCommand, MediaItem } from "@clawcut/domain";
import {
  getTimelineClipDurationUs,
  getTimelineClipEndUs,
  getTimelineEndUs,
  type TimelineClip,
  type TimelineTrack
} from "@clawcut/domain";

interface TimelineEditorProps {
  snapshot: EditorSessionSnapshot | null;
  selectedMediaItem: MediaItem | null;
  onExecuteCommand: (
    command: EditorCommand,
    message: string
  ) => Promise<ExecuteEditorCommandResult | null>;
}

interface MoveInteraction {
  kind: "move";
  clipId: string;
  pointerStartX: number;
  originalTrackId: string;
  originalStartUs: number;
  previewStartUs: number;
}

interface TrimInteraction {
  kind: "trim-start" | "trim-end";
  clipId: string;
  pointerStartX: number;
  originalStartUs: number;
  originalEndUs: number;
  previewStartUs: number;
  previewEndUs: number;
}

type InteractionState = MoveInteraction | TrimInteraction;

const PIXELS_PER_SECOND = 132;

function formatTimelineTime(valueUs: number): string {
  const totalSeconds = Math.max(0, Math.floor(valueUs / 1_000_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const milliseconds = Math.floor((valueUs % 1_000_000) / 1_000);

  return `${minutes}:${seconds.toString().padStart(2, "0")}.${Math.floor(milliseconds / 100)}`;
}

function findTrack(
  snapshot: EditorSessionSnapshot,
  trackId: string | null
): TimelineTrack | null {
  if (!trackId) {
    return null;
  }

  return snapshot.timeline.tracksById[trackId] ?? null;
}

function findPreferredTrack(
  snapshot: EditorSessionSnapshot,
  kind: TimelineTrack["kind"],
  preferredTrackId: string | null
): TimelineTrack | null {
  const preferredTrack = findTrack(snapshot, preferredTrackId);

  if (preferredTrack && preferredTrack.kind === kind && !preferredTrack.locked) {
    return preferredTrack;
  }

  for (const trackId of snapshot.timeline.trackOrder) {
    const track = snapshot.timeline.tracksById[trackId];

    if (track?.kind === kind && !track.locked) {
      return track;
    }
  }

  return null;
}

function createRulerMarks(durationUs: number): number[] {
  const secondCount = Math.max(8, Math.ceil(durationUs / 1_000_000) + 2);
  return Array.from({ length: secondCount }, (_value, index) => index * 1_000_000);
}

function timelineScalePxPerUs(zoom: number): number {
  return (PIXELS_PER_SECOND * zoom) / 1_000_000;
}

function trackLabel(track: TimelineTrack): string {
  return `${track.name} · ${track.kind}`;
}

function clipLabel(clip: TimelineClip, mediaItem: MediaItem | null): string {
  return mediaItem?.displayName ?? clip.mediaItemId;
}

export function TimelineEditor({
  snapshot,
  selectedMediaItem,
  onExecuteCommand
}: TimelineEditorProps) {
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [editorMessage, setEditorMessage] = useState<string | null>(null);
  const [interaction, setInteraction] = useState<InteractionState | null>(null);
  const pixelsPerUs = snapshot ? timelineScalePxPerUs(snapshot.timeline.zoom) : 0;
  const timelineDurationUs = snapshot
    ? Math.max(getTimelineEndUs(snapshot.timeline) + 2_000_000, 12_000_000)
    : 12_000_000;
  const timelineWidth = useMemo(() => {
    return Math.max(720, Math.round(timelineDurationUs * Math.max(pixelsPerUs, 0.00012)) + 96);
  }, [pixelsPerUs, timelineDurationUs]);

  useEffect(() => {
    if (!snapshot) {
      setSelectedTrackId(null);
      setSelectedClipId(null);
      return;
    }

    if (selectedTrackId && snapshot.timeline.tracksById[selectedTrackId]) {
      return;
    }

    setSelectedTrackId(snapshot.timeline.trackOrder[0] ?? null);
  }, [selectedTrackId, snapshot]);

  useEffect(() => {
    if (!snapshot) {
      return;
    }

    if (selectedClipId && snapshot.timeline.clipsById[selectedClipId]) {
      return;
    }

    setSelectedClipId(null);
  }, [selectedClipId, snapshot]);

  const runCommand = useEffectEvent(async (
    command: EditorCommand,
    message: string
  ): Promise<ExecuteEditorCommandResult | null> => {
    const response = await onExecuteCommand(command, message);

    if (!response) {
      return null;
    }

    if (!response.result.ok) {
      setEditorMessage(response.result.error.message);
      return response;
    }

    switch (response.result.commandType) {
      case "CreateTimeline":
        setSelectedTrackId(response.result.createdTrackIds[0] ?? null);
        setSelectedClipId(null);
        setEditorMessage("Timeline initialized with default video and audio tracks.");
        break;
      case "AddTrack":
        setSelectedTrackId(response.result.trackId);
        setEditorMessage("Track added.");
        break;
      case "InsertClip":
        setSelectedTrackId(response.result.trackId);
        setSelectedClipId(response.result.clipId);
        setEditorMessage("Clip inserted.");
        break;
      case "InsertLinkedMedia":
        setSelectedClipId(response.result.videoClipId ?? response.result.audioClipId);
        setEditorMessage("Linked media inserted onto the timeline.");
        break;
      case "SplitClip":
        setSelectedClipId(response.result.rightClipId);
        setEditorMessage("Clip split.");
        break;
      case "MoveClip":
      case "TrimClipStart":
      case "TrimClipEnd":
        setSelectedClipId(response.result.clipId);
        setEditorMessage("Clip updated.");
        break;
      case "RippleDeleteClip":
        setSelectedClipId(null);
        setEditorMessage("Clip removed with ripple.");
        break;
      case "LockTrack":
      case "UnlockTrack":
        setSelectedTrackId(response.result.trackId);
        setEditorMessage(
          response.result.commandType === "LockTrack" ? "Track locked." : "Track unlocked."
        );
        break;
      case "Undo":
      case "Redo":
        setEditorMessage(
          response.result.restoredCommandType
            ? `${response.result.commandType} restored ${response.result.restoredCommandType}.`
            : `${response.result.commandType} completed.`
        );
        break;
      case "AddMarker":
        setEditorMessage("Marker added.");
        break;
      case "RemoveMarker":
        setEditorMessage("Marker removed.");
        break;
      case "SetPlayhead":
        setEditorMessage(`Playhead set to ${formatTimelineTime(response.result.playheadUs)}.`);
        break;
    }

    return response;
  });

  useEffect(() => {
    if (!interaction || !snapshot || pixelsPerUs <= 0) {
      return;
    }

    const activeInteraction = interaction;
    const activeSnapshot = snapshot;

    function handleMouseMove(event: MouseEvent): void {
      const deltaX = event.clientX - activeInteraction.pointerStartX;
      const deltaUs = Math.round(deltaX / pixelsPerUs);

      setInteraction((current) => {
        if (
          !current ||
          current.clipId !== activeInteraction.clipId ||
          current.kind !== activeInteraction.kind
        ) {
          return current;
        }

        if (current.kind === "move") {
          return {
            ...current,
            previewStartUs: Math.max(0, current.originalStartUs + deltaUs)
          };
        }

        if (current.kind === "trim-start") {
          return {
            ...current,
            previewStartUs: Math.max(
              0,
              Math.min(current.originalEndUs - 1_000, current.originalStartUs + deltaUs)
            )
          };
        }

        return {
          ...current,
          previewEndUs: Math.max(current.originalStartUs + 1_000, current.originalEndUs + deltaUs)
        };
      });
    }

    function handleMouseUp(): void {
      const currentInteraction = activeInteraction;
      setInteraction(null);

      if (currentInteraction.kind === "move") {
        void runCommand(
          {
            type: "MoveClip",
            timelineId: activeSnapshot.timeline.id,
            clipId: currentInteraction.clipId,
            targetTrackId: selectedTrackId ?? undefined,
            newTimelineStartUs: currentInteraction.previewStartUs
          },
          "Moving clip…"
        );
        return;
      }

      if (currentInteraction.kind === "trim-start") {
        void runCommand(
          {
            type: "TrimClipStart",
            timelineId: activeSnapshot.timeline.id,
            clipId: currentInteraction.clipId,
            newTimelineStartUs: currentInteraction.previewStartUs
          },
          "Trimming clip start…"
        );
        return;
      }

      void runCommand(
        {
          type: "TrimClipEnd",
          timelineId: activeSnapshot.timeline.id,
          clipId: currentInteraction.clipId,
          newTimelineEndUs: currentInteraction.previewEndUs
        },
        "Trimming clip end…"
      );
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [interaction, pixelsPerUs, runCommand, selectedTrackId, snapshot]);

  function handleRulerClick(event: ReactMouseEvent<HTMLDivElement>): void {
    if (!snapshot || pixelsPerUs <= 0) {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const positionUs = Math.max(0, Math.round((event.clientX - bounds.left) / pixelsPerUs));

    void runCommand(
      {
        type: "SetPlayhead",
        timelineId: snapshot.timeline.id,
        positionUs
      },
      "Moving playhead…"
    );
  }

  function handleCreateTimeline(): void {
    if (!snapshot) {
      return;
    }

    void runCommand(
      {
        type: "CreateTimeline",
        timelineId: snapshot.timeline.id
      },
      "Creating timeline…"
    );
  }

  function handleAddTrack(kind: TimelineTrack["kind"]): void {
    if (!snapshot) {
      return;
    }

    void runCommand(
      {
        type: "AddTrack",
        timelineId: snapshot.timeline.id,
        trackKind: kind
      },
      `Adding ${kind} track…`
    );
  }

  function handleInsertSelected(mode: "linked" | "video" | "audio"): void {
    if (!snapshot || !selectedMediaItem) {
      return;
    }

    if (mode === "linked") {
      const preferredVideoTrack = findPreferredTrack(snapshot, "video", selectedTrackId);
      const preferredAudioTrack = findPreferredTrack(snapshot, "audio", selectedTrackId);

      void runCommand(
        {
          type: "InsertLinkedMedia",
          timelineId: snapshot.timeline.id,
          mediaItemId: selectedMediaItem.id,
          videoTrackId: preferredVideoTrack?.id ?? null,
          audioTrackId: preferredAudioTrack?.id ?? null,
          timelineStartUs: snapshot.timeline.playheadUs
        },
        "Inserting linked media…"
      );
      return;
    }

    const targetTrack = findPreferredTrack(snapshot, mode, selectedTrackId);

    if (!targetTrack) {
      setEditorMessage(`No unlocked ${mode} track is available for insertion.`);
      return;
    }

    void runCommand(
      {
        type: "InsertClip",
        timelineId: snapshot.timeline.id,
        trackId: targetTrack.id,
        mediaItemId: selectedMediaItem.id,
        streamType: mode,
        timelineStartUs: snapshot.timeline.playheadUs
      },
      `Inserting ${mode} clip…`
    );
  }

  function handleSplitAtPlayhead(): void {
    if (!snapshot || !selectedClipId) {
      return;
    }

    void runCommand(
      {
        type: "SplitClip",
        timelineId: snapshot.timeline.id,
        clipId: selectedClipId,
        splitTimeUs: snapshot.timeline.playheadUs
      },
      "Splitting clip…"
    );
  }

  function handleRippleDelete(): void {
    if (!snapshot || !selectedClipId) {
      return;
    }

    void runCommand(
      {
        type: "RippleDeleteClip",
        timelineId: snapshot.timeline.id,
        clipId: selectedClipId
      },
      "Ripple deleting clip…"
    );
  }

  function handleToggleTrackLock(track: TimelineTrack): void {
    if (!snapshot) {
      return;
    }

    void runCommand(
      {
        type: track.locked ? "UnlockTrack" : "LockTrack",
        timelineId: snapshot.timeline.id,
        trackId: track.id
      },
      track.locked ? "Unlocking track…" : "Locking track…"
    );
  }

  function startMove(event: ReactMouseEvent<HTMLButtonElement>, clip: TimelineClip): void {
    event.preventDefault();
    event.stopPropagation();
    setSelectedTrackId(clip.trackId);
    setSelectedClipId(clip.id);
    setInteraction({
      kind: "move",
      clipId: clip.id,
      pointerStartX: event.clientX,
      originalTrackId: clip.trackId,
      originalStartUs: clip.timelineStartUs,
      previewStartUs: clip.timelineStartUs
    });
  }

  function startTrim(
    event: ReactMouseEvent<HTMLButtonElement>,
    clip: TimelineClip,
    kind: TrimInteraction["kind"]
  ): void {
    event.preventDefault();
    event.stopPropagation();
    setSelectedTrackId(clip.trackId);
    setSelectedClipId(clip.id);
    setInteraction({
      kind,
      clipId: clip.id,
      pointerStartX: event.clientX,
      originalStartUs: clip.timelineStartUs,
      originalEndUs: getTimelineClipEndUs(clip),
      previewStartUs: clip.timelineStartUs,
      previewEndUs: getTimelineClipEndUs(clip)
    });
  }

  function getDraftBounds(clip: TimelineClip): {
    startUs: number;
    endUs: number;
    activeTrackId: string;
  } {
    if (!interaction || interaction.clipId !== clip.id) {
      return {
        startUs: clip.timelineStartUs,
        endUs: getTimelineClipEndUs(clip),
        activeTrackId: clip.trackId
      };
    }

    if (interaction.kind === "move") {
      return {
        startUs: interaction.previewStartUs,
        endUs: interaction.previewStartUs + getTimelineClipDurationUs(clip),
        activeTrackId: selectedTrackId ?? interaction.originalTrackId
      };
    }

    return {
      startUs: interaction.previewStartUs,
      endUs: interaction.previewEndUs,
      activeTrackId: clip.trackId
    };
  }

  if (!snapshot) {
    return (
      <section className="editor-panel" data-testid="timeline-editor">
        <div className="empty-panel">
          <strong>No timeline session yet.</strong>
          <p>Open or create a project first. Stage 3 editing commands are available as soon as a workspace is loaded.</p>
        </div>
      </section>
    );
  }

  const selectedTrack = findTrack(snapshot, selectedTrackId);
  const selectedClip = selectedClipId ? snapshot.timeline.clipsById[selectedClipId] ?? null : null;
  const selectedClipMedia = selectedClip
    ? snapshot.libraryItems.find((item) => item.id === selectedClip.mediaItemId) ?? null
    : null;
  const rulerMarks = createRulerMarks(timelineDurationUs);

  return (
    <section className="editor-panel" data-testid="timeline-editor">
      <header className="panel-header">
        <div>
          <p className="eyebrow eyebrow--muted">Timeline editor</p>
          <h2>Command-driven Stage 3 editing core</h2>
        </div>
        <div className="button-row button-row--tight">
          <button
            className="secondary-button"
            data-testid="undo-button"
            disabled={!snapshot.history.canUndo}
            onClick={() =>
              void runCommand(
                {
                  type: "Undo",
                  timelineId: snapshot.timeline.id
                },
                "Undoing command…"
              )
            }
            type="button"
          >
            Undo
          </button>
          <button
            className="secondary-button"
            data-testid="redo-button"
            disabled={!snapshot.history.canRedo}
            onClick={() =>
              void runCommand(
                {
                  type: "Redo",
                  timelineId: snapshot.timeline.id
                },
                "Redoing command…"
              )
            }
            type="button"
          >
            Redo
          </button>
        </div>
      </header>

      <div className="editor-toolbar">
        <div className="editor-toolbar__group">
          <span className="meta-label">Playhead</span>
          <strong data-testid="timeline-playhead">{formatTimelineTime(snapshot.timeline.playheadUs)}</strong>
        </div>
        <div className="editor-toolbar__group">
          <span className="meta-label">History</span>
          <strong>
            {snapshot.history.undoDepth} undo / {snapshot.history.redoDepth} redo
          </strong>
        </div>
        {editorMessage ? (
          <div className="editor-toolbar__message" data-testid="timeline-feedback">
            {editorMessage}
          </div>
        ) : null}
      </div>

      {snapshot.timeline.trackOrder.length === 0 ? (
        <div className="empty-panel empty-panel--editor">
          <strong>No timeline created yet.</strong>
          <p>Create the initial V1/A1 track set, then start inserting imported media through typed commands.</p>
          <button
            className="primary-button"
            data-testid="create-timeline-button"
            onClick={handleCreateTimeline}
            type="button"
          >
            Create timeline
          </button>
        </div>
      ) : (
        <>
          <div className="editor-actions">
            <div className="button-row">
              <button className="secondary-button" onClick={() => handleAddTrack("video")} type="button">
                Add video track
              </button>
              <button className="secondary-button" onClick={() => handleAddTrack("audio")} type="button">
                Add audio track
              </button>
            </div>
            <div className="button-row">
              <button
                className="primary-button"
                data-testid="insert-linked-button"
                disabled={!selectedMediaItem}
                onClick={() => handleInsertSelected("linked")}
                type="button"
              >
                Insert linked at playhead
              </button>
              <button
                className="secondary-button"
                disabled={!selectedMediaItem || selectedTrack?.kind !== "video"}
                onClick={() => handleInsertSelected("video")}
                type="button"
              >
                Insert video
              </button>
              <button
                className="secondary-button"
                disabled={!selectedMediaItem || selectedTrack?.kind !== "audio"}
                onClick={() => handleInsertSelected("audio")}
                type="button"
              >
                Insert audio
              </button>
            </div>
            <div className="button-row">
              <button
                className="secondary-button"
                data-testid="split-clip-button"
                disabled={!selectedClip}
                onClick={handleSplitAtPlayhead}
                type="button"
              >
                Split at playhead
              </button>
              <button
                className="secondary-button"
                data-testid="ripple-delete-button"
                disabled={!selectedClip}
                onClick={handleRippleDelete}
                type="button"
              >
                Ripple delete
              </button>
              {selectedTrack ? (
                <button
                  className="secondary-button"
                  onClick={() => handleToggleTrackLock(selectedTrack)}
                  type="button"
                >
                  {selectedTrack.locked ? "Unlock track" : "Lock track"}
                </button>
              ) : null}
            </div>
          </div>

          <div
            className="timeline-shell"
            data-testid="timeline-ruler"
            onClick={handleRulerClick}
            role="presentation"
          >
            <div className="timeline-ruler" style={{ width: `${timelineWidth}px` }}>
              {rulerMarks.map((markUs) => (
                <div
                  className="timeline-ruler__mark"
                  key={`mark-${markUs}`}
                  style={{ left: `${markUs * pixelsPerUs}px` }}
                >
                  <span>{formatTimelineTime(markUs)}</span>
                </div>
              ))}
              <div
                className="timeline-playhead"
                style={{ left: `${snapshot.timeline.playheadUs * pixelsPerUs}px` }}
              />
            </div>

            <div className="timeline-tracks" style={{ width: `${timelineWidth}px` }}>
              {snapshot.timeline.trackOrder.map((trackId) => {
                const track = snapshot.timeline.tracksById[trackId];
                const clips = track.clipIds
                  .map((clipId) => snapshot.timeline.clipsById[clipId])
                  .filter((clip): clip is TimelineClip => Boolean(clip));

                return (
                  <section
                    className={
                      selectedTrackId === track.id
                        ? "timeline-track timeline-track--selected"
                        : "timeline-track"
                    }
                    data-testid={`timeline-track-${track.id}`}
                    key={track.id}
                  >
                    <button
                      className="timeline-track__header"
                      onClick={() => setSelectedTrackId(track.id)}
                      type="button"
                    >
                      <div>
                        <strong>{trackLabel(track)}</strong>
                        <span>{track.locked ? "Locked" : "Editable"}</span>
                      </div>
                    </button>

                    <div className="timeline-track__lane" onClick={() => setSelectedTrackId(track.id)} role="presentation">
                      {clips.map((clip) => {
                        const mediaItem =
                          snapshot.libraryItems.find((item) => item.id === clip.mediaItemId) ?? null;
                        const bounds = getDraftBounds(clip);
                        const width = Math.max(
                          48,
                          Math.round((bounds.endUs - bounds.startUs) * pixelsPerUs)
                        );

                        return (
                          <div
                            className={
                              selectedClipId === clip.id
                                ? "timeline-clip timeline-clip--selected"
                                : "timeline-clip"
                            }
                            data-testid={`timeline-clip-${clip.id}`}
                            key={clip.id}
                            style={{
                              left: `${Math.max(0, bounds.startUs * pixelsPerUs)}px`,
                              width: `${width}px`,
                              opacity: bounds.activeTrackId === track.id ? 1 : 0.35,
                              visibility: bounds.activeTrackId === track.id ? "visible" : "hidden"
                            }}
                          >
                            <button
                              className="timeline-clip__trim timeline-clip__trim--start"
                              onMouseDown={(event) => startTrim(event, clip, "trim-start")}
                              type="button"
                            >
                              <span className="sr-only">Trim clip start</span>
                            </button>
                            <button
                              className="timeline-clip__body"
                              onClick={() => {
                                setSelectedClipId(clip.id);
                                setSelectedTrackId(track.id);
                              }}
                              onMouseDown={(event) => startMove(event, clip)}
                              type="button"
                            >
                              <strong>{clipLabel(clip, mediaItem)}</strong>
                              <span>{formatTimelineTime(getTimelineClipDurationUs(clip))}</span>
                            </button>
                            <button
                              className="timeline-clip__trim timeline-clip__trim--end"
                              onMouseDown={(event) => startTrim(event, clip, "trim-end")}
                              type="button"
                            >
                              <span className="sr-only">Trim clip end</span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>

          <div className="editor-selection">
            <div>
              <span className="meta-label">Selected track</span>
              <strong>{selectedTrack ? trackLabel(selectedTrack) : "None"}</strong>
            </div>
            <div>
              <span className="meta-label">Selected clip</span>
              <strong>{selectedClip ? clipLabel(selectedClip, selectedClipMedia) : "None"}</strong>
            </div>
            <div>
              <span className="meta-label">Insert source</span>
              <strong>{selectedMediaItem?.displayName ?? "Choose a library item"}</strong>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
