# OpenClaw Integration

## Stage 7 stance

Clawcut is now OpenClaw-plugin-first.

The intended layering is:

1. Clawcut command/query schema registry
2. Clawcut OpenClaw adapter package
3. local authenticated transport

OpenClaw should treat the HTTP surface as an implementation detail behind the shared schema/tool contract, not as the thing to reverse-engineer.

## Package boundary

The OpenClaw adapter package is:

- [packages/openclaw-plugin](/Users/winten/Developer/KPStudio/packages/openclaw-plugin)
- packaged with [openclaw.plugin.json](/Users/winten/Developer/KPStudio/packages/openclaw-plugin/openclaw.plugin.json)

It is intentionally thin:

- it imports tool and operation metadata from [control-schema.ts](/Users/winten/Developer/KPStudio/packages/ipc/src/control-schema.ts)
- it authenticates against the local control transport
- it maps tool invocations to canonical command/query requests
- it does not implement editor, preview, caption, or export business logic itself

The package now also owns a schema-validated config surface:

- `baseUrl`
- `token`
- `enableReadOnlyTools`
- `enabledMutatingTools`
- `enabledHighImpactTools`

Read-only tools are enabled by default. Mutating and high-impact tools are opt-in through explicit allowlists.

## Tool surface

Current tool coverage includes:

- `clawcut.open_project`
- `clawcut.get_project_summary`
- `clawcut.save_project`
- `clawcut.import_media`
- `clawcut.list_media`
- `clawcut.inspect_media`
- `clawcut.relink_media`
- `clawcut.get_timeline`
- `clawcut.insert_clip`
- `clawcut.split_clip`
- `clawcut.trim_clip`
- `clawcut.move_clip`
- `clawcut.load_preview`
- `clawcut.seek_preview`
- `clawcut.get_preview_state`
- `clawcut.capture_preview_frame`
- `clawcut.transcribe_clip`
- `clawcut.get_transcript`
- `clawcut.generate_captions`
- `clawcut.apply_caption_template`
- `clawcut.export_subtitles`
- `clawcut.analyze_silence`
- `clawcut.find_filler_words`
- `clawcut.generate_highlight_suggestions`
- `clawcut.list_suggestions`
- `clawcut.inspect_suggestion`
- `clawcut.preview_suggestion`
- `clawcut.seek_preview_to_suggestion`
- `clawcut.compile_edit_plan`
- `clawcut.apply_suggestion`
- `clawcut.apply_suggestion_set`
- `clawcut.reject_suggestion`
- `clawcut.start_export`
- `clawcut.query_job`
- `clawcut.list_jobs`
- `clawcut.cancel_job`

Each tool carries:

- category
- description
- operation type
- canonical operation name
- safety class
- mutability class
- sync vs job execution
- required scopes
- machine-readable input schema
- result contract summary
- `availableByDefault`

## Safety model

OpenClaw tools expose explicit impact classes:

- `read-only`
- `mutating`
- `high-impact`

High-impact examples:

- `clawcut.import_media`
- `clawcut.relink_media`
- `clawcut.transcribe_clip`
- `clawcut.start_export`
- `clawcut.cancel_job`

This is intended for future allowlisting and policy controls. The current local transport already enforces auth scopes, and the same metadata is available to the tool manifest.

Default exposure policy:

- `read-only`
  - enabled by default
- `mutating`
  - optional and allowlist-friendly by default
- `high-impact`
  - optional and allowlist-friendly by default

## Discovery

Discovery paths:

- `GET /api/v1/capabilities`
- `GET /api/v1/openclaw/tools`
- `GET /api/v1/openclaw/manifest`

The manifest includes:

- API version
- protocol version
- auth requirements
- capability availability
- default-enabled tools
- optional allowlist-only tools
- endpoint map
- full tool list

## Example workflow

1. `clawcut.open_project`
2. `clawcut.list_media`
3. `clawcut.get_timeline`
4. `clawcut.transcribe_clip`
5. poll `clawcut.query_job` or subscribe to `GET /api/v1/events`
6. `clawcut.generate_captions`
7. `clawcut.analyze_silence`
8. `clawcut.inspect_suggestion`
9. `clawcut.seek_preview_to_suggestion`
10. `clawcut.compile_edit_plan`
11. wait for approval
12. `clawcut.apply_suggestion`
13. `clawcut.capture_preview_frame`
14. `clawcut.start_export`
15. poll `clawcut.query_job`
16. inspect `export.session` or returned export state for the final output path

## Preview note

Preview inspection and preview control are available to OpenClaw, but the current backend still depends on a live desktop window. Stage 7 makes this controllable and observable, not headless.

## Known limitations

- the current adapter is a local package scaffold, not a marketplace-distributed plugin
- the local transport is still required underneath the adapter
- event updates are lightweight SSE snapshots, not a durable workflow bus
- smart analysis is heuristic and explainable, not a fully autonomous edit system
- compatibility versioning is explicit, but still early-stage and local-first
