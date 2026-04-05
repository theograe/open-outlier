import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { db } from "../db.js";
import { YoutubeClient } from "../services/youtube.js";
import type { ScanService } from "../services/scan-service.js";

export async function registerTrackedChannelRoutes(app: FastifyInstance, scanService: ScanService): Promise<void> {
  const youtube = new YoutubeClient();

  app.get("/api/tracked-channels", async () => {
    return db.prepare(`
      SELECT
        channels.id,
        channels.name,
        channels.handle,
        channels.subscriber_count AS subscriberCount,
        channels.thumbnail_url AS thumbnailUrl,
        channels.median_views AS channelMedianViews,
        channels.last_scanned_at AS lastScannedAt,
        tracked_channels.relationship,
        tracked_channels.added_at AS addedAt
      FROM tracked_channels
      INNER JOIN channels ON channels.id = tracked_channels.channel_id
      ORDER BY tracked_channels.added_at DESC, channels.name ASC
    `).all();
  });

  app.post("/api/tracked-channels", async (request, reply) => {
    const body = z.object({
      channelUrl: z.string().optional(),
      channelId: z.string().optional(),
      handle: z.string().optional(),
      relationship: z.string().optional(),
    }).parse(request.body);

    const channelInput = body.channelUrl ?? body.channelId ?? body.handle;
    if (!channelInput) {
      return reply.badRequest("Provide channelUrl, channelId, or handle.");
    }

    const channel = await youtube.resolveChannel(channelInput);

    db.prepare(`
      INSERT INTO channels (id, name, handle, subscriber_count, thumbnail_url, uploads_playlist_id)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        handle = excluded.handle,
        subscriber_count = excluded.subscriber_count,
        thumbnail_url = excluded.thumbnail_url,
        uploads_playlist_id = excluded.uploads_playlist_id
    `).run(
      channel.channelId,
      channel.channelName,
      channel.handle,
      channel.subscriberCount,
      channel.thumbnailUrl,
      channel.uploadsPlaylistId,
    );

    db.prepare(`
      INSERT INTO tracked_channels (channel_id, relationship)
      VALUES (?, ?)
      ON CONFLICT(channel_id) DO UPDATE SET relationship = excluded.relationship
    `).run(channel.channelId, body.relationship ?? "competitor");

    void scanService.triggerChannelScan(channel.channelId).catch(() => undefined);

    reply.code(201);
    return channel;
  });

  app.post("/api/tracked-channels/discover", async (request) => {
    const body = z.object({
      query: z.string().min(1),
      limit: z.number().int().min(1).max(25).default(12),
    }).parse(request.body ?? {});

    const existingIds = new Set(
      (db.prepare("SELECT channel_id FROM tracked_channels").all() as Array<{ channel_id: string }>).map((row) => row.channel_id),
    );

    const suggestions = (await youtube.searchChannels(body.query, body.limit))
      .filter((channel) => !existingIds.has(channel.channelId))
      .map((channel) => ({
        channelId: channel.channelId,
        channelName: channel.channelName,
        handle: channel.handle,
        subscriberCount: channel.subscriberCount,
        thumbnailUrl: channel.thumbnailUrl,
      }));

    return {
      query: body.query,
      suggestions,
    };
  });

  app.delete("/api/tracked-channels/:channelId", async (request, reply) => {
    const { channelId } = z.object({ channelId: z.string() }).parse(request.params);
    const result = db.prepare("DELETE FROM tracked_channels WHERE channel_id = ?").run(channelId);
    if (result.changes === 0) {
      return reply.notFound("Tracked channel not found.");
    }
    reply.code(204);
    return null;
  });
}
