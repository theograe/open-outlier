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

server.registerTool("list_projects", {
  description: "List OpenOutlier projects.",
}, async () => textResult(await client.listProjects()));

server.registerTool("create_project", {
  description: "Create a new OpenOutlier project.",
  inputSchema: z.object({
    name: z.string().min(1),
    niche: z.string().optional(),
    primaryChannelInput: z.string().optional(),
    competitorSourceSetName: z.string().optional(),
  }),
}, async (args) => textResult(await client.createProject(args)));

server.registerTool("discover_channels", {
  description: "Discover YouTube channels for a source set.",
  inputSchema: z.object({
    sourceSetId: z.number().int(),
    query: z.string().optional(),
    niche: z.string().optional(),
    limit: z.number().int().min(1).max(25).optional(),
    autoAttach: z.boolean().optional(),
  }),
}, async ({ sourceSetId, ...input }) => textResult(await client.discoverChannels(sourceSetId, input)));

server.registerTool("import_reference_video", {
  description: "Import a seed video directly into a project as a reference.",
  inputSchema: z.object({
    projectId: z.number().int(),
    sourceSetId: z.number().int().optional(),
    videoId: z.string().optional(),
    videoUrl: z.string().optional(),
  }),
}, async ({ projectId, ...input }) => textResult(await client.importReferenceVideo(projectId, input)));

server.registerTool("search_references", {
  description: "Search discover data for references inside a project.",
  inputSchema: z.object({
    projectId: z.number().int(),
    sourceSetId: z.number().int().optional(),
    search: z.string().optional(),
    contentType: z.enum(["all", "long", "short"]).optional(),
    days: z.number().int().optional(),
    sort: z.enum(["score", "views", "date", "velocity", "momentum"]).optional(),
    order: z.enum(["asc", "desc"]).optional(),
    limit: z.number().int().optional(),
    minScore: z.number().optional(),
    maxScore: z.number().optional(),
    saveTop: z.number().int().optional(),
  }),
}, async ({ projectId, ...input }) => textResult(await client.searchReferences(projectId, input)));

server.registerTool("generate_concept", {
  description: "Generate a grounded concept from project references.",
  inputSchema: z.object({
    projectId: z.number().int(),
    referenceIds: z.array(z.number().int()).optional(),
    context: z.string().optional(),
    providerId: z.number().int().optional(),
  }),
}, async ({ projectId, ...input }) => textResult(await client.generateConcept(projectId, input)));

server.registerTool("generate_thumbnail", {
  description: "Generate a thumbnail from project references.",
  inputSchema: z.object({
    projectId: z.number().int(),
    referenceIds: z.array(z.number().int()).optional(),
    prompt: z.string().optional(),
    context: z.string().optional(),
    characterProfileId: z.number().int().nullable().optional(),
    size: z.enum(["16:9", "3:2", "1:1", "2:3"]).optional(),
  }),
}, async ({ projectId, ...input }) => textResult(await client.generateThumbnail(projectId, input)));

server.registerTool("run_workflow_auto", {
  description: "Run an OpenOutlier workflow automatically. Best default for agent execution.",
  inputSchema: z.object({
    projectId: z.number().int(),
    sourceSetId: z.number().int().optional(),
    targetNiche: z.string().optional(),
    targetChannelId: z.string().optional(),
    startStage: z.enum(["source_discovery", "reference_research", "concept_adaptation", "thumbnail_creation"]).optional(),
    stopAfterStage: z.enum(["source_discovery", "reference_research", "concept_adaptation", "thumbnail_creation"]).optional(),
    referenceIds: z.array(z.number().int()).optional(),
    seedVideoId: z.string().optional(),
    seedVideoUrl: z.string().optional(),
    input: z.record(z.string(), z.unknown()).optional(),
  }),
}, async (args) => textResult(await client.runWorkflowAuto(args)));

server.registerTool("get_workflow_run", {
  description: "Fetch a workflow run by id.",
  inputSchema: z.object({
    workflowRunId: z.number().int(),
  }),
}, async ({ workflowRunId }) => textResult(await client.getWorkflowRun(workflowRunId)));

server.registerTool("advance_workflow_run", {
  description: "Advance a workflow run manually or in copilot mode.",
  inputSchema: z.object({
    workflowRunId: z.number().int(),
    input: z.record(z.string(), z.unknown()).optional(),
  }),
}, async ({ workflowRunId, input }) => textResult(await client.advanceWorkflowRun(workflowRunId, input)));

const transport = new StdioServerTransport();
await server.connect(transport);
