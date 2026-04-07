# MCP

The MCP server exposes OpenOutlier as a small research toolset.

## Environment

- `OPENOUTLIER_BASE_URL`
- `OPENOUTLIER_API_KEY` if your local OpenOutlier instance has `API_KEY` enabled

## Available tools

- `list_collections`
- `create_collection`
- `get_collection`
- `discover_tracked_channels`
- `add_tracked_channel`
- `search_references`
- `save_reference`
- `remove_reference`
- `export_collection`
- `import_reference_video`
- `trigger_scan`
- `get_scan_status`

## Typical flow

1. create or select a collection
2. discover channels to track
3. attach the best channels globally
4. trigger a scan
5. search references
6. save the strongest references
7. remove weak saves if needed
8. export the collection for downstream agents
