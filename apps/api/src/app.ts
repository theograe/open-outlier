import Fastify from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import multipart from "@fastify/multipart";
import fs from "node:fs/promises";
import path from "node:path";
import { ZodError } from "zod";
import { config } from "./config.js";
import { initializeDatabase } from "./db.js";
import { ScanService } from "./services/scan-service.js";
import { registerListRoutes } from "./routes/lists.js";
import { registerChannelRoutes } from "./routes/channels.js";
import { registerFeedRoutes } from "./routes/feed.js";
import { registerDiscoverRoutes } from "./routes/discover.js";
import { registerScanRoutes } from "./routes/scan.js";
import { registerSettingsRoutes } from "./routes/settings.js";
import { registerAgentRoutes } from "./routes/agent.js";
import { registerResearchRoutes } from "./routes/research.js";
import { registerWorkflowRoutes } from "./routes/workflows.js";

export function buildApp() {
  initializeDatabase();

  const app = Fastify({ logger: true });
  const scanService = new ScanService();
  const mediaRoot = path.resolve(config.mediaRoot);

  void app.register(cors, { origin: true });
  void app.register(sensible);
  void app.register(multipart);

  app.get("/api/health", async () => ({
    ok: true,
    service: "OpenOutlier",
    timestamp: new Date().toISOString(),
  }));

  app.get("/api/media/*", async (request, reply) => {
    const relativePath = (request.params as { "*": string })["*"];
    const normalizedPath = path.normalize(relativePath).replace(/^([/\\])+/, "");
    const absolutePath = path.resolve(mediaRoot, normalizedPath);

    if (absolutePath !== mediaRoot && !absolutePath.startsWith(`${mediaRoot}${path.sep}`)) {
      return reply.forbidden("Invalid media path.");
    }

    let buffer: Buffer;
    try {
      buffer = await fs.readFile(absolutePath);
    } catch {
      return reply.notFound("Media not found.");
    }

    const ext = path.extname(absolutePath).toLowerCase();
    const mimeType = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
    reply.type(mimeType);
    return buffer;
  });

  app.addHook("onRequest", async (request, reply) => {
    if (request.url === "/api/health" || request.url.startsWith("/api/media/")) {
      return;
    }

    const apiKey = request.headers["x-api-key"];
    if (apiKey !== config.apiKey) {
      return reply.unauthorized("Invalid API key.");
    }
  });

  void registerListRoutes(app);
  void registerChannelRoutes(app);
  void registerFeedRoutes(app);
  void registerDiscoverRoutes(app);
  void registerScanRoutes(app, scanService);
  void registerSettingsRoutes(app, scanService);
  void registerAgentRoutes(app);
  void registerResearchRoutes(app);
  void registerWorkflowRoutes(app, scanService);

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: "ValidationError",
        details: error.flatten(),
      });
    }

    app.log.error(error);
    const statusCode =
      typeof error === "object" && error !== null && "statusCode" in error && typeof error.statusCode === "number"
        ? error.statusCode
        : 500;
    const name =
      typeof error === "object" && error !== null && "name" in error && typeof error.name === "string"
        ? error.name
        : "Error";
    const message =
      error instanceof Error
        ? error.message
        : "Unexpected server error";

    return reply.status(statusCode).send({
      error: name,
      message,
    });
  });

  scanService.startScheduler();

  return app;
}
