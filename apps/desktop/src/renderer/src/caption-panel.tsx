import { useEffect, useState } from "react";

import type {
  CaptionTemplateId,
  SubtitleFormat,
  Transcript,
  TranscriptSummary,
  TranscriptionOptions
} from "@clawcut/domain";
import type { CaptionSessionSnapshot, EditorSessionSnapshot } from "@clawcut/ipc";

interface CaptionPanelProps {
  snapshot: EditorSessionSnapshot | null;
  captionSnapshot: CaptionSessionSnapshot | null;
  selectedClipId: string | null;
  onTranscribeClip: (
    options?: Partial<Pick<TranscriptionOptions, "initialPrompt" | "glossaryTerms">>
  ) => void;
  onUpdateTranscriptSegment: (transcriptId: string, segmentId: string, text: string) => void;
  onGenerateCaptionTrack: (transcriptId: string, templateId: CaptionTemplateId) => void;
  onRegenerateCaptionTrack: (captionTrackId: string) => void;
  onApplyCaptionTemplate: (captionTrackId: string, templateId: CaptionTemplateId) => void;
  onUpdateCaptionSegment: (captionTrackId: string, segmentId: string, text: string) => void;
  onExportSubtitle: (captionTrackId: string, format: SubtitleFormat) => void;
}

