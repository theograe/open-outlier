import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { OpenOutlierClient } from "@openoutlier/sdk";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const client = new OpenOutlierClient({
  baseUrl: process.env.OPENOUTLIER_BASE_URL ?? "http://localhost:3001",
  apiKey: requireEnv("OPENOUTLIER_API_KEY"),
});

const server = new McpServer({
  name: "openoutlier-mcp",
  version: "1.0.0",
});

function toStructuredContent(payload: unknown): Record<string, unknown> {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }

  if (Array.isArray(payload)) {
    return { items: payload as unknown[] };
  }

  return { value: payload };
}

function textResult(payload: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload, null, 2),
      },
    ],
    structuredContent: toStructuredContent(payload),
  };
}

server.registerTool("list_collections", {
  description: "List OpenOutlier collections.",
}, async () => textResult(await client.listCollections()));

server.registerTool("create_collection", {
  description: "Create a new OpenOutlier collection.",
  inputSchema: z.object({
    name: z.string().min(1),
    niche: z.string().optional(),
    primaryChannelInput: z.string().optional(),
  }),
}, async (args) => textResult(await client.createCollection(args)));

server.registerTool("get_collection", {
  description: "Fetch one OpenOutlier collection with saved references.",
  inputSchema: z.object({
    collectionId: z.number().int(),
  }),
}, async ({ collectionId }) => textResult(await client.getCollection(collectionId)));

server.registerTool("discover_tracked_channels", {
  description: "Discover YouTube channels to track.",
  inputSchema: z.object({
    query: z.string().optional(),
    niche: z.string().optional(),
    limit: z.number().int().min(1).max(25).optional(),
    autoAttach: z.boolean().optional(),
  }),
}, async (input) => textResult(await client.discoverTrackedChannels(input)));

server.registerTool("add_tracked_channel", {
  description: "Track a channel globally for Browse.",
  inputSchema: z.object({
    channelUrl: z.string().optional(),
    channelId: z.string().optional(),
    handle: z.string().optional(),
  }),
}, async (input) => textResult(await client.addTrackedChannel(input)));

server.registerTool("search_references", {
  description: "Search the scanned outlier feed for a collection.",
  inputSchema: z.object({
    collectionId: z.number().int(),
    search: z.string().optional(),
    contentType: z.enum(["all", "long", "short"]).optional(),
    days: z.number().int().optional(),
    sort: z.enum(["score", "views", "date", "momentum", "subscribers"]).optional(),
    order: z.enum(["asc", "desc"]).optional(),
    limit: z.number().int().optional(),
    minScore: z.number().optional(),
    maxScore: z.number().optional(),
    saveTop: z.number().int().optional(),
  }),
}, async ({ collectionId, ...input }) => textResult(await client.searchReferences(collectionId, input)));

server.registerTool("save_reference", {
  description: "Save a video into a collection.",
  inputSchema: z.object({
    collectionId: z.number().int(),
    videoId: z.string(),
    notes: z.string().optional(),
    tags: z.array(z.string()).optional(),
  }),
}, async ({ collectionId, ...input }) => textResult(await client.saveReference(collectionId, input)));

server.registerTool("import_reference_video", {
  description: "Import a single YouTube video directly as a saved reference.",
  inputSchema: z.object({
    collectionId: z.number().int(),
    videoId: z.string().optional(),
    videoUrl: z.string().optional(),
  }),
}, async ({ collectionId, ...input }) => textResult(await client.importReferenceVideo(collectionId, input)));

server.registerTool("trigger_scan", {
  description: "Start a scan for the tracked channel library.",
  inputSchema: z.object({
    listId: z.number().int().optional(),
  }),
}, async ({ listId }) => textResult(await client.triggerScan(listId)));

server.registerTool("get_scan_status", {
  description: "Fetch the current scan status.",
}, async () => textResult(await client.getScanStatus()));

const transport = new StdioServerTransport();
await server.connect(transport);
