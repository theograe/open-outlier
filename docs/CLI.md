# CLI Guide

OpenOutlier ships with a small CLI agent in `apps/cli`.

## Build

```bash
npm run build
```

## Required environment

- `OPENOUTLIER_BASE_URL`
- `OPENOUTLIER_API_KEY`

`API_KEY` can also be used as a fallback.

## Commands

### Run from a seed video

```bash
node apps/cli/dist/index.js run-seed \
  --project 1 \
  --source-set 1 \
  --video "https://www.youtube.com/watch?v=abc123xyz89" \
  --context "Adapt this for editing educators."
```

### Discover channels

```bash
node apps/cli/dist/index.js discover \
  --source-set 1 \
  --query "premiere pro tutorials" \
  --limit 8 \
  --auto-attach
```

## When to use the CLI

Use the CLI when you want:

- simple shell scripting
- cron jobs
- automation runners
- a lightweight alternative to wiring the SDK directly

For richer programmatic integrations, prefer `@openoutlier/sdk`.
