import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import {
  createEmptyDerivedAssetSet,
  createEmptyMetadataSummary,
  createTranscriptFromNormalizedResult,
  getTimelineEndUs,
  type MediaItem,
  type TimelineClip
} from "@clawcut/domain";

import { WAVEFORM_PRESET_KEY } from "../src/cache-manager";
import { executeCaptionCommand } from "../src/caption-session";
import { executeEditorCommand, getEditorSessionSnapshot } from "../src/editor-session";
import { executeSmartCommand, getSmartSessionSnapshot } from "../src/smart-session";
import { resolveDerivedAssetPath, resolveProjectPaths } from "../src/paths";
import { createProject, updateMediaItem } from "../src/project-repository";

const temporaryDirectories: string[] = [];

function registerTempDirectory(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

function createLibraryItem(id: string): MediaItem {
  const sourcePath = join(process.cwd(), "fixtures/media/talking-head-sample.mp4");

  return {
    id,
    displayName: "Fixture Clip",
    source: {
      sourceType: "import",
      originalPath: sourcePath,
      currentResolvedPath: sourcePath,
      normalizedOriginalPath: sourcePath,
      normalizedResolvedPath: sourcePath
    },
    importTimestamp: new Date().toISOString(),
    lastSeenTimestamp: new Date().toISOString(),
    fileSize: 42,
    fileModifiedTimeMs: 10,
    fingerprint: {
      strategy: "partial-sha256",
      quickHash: `${id}-hash`,
      fileSize: 42,
      modifiedTimeMs: 10,
      sampleSizeBytes: 42
    },
    sourceRevision: `${id}-revision`,
    metadataSummary: {
      ...createEmptyMetadataSummary(),
      kind: "video",
      durationMs: 4_000,
      hasVideo: true,
      hasAudio: true,
      container: "mp4"
    },
    streams: [],
    ingestStatus: "ready",
    relinkStatus: "linked",
    errorState: null,
    derivedAssets: createEmptyDerivedAssetSet()
  };
}

function createTranscript(timelineId: string, clip: TimelineClip) {
  return createTranscriptFromNormalizedResult({
    timelineId,
    source: {
      kind: "clip",
      timelineId,
      clipId: clip.id,
      mediaItemId: clip.mediaItemId,
      sourceStartUs: clip.sourceInUs,
      sourceEndUs: clip.sourceOutUs
    },
    result: {
      provider: "faster-whisper",
      model: "tiny",
      language: "en",
      confidence: 0.87,
      wordTimestamps: true,
      warnings: [],
      segments: [
        {
          startUs: 0,
          endUs: 800_000,
          text: "Um welcome",
          confidence: 0.84,
          words: [
            { text: "Um", startUs: 0, endUs: 150_000, confidence: 0.71 },
            { text: "welcome", startUs: 200_000, endUs: 800_000, confidence: 0.91 }
          ]
        },
        {
          startUs: 900_000,
          endUs: 2_300_000,
          text: "This keynote is useful",
          confidence: 0.9,
          words: [
            { text: "This", startUs: 900_000, endUs: 1_050_000, confidence: 0.9 },
            { text: "keynote", startUs: 1_060_000, endUs: 1_420_000, confidence: 0.92 },
            { text: "is", startUs: 1_430_000, endUs: 1_500_000, confidence: 0.91 },
            { text: "useful", startUs: 1_520_000, endUs: 2_300_000, confidence: 0.9 }
          ]
        }
      ]
    }
  });
}

describe.sequential("smart session", () => {
  afterEach(() => {
    while (temporaryDirectories.length > 0) {
      const directory = temporaryDirectories.pop();

      if (directory) {
        rmSync(directory, { recursive: true, force: true });
      }
    }
  });

  test("runs silence analysis, persists suggestions, applies a plan, and stays undoable", async () => {
    const directory = registerTempDirectory("clawcut-stage8-smart-");
    await createProject(directory, "Stage 8 Smart");
    const mediaItem = createLibraryItem("media-1");
    const paths = resolveProjectPaths(directory);
    const waveformPath = resolveDerivedAssetPath(
      paths,
      mediaItem.id,
      mediaItem.sourceRevision,
      "waveform.json"
    );
    mkdirSync(join(waveformPath.absolutePath, ".."), { recursive: true });
    writeFileSync(
      waveformPath.absolutePath,
      JSON.stringify({
        version: 1,
        bucketCount: 8,
        durationMs: 4_000,
        peaks: [0.24, 0.21, 0.01, 0.01, 0.01, 0.23, 0.19, 0.17],
        rms: [0.13, 0.11, 0.01, 0.01, 0.01, 0.1, 0.09, 0.08]
      }),
      "utf8"
    );

    await updateMediaItem(directory, {
      ...mediaItem,
      derivedAssets: {
        ...mediaItem.derivedAssets,
        waveform: {
          id: `${mediaItem.id}:waveform`,
          type: "waveform",
          status: "ready",
          relativePath: waveformPath.relativePath,
          sourceRevision: mediaItem.sourceRevision,
          presetKey: WAVEFORM_PRESET_KEY,
          generatedAt: new Date().toISOString(),
          fileSize: 1,
          errorMessage: null,
          bucketCount: 8,
          durationMs: 4_000,
          previewPeaks: [0.24, 0.21, 0.01, 0.01, 0.01, 0.23, 0.19, 0.17]
        }
      }
    });

    const initialEditorSession = await getEditorSessionSnapshot(directory);

    let editor = await executeEditorCommand({
      directory,
      command: {
        type: "CreateTimeline",
        timelineId: initialEditorSession.timeline.id
      }
    });

    const [videoTrackId, audioTrackId] =
      editor.result.ok && editor.result.commandType === "CreateTimeline"
        ? editor.result.createdTrackIds
        : [];

    editor = await executeEditorCommand({
      directory,
      command: {
        type: "InsertLinkedMedia",
        timelineId: editor.snapshot.timeline.id,
        mediaItemId: mediaItem.id,
        videoTrackId,
        audioTrackId,
        timelineStartUs: 0
      }
    });

    const videoClipId = editor.snapshot.timeline.tracksById[videoTrackId]?.clipIds[0] ?? null;
    expect(videoClipId).toBeTruthy();

    const silence = await executeSmartCommand({
      directory,
      command: {
        type: "AnalyzeSilence",
        timelineId: editor.snapshot.timeline.id,
        clipId: videoClipId!
      }
    });

    expect(silence.result.ok).toBe(true);

    if (!silence.result.ok || silence.result.commandType !== "AnalyzeSilence") {
      return;
    }

    expect(silence.result.suggestionSet.items.length).toBeGreaterThan(0);

    const beforeApply = await getEditorSessionSnapshot(directory);
    const applied = await executeSmartCommand({
      directory,
      command: {
        type: "ApplySuggestion",
        timelineId: beforeApply.timeline.id,
        suggestionSetId: silence.result.suggestionSet.id,
        suggestionId: silence.result.suggestionSet.items[0]!.id
      }
    });

    expect(applied.result.ok).toBe(true);

    const afterApply = await getEditorSessionSnapshot(directory);
    expect(getTimelineEndUs(afterApply.timeline)).toBeLessThan(getTimelineEndUs(beforeApply.timeline));

    const undone = await executeEditorCommand({
      directory,
      command: {
        type: "Undo",
        timelineId: afterApply.timeline.id
      }
    });

    expect(undone.result.ok).toBe(true);
    expect(getTimelineEndUs(undone.snapshot.timeline)).toBe(getTimelineEndUs(beforeApply.timeline));
  });

  test("generates transcript-based suggestions and exposes them through the smart snapshot", async () => {
    const directory = registerTempDirectory("clawcut-stage8-smart-caption-");
    await createProject(directory, "Stage 8 Transcript Smart");
    const mediaItem = createLibraryItem("media-2");
    await updateMediaItem(directory, mediaItem);

    const initialEditorSession = await getEditorSessionSnapshot(directory);

    let editor = await executeEditorCommand({
      directory,
      command: {
        type: "CreateTimeline",
        timelineId: initialEditorSession.timeline.id
      }
    });

    const [videoTrackId, audioTrackId] =
      editor.result.ok && editor.result.commandType === "CreateTimeline"
        ? editor.result.createdTrackIds
        : [];

    editor = await executeEditorCommand({
      directory,
      command: {
        type: "InsertLinkedMedia",
        timelineId: editor.snapshot.timeline.id,
        mediaItemId: mediaItem.id,
        videoTrackId,
        audioTrackId,
        timelineStartUs: 0
      }
    });

    const clipId = editor.snapshot.timeline.tracksById[videoTrackId]?.clipIds[0] ?? null;
    expect(clipId).toBeTruthy();

    const clip = editor.snapshot.timeline.clipsById[clipId!];
    const transcript = createTranscript(editor.snapshot.timeline.id, clip);
    await executeCaptionCommand({
      directory,
      command: {
        type: "CreateTranscript",
        transcript
      }
    });

    const filler = await executeSmartCommand({
      directory,
      command: {
        type: "FindFillerWords",
        transcriptId: transcript.id
      }
    });
    const highlights = await executeSmartCommand({
      directory,
      command: {
        type: "GenerateHighlightSuggestions",
        transcriptId: transcript.id,
        options: {
          keywordBoostTerms: ["keynote"],
          minimumScore: 0.3
        }
      }
    });

    expect(filler.result.ok).toBe(true);
    expect(highlights.result.ok).toBe(true);

    const smartSnapshot = await getSmartSessionSnapshot({ directory });
    expect(smartSnapshot.suggestionSets).toHaveLength(2);
    expect(smartSnapshot.suggestionSets.some((set) => set.analysisType === "filler-words")).toBe(true);
    expect(smartSnapshot.suggestionSets.some((set) => set.analysisType === "highlights")).toBe(true);
  });
});
