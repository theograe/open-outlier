import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { getNiches, getSimilarThumbnails, getSimilarTopics, listDiscoverOutliers } from "../services/discovery.js";

const discoverQuerySchema = z.object({
  listId: z.coerce.number().int().optional(),
  minScore: z.coerce.number().optional(),
  maxScore: z.coerce.number().optional(),
  days: z.coerce.number().int().min(1).default(365),
  sort: z.enum(["score", "views", "date", "velocity", "momentum"]).default("score"),
  order: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  channelId: z.string().optional(),
  search: z.string().optional(),
  contentType: z.enum(["all", "long", "short"]).default("all"),
  minSubscribers: z.coerce.number().optional(),
  maxSubscribers: z.coerce.number().optional(),
  minViews: z.coerce.number().optional(),
  maxViews: z.coerce.number().optional(),
  minVelocity: z.coerce.number().optional(),
  maxVelocity: z.coerce.number().optional(),
  minDurationSeconds: z.coerce.number().optional(),
  maxDurationSeconds: z.coerce.number().optional(),
});

export async function registerDiscoverRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/discover/outliers", async (request) => listDiscoverOutliers(discoverQuerySchema.parse(request.query)));

  app.get("/api/discover/similar-topics", async (request, reply) => {
    const query = z.object({ videoId: z.string(), limit: z.coerce.number().int().min(1).max(30).default(12) }).parse(request.query);
    const results = await getSimilarTopics(query.videoId, query.limit);
    if (!results) {
      return reply.notFound("Video not found.");
    }
    return { videoId: query.videoId, items: results };
  });

  app.get("/api/discover/similar-thumbnails", async (request, reply) => {
    const query = z.object({ videoId: z.string(), limit: z.coerce.number().int().min(1).max(30).default(12) }).parse(request.query);
    const results = await getSimilarThumbnails(query.videoId, query.limit);
    if (!results) {
      return reply.notFound("Video not found.");
    }
    return results;
  });

  app.get("/api/discover/niches", async (request) => {
    const query = z.object({ days: z.coerce.number().int().min(1).default(90), limit: z.coerce.number().int().min(1).max(50).default(25) }).parse(request.query);
    return {
      days: query.days,
      niches: getNiches(query.days, query.limit),
    };
  });
}
