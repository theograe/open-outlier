# Agent Integration Guide

This guide is for agents that want to drive OpenOutlier directly over HTTP.

## What OpenOutlier is

OpenOutlier is a workflow engine for:

1. defining a `Project`
2. tracking channels in `Source Sets`
3. finding and saving `References`
4. generating grounded `Concepts`
5. generating `Thumbnail` variants
6. orchestrating the whole flow through `Workflow Runs`

The easiest way to think about it:

- `Project` = one niche or growth effort
- `Source Set` = a group of channels
- `Reference` = a saved inspiration video
- `Concept` = adapted ideas, titles, and thumbnail direction
- `Workflow Run` = the full guided process

## Auth

Every protected request requires:

```http
x-api-key: YOUR_API_KEY
```

## Best entrypoints

### 1. User gives you a single YouTube video

Use this when the user already has a reference video.

Recommended flow:

1. create or locate a project
2. call `POST /api/workflow-runs/run-auto`
3. pass `seedVideoUrl`
4. stop after `concept_adaptation` if the user only wants ideas/titles/briefs
5. continue to thumbnail generation if the user wants images now

Example:

```json
{
  "projectId": 1,
  "sourceSetId": 1,
  "seedVideoUrl": "https://www.youtube.com/watch?v=abc123xyz89",
  "stopAfterStage": "concept_adaptation",
  "input": {
    "adaptationContext": "Adapt this for English editing educators selling short-form editing services."
  }
}
```

### 2. User gives you a niche, but no video

Use this when the user wants discovery first.

Recommended flow:

1. create or locate a project
2. create or locate a source set
3. call `POST /api/source-sets/:id/discover`
4. attach good channels with `POST /api/source-sets/:id/channels`
5. search references with `POST /api/projects/:id/references/search`
6. generate concepts with `POST /api/projects/:id/concepts/generate`
7. generate thumbnails with `POST /api/projects/:id/thumbnails/generate`

### 3. User wants full autonomous execution

Use:

- `POST /api/workflow-runs/run-auto`

This is the best default autonomous agent entrypoint.

## Canonical workflow

### Source discovery

Purpose:
- define the target niche
- attach the primary channel
- add competitors manually or automatically

Endpoints:
- `POST /api/projects`
- `POST /api/projects/:id/source-sets`
- `POST /api/source-sets/:id/channels`
- `POST /api/source-sets/:id/discover`

### Reference research

Purpose:
- search scanned outlier videos
- save the strongest references into the project

Endpoints:
- `POST /api/projects/:id/references/search`
- `POST /api/projects/:id/references`
- `POST /api/projects/:id/references/import-video`
- `GET /api/projects/:id/references`

### Concept adaptation

Purpose:
- generate grounded ideas, titles, and thumbnail direction

Endpoint:
- `POST /api/projects/:id/concepts/generate`

### Thumbnail creation

Purpose:
- generate an actual thumbnail using project references and optional character profiles

Endpoint:
- `POST /api/projects/:id/thumbnails/generate`

## Workflow modes

- `manual`: a human or agent advances deliberately
- `copilot`: the system pauses between major stages for review
- `auto`: OpenOutlier runs through stages automatically

## Stage control

Agents can start in the middle of the workflow.

Useful fields:

- `startStage`
- `stopAfterStage`
- `referenceIds`
- `seedVideoId`
- `seedVideoUrl`

This is important because many users will enter with a specific video, not a full discovery brief.

## Best practices for agents

- Prefer `run-auto` when the user already gave a strong seed video.
- Prefer source discovery when the user only gave a niche.
- Save good videos as `References` before generating concepts.
- Use project-scoped routes instead of legacy list routes.
- Treat OpenOutlier outputs as grounded suggestions, not guaranteed truth.
- Cite the source references you used in your own final answer.

## Recommended system prompt

Use this as a starting point for an agent that plugs into OpenOutlier:

```text
You are an OpenOutlier research agent.

Your job is to turn niche inputs, competitor channels, or seed YouTube videos into grounded content concepts and thumbnail directions.

Prefer the workflow-native API:
- projects
- source sets
- references
- concepts
- thumbnails
- workflow runs

When the user provides a specific YouTube video, prefer importing it directly and starting from concept adaptation.

When the user provides only a niche, begin with source discovery and reference search.

Always keep outputs grounded in saved references instead of producing generic content ideas.

When possible, return:
- the best adapted idea
- title options
- thumbnail direction
- generated thumbnail URLs if available
- which references were used
```

## Minimal HTTP client shape

Any agent can plug in with:

- a base URL
- an API key
- JSON `POST` support

That means OpenOutlier is already usable as:

- a direct REST integration
- a future SDK backend
- a future MCP tool server backend

## Next packaging layers

The intended packaging order is:

1. REST API
2. OpenAPI spec
3. typed SDK
4. MCP server

The OpenAPI spec lives in [openapi.yaml](openapi.yaml).
