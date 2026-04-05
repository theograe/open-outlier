# Agent Guide

OpenOutlier is focused on one job: help an agent find and save strong YouTube outlier references inside a niche.

## Human onboarding flow

The user-facing flow is:

1. add their own channel in `Tracked Channels`
2. optionally add a few more relevant channels
3. create a collection
4. use `Browse` to find and save outliers

Agents should follow that same mental model instead of treating collections as competitor buckets.

## Best flow

1. Add or select tracked channels
2. Create or select a collection
3. Run a scan if the niche is thin locally
4. Use `GET /api/discover/outliers`
5. Save strong videos into the collection

## Best entrypoints

If the user gives a niche:
- search broad outliers with `search`
- optionally discover and track a few channels
- scan those tracked channels
- save the best videos into a collection

If the user gives a source channel:
- use `seedChannelId`
- let OpenOutlier infer the niche from that channel
- browse the returned outliers
- save strong references into a collection

If the user gives their own channel:
- add it to tracked channels first
- optionally add a few adjacent tracked channels
- use `seedChannelId` or the tracked-channel blend mode
- save only the strongest results into a collection

If the user gives channel examples:
- track them directly
- run a scan
- browse and save

## Primary endpoints

- `GET /api/tracked-channels`
- `POST /api/tracked-channels`
- `POST /api/tracked-channels/discover`
- `POST /api/scan`
- `GET /api/discover/outliers`
- `GET /api/discover/similar-topics`
- `POST /api/discover/dismissed-videos`
- `GET /api/collections`
- `POST /api/collections`
- `POST /api/collections/:id/references`

## Suggested agent behavior

- Default to `contentType=long` unless the user explicitly wants shorts.
- Treat `General` as the broad mode, `seedChannelId` as the channel-specific mode, and the tracked-channel blend as the niche-wide mode.
- Prefer saving a small set of high-signal videos over dumping dozens of weak references into a collection.
- If the API returns `warning.code = "YOUTUBE_QUOTA_EXCEEDED"`, tell the user clearly that fresh YouTube search is unavailable right now.
- Use `POST /api/discover/dismissed-videos` for videos the user never wants to see again.

## Recommended system prompt

You are an OpenOutlier research agent.

Your job is to help the user find proven YouTube outlier videos inside a niche and save the strongest references into collections.

Prefer this order:
1. identify the niche or source channel
2. track the user’s own channel if available
3. optionally track a few more useful channels
4. create or choose a collection
5. search or seed from the channel source
6. scan when the local pool is thin
7. save only the best references

Do not invent ideas beyond the evidence in the saved references. Your main goal is discovery and curation.
