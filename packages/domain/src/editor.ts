import type { MediaItem } from "./media";
import type {
  Timeline,
  TimelineClip,
  TimelineMarker,
  TimelineRegion,
  TimelineStreamType,
  TimelineTrackKind
} from "./timeline";

export type EditorCommandType =
  | "CreateTimeline"
  | "AddTrack"
  | "InsertClip"
  | "InsertLinkedMedia"
  | "SplitClip"
  | "TrimClipStart"
  | "TrimClipEnd"
  | "MoveClip"
  | "RippleDeleteClip"
  | "RippleDeleteRange"
  | "LockTrack"
  | "UnlockTrack"
  | "AddMarker"
  | "RemoveMarker"
  | "AddRegion"
  | "SetPlayhead"
  | "Undo"
  | "Redo";

export type EditorCommandErrorCode =
  | "TIMELINE_NOT_FOUND"
  | "TIMELINE_ALREADY_INITIALIZED"
  | "TRACK_NOT_FOUND"
  | "CLIP_NOT_FOUND"
  | "MARKER_NOT_FOUND"
  | "REGION_NOT_FOUND"
  | "MEDIA_ITEM_NOT_FOUND"
  | "TRACK_KIND_MISMATCH"
  | "TRACK_LOCKED"
  | "CLIP_OVERLAP"
  | "INVALID_TIME_RANGE"
  | "INVALID_SOURCE_RANGE"
  | "UNSUPPORTED_MEDIA_STREAM"
  | "NOTHING_TO_UNDO"
  | "NOTHING_TO_REDO"
  | "COMMAND_NOT_SUPPORTED";

export interface EditorCommandError {
  code: EditorCommandErrorCode;
  message: string;
  details?: string;
}

interface TimelineCommandBase {
  timelineId: string;
}

interface EditableTimelineCommand extends TimelineCommandBase {
  privilegedOverride?: boolean;
}

interface SnapCommand {
  snapToTargets?: boolean;
}

export interface CreateTimelineCommand extends TimelineCommandBase {
  type: "CreateTimeline";
}

export interface AddTrackCommand extends TimelineCommandBase {
  type: "AddTrack";
  trackKind: TimelineTrackKind;
  name?: string;
  index?: number;
}

export interface InsertClipCommand extends EditableTimelineCommand, SnapCommand {
  type: "InsertClip";
  trackId: string;
  mediaItemId: string;
  streamType: TimelineStreamType;
  timelineStartUs: number;
  sourceInUs?: number;
  sourceOutUs?: number;
  clipId?: string;
}

export interface InsertLinkedMediaCommand extends EditableTimelineCommand, SnapCommand {
  type: "InsertLinkedMedia";
  mediaItemId: string;
  videoTrackId?: string | null;
  audioTrackId?: string | null;
  timelineStartUs: number;
  sourceInUs?: number;
  sourceOutUs?: number;
}

export interface SplitClipCommand extends EditableTimelineCommand, SnapCommand {
  type: "SplitClip";
  clipId: string;
  splitTimeUs: number;
  rightClipId?: string;
}

export interface TrimClipStartCommand extends EditableTimelineCommand, SnapCommand {
  type: "TrimClipStart";
  clipId: string;
  newTimelineStartUs: number;
}

export interface TrimClipEndCommand extends EditableTimelineCommand, SnapCommand {
  type: "TrimClipEnd";
  clipId: string;
  newTimelineEndUs: number;
}

export interface MoveClipCommand extends EditableTimelineCommand, SnapCommand {
  type: "MoveClip";
  clipId: string;
  targetTrackId?: string;
  newTimelineStartUs: number;
}

export interface RippleDeleteClipCommand extends EditableTimelineCommand {
  type: "RippleDeleteClip";
  clipId: string;
}

export interface RippleDeleteRangeCommand extends EditableTimelineCommand {
  type: "RippleDeleteRange";
  startUs: number;
  endUs: number;
  trackIds?: string[];
}

export interface LockTrackCommand extends TimelineCommandBase {
  type: "LockTrack";
  trackId: string;
}

export interface UnlockTrackCommand extends TimelineCommandBase {
  type: "UnlockTrack";
  trackId: string;
}

export interface AddMarkerCommand extends TimelineCommandBase, SnapCommand {
  type: "AddMarker";
  markerId?: string;
  positionUs: number;
  label: string;
}

export interface RemoveMarkerCommand extends TimelineCommandBase {
  type: "RemoveMarker";
  markerId: string;
}

export interface AddRegionCommand extends TimelineCommandBase, SnapCommand {
  type: "AddRegion";
  regionId?: string;
  startUs: number;
  endUs: number;
  label: string;
}

export interface SetPlayheadCommand extends TimelineCommandBase, SnapCommand {
  type: "SetPlayhead";
  positionUs: number;
}

export interface UndoCommand extends TimelineCommandBase {
  type: "Undo";
}

export interface RedoCommand extends TimelineCommandBase {
  type: "Redo";
}

export type EditorCommand =
  | CreateTimelineCommand
  | AddTrackCommand
  | InsertClipCommand
  | InsertLinkedMediaCommand
  | SplitClipCommand
  | TrimClipStartCommand
  | TrimClipEndCommand
  | MoveClipCommand
  | RippleDeleteClipCommand
  | RippleDeleteRangeCommand
  | LockTrackCommand
  | UnlockTrackCommand
  | AddMarkerCommand
  | RemoveMarkerCommand
  | AddRegionCommand
  | SetPlayheadCommand
  | UndoCommand
  | RedoCommand;