function formatTimeUs(valueUs: number): string {
  const totalSeconds = Math.max(0, valueUs / 1_000_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toFixed(2).padStart(5, "0")}`;
}

function resolveSelectedTranscript(
  captionSnapshot: CaptionSessionSnapshot | null,
  selectedTranscriptId: string | null
): Transcript | null {
  if (!captionSnapshot) {
    return null;
  }

  return (
    captionSnapshot.transcripts.find((transcript) => transcript.id === selectedTranscriptId) ??
    captionSnapshot.transcripts[0] ??
    null
  );
}

function resolveSelectedTranscriptSummary(
  captionSnapshot: CaptionSessionSnapshot | null,
  selectedTranscriptId: string | null
): TranscriptSummary | null {
  if (!captionSnapshot) {
    return null;
  }

  return (
    captionSnapshot.transcriptSummaries.find(
      (summary) => summary.transcriptId === selectedTranscriptId
    ) ??
    captionSnapshot.transcriptSummaries[0] ??
    null
  );
}

function parseGlossaryTerms(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[\n,]/gu)
        .map((term) => term.trim())
        .filter((term) => term.length > 0)
    )
  );
}

export function CaptionPanel({
  snapshot,
  captionSnapshot,
  selectedClipId,
  onTranscribeClip,
  onUpdateTranscriptSegment,
  onGenerateCaptionTrack,
  onRegenerateCaptionTrack,
  onApplyCaptionTemplate,
  onUpdateCaptionSegment,
  onExportSubtitle
}: CaptionPanelProps) {
  const [selectedTranscriptId, setSelectedTranscriptId] = useState<string | null>(null);
  const [selectedCaptionTrackId, setSelectedCaptionTrackId] = useState<string | null>(null);
  const [pendingTemplateId, setPendingTemplateId] = useState<CaptionTemplateId>("bottom-center-clean");
  const [transcriptionPrompt, setTranscriptionPrompt] = useState("");
  const [glossaryTerms, setGlossaryTerms] = useState("");

  useEffect(() => {
    if (!captionSnapshot) {
      setSelectedTranscriptId(null);
      setSelectedCaptionTrackId(null);
      return;
    }

    if (!selectedTranscriptId || !captionSnapshot.transcripts.some((item) => item.id === selectedTranscriptId)) {
      setSelectedTranscriptId(captionSnapshot.transcripts[0]?.id ?? null);
    }

    if (
      !selectedCaptionTrackId ||
      !captionSnapshot.captionTracks.some((item) => item.id === selectedCaptionTrackId)
    ) {
      setSelectedCaptionTrackId(captionSnapshot.captionTracks[0]?.id ?? null);
    }
  }, [captionSnapshot, selectedCaptionTrackId, selectedTranscriptId]);

  const selectedTranscript = resolveSelectedTranscript(captionSnapshot, selectedTranscriptId);
  const selectedTranscriptSummary = resolveSelectedTranscriptSummary(
    captionSnapshot,
    selectedTranscript?.id ?? selectedTranscriptId
  );
  const selectedCaptionTrack =
    captionSnapshot?.captionTracks.find((track) => track.id === selectedCaptionTrackId) ??
    captionSnapshot?.captionTracks[0] ??
    null;

  return (
    <section className="caption-panel" data-testid="caption-panel">
      <header className="panel-header">
        <div>
          <p className="eyebrow eyebrow--muted">Transcripts and captions</p>
          <h2>Word timing, templates, subtitle outputs</h2>
        </div>
        <div className="button-row button-row--tight">
          <button
            className="primary-button"
            data-testid="transcribe-clip-button"
            disabled={!snapshot || Object.keys(snapshot.timeline.clipsById).length === 0}
            onClick={() =>
              onTranscribeClip({
                initialPrompt: transcriptionPrompt.trim() || null,
                glossaryTerms: parseGlossaryTerms(glossaryTerms)
              })
            }
            type="button"
          >
            {selectedClipId ? "Transcribe selected clip" : "Transcribe first clip"}
          </button>
        </div>
      </header>

      <div className="caption-panel__grid">
        <article className="caption-surface">
          <div className="caption-surface__header">
            <div>
              <span className="meta-label">Transcript</span>
              <strong>{selectedTranscript ? selectedTranscript.language ?? "Unknown language" : "No transcript yet"}</strong>
            </div>
            {captionSnapshot?.transcripts.length ? (
              <select
                aria-label="Select transcript"
                onChange={(event) => setSelectedTranscriptId(event.target.value)}
                value={selectedTranscript?.id ?? ""}
              >
                {captionSnapshot.transcripts.map((transcript) => (
                  <option key={transcript.id} value={transcript.id}>
                    {transcript.source.kind === "clip" ? "Clip transcript" : "Media transcript"} · {transcript.status}
                  </option>
                ))}
              </select>
            ) : null}
          </div>

          <div className="caption-toolbar">
            <label className="field field--compact caption-field caption-field--wide">
              <span>Initial prompt</span>
              <textarea
                data-testid="transcription-initial-prompt-input"
                onChange={(event) => setTranscriptionPrompt(event.target.value)}
                placeholder="Names, context, or domain hints for the transcription engine."
                rows={3}
                value={transcriptionPrompt}
              />
            </label>
            <label className="field field--compact caption-field caption-field--wide">
              <span>Glossary</span>
              <input
                data-testid="transcription-glossary-input"
                onChange={(event) => setGlossaryTerms(event.target.value)}
                placeholder="OpenClaw, ClawCut, product names, custom vocabulary"
                type="text"
                value={glossaryTerms}
              />
            </label>
          </div>

          {selectedTranscript ? (
            <>
              {selectedTranscriptSummary ? (
                <div className="caption-summary" data-testid="transcript-summary">
                  <span>{selectedTranscriptSummary.segmentCount} segments</span>
                  <span>{selectedTranscriptSummary.wordCount} words</span>
                  <span>
                    {Math.round(selectedTranscriptSummary.wordTimingCoverageRatio * 100)}% word timing
                  </span>
                  <span>
                    {Math.round(selectedTranscriptSummary.captionCoverage.coverageRatio * 100)}% caption coverage
                  </span>
                </div>
              ) : null}

              <div className="caption-toolbar">
                <label className="field field--compact">
                  <span>Template</span>
                  <select
                    aria-label="Caption template"
                    onChange={(event) => setPendingTemplateId(event.target.value as CaptionTemplateId)}
                    value={pendingTemplateId}
                  >
                    {captionSnapshot?.templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.displayName}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="secondary-button"
                  data-testid="generate-caption-track-button"
                  onClick={() => onGenerateCaptionTrack(selectedTranscript.id, pendingTemplateId)}
                  type="button"
                >
                  Generate caption track
                </button>
              </div>

              <div className="caption-list" data-testid="transcript-segment-list">
                {selectedTranscript.segments.map((segment) => (
                  <label className="caption-row" key={segment.id}>
                    <div className="caption-row__meta">
                      <strong>
                        {formatTimeUs(segment.startUs)} - {formatTimeUs(segment.endUs)}
                      </strong>
                      <span>{segment.words.length} words</span>
                    </div>
                    <textarea
                      data-testid={`transcript-segment-${segment.id}`}
                      defaultValue={segment.text}
                      onBlur={(event) => {
                        if (event.target.value !== segment.text) {
                          onUpdateTranscriptSegment(selectedTranscript.id, segment.id, event.target.value);
                        }
                      }}
                      rows={2}
                    />
                  </label>
                ))}
              </div>
            </>
          ) : (
            <div className="empty-panel empty-panel--captions">
              <strong>No transcript created yet.</strong>
              <p>Transcribe a selected clip first, then generate a caption track from the normalized transcript model.</p>
            </div>
          )}
        </article>

        <article className="caption-surface">
          <div className="caption-surface__header">
            <div>
              <span className="meta-label">Caption track</span>
              <strong>{selectedCaptionTrack?.name ?? "No caption track yet"}</strong>
            </div>
            {captionSnapshot?.captionTracks.length ? (
              <select
                aria-label="Select caption track"
                onChange={(event) => setSelectedCaptionTrackId(event.target.value)}
                value={selectedCaptionTrack?.id ?? ""}
              >
                {captionSnapshot.captionTracks.map((track) => (
                  <option key={track.id} value={track.id}>
                    {track.name}
                  </option>
                ))}
              </select>
            ) : null}
          </div>

          {selectedCaptionTrack ? (
            <>
              <div className="caption-toolbar">
                <label className="field field--compact">
                  <span>Applied template</span>
                  <select
                    aria-label="Applied caption template"
                    onChange={(event) =>
                      onApplyCaptionTemplate(
                        selectedCaptionTrack.id,
                        event.target.value as CaptionTemplateId
                      )
                    }
                    value={selectedCaptionTrack.templateId}
                  >
                    {captionSnapshot?.templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.displayName}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="button-row button-row--tight">
                  <button
                    className="secondary-button"
                    onClick={() => onRegenerateCaptionTrack(selectedCaptionTrack.id)}
                    type="button"
                  >
                    Regenerate
                  </button>
                  <button
                    className="ghost-button"
                    onClick={() => onExportSubtitle(selectedCaptionTrack.id, "srt")}
                    type="button"
                  >
                    Export SRT
                  </button>
                  <button
                    className="ghost-button"
                    onClick={() => onExportSubtitle(selectedCaptionTrack.id, "ass")}
                    type="button"
                  >
                    Export ASS
                  </button>
                </div>
              </div>

              <div className="caption-list" data-testid="caption-segment-list">
                {selectedCaptionTrack.segments.map((segment) => (
                  <label className="caption-row" key={segment.id}>
                    <div className="caption-row__meta">
                      <strong>
                        {formatTimeUs(segment.startUs)} - {formatTimeUs(segment.endUs)}
                      </strong>
                      <span>{segment.templateId ?? selectedCaptionTrack.templateId}</span>
                    </div>
                    <textarea
                      data-testid={`caption-segment-${segment.id}`}
                      defaultValue={segment.text}
                      onBlur={(event) => {
                        if (event.target.value !== segment.text) {
                          onUpdateCaptionSegment(selectedCaptionTrack.id, segment.id, event.target.value);
                        }
                      }}
                      rows={2}
                    />
                  </label>
                ))}
              </div>
            </>
          ) : (
            <div className="empty-panel empty-panel--captions">
              <strong>No caption track generated yet.</strong>
              <p>Generate a track from an existing transcript to preview styled captions and export sidecar subtitle files.</p>
            </div>
          )}
        </article>
      </div>
    </section>
  );
}
