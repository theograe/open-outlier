# OpenOutlier

OpenOutlier is an open-source, local-first YouTube outlier finder.

It is built for one narrow job:
- add your channel
- optionally track a few more channels in your niche
- browse YouTube outliers
- save the best references into collections

## What ships in this MVP

- Fastify API for discovery, tracked channels, collections, scans, and saved references
- Next.js local UI for Browse, Collections, Tracked Channels, and Settings
- SQLite storage for local/self-hosted use
- agent-friendly REST API, TypeScript SDK, MCP server, and CLI
- topic-based similar-video browsing

## Product model

- `Browse`: the main feed for finding outliers
- `Tracked channels`: channels you want OpenOutlier to learn from and scan
- `Collections`: saved-video folders for references you want to keep
- `Settings`: API keys and local connection health

## Workspace layout

- `apps/api`: Fastify API and scan scheduler
- `apps/cli`: simple CLI for discovery tasks
- `apps/mcp`: MCP server exposing OpenOutlier as tools
- `apps/web`: local Next.js interface
- `packages/core`: scoring and similarity utilities
- `packages/sdk`: typed TypeScript client
- `packages/storage`: SQLite bootstrap and schema

## Requirements

- Node.js `20+`
- a YouTube Data API key
- optionally an OpenAI API key for embedding-backed similarity and channel niche matching
- optionally an API key if you want to protect the API for local agents or external clients

## Quick start

1. Copy `.env.example` to `.env`
2. Fill in the required values
3. Install dependencies with `npm install`
4. Start the app with `npm run dev`
5. Open [http://localhost:3000](http://localhost:3000)

Minimal `.env`:

```env
YOUTUBE_API_KEY=...
OPENAI_API_KEY=...
```

Optional local auth:

```env
API_KEY=choose-a-long-random-string
NEXT_PUBLIC_OPENOUTLIER_API_URL=http://localhost:3001
NEXT_PUBLIC_OPENOUTLIER_API_KEY=choose-a-long-random-string
```

## Onboarding flow

1. Open `Tracked Channels`
2. Add your own channel URL or handle
3. Optionally add a few more channels in the same niche
4. Open `Collections` and create one collection for the references you want to keep
5. Open `Browse`
6. Stay in `General`, use `All tracked channels`, or pick one tracked channel
7. Search, browse, and save the best outliers into your collection

## How Browse works

- `General`: broad YouTube outliers
- `All tracked channels`: uses your tracked set as a niche source
- `Single tracked channel`: uses one tracked channel as the niche source
- `View similar`: opens a related-video browse page for the selected video
- `Save`: adds the video to a collection
- `Track channel`: adds that channel to your tracked set
- `×`: hides that video from future Browse and Similar results

## Scripts

- `npm run dev`: run API and web locally
- `npm run build`: build all workspaces
- `npm run lint`: lint API and web
- `npm run test`: run core and API tests

## API highlights

- `GET /api/tracked-channels`
- `POST /api/tracked-channels`
- `GET /api/collections`
- `POST /api/collections`
- `GET /api/discover/outliers`
- `GET /api/discover/similar-topics`
- `POST /api/discover/dismissed-videos`
- `POST /api/collections/:id/references`
- `POST /api/scan`

More detail lives in `docs/API.md`, with agent guidance in `docs/AGENTS.md`.

## Agent integrations

OpenOutlier can be consumed four ways:

- direct REST API
- the TypeScript SDK in `packages/sdk`
- the MCP server in `apps/mcp`
- the CLI in `apps/cli`

For local open-source use, the simplest mode is to leave `API_KEY` unset.
That means the local web UI works without a browser-exposed key, and local agents can call the API directly on `http://localhost:3001`.

## Notes

- YouTube search is quota-limited. If your quota is exhausted, OpenOutlier shows a clear quota warning in Browse and Similar.
- The app is intentionally local-first, so some searches are slower than premium hosted tools that precompute large cloud indexes.

## License

[MIT](LICENSE)
