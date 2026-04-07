import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { db } from "../db.js";
import { dismissVideo, getNiches, getSimilarThumbnails, getSimilarTopics, getVideoForDiscover, ingestSearchQuery, ingestSeedChannelDiscovery, ingestTrackedChannelDiscovery, listDiscoverOutliers, markSearchQueryRefreshed, markSeedChannelDiscoveryRefreshed, markSimilarVideoRefreshed, markTrackedChannelDiscoveryRefreshed, refreshSimilarTopicDiscovery, shouldRefreshSearchQuery, shouldRefreshSeedChannelDiscovery, shouldRefreshSimilarVideo, shouldRefreshTrackedChannelDiscovery } from "../services/discovery.js";
import { GeneralDiscoveryService } from "../services/general-discovery-service.js";

function isYoutubeQuotaError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("quotaExceeded");
}

const discoverQuerySchema = z.object({
  listId: z.coerce.number().int().optional(),
  projectId: z.coerce.number().int().optional(),
  seedChannelId: z.string().optional(),
  trackedMode: z.coerce.boolean().optional(),
  generalMode: z.coerce.boolean().optional(),
  includeAdjacent: z.coerce.boolean().optional(),
  excludeProjectSaved: z.coerce.boolean().optional(),
  channelScope: z.enum(["all", "tracked", "adjacent"]).optional(),
  minScore: z.coerce.number().optional(),
  maxScore: z.coerce.number().optional(),
  days: z.coerce.number().int().min(1).default(365),
  sort: z.enum(["score", "views", "date", "velocity", "momentum", "subscribers"]).default("momentum"),
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
  forceRefresh: z.coerce.boolean().optional(),
});

