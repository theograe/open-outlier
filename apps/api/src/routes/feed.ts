import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { listDiscoverOutliers } from "../services/discovery.js";

export async function registerFeedRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/feed", async (request) => {
    const querySchema = z.object({
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

    return await listDiscoverOutliers(querySchema.parse(request.query));
  });
}
