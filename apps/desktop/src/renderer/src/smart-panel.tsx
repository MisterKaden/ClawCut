import { useEffect, useMemo, useState } from "react";

import type { SmartSuggestionItem } from "@clawcut/domain";
import type {
  CaptionSessionSnapshot,
  EditorSessionSnapshot,
  SmartSessionSnapshot
} from "@clawcut/ipc";

interface SmartPanelProps {
  snapshot: EditorSessionSnapshot | null;
  captionSnapshot: CaptionSessionSnapshot | null;
  smartSnapshot: SmartSessionSnapshot | null;
  selectedClipId: string | null;
  onAnalyzeSilence: (clipId: string) => void;
  onAnalyzeWeakSegments: (transcriptId: string) => void;
  onFindFillerWords: (transcriptId: string) => void;
  onGenerateHighlights: (transcriptId: string) => void;
  onCompilePlan: (timelineId: string, suggestionSetId: string, suggestionIds?: string[]) => void;
  onApplySuggestion: (timelineId: string, suggestionSetId: string, suggestionId: string) => void;
  onApplySuggestionSet: (timelineId: string, suggestionSetId: string, suggestionIds?: string[]) => void;
  onRejectSuggestion: (suggestionSetId: string, suggestionId: string) => void;
  onPreviewSuggestion: (suggestion: SmartSuggestionItem) => void;
}

