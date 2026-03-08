# Smart Editing

## Stage 8 stance

Clawcut smart editing is a review-first assistance layer.

The governing rule is:

1. analyze
2. generate suggestions
3. compile an explicit edit plan
4. apply through the command engine

Smart systems do not mutate the timeline directly.

## Current analyzers

Stage 8 ships four explainable analyzers:

- silence and dead-air detection from waveform envelopes
- weak transcript segment detection from speech-density heuristics
- filler-word detection from transcript content and a configurable vocabulary list
- highlight candidate generation from transcript timing and keyword boosts

Each analyzer produces a `SmartSuggestionSet` with:

- a typed analysis target
- summary text
- warnings
- ordered suggestion items

Each `SmartSuggestionItem` includes:

- type
- target time range
- confidence
- rationale
- evidence summaries
- suggested action
- review status
- reversibility metadata

## Persistence model

Smart-analysis artifacts are persisted as worker-owned operational records, not canonical project-document fields.

Current persisted records:

- analysis runs
- suggestion sets
- compiled edit plans

This keeps heuristic artifacts durable and machine-readable without turning them into required user-authored project state.

## Edit-plan compiler

The edit-plan compiler converts accepted suggestions into typed editor commands.

Current Stage 8 mappings:

- silence suggestions -> `RippleDeleteRange`
- filler-word suggestions -> `RippleDeleteRange`
- weak-segment suggestions -> `AddRegion`
- highlight suggestions -> `AddRegion`

Plans are inspectable before application and contain:

- generated command steps
- predicted removed duration
- region delta
- warnings
- conflicts

Applying a plan still goes through the existing editor session and remains undoable.

## Preview and review workflow

Suggestions are previewable before application.

Current review flow supports:

- listing suggestion sets
- inspecting one suggestion
- seeking preview to a suggestion range
- capturing preview frames through the existing preview inspection APIs

The dedicated `smart.seekPreviewToSuggestion` helper exists so OpenClaw and other automation clients do not have to manually compose suggestion inspection with low-level preview seek behavior.

## OpenClaw exposure

Stage 8 smart tools are exposed through the existing plugin-first contract.

Read-only / review tools:

- `clawcut.analyze_silence`
- `clawcut.find_filler_words`
- `clawcut.generate_highlight_suggestions`
- `clawcut.list_suggestions`
- `clawcut.inspect_suggestion`
- `clawcut.preview_suggestion`
- `clawcut.compile_edit_plan`

Mutating / high-impact tools:

- `clawcut.seek_preview_to_suggestion`
- `clawcut.apply_suggestion`
- `clawcut.apply_suggestion_set`
- `clawcut.reject_suggestion`

Apply tools stay optional and allowlist-friendly by default.

## Safety boundary

Smart editing is intentionally not autonomous.

Important boundaries:

- analysis tools are separate from apply tools
- suggestions carry rationale and evidence
- dry-run planning is available before mutation
- apply tools remain safety-classified and policy-aware
- resulting timeline changes remain visible and reversible through undo/redo

## Known limitations

- silence detection depends on Stage 2 waveform quality and fixed heuristics
- filler-word detection is heuristic and language-lightweight
- highlight suggestions are candidate markers, not a mature short-form ranking model
- transcript-based edits currently map to explicit ranges, not arbitrary freeform text deletion
- smart artifacts live in worker persistence, so cross-machine portability is not yet treated as canonical project state
