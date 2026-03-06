import { randomUUID } from "node:crypto";

import {
  applyEditorCommand,
  createTimelineMediaMap,
  isHistoryCommand,
  replaceProjectTimeline,
  type EditorCommand,
  type EditorCommandFailure,
  type EditorCommandResult,
  type EditorHistoryEntry,
  type EditorHistorySummary,
  type Timeline
} from "@clawcut/domain";
import type {
  EditorSessionSnapshot,
  ExecuteEditorCommandInput,
  ExecuteEditorCommandResult
} from "@clawcut/ipc";

import {
  getProjectSnapshot,
  loadAndMaybeMigrateProject,
  saveProjectDocument
} from "./project-repository";

interface EditorSessionState {
  undoStack: EditorHistoryEntry[];
  redoStack: EditorHistoryEntry[];
}

const editorSessions = new Map<string, EditorSessionState>();

function getOrCreateEditorSession(directory: string): EditorSessionState {
  const existing = editorSessions.get(directory);

  if (existing) {
    return existing;
  }

  const created: EditorSessionState = {
    undoStack: [],
    redoStack: []
  };

  editorSessions.set(directory, created);

  return created;
}

function buildHistorySummary(session: EditorSessionState): EditorHistorySummary {
  return {
    canUndo: session.undoStack.length > 0,
    canRedo: session.redoStack.length > 0,
    undoDepth: session.undoStack.length,
    redoDepth: session.redoStack.length,
    lastUndoLabel: session.undoStack.at(-1)?.label ?? null,
    lastRedoLabel: session.redoStack.at(-1)?.label ?? null
  };
}

async function persistTimeline(
  directory: string,
  timeline: Timeline
): Promise<void> {
  const { paths, document } = await loadAndMaybeMigrateProject(directory);
  await saveProjectDocument(paths, replaceProjectTimeline(document, timeline));
}

function toEditorSessionSnapshot(
  snapshot: Awaited<ReturnType<typeof getProjectSnapshot>>,
  session: EditorSessionState
): EditorSessionSnapshot {
  return {
    ...snapshot,
    timeline: snapshot.document.timeline,
    history: buildHistorySummary(session)
  };
}

function createHistoryFailure(
  command: EditorCommand,
  code: "NOTHING_TO_UNDO" | "NOTHING_TO_REDO",
  message: string
): EditorCommandFailure {
  return {
    ok: false,
    commandType: command.type,
    timelineId: command.timelineId,
    error: {
      code,
      message
    }
  };
}

function stripExecutionMetadata(
  execution: Exclude<Awaited<ReturnType<typeof applyEditorCommand>>, EditorCommandFailure> & {
    historyEntryId: string | null;
  }
): EditorCommandResult {
  const { nextTimeline, reversible, historyLabel, ...result } =
    execution;
  void nextTimeline;
  void reversible;
  void historyLabel;

  return result;
}

async function snapshotForDirectory(directory: string): Promise<EditorSessionSnapshot> {
  const snapshot = await getProjectSnapshot(directory);
  const session = getOrCreateEditorSession(snapshot.directory);

  return toEditorSessionSnapshot(snapshot, session);
}

async function executeUndoRedo(
  input: ExecuteEditorCommandInput
): Promise<ExecuteEditorCommandResult> {
  const { paths, document } = await loadAndMaybeMigrateProject(input.directory);
  const session = getOrCreateEditorSession(paths.directory);
  const historyEntry =
    input.command.type === "Undo" ? session.undoStack.pop() : session.redoStack.pop();

  if (!historyEntry) {
    return {
      snapshot: await snapshotForDirectory(paths.directory),
      result:
        input.command.type === "Undo"
          ? createHistoryFailure(input.command, "NOTHING_TO_UNDO", "There is no command to undo.")
          : createHistoryFailure(input.command, "NOTHING_TO_REDO", "There is no command to redo.")
    };
  }

  const nextTimeline =
    input.command.type === "Undo" ? historyEntry.beforeTimeline : historyEntry.afterTimeline;

  await saveProjectDocument(paths, replaceProjectTimeline(document, nextTimeline));

  if (input.command.type === "Undo") {
    session.redoStack.push(historyEntry);
  } else {
    session.undoStack.push(historyEntry);
  }

  return {
    snapshot: await snapshotForDirectory(paths.directory),
    result:
      input.command.type === "Undo"
        ? {
            ok: true,
            commandType: "Undo",
            timelineId: nextTimeline.id,
            historyEntryId: null,
            changed: true,
            touchedClipIds: [],
            touchedTrackIds: [],
            snapDeltaUs: null,
            restoredCommandType: historyEntry.commandType
          }
        : {
            ok: true,
            commandType: "Redo",
            timelineId: nextTimeline.id,
            historyEntryId: null,
            changed: true,
            touchedClipIds: [],
            touchedTrackIds: [],
            snapDeltaUs: null,
            restoredCommandType: historyEntry.commandType
          }
  };
}

export async function getEditorSessionSnapshot(
  directory: string
): Promise<EditorSessionSnapshot> {
  return snapshotForDirectory(directory);
}

export async function executeEditorCommand(
  input: ExecuteEditorCommandInput
): Promise<ExecuteEditorCommandResult> {
  if (isHistoryCommand(input.command)) {
    return executeUndoRedo(input);
  }

  const { paths, document } = await loadAndMaybeMigrateProject(input.directory);
  const session = getOrCreateEditorSession(paths.directory);
  const execution = applyEditorCommand(document.timeline, input.command, {
    mediaItemsById: createTimelineMediaMap(document.library.items)
  });

  if (!execution.ok) {
    return {
      snapshot: await snapshotForDirectory(paths.directory),
      result: execution
    };
  }

  const historyEntryId =
    execution.reversible && execution.changed ? randomUUID() : null;

  if (execution.changed) {
    await persistTimeline(paths.directory, execution.nextTimeline);
  }

  if (execution.reversible && execution.changed && execution.historyLabel) {
    session.undoStack.push({
      id: historyEntryId ?? randomUUID(),
      commandType: execution.commandType,
      label: execution.historyLabel,
      timestamp: new Date().toISOString(),
      beforeTimeline: structuredClone(document.timeline),
      afterTimeline: structuredClone(execution.nextTimeline)
    });
    session.redoStack = [];
  }

  return {
    snapshot: await snapshotForDirectory(paths.directory),
    result: stripExecutionMetadata({
      ...execution,
      historyEntryId
    })
  };
}
