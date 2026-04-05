import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { ScanService } from "../services/scan-service.js";
import { WorkflowService } from "../services/workflow-service.js";

export async function registerWorkflowRoutes(app: FastifyInstance, scanService: ScanService): Promise<void> {
  const workflows = new WorkflowService(scanService);

  app.get("/api/projects", async () => workflows.listProjects());
  app.get("/api/collections", async () => workflows.listProjects());

  app.post("/api/projects", async (request, reply) => {
    const body = z.object({
      name: z.string().min(1),
      niche: z.string().optional().nullable(),
      primaryChannelInput: z.string().optional().nullable(),
    }).parse(request.body);

    const project = await workflows.createProjectAsync(body);
    reply.code(201);
    return project;
  });
  app.post("/api/collections", async (request, reply) => {
    const body = z.object({
      name: z.string().min(1),
      niche: z.string().optional().nullable(),
      primaryChannelInput: z.string().optional().nullable(),
    }).parse(request.body);

    const project = await workflows.createProjectAsync(body);
    reply.code(201);
    return project;
  });

  app.get("/api/projects/:id", async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    try {
      return workflows.getProject(id);
    } catch {
      return reply.notFound("Project not found.");
    }
  });
  app.get("/api/collections/:id", async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    try {
      return workflows.getProject(id);
    } catch {
      return reply.notFound("Collection not found.");
    }
  });

  app.delete("/api/projects/:id", async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    try {
      workflows.deleteProject(id);
      reply.code(204);
      return null;
    } catch {
      return reply.notFound("Project not found.");
    }
  });
  app.delete("/api/collections/:id", async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    try {
      workflows.deleteProject(id);
      reply.code(204);
      return null;
    } catch {
      return reply.notFound("Collection not found.");
    }
  });

  app.get("/api/projects/:id/channels", async (request) => {
    const id = Number((request.params as { id: string }).id);
    return workflows.listProjectChannels(id);
  });

  app.post("/api/projects/:id/channels", async (request, reply) => {
    const projectId = Number((request.params as { id: string }).id);
    const body = z.object({
      channelUrl: z.string().optional(),
      channelId: z.string().optional(),
      handle: z.string().optional(),
      relationship: z.string().optional(),
    }).parse(request.body);

    const channel = await workflows.addChannelToProject(projectId, body);
    reply.code(201);
    return channel;
  });

  app.post("/api/projects/:id/channels/discover", async (request) => {
    const projectId = Number((request.params as { id: string }).id);
    const body = z.object({
      query: z.string().optional(),
      niche: z.string().optional(),
      limit: z.number().int().min(1).max(25).optional(),
      autoAttach: z.boolean().default(false),
    }).parse(request.body ?? {});

    return workflows.discoverProjectChannels(projectId, body);
  });

  app.post("/api/projects/:id/references/search", async (request) => {
    const projectId = Number((request.params as { id: string }).id);
    const body = z.object({
      search: z.string().optional(),
      contentType: z.enum(["all", "long", "short"]).optional(),
      days: z.number().int().min(1).optional(),
      sort: z.enum(["score", "views", "date", "velocity", "momentum", "subscribers"]).optional(),
      order: z.enum(["asc", "desc"]).optional(),
      limit: z.number().int().min(1).max(200).optional(),
      minScore: z.number().optional(),
      maxScore: z.number().optional(),
      minViews: z.number().optional(),
      maxViews: z.number().optional(),
      minSubscribers: z.number().optional(),
      maxSubscribers: z.number().optional(),
      minVelocity: z.number().optional(),
      maxVelocity: z.number().optional(),
      minDurationSeconds: z.number().optional(),
      maxDurationSeconds: z.number().optional(),
      saveTop: z.number().int().min(0).max(50).optional(),
    }).parse(request.body ?? {});

    return await workflows.searchReferences(projectId, body);
  });
  app.post("/api/collections/:id/references/search", async (request) => {
    const projectId = Number((request.params as { id: string }).id);
    const body = z.object({
      search: z.string().optional(),
      contentType: z.enum(["all", "long", "short"]).optional(),
      days: z.number().int().min(1).optional(),
      sort: z.enum(["score", "views", "date", "velocity", "momentum", "subscribers"]).optional(),
      order: z.enum(["asc", "desc"]).optional(),
      limit: z.number().int().min(1).max(200).optional(),
      minScore: z.number().optional(),
      maxScore: z.number().optional(),
      minViews: z.number().optional(),
      maxViews: z.number().optional(),
      minSubscribers: z.number().optional(),
      maxSubscribers: z.number().optional(),
      minVelocity: z.number().optional(),
      maxVelocity: z.number().optional(),
      minDurationSeconds: z.number().optional(),
      maxDurationSeconds: z.number().optional(),
      saveTop: z.number().int().min(0).max(50).optional(),
    }).parse(request.body ?? {});

    return await workflows.searchReferences(projectId, body);
  });

  app.get("/api/projects/:id/references", async (request) => {
    const projectId = Number((request.params as { id: string }).id);
    return workflows.listReferences(projectId);
  });
  app.get("/api/collections/:id/references", async (request) => {
    const projectId = Number((request.params as { id: string }).id);
    return workflows.listReferences(projectId);
  });

  app.post("/api/projects/:id/references", async (request, reply) => {
    const projectId = Number((request.params as { id: string }).id);
    const body = z.object({
      videoId: z.string(),
      kind: z.string().optional(),
      notes: z.string().optional().nullable(),
      tags: z.array(z.string()).default([]),
    }).parse(request.body);

    const reference = workflows.saveReference(projectId, body);
    reply.code(201);
    return reference;
  });
  app.post("/api/collections/:id/references", async (request, reply) => {
    const projectId = Number((request.params as { id: string }).id);
    const body = z.object({
      videoId: z.string(),
      kind: z.string().optional(),
      notes: z.string().optional().nullable(),
      tags: z.array(z.string()).default([]),
    }).parse(request.body);

    const reference = workflows.saveReference(projectId, body);
    reply.code(201);
    return reference;
  });

  app.post("/api/projects/:id/references/import-video", async (request, reply) => {
    const projectId = Number((request.params as { id: string }).id);
    const body = z.object({
      videoId: z.string().optional().nullable(),
      videoUrl: z.string().optional().nullable(),
    }).parse(request.body ?? {});

    const imported = await workflows.importReferenceVideo(projectId, body.videoUrl ?? body.videoId ?? "");
    reply.code(201);
    return imported;
  });
  app.post("/api/collections/:id/references/import-video", async (request, reply) => {
    const projectId = Number((request.params as { id: string }).id);
    const body = z.object({
      videoId: z.string().optional().nullable(),
      videoUrl: z.string().optional().nullable(),
    }).parse(request.body ?? {});

    const imported = await workflows.importReferenceVideo(projectId, body.videoUrl ?? body.videoId ?? "");
    reply.code(201);
    return imported;
  });
}
