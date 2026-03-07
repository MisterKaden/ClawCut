# Clawcut Local Control

## Purpose

Stage 7 makes Clawcut controllable as a local programmable media engine.

The integration stack is intentionally ordered this way:

1. shared command/query schema layer
2. OpenClaw plugin/tool adapter
3. local authenticated transport

The HTTP transport is useful, but it is not the product identity. The durable contract is the typed operation and tool schema registry in [control-schema.ts](/Users/winten/Developer/KPStudio/packages/ipc/src/control-schema.ts).

## Core pieces

- Shared operation registry:
  - canonical operation names
  - input schema
  - output contract summary
  - safety class
  - mutability class
  - sync vs job execution
  - required scopes
- OpenClaw adapter package:
  - [index.ts](/Users/winten/Developer/KPStudio/packages/openclaw-plugin/src/index.ts)
  - [openclaw.plugin.json](/Users/winten/Developer/KPStudio/packages/openclaw-plugin/openclaw.plugin.json)
  - thin wrapper around the Clawcut transport
  - no editor/business-logic duplication
- Local transport:
  - [local-api.ts](/Users/winten/Developer/KPStudio/apps/desktop/src/main/local-api.ts)
  - localhost-only HTTP by default
  - bearer auth
  - command/query envelopes
  - event stream hook

## Versions

- API version: `v1`
- integration protocol version: `1`
- OpenClaw manifest version: `1`

These are exposed in capability and manifest responses so automation callers can detect incompatible future changes explicitly.

## Safety classes

Every exported operation/tool is classified as one of:

- `read-only`
- `mutating`
- `high-impact`

Examples:

- `project.summary`, `timeline.get`, `preview.state`, `jobs.get`
  - `read-only`
- `timeline.insertClip`, `timeline.moveClip`, `captions.applyTemplate`, `preview.seek`
  - `mutating`
- `media.import`, `media.relink`, `transcript.transcribeClip`, `export.start`, `jobs.cancel`
  - `high-impact`

This metadata is shared by:

- capability discovery
- OpenClaw tool discovery
- local transport policy checks
- future allowlist or approval policy layers

## OpenClaw plugin-first model

The OpenClaw-facing package is [packages/openclaw-plugin](/Users/winten/Developer/KPStudio/packages/openclaw-plugin).

It exports:

- a static plugin descriptor
- a validated plugin manifest file
- a schema-validated plugin config parser
- a generated tool manifest
- a thin local HTTP client
- tool-to-operation mapping helpers

Tool examples:

- `clawcut.open_project`
- `clawcut.get_project_summary`
- `clawcut.list_media`
- `clawcut.get_timeline`
- `clawcut.capture_preview_frame`
- `clawcut.transcribe_clip`
- `clawcut.generate_captions`
- `clawcut.start_export`
- `clawcut.query_job`

Default exposure policy in the plugin package:

- read-only inspection tools are enabled by default
- mutating tools require explicit allowlisting
- high-impact tools require explicit allowlisting

This policy is enforced by the adapter client itself, not only by documentation.

The tool layer can collapse or refine transport operations when that improves automation ergonomics. Example: `clawcut.trim_clip` maps to either `timeline.trimClipStart` or `timeline.trimClipEnd` based on the requested edge.

## Local transport

Routes:

- `GET /api/v1/health`
- `GET /api/v1/capabilities`
- `GET /api/v1/openclaw/tools`
- `GET /api/v1/openclaw/manifest`
- `GET /api/v1/events`
- `POST /api/v1/command`
- `POST /api/v1/query`

Auth:

- header: `Authorization`
- format: `Bearer <token>`

Default bind:

- `127.0.0.1`
- port `42170` unless a fallback ephemeral port is needed

## Request/response shape

Command request:

```json
{
  "name": "export.start",
  "input": {
    "directory": "/absolute/project/path",
    "request": {
      "timelineId": "timeline-1",
      "presetId": "video-share-720p"
    }
  }
}
```

Query request:

```json
{
  "name": "timeline.get",
  "input": {
    "directory": "/absolute/project/path"
  }
}
```

Success envelope:

```json
{
  "ok": true,
  "apiVersion": "v1",
  "requestId": "uuid",
  "name": "timeline.get",
  "warnings": [],
  "data": {}
}
```

Failure envelope:

```json
{
  "ok": false,
  "apiVersion": "v1",
  "requestId": "uuid",
  "name": "export.start",
  "warnings": [],
  "error": {
    "code": "AUTH_FORBIDDEN",
    "message": "The configured local API token does not allow export.start.",
    "status": 403
  }
}
```

## Events and jobs

Long-running work stays job-based.

Current long-running categories:

- ingest
- transcription
- export

Callers can:

- poll `jobs.get`, `jobs.list`, `export.session`, `captions.session`
- subscribe to `GET /api/v1/events?directory=/absolute/project/path`

Current event types:

- `ready`
- `jobs.snapshot`
- `heartbeat`

## Preview inspection

Automation callers can inspect current preview state with:

- `preview.state`
- `preview.frame-snapshot`
- `preview.frame-reference`
- tool: `clawcut.capture_preview_frame`

`preview.frame-reference` is the cheap default for OpenClaw-style reasoning. It returns timing, clip identity, source mode, dimensions, and warning/error state without requiring inline image data.

## Known limitations

- the current preview backend still depends on a live desktop window
- the event stream is a lightweight SSE hook, not a durable event bus
- the local transport is intentionally localhost-only and not designed for remote/public exposure
- the OpenClaw package is a thin adapter scaffold, not a general plugin marketplace format
