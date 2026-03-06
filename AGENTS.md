# Clawcut AGENTS.md

## Product
Build a desktop video editor powered by FFmpeg/ffprobe and Whisper.
The product target is talking-head, podcast, tutorial, and short-form social editing first.

## Architecture rules
- The source of truth is a versioned timeline schema and render IR.
- UI components must never build raw ffmpeg command strings directly.
- All media execution must go through the media worker layer.
- Preview must sit behind a PreviewEngine interface so the backend can evolve later.
- Export must compile timeline IR into ffmpeg filter script files, subtitle assets, and deterministic job specs.
- Caption templates must be data-driven and editable, not hard-coded in components.
- Whisper output is a draft; keep raw words and timestamps editable in the UI.
- Keep files and modules small, typed, and testable.

## Engineering standards
- Every stage must leave the app runnable.
- Prefer clear interfaces over clever shortcuts.
- Do not add dependencies casually; justify large deps in docs/decisions.
- Reuse existing helpers before creating new ones.
- Surface errors explicitly; do not swallow failures.
- Preserve type safety; avoid `any` and unsafe casts.
- Update docs when architecture changes.
- Add tests for domain logic and compiler logic.
- Add at least one smoke path for every shipped feature.

## Verification
After each stage:
- install dependencies
- run typecheck
- run lint
- run unit tests
- run integration and smoke tests for the stage
- document known limitations and next steps

## Product philosophy
- Fast preview, deterministic export.
- Own the model, compile to ffmpeg.
- AI assists editing; AI does not replace editor control.
