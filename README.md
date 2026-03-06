# Clawcut

Clawcut is a desktop video editor built around a versioned edit model, deterministic FFmpeg exports, and editable AI-assisted captions.

Stage 1 bootstraps:

- an Electron + React + TypeScript desktop shell
- a typed media-worker process for FFmpeg, ffprobe, and SQLite-backed metadata
- a hybrid project format with `clawcut.project.json` plus `.clawcut/project.db`
- fixture media registration and inspection
- unit, integration, and smoke verification

## Commands

```bash
pnpm install
pnpm dev
pnpm typecheck
pnpm lint
pnpm test
pnpm smoke
```

## Stage 1 scope

Stage 1 is intentionally narrow:

- create and open projects
- detect `ffmpeg` and `ffprobe`
- register a bundled fixture clip
- inspect probed media metadata

Timeline editing, real preview playback, export, and Whisper jobs are staged for later roadmap milestones.
