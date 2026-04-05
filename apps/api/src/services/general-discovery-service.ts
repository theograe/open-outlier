import { computeMomentumScore, getContentType, parseDurationToSeconds } from "@openoutlier/core";
import { db, getSetting, upsertSetting } from "../db.js";
import { isoNow, median, subtractDays } from "../utils.js";
import { YoutubeClient } from "./youtube.js";

const GENERAL_DISCOVERY_REFRESH_HOURS = 24;
const GENERAL_DISCOVERY_CHANNEL_LIMIT = 40;
const GENERAL_DISCOVERY_MAX_SUBSCRIBERS = 2_000_000;
const GENERAL_DISCOVERY_MIN_SUBSCRIBERS = 10_000;
const GENERAL_DISCOVERY_QUERIES = [
  "small creator documentary",
  "creator breakdown",
  "video essay",
  "commentary video",
  "case study",
  "how to",
  "review",
  "experiment video",
  "storytime",
  "internet deep dive",
];
const GENERAL_DISCOVERY_REGIONS = ["US", "GB", "CA", "AU"];
const EXCLUDED_CHANNEL_TERMS = [
  "mrbeast",
  "blippi",
  "cocomelon",
  "deepmind",
  "google",
  "official",
  "kids",
  "nursery",
  "family",
  "cartoon",
  "rhymes",
  "toy",
  "craft",
  "art",
  "hack",
  "trendsetter",
  "tutorial fountain",
  "movieclips",
];

