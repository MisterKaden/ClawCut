# Clawcut Local API

## Purpose

Stage 7 adds a local authenticated API so OpenClaw and other trusted local tools can control Clawcut without screen-driving the desktop UI.

This API is:

- local-only by default
- authenticated
- command/query oriented
- layered above the existing worker and preview services

It is not a public internet API.

## Transport

- protocol: HTTP
- default bind: `127.0.0.1`
- default port: `42170`
- versioned base routes under `/api/v1`

The running port is surfaced in the desktop UI because the API may fall back to an ephemeral port when the default is already in use.

## Authentication

Protected routes require:

- header: `Authorization`
- format: `Bearer <token>`

Health remains unauthenticated so a caller can detect whether Clawcut is alive without learning anything sensitive.

The token is generated locally and stored in the desktop app data config. The user can:

- inspect the current token in the Clawcut UI
- disable or enable the local API
- regenerate the token

## Scopes

Current scopes:

- `read`
- `edit`
- `preview`
- `export`
- `transcript`
- `admin`

Operations declare required scopes in the capability response and the OpenClaw tool manifest.

## Routes

- `GET /api/v1/health`
  - public health/status check
- `GET /api/v1/capabilities`
  - auth requirements, features, commands, queries, and endpoint map
- `GET /api/v1/openclaw/tools`
  - OpenClaw-oriented tool definitions
- `POST /api/v1/command`
  - typed state-changing operations
- `POST /api/v1/query`
  - typed read-only queries

## Request envelope

Command request:

```json
{
  "name": "project.open",
  "input": {
    "directory": "/absolute/project/path"
  }
}
```

Query request:

```json
{
  "name": "timeline.session",
  "input": {
    "directory": "/absolute/project/path"
  }
}
```

## Response envelope

Success:

```json
{
  "ok": true,
  "apiVersion": "v1",
  "requestId": "uuid",
  "name": "timeline.session",
  "warnings": [],
  "data": {}
}
```

Failure:

```json
{
  "ok": false,
  "apiVersion": "v1",
  "requestId": "uuid",
  "name": "timeline.session",
  "warnings": [],
  "error": {
    "code": "AUTH_INVALID",
    "message": "The supplied local API token was rejected.",
    "status": 401
  }
}
```

## Supported command categories

- project
- media
- timeline
- preview
- export
- captions/transcripts
- jobs

All state-changing actions flow through existing typed commands. The HTTP layer does not invent a second business-logic path.

## Job model

Long-running actions such as:

- import/ingest
- transcription
- export

return machine-readable job-linked state. Callers can poll:

- `jobs.list`
- `jobs.get`
- `export.session`
- `captions.session`

This keeps automation flows retry-safe and observable.

## Error model

The local API returns structured failures for:

- missing or invalid auth
- invalid request envelope
- invalid operation input
- unsupported command/query names
- scope rejection
- worker or preview bridge failures

Request ids are included so development logs can correlate a failing caller request with local API diagnostics.

## Development diagnostics

In development-oriented runs the local API keeps a recent in-memory request log and prints concise request summaries to the console. Sensitive values are not echoed verbatim in those logs.