export async function registerDiscoverRoutes(app: FastifyInstance): Promise<void> {
  const generalDiscovery = new GeneralDiscoveryService();

  app.get("/api/discover/outliers", async (request) => {
    const query = discoverQuerySchema.parse(request.query);
    let listId = query.listId;
    let warning:
      | {
          code: "YOUTUBE_QUOTA_EXCEEDED";
          message: string;
        }
      | undefined;

    if (query.search?.trim() && (query.forceRefresh || shouldRefreshSearchQuery(query.search))) {
      try {
        await ingestSearchQuery(query.search, query.days);
        markSearchQueryRefreshed(query.search);
      } catch (error) {
        if (!isYoutubeQuotaError(error)) {
          throw error;
        }
        warning = {
          code: "YOUTUBE_QUOTA_EXCEEDED",
          message: "YouTube API quota is exhausted right now. OpenOutlier is showing results from your local scanned library until quota resets.",
        };
      }
    }

    if (query.seedChannelId && (query.forceRefresh || shouldRefreshSeedChannelDiscovery(query.seedChannelId, query.days))) {
      try {
        await ingestSeedChannelDiscovery(query.seedChannelId, query.days);
        markSeedChannelDiscoveryRefreshed(query.seedChannelId, query.days);
      } catch (error) {
        if (!isYoutubeQuotaError(error)) {
          throw error;
        }
        warning = {
          code: "YOUTUBE_QUOTA_EXCEEDED",
          message: "YouTube API quota is exhausted right now. OpenOutlier is using your local scanned library for channel-niche results until quota resets.",
        };
      }
    }

    if (query.trackedMode && (query.forceRefresh || shouldRefreshTrackedChannelDiscovery(query.days))) {
      try {
        await ingestTrackedChannelDiscovery(query.days);
        markTrackedChannelDiscoveryRefreshed(query.days);
      } catch (error) {
        if (!isYoutubeQuotaError(error)) {
          throw error;
        }
        warning = {
          code: "YOUTUBE_QUOTA_EXCEEDED",
          message: "YouTube API quota is exhausted right now. OpenOutlier is using your local scanned library for tracked-channel niche results until quota resets.",
        };
      }
    }

    if (query.generalMode && query.projectId === undefined) {
      const existingPool = db.prepare("SELECT COUNT(*) AS total FROM general_discovery_channels").get() as { total: number };
      if (query.forceRefresh || (existingPool.total ?? 0) === 0) {
        try {
          await generalDiscovery.ensureFreshPool();
        } catch (error) {
          if (!isYoutubeQuotaError(error)) {
            throw error;
          }
          warning = {
            code: "YOUTUBE_QUOTA_EXCEEDED",
            message: "YouTube API quota is exhausted right now. OpenOutlier is using your existing local library until quota resets.",
          };
        }
      } else {
        void generalDiscovery.ensureFreshPool().catch(() => undefined);
      }
    }

    if (query.projectId !== undefined) {
      const existingPool = db.prepare("SELECT COUNT(*) AS total FROM general_discovery_channels").get() as { total: number };
      if (query.forceRefresh || (existingPool.total ?? 0) === 0) {
        try {
          await generalDiscovery.ensureFreshPool();
        } catch (error) {
          if (!isYoutubeQuotaError(error)) {
            throw error;
          }
          warning = {
            code: "YOUTUBE_QUOTA_EXCEEDED",
            message: "YouTube API quota is exhausted right now. OpenOutlier is using your existing local library until quota resets.",
          };
        }
      } else {
        void generalDiscovery.ensureFreshPool().catch(() => undefined);
      }
    }

    if (query.projectId && listId === undefined) {
      const backingGroup = db.prepare("SELECT backing_list_id FROM source_sets WHERE project_id = ? ORDER BY id ASC LIMIT 1").get(query.projectId) as
        | { backing_list_id: number | null }
        | undefined;
      listId = backingGroup?.backing_list_id ?? undefined;
    }

    const result = await listDiscoverOutliers({
      ...query,
      listId,
    });
    return warning ? { ...result, warning } : result;
  });

  app.get("/api/discover/similar-topics", async (request, reply) => {
    const query = z.object({ videoId: z.string(), limit: z.coerce.number().int().min(1).max(30).default(12) }).parse(request.query);
    let warning:
      | {
          code: "YOUTUBE_QUOTA_EXCEEDED";
          message: string;
        }
      | undefined;

    if (shouldRefreshSimilarVideo(query.videoId)) {
      try {
        await Promise.race([
          refreshSimilarTopicDiscovery(query.videoId, 365),
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error("similar-refresh-timeout")), 4500);
          }),
        ]);
        markSimilarVideoRefreshed(query.videoId);
      } catch (error) {
        if (!(error instanceof Error && error.message === "similar-refresh-timeout") && !isYoutubeQuotaError(error)) {
          throw error;
        }
        warning = {
          code: "YOUTUBE_QUOTA_EXCEEDED",
          message: "OpenOutlier could not refresh similar videos from YouTube right now, so it is showing results from your local scanned library.",
        };
      }
    }

    const results = await getSimilarTopics(query.videoId, query.limit);
    if (!results) {
      return reply.notFound("Video not found.");
    }
    return warning ? { videoId: query.videoId, items: results, warning } : { videoId: query.videoId, items: results };
  });

  app.get("/api/discover/similar-thumbnails", async (request, reply) => {
    const query = z.object({ videoId: z.string(), limit: z.coerce.number().int().min(1).max(30).default(12) }).parse(request.query);
    const results = await getSimilarThumbnails(query.videoId, query.limit);
    if (!results) {
      return reply.notFound("Video not found.");
    }
    return { videoId: query.videoId, items: results };
  });

  app.get("/api/discover/video/:videoId", async (request, reply) => {
    const params = z.object({ videoId: z.string() }).parse(request.params);
    const video = getVideoForDiscover(params.videoId);
    if (!video) {
      return reply.notFound("Video not found.");
    }
    return video;
  });

  app.get("/api/discover/niches", async (request) => {
    const query = z.object({ days: z.coerce.number().int().min(1).default(90), limit: z.coerce.number().int().min(1).max(50).default(25) }).parse(request.query);
    return {
      days: query.days,
      niches: getNiches(query.days, query.limit),
    };
  });

  app.post("/api/discover/dismissed-videos", async (request, reply) => {
    const body = z.object({ videoId: z.string().min(1) }).parse(request.body);
    dismissVideo(body.videoId);
    return reply.code(204).send();
  });
}