async function warmThumbnailHashes(
  videos: Array<{ id: string; thumbnailUrl: string | null | undefined }>,
  limit = 40,
): Promise<void> {
  const pending: Array<{ id: string; thumbnailUrl: string }> = [];
  const seen = new Set<string>();

  for (const video of videos) {
    if (!video.id || !video.thumbnailUrl || seen.has(video.id)) {
      continue;
    }
    seen.add(video.id);
    pending.push({ id: video.id, thumbnailUrl: video.thumbnailUrl });
    if (pending.length >= limit) {
      break;
    }
  }

  if (pending.length === 0) {
    return;
  }

  await Promise.allSettled(
    pending.map(async (video) => {
      const exists = db.prepare("SELECT 1 FROM video_thumbnail_features WHERE video_id = ?").get(video.id) as { 1: number } | undefined;
      if (exists) {
        return;
      }
      const response = await fetch(video.thumbnailUrl);
      if (!response.ok) {
        return;
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      const perceptualHash = await (await import("imghash")).default.hash(buffer, 16, "hex");
      db.prepare(`
        INSERT INTO video_thumbnail_features (video_id, algorithm, perceptual_hash, created_at, updated_at)
        VALUES (?, 'imghash', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(video_id) DO UPDATE SET
          perceptual_hash = excluded.perceptual_hash,
          updated_at = CURRENT_TIMESTAMP
      `).run(video.id, perceptualHash);
    }),
  );
}

export class GeneralDiscoveryService {
  private readonly youtubeClient = new YoutubeClient();

  async ensureFreshPool(): Promise<void> {
    const existingCount = (
      db.prepare("SELECT COUNT(*) AS total FROM general_discovery_channels").get() as { total: number }
    ).total;
    const lastRefresh = getSetting("general_discovery_last_refreshed_at");

    if (existingCount > 0 && lastRefresh) {
      const hoursSinceLastRefresh = (Date.now() - new Date(lastRefresh).getTime()) / (1000 * 60 * 60);
      if (Number.isFinite(hoursSinceLastRefresh) && hoursSinceLastRefresh < GENERAL_DISCOVERY_REFRESH_HOURS) {
        return;
      }
    }

    const publishedAfter = subtractDays(365).toISOString();
    const seedIds = new Set<string>();

    for (const regionCode of GENERAL_DISCOVERY_REGIONS) {
      for (const videoId of await this.youtubeClient.listMostPopularVideoIds(regionCode, 25)) {
        seedIds.add(videoId);
      }
    }

    for (const query of GENERAL_DISCOVERY_QUERIES) {
      for (const videoId of await this.youtubeClient.searchVideoIds(query, 10, publishedAfter)) {
        seedIds.add(videoId);
      }
    }

    const seedVideos = await this.youtubeClient.fetchVideos([...seedIds]);
    const channelViewMap = new Map<string, number>();
    for (const video of seedVideos) {
      if (!video.channelId) continue;
      channelViewMap.set(video.channelId, Math.max(channelViewMap.get(video.channelId) ?? 0, video.views));
    }

    const seedChannelIds = [...channelViewMap.entries()]
      .sort((left, right) => right[1] - left[1])
      .map(([channelId]) => channelId)
      .slice(0, GENERAL_DISCOVERY_CHANNEL_LIMIT * 6);

    const candidateChannels: string[] = [];
    for (const channelId of seedChannelIds) {
      const channel = await this.youtubeClient.fetchChannelById(channelId);
      const normalizedName = channel.channelName.toLowerCase();
      if (channel.subscriberCount > GENERAL_DISCOVERY_MAX_SUBSCRIBERS || channel.subscriberCount < GENERAL_DISCOVERY_MIN_SUBSCRIBERS) {
        continue;
      }
      if (EXCLUDED_CHANNEL_TERMS.some((term) => normalizedName.includes(term))) {
        continue;
      }
      candidateChannels.push(channelId);
      if (candidateChannels.length >= GENERAL_DISCOVERY_CHANNEL_LIMIT) {
        break;
      }
    }

    if (candidateChannels.length === 0) {
      return;
    }

    db.prepare("DELETE FROM general_discovery_channels").run();

    for (const channelId of candidateChannels) {
      await this.ingestChannel(channelId);
      db.prepare(`
        INSERT INTO general_discovery_channels (channel_id, source, discovered_at, last_refreshed_at)
        VALUES (?, 'general', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(channel_id) DO UPDATE SET
          source = excluded.source,
          last_refreshed_at = CURRENT_TIMESTAMP
      `).run(channelId);
    }

    upsertSetting("general_discovery_last_refreshed_at", isoNow());
  }

  private async ingestChannel(channelId: string): Promise<void> {
    const channel = await this.youtubeClient.fetchChannelById(channelId);

    db.prepare(`
      INSERT INTO channels (id, name, handle, subscriber_count, thumbnail_url, uploads_playlist_id, median_views, last_scanned_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, NULL)
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

    if (!channel.uploadsPlaylistId) {
      return;
    }

    const publishedAfter = subtractDays(365);
    const videoIds = await this.youtubeClient.listRecentUploadVideoIds(channel.uploadsPlaylistId, publishedAfter);
    const videos = await this.youtubeClient.fetchVideos(videoIds);
    await warmThumbnailHashes(videos, 36);
    const now = isoNow();
    const viewValues = videos.map((video) => video.views).filter((views) => views > 0);
    const medianViews = median(viewValues);
    const safeMedian = medianViews > 0 ? medianViews : 1;

    const insertVideo = db.prepare(`
      INSERT INTO videos (
        id, channel_id, title, published_at, thumbnail_url, views, likes, comments, duration,
        duration_seconds, content_type, outlier_score, momentum_score, view_velocity, engagement_ratio, scanned_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        channel_id = excluded.channel_id,
        title = excluded.title,
        published_at = excluded.published_at,
        thumbnail_url = excluded.thumbnail_url,
        views = excluded.views,
        likes = excluded.likes,
        comments = excluded.comments,
        duration = excluded.duration,
        duration_seconds = excluded.duration_seconds,
        content_type = excluded.content_type,
        outlier_score = excluded.outlier_score,
        momentum_score = excluded.momentum_score,
        view_velocity = excluded.view_velocity,
        engagement_ratio = excluded.engagement_ratio,
        scanned_at = excluded.scanned_at
    `);

    const transaction = db.transaction(() => {
      for (const video of videos) {
        const durationSeconds = parseDurationToSeconds(video.duration);
        const contentType = getContentType(durationSeconds);
        const daysSincePublished = Math.max(
          (Date.now() - new Date(video.publishedAt ?? now).getTime()) / (1000 * 60 * 60 * 24),
          1,
        );
        const outlierScore = Number((video.views / safeMedian).toFixed(4));
        const viewVelocity = Number((video.views / daysSincePublished).toFixed(4));
        const momentumScore = computeMomentumScore(outlierScore, viewVelocity, channel.subscriberCount, medianViews);
        const engagementRatio = video.views > 0 ? Number(((video.likes + video.comments) / video.views).toFixed(4)) : 0;

        insertVideo.run(
          video.id,
          channelId,
          video.title,
          video.publishedAt,
          video.thumbnailUrl,
          video.views,
          video.likes,
          video.comments,
          video.duration,
          durationSeconds,
          contentType,
          outlierScore,
          momentumScore,
          viewVelocity,
          engagementRatio,
          now,
        );
      }

      db.prepare("UPDATE channels SET median_views = ?, last_scanned_at = ? WHERE id = ?").run(
        medianViews,
        now,
        channelId,
      );
      db.prepare("DELETE FROM videos WHERE channel_id = ? AND published_at < ?").run(channelId, publishedAfter.toISOString());
    });

    transaction();
  }
}