function formatTimeUs(valueUs: number): string {
  const totalSeconds = Math.max(0, valueUs / 1_000_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toFixed(2).padStart(5, "0")}`;
}

function formatSuggestionType(type: SmartSuggestionItem["type"]): string {
  switch (type) {
    case "silence":
      return "Silence";
    case "weak-segment":
      return "Weak segment";
    case "filler-word":
      return "Filler";
    case "highlight":
      return "Highlight";
  }
}

function formatSuggestionStatus(status: SmartSuggestionItem["status"]): string {
  switch (status) {
    case "new":
      return "New";
    case "reviewed":
      return "Reviewed";
    case "accepted":
      return "Accepted";
    case "rejected":
      return "Rejected";
    case "applied":
      return "Applied";
  }
}

function toneClassForSuggestionStatus(status: SmartSuggestionItem["status"]): string {
  switch (status) {
    case "applied":
      return "tone-chip tone-chip--ok";
    case "rejected":
      return "tone-chip tone-chip--warning";
    case "accepted":
    case "reviewed":
      return "tone-chip tone-chip--progress";
    case "new":
      return "tone-chip";
  }
}

export function SmartPanel({
  snapshot,
  captionSnapshot,
  smartSnapshot,
  selectedClipId,
  onAnalyzeSilence,
  onAnalyzeWeakSegments,
  onFindFillerWords,
  onGenerateHighlights,
  onCompilePlan,
  onApplySuggestion,
  onApplySuggestionSet,
  onRejectSuggestion,
  onPreviewSuggestion
}: SmartPanelProps) {
  const [selectedTranscriptId, setSelectedTranscriptId] = useState<string | null>(null);
  const [selectedSuggestionSetId, setSelectedSuggestionSetId] = useState<string | null>(null);

  const selectedTranscript = useMemo(() => {
    if (!captionSnapshot) {
      return null;
    }

    const preferredTranscript =
      (selectedClipId
        ? captionSnapshot.transcripts.find((item) => item.source.clipId === selectedClipId)
        : null) ?? null;

    return (
      captionSnapshot.transcripts.find((item) => item.id === selectedTranscriptId) ??
      preferredTranscript ??
      captionSnapshot.transcripts[0] ??
      null
    );
  }, [captionSnapshot, selectedClipId, selectedTranscriptId]);

  useEffect(() => {
    if (!captionSnapshot) {
      setSelectedTranscriptId(null);
      return;
    }

    if (selectedTranscriptId && captionSnapshot.transcripts.some((item) => item.id === selectedTranscriptId)) {
      return;
    }

    const fallbackTranscript =
      (selectedClipId
        ? captionSnapshot.transcripts.find((item) => item.source.clipId === selectedClipId)
        : null) ?? captionSnapshot.transcripts[0] ?? null;

    setSelectedTranscriptId(fallbackTranscript?.id ?? null);
  }, [captionSnapshot, selectedClipId, selectedTranscriptId]);

  const orderedSuggestionSets = useMemo(
    () =>
      [...(smartSnapshot?.suggestionSets ?? [])].sort(
        (left, right) =>
          new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
      ),
    [smartSnapshot]
  );

  const selectedSuggestionSet =
    orderedSuggestionSets.find((set) => set.id === selectedSuggestionSetId) ??
    orderedSuggestionSets[0] ??
    null;

  useEffect(() => {
    if (!orderedSuggestionSets.length) {
      setSelectedSuggestionSetId(null);
      return;
    }

    if (selectedSuggestionSetId && orderedSuggestionSets.some((set) => set.id === selectedSuggestionSetId)) {
      return;
    }

    setSelectedSuggestionSetId(orderedSuggestionSets[0]?.id ?? null);
  }, [orderedSuggestionSets, selectedSuggestionSetId]);

  const latestPlan =
    [...(smartSnapshot?.editPlans ?? [])]
      .filter((plan) => plan.suggestionSetId === selectedSuggestionSet?.id)
      .sort(
        (left, right) =>
          new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
      )[0] ?? null;

  const activeRuns = (smartSnapshot?.analysisRuns ?? []).filter(
    (run) => run.status === "queued" || run.status === "running"
  );

  return (
    <section className="smart-panel" data-testid="smart-panel">
      <header className="panel-header">
        <div>
          <p className="eyebrow eyebrow--muted">Smart editing</p>
          <h2>Explainable suggestions, dry-run plans, reversible edits</h2>
        </div>
        <span className={activeRuns.length ? "tone-chip tone-chip--progress" : "tone-chip"}>
          {activeRuns.length ? `${activeRuns.length} analysis job${activeRuns.length === 1 ? "" : "s"} active` : "Review mode"}
        </span>
      </header>

      <div className="smart-panel__grid">
        <article className="smart-surface">
          <div className="smart-toolbar">
            <label className="field field--compact">
              <span>Transcript</span>
              <select
                aria-label="Select transcript for smart analysis"
                onChange={(event) => setSelectedTranscriptId(event.target.value)}
                value={selectedTranscript?.id ?? ""}
              >
                {(captionSnapshot?.transcripts ?? []).map((transcript) => (
                  <option key={transcript.id} value={transcript.id}>
                    {(transcript.source.clipId ? "Clip" : "Media") + " transcript"} · {transcript.status}
                  </option>
                ))}
              </select>
            </label>
            <div className="button-row button-row--tight smart-toolbar__actions">
              <button
                className="secondary-button"
                data-testid="analyze-silence-button"
                disabled={!snapshot || !selectedClipId}
                onClick={() => selectedClipId && onAnalyzeSilence(selectedClipId)}
                type="button"
              >
                Analyze silence
              </button>
              <button
                className="secondary-button"
                data-testid="analyze-weak-segments-button"
                disabled={!snapshot || !selectedTranscript}
                onClick={() => selectedTranscript && onAnalyzeWeakSegments(selectedTranscript.id)}
                type="button"
              >
                Find weak segments
              </button>
              <button
                className="secondary-button"
                data-testid="find-filler-words-button"
                disabled={!snapshot || !selectedTranscript}
                onClick={() => selectedTranscript && onFindFillerWords(selectedTranscript.id)}
                type="button"
              >
                Flag filler words
              </button>
              <button
                className="primary-button"
                data-testid="generate-highlights-button"
                disabled={!snapshot || !selectedTranscript}
                onClick={() => selectedTranscript && onGenerateHighlights(selectedTranscript.id)}
                type="button"
              >
                Generate highlights
              </button>
            </div>
          </div>

          {activeRuns.length ? (
            <div className="smart-summary">
              {activeRuns.map((run) => (
                <div className="smart-summary__item" key={run.id}>
                  <strong>{run.request.analysisType}</strong>
                  <span>{run.status}</span>
                </div>
              ))}
            </div>
          ) : null}

          {selectedSuggestionSet ? (
            <>
              <div className="smart-toolbar">
                <label className="field field--compact">
                  <span>Suggestion set</span>
                  <select
                    aria-label="Select suggestion set"
                    data-testid="smart-suggestion-set-select"
                    onChange={(event) => setSelectedSuggestionSetId(event.target.value)}
                    value={selectedSuggestionSet.id}
                  >
                    {orderedSuggestionSets.map((set) => (
                      <option key={set.id} value={set.id}>
                        {set.title} · {set.analysisType}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="button-row button-row--tight smart-toolbar__actions">
                  <button
                    className="secondary-button"
                    data-testid="smart-compile-plan-button"
                    disabled={!snapshot}
                    onClick={() =>
                      snapshot &&
                      onCompilePlan(snapshot.timeline.id, selectedSuggestionSet.id)
                    }
                    type="button"
                  >
                    Compile plan
                  </button>
                  <button
                    className="primary-button"
                    data-testid="smart-apply-set-button"
                    disabled={!snapshot}
                    onClick={() =>
                      snapshot &&
                      onApplySuggestionSet(snapshot.timeline.id, selectedSuggestionSet.id)
                    }
                    type="button"
                  >
                    Apply set
                  </button>
                </div>
              </div>

              <div className="smart-summary" data-testid="smart-suggestion-summary">
                <div className="smart-summary__item">
                  <strong>{selectedSuggestionSet.items.length}</strong>
                  <span>Suggestions</span>
                </div>
                <div className="smart-summary__item">
                  <strong>{selectedSuggestionSet.analysisType}</strong>
                  <span>Analyzer</span>
                </div>
                <div className="smart-summary__item">
                  <strong>{selectedSuggestionSet.warnings.length}</strong>
                  <span>Warnings</span>
                </div>
              </div>

              {selectedSuggestionSet.warnings.length ? (
                <div className="callout callout--warning">
                  <strong>Analyzer notes</strong>
                  <ul className="plain-list">
                    {selectedSuggestionSet.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="suggestion-list" data-testid="smart-suggestion-list">
                {selectedSuggestionSet.items.map((suggestion) => (
                  <article
                    className="suggestion-card"
                    data-testid={`smart-suggestion-${suggestion.id}`}
                    key={suggestion.id}
                  >
                    <div className="suggestion-card__header">
                      <div>
                        <span className="meta-label">{formatSuggestionType(suggestion.type)}</span>
                        <strong>{suggestion.label}</strong>
                      </div>
                      <span className={toneClassForSuggestionStatus(suggestion.status)}>
                        {formatSuggestionStatus(suggestion.status)}
                      </span>
                    </div>

                    <div className="suggestion-card__meta">
                      <span>
                        {formatTimeUs(suggestion.target.startUs)} - {formatTimeUs(suggestion.target.endUs)}
                      </span>
                      <span>{Math.round(suggestion.confidence * 100)}% confidence</span>
                      <span>{suggestion.suggestedAction}</span>
                    </div>

                    <ul className="plain-list suggestion-card__reasons">
                      {suggestion.rationale.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>

                    <div className="button-row button-row--tight">
                      <button
                        className="ghost-button"
                        data-testid={`smart-preview-suggestion-button-${suggestion.id}`}
                        onClick={() => onPreviewSuggestion(suggestion)}
                        type="button"
                      >
                        Preview
                      </button>
                      <button
                        className="secondary-button"
                        data-testid={`smart-compile-suggestion-button-${suggestion.id}`}
                        disabled={!snapshot}
                        onClick={() =>
                          snapshot &&
                          onCompilePlan(snapshot.timeline.id, selectedSuggestionSet.id, [suggestion.id])
                        }
                        type="button"
                      >
                        Dry-run
                      </button>
                      <button
                        className="primary-button"
                        data-testid={`smart-apply-suggestion-button-${suggestion.id}`}
                        disabled={!snapshot || suggestion.status === "applied"}
                        onClick={() =>
                          snapshot &&
                          onApplySuggestion(snapshot.timeline.id, selectedSuggestionSet.id, suggestion.id)
                        }
                        type="button"
                      >
                        Apply
                      </button>
                      <button
                        className="ghost-button"
                        data-testid={`smart-reject-suggestion-button-${suggestion.id}`}
                        disabled={suggestion.status === "rejected" || suggestion.status === "applied"}
                        onClick={() => onRejectSuggestion(selectedSuggestionSet.id, suggestion.id)}
                        type="button"
                      >
                        Reject
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </>
          ) : (
            <div className="empty-panel empty-panel--smart">
              <strong>No smart suggestion sets yet.</strong>
              <p>Run silence, filler, weak-segment, or highlight analysis to produce reviewable edit suggestions before applying anything to the timeline.</p>
            </div>
          )}
        </article>

        <aside className="smart-sidebar">
          <div className="smart-sidebar__section">
            <span className="meta-label">Latest plan</span>
            {latestPlan ? (
              <>
                <strong>{latestPlan.steps.length} command step{latestPlan.steps.length === 1 ? "" : "s"}</strong>
                <p>{Math.round(latestPlan.summary.predictedRemovedDurationUs / 100_000) / 10}s removable</p>
                {latestPlan.warnings.length ? (
                  <ul className="plain-list">
                    {latestPlan.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                ) : (
                  <p>No plan warnings.</p>
                )}
              </>
            ) : (
              <>
                <strong>No compiled plan yet</strong>
                <p>Compile a suggestion or suggestion set to inspect the resulting command sequence before applying it.</p>
              </>
            )}
          </div>

          <div className="smart-sidebar__section">
            <span className="meta-label">Safety boundary</span>
            <strong>Analysis never edits the timeline directly.</strong>
            <p>Suggestions become explicit command plans first. Applying them still routes through the same validated editor command engine and stays reversible with undo.</p>
          </div>
        </aside>
      </div>
    </section>
  );
}