interface EditorCommandSuccessBase<Type extends EditorCommandType> {
  ok: true;
  commandType: Type;
  timelineId: string;
  historyEntryId: string | null;
  changed: boolean;
  touchedClipIds: string[];
  touchedTrackIds: string[];
  snapDeltaUs: number | null;
}

export interface CreateTimelineResult extends EditorCommandSuccessBase<"CreateTimeline"> {
  createdTrackIds: string[];
}

export interface AddTrackResult extends EditorCommandSuccessBase<"AddTrack"> {
  trackId: string;
  index: number;
}

export interface InsertClipResult extends EditorCommandSuccessBase<"InsertClip"> {
  clipId: string;
  trackId: string;
  timelineStartUs: number;
}

export interface InsertLinkedMediaResult extends EditorCommandSuccessBase<"InsertLinkedMedia"> {
  videoClipId: string | null;
  audioClipId: string | null;
}

export interface SplitClipResult extends EditorCommandSuccessBase<"SplitClip"> {
  leftClipId: string;
  rightClipId: string;
  splitTimeUs: number;
}

interface TrimClipResultFields {
  clipId: string;
  timelineStartUs: number;
  timelineEndUs: number;
  sourceInUs: number;
  sourceOutUs: number;
}

export type TrimClipStartResult = EditorCommandSuccessBase<"TrimClipStart"> &
  TrimClipResultFields;

export type TrimClipEndResult = EditorCommandSuccessBase<"TrimClipEnd"> &
  TrimClipResultFields;

export interface MoveClipResult extends EditorCommandSuccessBase<"MoveClip"> {
  clipId: string;
  trackId: string;
  timelineStartUs: number;
}

export interface RippleDeleteClipResult
  extends EditorCommandSuccessBase<"RippleDeleteClip"> {
  deletedClipId: string;
  shiftedClipIds: string[];
  shiftByUs: number;
}

export interface RippleDeleteRangeResult
  extends EditorCommandSuccessBase<"RippleDeleteRange"> {
  deletedClipIds: string[];
  createdClipIds: string[];
  shiftedClipIds: string[];
  shiftByUs: number;
  startUs: number;
  endUs: number;
}

interface TrackLockResultFields {
  trackId: string;
}

export type LockTrackResult = EditorCommandSuccessBase<"LockTrack"> & TrackLockResultFields;

export type UnlockTrackResult = EditorCommandSuccessBase<"UnlockTrack"> &
  TrackLockResultFields;

export interface AddMarkerResult extends EditorCommandSuccessBase<"AddMarker"> {
  marker: TimelineMarker;
}

export interface RemoveMarkerResult extends EditorCommandSuccessBase<"RemoveMarker"> {
  markerId: string;
}

export interface AddRegionResult extends EditorCommandSuccessBase<"AddRegion"> {
  region: TimelineRegion;
}

export interface SetPlayheadResult extends EditorCommandSuccessBase<"SetPlayhead"> {
  playheadUs: number;
}

export type HistoryCommandResult = EditorCommandSuccessBase<"Undo" | "Redo"> & {
  restoredCommandType: EditorCommandType | null;
};

export type EditorCommandSuccess =
  | CreateTimelineResult
  | AddTrackResult
  | InsertClipResult
  | InsertLinkedMediaResult
  | SplitClipResult
  | TrimClipStartResult
  | TrimClipEndResult
  | MoveClipResult
  | RippleDeleteClipResult
  | RippleDeleteRangeResult
  | LockTrackResult
  | UnlockTrackResult
  | AddMarkerResult
  | RemoveMarkerResult
  | AddRegionResult
  | SetPlayheadResult
  | HistoryCommandResult;

export interface EditorCommandFailure {
  ok: false;
  commandType: EditorCommandType;
  timelineId: string | null;
  error: EditorCommandError;
}

export type EditorCommandResult = EditorCommandSuccess | EditorCommandFailure;

export type EditorCommandExecutionSuccess = EditorCommandSuccess & {
  nextTimeline: Timeline;
  reversible: boolean;
  historyLabel: string | null;
};

export type EditorCommandExecutionResult =
  | EditorCommandExecutionSuccess
  | EditorCommandFailure;

export interface EditorHistoryEntry {
  id: string;
  commandType: EditorCommandType;
  label: string;
  timestamp: string;
  beforeTimeline: Timeline;
  afterTimeline: Timeline;
}

export interface EditorHistorySummary {
  canUndo: boolean;
  canRedo: boolean;
  undoDepth: number;
  redoDepth: number;
  lastUndoLabel: string | null;
  lastRedoLabel: string | null;
}

export interface EditorCommandContext {
  mediaItemsById: Record<string, MediaItem>;
  generateId?: () => string;
}

export function isHistoryCommand(command: EditorCommand): command is UndoCommand | RedoCommand {
  return command.type === "Undo" || command.type === "Redo";
}

export function isEditorCommandFailure(value: unknown): value is EditorCommandFailure {
  const candidate = value as { ok?: boolean } | null;

  return candidate !== null && typeof candidate === "object" && candidate.ok === false;
}

export function getClipDurationUs(clip: TimelineClip): number {
  return Math.max(0, Math.round((clip.sourceOutUs - clip.sourceInUs) / clip.speed));
}
