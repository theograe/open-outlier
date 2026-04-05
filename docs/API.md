# API

If `API_KEY` is set, protected routes require:

```http
x-api-key: your_api_key
```

If `API_KEY` is not set, local requests work without auth.

## Health

### `GET /api/health`

Returns service health.

## Tracked channels

### `GET /api/tracked-channels`

List tracked channels.

### `POST /api/tracked-channels`

Track a channel globally.

```json
{
  "channelId": "UC123...",
  "relationship": "competitor"
}
```

### `POST /api/tracked-channels/discover`

Discover channels from a query.

```json
{
  "query": "premiere pro tutorials",
  "limit": 8
}
```

## Collections

### `GET /api/collections`

List collections.

### `POST /api/collections`

Create a collection.

```json
{
  "name": "Editing references",
  "niche": "English editing tutorials"
}
```

### `GET /api/collections/:id/references`

List saved references in a collection.

### `POST /api/collections/:id/references`

Save a video into a collection.

```json
{
  "videoId": "abc123xyz89",
  "kind": "outlier",
  "tags": ["editing", "hook"]
}
```

## Discovery

### `GET /api/discover/outliers`

Search the outlier feed.

Useful query params:
- `search`
- `seedChannelId`
- `trackedMode=true`
- `generalMode=true`
- `includeAdjacent=true|false`
- `contentType=all|long|short`
- `days`
- `minScore`
- `maxScore`
- `minViews`
- `maxViews`
- `minSubscribers`
- `maxSubscribers`
- `minDurationSeconds`
- `maxDurationSeconds`
- `sort=momentum|score|views|date|subscribers`
- `order=asc|desc`
- `limit`

Notes:
- `seedChannelId` tells OpenOutlier to infer a niche from that channel and search for related outliers.
- `trackedMode=true` uses the tracked-channel set as a blended niche source.
- `generalMode=true` is the broad general mode.
- when YouTube quota is exhausted, the response can include:

```json
{
  "warning": {
    "code": "YOUTUBE_QUOTA_EXCEEDED",
    "message": "..."
  }
}
```

In that case, OpenOutlier could not refresh from YouTube for that request.

### `GET /api/discover/similar-topics?videoId=...`

Return similar videos for one source video.

### `POST /api/discover/dismissed-videos`

Hide one video from future Browse and Similar results.

```json
{
  "videoId": "abc123xyz89"
}
```

### `GET /api/discover/video/:videoId`

Return one normalized video payload for the Browse UI.

### `GET /api/discover/niches`

Return topic clusters from recent outliers.

## Scanning

### `POST /api/scan`

Start a scan for tracked channels.

Body is optional.

### `GET /api/scan/status`

Fetch current scan status.

## Recommended user flow

1. Add your own channel in `Tracked Channels`
2. Optionally add a few more relevant channels
3. Create a collection
4. Use `GET /api/discover/outliers` in one of three modes:
   - `generalMode=true`
   - `trackedMode=true`
   - `seedChannelId=...`
5. Save strong results with `POST /api/collections/:id/references`
