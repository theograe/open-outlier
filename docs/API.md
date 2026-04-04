# API Guide

This document covers the stable MVP endpoints that matter most for agents and integrations.

## Auth

All protected requests require:

```http
x-api-key: your_api_key
```

## Health

### `GET /api/health`

Returns service health metadata.

## Projects

### `POST /api/projects`

Create a new project and its default competitor source set.

```json
{
  "name": "Editing Ideas",
  "niche": "editing education",
  "primaryChannelInput": "@mychannel"
}
```

### `GET /api/projects`

List projects with summary counts.

### `GET /api/projects/:id`

Return one project with source sets, references, and concept summaries.

### `GET /api/projects/:id/workflow-runs`

List workflow runs for a project.

### `GET /api/projects/:id/thumbnail-generations`

List thumbnail generations for a project.

## Source sets

### `POST /api/projects/:id/source-sets`

Create an extra source set inside a project.

```json
{
  "name": "Short-form editors",
  "role": "competitors"
}
```

### `POST /api/source-sets/:id/channels`

Attach a channel manually.

```json
{
  "handle": "@creator",
  "relationship": "competitor"
}
```

### `POST /api/source-sets/:id/discover`

Discover channels automatically from a query or niche.

```json
{
  "query": "premiere pro editing tutorials",
  "limit": 10,
  "autoAttach": true
}
```

## References

### `POST /api/projects/:id/references/search`

Search the scanned outlier graph for references and optionally save the top results.

```json
{
  "sourceSetId": 1,
  "search": "reel editing",
  "contentType": "long",
  "sort": "momentum",
  "minScore": 2.5,
  "saveTop": 5
}
```

### `POST /api/projects/:id/references`

Save an existing video as a project reference.

```json
{
  "sourceSetId": 1,
  "videoId": "abc123xyz89",
  "kind": "outlier",
  "notes": "Great before/after framing",
  "tags": ["hook", "thumbnail"]
}
```

### `POST /api/projects/:id/references/import-video`

Import a seed video directly from a YouTube URL or ID. This is the main shortcut for agent workflows that need to skip discovery.

```json
{
  "sourceSetId": 1,
  "videoUrl": "https://www.youtube.com/watch?v=abc123xyz89"
}
```

### `GET /api/projects/:id/references`

List saved project references.

## Concepts

### `POST /api/projects/:id/concepts/generate`

Generate an adapted concept grounded in project references.

```json
{
  "referenceIds": [12, 14],
  "context": "Adapt these for editing educators selling short-form editing services."
}
```

### `GET /api/projects/:id/concepts`

List previous concept runs.

## Thumbnails

### `POST /api/projects/:id/thumbnails/generate`

Generate a thumbnail from reference context.

```json
{
  "referenceIds": [12, 14],
  "prompt": "Bright, clean editing desk setup with strong subject separation",
  "characterProfileId": 3,
  "size": "16:9"
}
```

### `GET /api/thumbnails/generations?projectId=:id`

List thumbnail generations, optionally scoped to a project.

## Boards

### `GET /api/boards?projectId=:id`

List boards for a project.

### `POST /api/boards`

Create a board, optionally attached to a project.

```json
{
  "projectId": 1,
  "name": "High CTR packaging"
}
```

### `GET /api/boards/:id`

Read one board and its items.

### `POST /api/boards/:id/items`

Add a video to a board.

## Workflow runs

### `POST /api/workflow-runs`

Create a workflow run in `manual`, `copilot`, or `auto` mode.

```json
{
  "projectId": 1,
  "sourceSetId": 1,
  "mode": "copilot",
  "startStage": "reference_research",
  "referenceIds": [12],
  "input": {
    "adaptationContext": "Turn this into an idea for editing educators."
  }
}
```

### `POST /api/workflow-runs/run-auto`

Create and execute a workflow immediately. This is the simplest agent entrypoint.

```json
{
  "projectId": 1,
  "sourceSetId": 1,
  "seedVideoUrl": "https://www.youtube.com/watch?v=abc123xyz89",
  "stopAfterStage": "concept_adaptation",
  "input": {
    "adaptationContext": "Produce final ideas, titles, and thumbnail direction."
  }
}
```

### `POST /api/workflow-runs/:id/advance`

Advance a created workflow one or more stages based on its mode and current state.

### `GET /api/workflow-runs/:id`

Read workflow state, outputs, and progress.

## Compatibility routes

These remain available during the migration:

- `/api/lists`
- `/api/collections`
- `/api/discover/*`
- `/api/feed`
- `/api/channels/:id`
- `/api/scan/*`

They are still useful for older integrations, but new integrations should prefer projects, source sets, references, concepts, boards, thumbnail generations, and workflow runs.
