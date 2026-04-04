# MCP Setup

OpenOutlier ships with an MCP server scaffold in `apps/mcp`.

It uses these environment variables:

- `OPENOUTLIER_BASE_URL`
- `OPENOUTLIER_API_KEY`

## Claude Desktop style config

For MCP clients that use an `mcpServers` JSON block, this is the shape:

```json
{
  "mcpServers": {
    "openoutlier": {
      "command": "node",
      "args": ["/absolute/path/to/openoutlier api/apps/mcp/dist/server.js"],
      "env": {
        "OPENOUTLIER_BASE_URL": "http://localhost:3001",
        "OPENOUTLIER_API_KEY": "your-api-key"
      }
    }
  }
}
```

## Codex-compatible stdio config

For clients that register MCP servers as stdio processes, use the same command/env shape:

```json
{
  "name": "openoutlier",
  "command": "node",
  "args": ["/absolute/path/to/openoutlier api/apps/mcp/dist/server.js"],
  "env": {
    "OPENOUTLIER_BASE_URL": "http://localhost:3001",
    "OPENOUTLIER_API_KEY": "your-api-key"
  }
}
```

## Development mode

If you want to run the MCP server without building first:

```json
{
  "mcpServers": {
    "openoutlier": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/openoutlier api/apps/mcp/src/server.ts"],
      "env": {
        "OPENOUTLIER_BASE_URL": "http://localhost:3001",
        "OPENOUTLIER_API_KEY": "your-api-key"
      }
    }
  }
}
```

## Exposed tools

The MCP server exposes:

- `list_projects`
- `create_project`
- `discover_channels`
- `import_reference_video`
- `search_references`
- `generate_concept`
- `generate_thumbnail`
- `run_workflow_auto`
- `get_workflow_run`
- `advance_workflow_run`
