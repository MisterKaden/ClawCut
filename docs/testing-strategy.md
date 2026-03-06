# Testing Strategy

## Unit and domain tests

Use Vitest for fast feedback on:

- project document creation and migration
- media reference registration semantics
- toolchain detection parsing
- repository bootstrap behavior

## Integration tests

Integration tests exercise the media-worker layer with real local tooling:

- real `ffprobe` runs on the committed fixture clip
- SQLite persistence is exercised through project repository calls
- missing-tool scenarios are covered by environment overrides

## Smoke tests

Smoke verification launches the built Electron app and drives it through the renderer shell:

1. create a temp project
2. confirm the workspace loads
3. register the bundled fixture
4. assert metadata fields render
5. capture a screenshot artifact

## CI posture

CI should fail on any regression in type safety, lint, domain behavior, worker bootstrap, or the Electron shell smoke path. Stage 1 uses a single macOS workflow so Electron, FFmpeg, and the local desktop stack behave like development machines.
