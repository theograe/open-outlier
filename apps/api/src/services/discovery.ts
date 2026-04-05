import { computeMomentumScore, getContentType, getScoreBand, parseDurationToSeconds, similarityScore, titleFormat, tokenizeTitle } from "@openoutlier/core";
import imghash from "imghash";
import { db, getSetting } from "../db.js";
import { EmbeddingsService } from "./embeddings-service.js";
import { YoutubeClient } from "./youtube.js";
import { isoNow, median, subtractDays } from "../utils.js";

export type DiscoverQuery = {
  listId?: number;
  projectId?: number;
  seedChannelId?: string;
  generalMode?: boolean;
  excludeProjectSaved?: boolean;
  channelScope?: "all" | "tracked" | "adjacent";
  minScore?: number;
  maxScore?: number;
  days: number;
  sort: "score" | "views" | "date" | "velocity" | "momentum" | "subscribers";
  order: "asc" | "desc";
  page: number;
  limit: number;
  channelId?: string;
  search?: string;
  contentType?: "all" | "long" | "short";
  minSubscribers?: number;
  maxSubscribers?: number;
  minViews?: number;
  maxViews?: number;
  minVelocity?: number;
  maxVelocity?: number;
  minDurationSeconds?: number;
  maxDurationSeconds?: number;
};

const embeddingsService = new EmbeddingsService();
const youtubeClient = new YoutubeClient();
const THUMBNAIL_HASH_BITS = 16;
const SEED_DISCOVERY_TTL_MS = 1000 * 60 * 60 * 6;
const seedDiscoveryCache = new Map<string, number>();
const seedProfileCache = new Map<string, { cachedAt: number; queryText: string; queries: string[] }>();
const orderMap = {
  asc: "ASC",
  desc: "DESC",
} as const;

const CHANNEL_QUERY_STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
  "your",
  "into",
  "without",
  "about",
  "make",
  "made",
  "best",
  "video",
  "videos",
  "channel",
  "tutorial",
  "complete",
  "beginner",
  "beginners",
  "ultimate",
  "guide",
  "how",
  "what",
  "why",
  "when",
  "tips",
  "tricks",
  "edit",
  "editing",
  "youtube",
  "creator",
  "creators",
  "official",
  "review",
  "reacts",
]);

function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function tokenizeSearchQuery(value: string): string[] {
  return normalizeSearchText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function hexHammingDistance(left: string, right: string): number {
  let distance = 0;
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftNibble = Number.parseInt(left[index] ?? "0", 16);
    const rightNibble = Number.parseInt(right[index] ?? "0", 16);
    const xor = leftNibble ^ rightNibble;
    distance += xor.toString(2).split("1").length - 1;
  }
  return distance + Math.abs(left.length - right.length) * 4;
}

async function ensureThumbnailHash(videoId: string, thumbnailUrl: string | null | undefined): Promise<string | null> {
  const cached = db.prepare("SELECT perceptual_hash FROM video_thumbnail_features WHERE video_id = ?").get(videoId) as
    | { perceptual_hash: string }
    | undefined;
  if (cached?.perceptual_hash) {
    return cached.perceptual_hash;
  }

  if (!thumbnailUrl) {
    return null;
  }

  const response = await fetch(thumbnailUrl);
  if (!response.ok) {
    return null;
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const perceptualHash = await imghash.hash(buffer, THUMBNAIL_HASH_BITS, "hex");

  db.prepare(`
    INSERT INTO video_thumbnail_features (video_id, algorithm, perceptual_hash, created_at, updated_at)
    VALUES (?, 'imghash', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(video_id) DO UPDATE SET
      perceptual_hash = excluded.perceptual_hash,
      updated_at = CURRENT_TIMESTAMP
  `).run(videoId, perceptualHash);

  return perceptualHash;
}

function upsertChannelRecord(input: {
  channelId: string;
  channelName: string;
  handle: string | null;
  subscriberCount: number;
  thumbnailUrl: string | null;
  uploadsPlaylistId: string | null;
  medianViews?: number;
}) {
  db.prepare(`
    INSERT INTO channels (id, name, handle, subscriber_count, thumbnail_url, uploads_playlist_id, median_views, last_scanned_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      handle = excluded.handle,
      subscriber_count = excluded.subscriber_count,
      thumbnail_url = excluded.thumbnail_url,
      uploads_playlist_id = excluded.uploads_playlist_id,
      median_views = excluded.median_views,
      last_scanned_at = excluded.last_scanned_at
  `).run(
    input.channelId,
    input.channelName,
    input.handle,
    input.subscriberCount,
    input.thumbnailUrl,
    input.uploadsPlaylistId,
    input.medianViews ?? 0,
    isoNow(),
  );
}

function upsertVideoRecord(
  video: {
    id: string;
    channelId: string | null;
    title: string;
    publishedAt: string | null;
    thumbnailUrl: string | null;
    views: number;
    likes: number;
    comments: number;
    duration: string | null;
  },
  channelStats: { medianViews: number },
) {
  if (!video.channelId) {
    return;
  }

  const durationSeconds = parseDurationToSeconds(video.duration);
  const safeMedian = Math.max(channelStats.medianViews || 0, 1);
  const publishedTime = video.publishedAt ? new Date(video.publishedAt).getTime() : Date.now();
  const daysSincePublished = Math.max((Date.now() - publishedTime) / (1000 * 60 * 60 * 24), 1);
  const outlierScore = Number((video.views / safeMedian).toFixed(4));
  const viewVelocity = Number((video.views / daysSincePublished).toFixed(4));
  const momentumScore = computeMomentumScore(outlierScore, viewVelocity, 0, safeMedian);
  const engagementRatio = video.views > 0 ? Number(((video.likes + video.comments) / video.views).toFixed(4)) : 0;

  db.prepare(`
    INSERT INTO videos (
      id, channel_id, title, published_at, thumbnail_url, views, likes, comments, duration,
      duration_seconds, content_type, outlier_score, momentum_score, view_velocity, engagement_ratio, scanned_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
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
      scanned_at = CURRENT_TIMESTAMP
  `).run(
    video.id,
    video.channelId,
    video.title,
    video.publishedAt,
    video.thumbnailUrl,
    video.views,
    video.likes,
    video.comments,
    video.duration,
    durationSeconds,
    getContentType(durationSeconds),
    outlierScore,
    momentumScore,
    viewVelocity,
    engagementRatio,
  );
}

export async function ingestSearchQuery(searchText: string, days = 365): Promise<void> {
  const query = searchText.trim();
  if (!query || query.length < 2) {
    return;
  }

  const publishedAfter = subtractDays(Math.min(days, 365)).toISOString();
  const searchVideoIds = [
    ...(await youtubeClient.searchVideoIds(query, 12, publishedAfter, "relevance")),
    ...(await youtubeClient.searchVideoIds(query, 12, publishedAfter, "viewCount")),
    ...(query.includes(" ") ? await youtubeClient.searchVideoIds(`"${query}"`, 8, publishedAfter, "relevance") : []),
  ];
  const dedupedVideoIds = [...new Set(searchVideoIds)];
  if (dedupedVideoIds.length === 0) {
    return;
  }

  const seedVideos = await youtubeClient.fetchVideos(dedupedVideoIds);
  const channelIds = [...new Set(seedVideos.map((video) => video.channelId).filter(Boolean) as string[])].slice(0, 10);
  const channelMedians = new Map<string, number>();

  for (const channelId of channelIds) {
    const channel = await youtubeClient.fetchChannelById(channelId);
    let medianViews = 0;

    if (channel.uploadsPlaylistId) {
      const uploadIds = await youtubeClient.listRecentUploadVideoIds(channel.uploadsPlaylistId, subtractDays(Math.min(days, 365)));
      const sampleVideoIds = uploadIds.slice(0, 20);
      const channelVideos = sampleVideoIds.length > 0 ? await youtubeClient.fetchVideos(sampleVideoIds) : [];
      medianViews = median(channelVideos.map((video) => Math.max(video.views, 0)).filter((value) => value > 0));

      upsertChannelRecord({
        channelId: channel.channelId,
        channelName: channel.channelName,
        handle: channel.handle,
        subscriberCount: channel.subscriberCount,
        thumbnailUrl: channel.thumbnailUrl,
        uploadsPlaylistId: channel.uploadsPlaylistId,
        medianViews,
      });

      for (const channelVideo of channelVideos) {
        upsertVideoRecord(channelVideo, { medianViews });
      }
    } else {
      upsertChannelRecord({
        channelId: channel.channelId,
        channelName: channel.channelName,
        handle: channel.handle,
        subscriberCount: channel.subscriberCount,
        thumbnailUrl: channel.thumbnailUrl,
        uploadsPlaylistId: channel.uploadsPlaylistId,
        medianViews,
      });
    }

    channelMedians.set(channel.channelId, medianViews);
  }

  for (const video of seedVideos) {
    if (!video.channelId) {
      continue;
    }

    if (!channelMedians.has(video.channelId)) {
      const channel = await youtubeClient.fetchChannelById(video.channelId);
      upsertChannelRecord({
        channelId: channel.channelId,
        channelName: channel.channelName,
        handle: channel.handle,
        subscriberCount: channel.subscriberCount,
        thumbnailUrl: channel.thumbnailUrl,
        uploadsPlaylistId: channel.uploadsPlaylistId,
        medianViews: 0,
      });
      channelMedians.set(video.channelId, 0);
    }

    const fallbackMedian = channelMedians.get(video.channelId) ?? 0;
    const effectiveMedian = fallbackMedian > 0 ? fallbackMedian : Math.max(Math.round(video.views / 2), 1);
    upsertVideoRecord(video, { medianViews: effectiveMedian });
  }
}

function buildBigrams(tokens: string[]): string[] {
  const phrases: string[] = [];
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const left = tokens[index];
    const right = tokens[index + 1];
    if (!left || !right) {
      continue;
    }
    phrases.push(`${left} ${right}`);
  }
  return phrases;
}

async function getSeedChannelTitles(channelId: string, days: number): Promise<{ channelName: string; titles: string[] }> {
  const localRows = db.prepare(`
    SELECT videos.title AS title, channels.name AS channelName
    FROM videos
    INNER JOIN channels ON channels.id = videos.channel_id
    WHERE videos.channel_id = ?
    ORDER BY videos.outlier_score DESC, videos.views DESC, videos.published_at DESC
    LIMIT 24
  `).all(channelId) as Array<{ title: string; channelName: string }>;

  if (localRows.length >= 8) {
    return {
      channelName: localRows[0]?.channelName ?? "Channel",
      titles: localRows.map((row) => row.title).filter(Boolean),
    };
  }

  const channel = await youtubeClient.fetchChannelById(channelId);
  const fallbackTitles: string[] = [];

  if (channel.uploadsPlaylistId) {
    const uploadIds = await youtubeClient.listRecentUploadVideoIds(channel.uploadsPlaylistId, subtractDays(Math.min(days, 365)));
    const sampleIds = uploadIds.slice(0, 18);
    if (sampleIds.length > 0) {
      const videos = await youtubeClient.fetchVideos(sampleIds);
      for (const video of videos) {
        fallbackTitles.push(video.title);
      }
    }
  }

  return {
    channelName: channel.channelName,
    titles: fallbackTitles,
  };
}

async function deriveSeedChannelProfile(channelId: string, days: number): Promise<{ queryText: string; queries: string[] }> {
  const cacheKey = `${channelId}:${days}`;
  const cached = seedProfileCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < SEED_DISCOVERY_TTL_MS) {
    return {
      queryText: cached.queryText,
      queries: cached.queries,
    };
  }

  const { channelName, titles } = await getSeedChannelTitles(channelId, days);
  const tokenCounts = new Map<string, number>();
  const phraseCounts = new Map<string, number>();

  for (const title of titles) {
    const tokens = tokenizeTitle(title)
      .map((token) => token.toLowerCase())
      .filter((token) => token.length >= 3 && !CHANNEL_QUERY_STOPWORDS.has(token) && !/^\d+$/.test(token));

    for (const token of tokens) {
      tokenCounts.set(token, (tokenCounts.get(token) ?? 0) + 1);
    }
    for (const phrase of buildBigrams(tokens)) {
      phraseCounts.set(phrase, (phraseCounts.get(phrase) ?? 0) + 1);
    }
  }

  const topPhrases = [...phraseCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([phrase]) => phrase)
    .filter((phrase) => phrase.split(" ").every((token) => !CHANNEL_QUERY_STOPWORDS.has(token)))
    .slice(0, 4);

  const topTokens = [...tokenCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([token]) => token)
    .slice(0, 8);

  const querySet = new Set<string>();

  for (const phrase of topPhrases) {
    querySet.add(phrase);
    querySet.add(`${phrase} tutorial`);
  }
  if (topTokens.length >= 2) {
    querySet.add(`${topTokens[0]} ${topTokens[1]}`);
  }
  if (topTokens.length >= 3) {
    querySet.add(`${topTokens[0]} ${topTokens[1]} ${topTokens[2]}`);
  }
  if (topTokens.length > 0) {
    querySet.add(topTokens.slice(0, 3).join(" "));
  }
  if (channelName) {
    querySet.add(channelName);
  }

  const queries = [...querySet]
    .map((value) => value.trim())
    .filter((value) => value.length >= 3)
    .slice(0, 3);

  const queryText = [...topPhrases.slice(0, 2), ...topTokens.slice(0, 4)].join(" ").trim() || channelName;

  const profile = {
    queryText,
    queries,
  };
  seedProfileCache.set(cacheKey, {
    cachedAt: Date.now(),
    queryText: profile.queryText,
    queries: profile.queries,
  });

  return profile;
}

export async function ingestSeedChannelDiscovery(seedChannelId: string, days = 365): Promise<string> {
  const cacheKey = `${seedChannelId}:${days}`;
  const cachedAt = seedDiscoveryCache.get(cacheKey) ?? 0;
  const now = Date.now();

  const profile = await deriveSeedChannelProfile(seedChannelId, days);

  if (now - cachedAt < SEED_DISCOVERY_TTL_MS) {
    return profile.queryText;
  }

  for (const query of profile.queries) {
    await ingestSearchQuery(query, days);
  }

  seedDiscoveryCache.set(cacheKey, now);
  return profile.queryText;
}

export async function listDiscoverOutliers(query: DiscoverQuery) {
  const searchText = query.search?.trim() ?? "";
  const derivedSeedText = query.seedChannelId && !searchText
    ? await deriveSeedChannelProfile(query.seedChannelId, query.days).then((profile) => profile.queryText)
    : "";
  const rankingSearchText = searchText || derivedSeedText;
  const hasSearch = searchText.length > 0;
  const hasRankingSearch = rankingSearchText.length > 0;
  const threshold = Number(getSetting("default_outlier_threshold") ?? 3);
  const minScore = query.minScore ?? threshold;
  const offset = (query.page - 1) * query.limit;
  const publishedAfter = new Date(Date.now() - query.days * 24 * 60 * 60 * 1000).toISOString();
  const sortMap = {
    score: "videos.outlier_score",
    views: "videos.views",
    date: "videos.published_at",
    velocity: "videos.view_velocity",
    momentum: "videos.momentum_score",
    subscribers: "channels.subscriber_count",
  } as const;

  const whereClauses = [
    "videos.outlier_score >= @minScore",
    "videos.published_at >= @publishedAfter",
  ];
  const params: Record<string, string | number> = {
    minScore,
    publishedAfter,
    projectId: query.projectId ?? -1,
  };

  if (query.seedChannelId && query.channelScope === "adjacent") {
    const relatedChannels = await getRelatedChannels(query.seedChannelId);
    const nicheChannelIds = [query.seedChannelId, ...relatedChannels.map((channel) => channel.id)];
    if (nicheChannelIds.length > 0) {
      const placeholders = nicheChannelIds.map((_, index) => `@nicheChannel${index}`);
      whereClauses.push(`videos.channel_id IN (${placeholders.join(", ")})`);
      nicheChannelIds.forEach((channelId, index) => {
        params[`nicheChannel${index}`] = channelId;
      });
    }
  }

  if (query.maxScore !== undefined) {
    whereClauses.push("videos.outlier_score <= @maxScore");
    params.maxScore = query.maxScore;
  }
  if (query.listId !== undefined) {
    whereClauses.push("list_channels.list_id = @listId");
    params.listId = query.listId;
  }
  if (query.channelId) {
    whereClauses.push("videos.channel_id = @channelId");
    params.channelId = query.channelId;
  }
  if (hasSearch) {
    params.search = `%${searchText}%`;
  }
  if (query.contentType && query.contentType !== "all") {
    whereClauses.push("videos.content_type = @contentType");
    params.contentType = query.contentType;
  }
  if (query.minSubscribers !== undefined) {
    whereClauses.push("channels.subscriber_count >= @minSubscribers");
    params.minSubscribers = query.minSubscribers;
  }
  if (query.maxSubscribers !== undefined) {
    whereClauses.push("channels.subscriber_count <= @maxSubscribers");
    params.maxSubscribers = query.maxSubscribers;
  }
  if (query.minViews !== undefined) {
    whereClauses.push("videos.views >= @minViews");
    params.minViews = query.minViews;
  }
  if (query.maxViews !== undefined) {
    whereClauses.push("videos.views <= @maxViews");
    params.maxViews = query.maxViews;
  }
  if (query.minVelocity !== undefined) {
    whereClauses.push("videos.view_velocity >= @minVelocity");
    params.minVelocity = query.minVelocity;
  }
  if (query.maxVelocity !== undefined) {
    whereClauses.push("videos.view_velocity <= @maxVelocity");
    params.maxVelocity = query.maxVelocity;
  }
  if (query.minDurationSeconds !== undefined) {
    whereClauses.push("videos.duration_seconds >= @minDurationSeconds");
    params.minDurationSeconds = query.minDurationSeconds;
  }
  if (query.maxDurationSeconds !== undefined) {
    whereClauses.push("videos.duration_seconds <= @maxDurationSeconds");
    params.maxDurationSeconds = query.maxDurationSeconds;
  }
  if (query.generalMode && !hasSearch) {
    whereClauses.push("EXISTS (SELECT 1 FROM general_discovery_channels general_channels WHERE general_channels.channel_id = videos.channel_id)");
  }
  if (query.projectId !== undefined && query.excludeProjectSaved !== false) {
    whereClauses.push("NOT EXISTS (SELECT 1 FROM project_references saved_refs WHERE saved_refs.project_id = @projectId AND saved_refs.video_id = videos.id)");
  }
  if (query.channelScope === "tracked") {
    whereClauses.push("EXISTS (SELECT 1 FROM tracked_channels tracked_channels WHERE tracked_channels.channel_id = videos.channel_id)");
  }
  if (query.channelScope === "adjacent") {
    whereClauses.push("NOT EXISTS (SELECT 1 FROM tracked_channels tracked_channels WHERE tracked_channels.channel_id = videos.channel_id)");
  }
  const whereSql = whereClauses.join(" AND ");

  const baseSelect = `
    SELECT
      videos.id AS videoId,
      videos.title,
      channels.name AS channelName,
      channels.id AS channelId,
      channels.handle AS channelHandle,
      channels.subscriber_count AS channelSubscribers,
      channels.median_views AS channelMedianViews,
      videos.views,
      videos.likes,
      videos.comments,
      videos.published_at AS publishedAt,
      videos.thumbnail_url AS thumbnailUrl,
      'https://youtube.com/watch?v=' || videos.id AS videoUrl,
      videos.outlier_score AS outlierScore,
      videos.momentum_score AS momentumScore,
      videos.view_velocity AS viewVelocity,
      videos.engagement_ratio AS engagementRatio,
      videos.duration,
      videos.duration_seconds AS durationSeconds,
      videos.content_type AS contentType,
      videos.scanned_at AS scannedAt,
      MAX(CASE WHEN project_references.project_id = @projectId THEN project_references.id END) AS projectReferenceId,
      MAX(CASE WHEN tracked_channels.channel_id IS NOT NULL THEN 1 ELSE 0 END) AS trackedInProject,
      COALESCE(json_group_array(DISTINCT lists.name) FILTER (WHERE lists.name IS NOT NULL), '[]') AS lists
    FROM videos
    INNER JOIN channels ON channels.id = videos.channel_id
    LEFT JOIN list_channels ON list_channels.channel_id = channels.id
    LEFT JOIN lists ON lists.id = list_channels.list_id
    LEFT JOIN project_references ON project_references.video_id = videos.id
    LEFT JOIN tracked_channels ON tracked_channels.channel_id = channels.id
    WHERE ${whereSql}
    GROUP BY videos.id
  `;

  let totalRow: { total: number };
  let videos: Array<Record<string, unknown>>;
  const fetchLimit = hasRankingSearch ? Math.max(query.limit * 10, 250) : query.limit;
  const fetchOffset = hasRankingSearch ? 0 : offset;

  if (query.generalMode && query.projectId === undefined) {
    totalRow = db
      .prepare(`
        WITH filtered AS (
          ${baseSelect}
        )
        SELECT COUNT(*) AS total
        FROM filtered
      `)
      .get(params) as { total: number };

    const generalSortMap = {
      score: "outlierScore",
      views: "views",
      date: "publishedAt",
      velocity: "viewVelocity",
      momentum: "momentumScore",
      subscribers: "channelSubscribers",
    } as const;

    videos = db
      .prepare(`
        WITH filtered AS (
          ${baseSelect}
        ),
        ranked AS (
          SELECT
            *,
            ROW_NUMBER() OVER (
              PARTITION BY channelId
              ORDER BY ${generalSortMap[query.sort]} ${orderMap[query.order]}, publishedAt DESC
            ) AS channelRank
          FROM filtered
        )
        SELECT *
        FROM ranked
        WHERE channelRank <= 2
        ORDER BY channelRank ASC, RANDOM(), ${generalSortMap[query.sort]} ${orderMap[query.order]}, publishedAt DESC
        LIMIT @limit OFFSET @offset
      `)
      .all({ ...params, limit: fetchLimit, offset: fetchOffset }) as Array<Record<string, unknown>>;
  } else {
    totalRow = db
      .prepare(`
        SELECT COUNT(DISTINCT videos.id) AS total
        FROM videos
        INNER JOIN channels ON channels.id = videos.channel_id
        LEFT JOIN list_channels ON list_channels.channel_id = channels.id
        WHERE ${whereSql}
      `)
      .get(params) as { total: number };

    videos = db
      .prepare(`
        ${baseSelect}
        ORDER BY ${sortMap[query.sort]} ${orderMap[query.order]}, videos.published_at DESC
        LIMIT @limit OFFSET @offset
      `)
      .all({ ...params, limit: fetchLimit, offset: fetchOffset }) as Array<Record<string, unknown>>;
  }

  if (hasRankingSearch) {
    const normalizedQuery = normalizeSearchText(rankingSearchText);
    const searchTokens = tokenizeSearchQuery(rankingSearchText);
    const embeddingScores = await embeddingsService.getQuerySimilarityScores(
      rankingSearchText,
      videos.map((video) => String(video.videoId)),
    );

    const scored = videos
      .map((video) => {
        const title = String(video.title ?? "");
        const channelName = String(video.channelName ?? "");
        const handle = String(video.channelHandle ?? "");
        const combinedText = normalizeSearchText(`${title} ${channelName} ${handle}`);
        const phraseMatch = normalizedQuery.length > 0 && combinedText.includes(normalizedQuery);
        const tokenHits = searchTokens.reduce((count, token) => count + (combinedText.includes(token) ? 1 : 0), 0);
        const strictMatch = searchTokens.length >= 2 ? phraseMatch || tokenHits >= 2 : tokenHits >= 1 || phraseMatch;
        const lexical = Math.max(
          similarityScore(searchText, title),
          similarityScore(searchText, channelName),
          similarityScore(searchText, handle),
        );
        const embedding = embeddingScores?.get(String(video.videoId));
        const semanticScore = embedding !== undefined
          ? Number((embedding * 0.82 + lexical * 0.18).toFixed(4))
          : lexical;

        return {
          ...video,
          strictMatch,
          tokenHits,
          phraseMatch,
          semanticScore,
        };
      })
      .filter((video) => {
        if (hasSearch) {
          return video.strictMatch || video.semanticScore > (embeddingScores ? 0.32 : 0.16);
        }
        return video.semanticScore > (embeddingScores ? 0.3 : 0.18) || video.tokenHits >= 1;
      })
      .sort((left, right) => {
        if (Number(Boolean(right.strictMatch)) !== Number(Boolean(left.strictMatch))) {
          return Number(Boolean(right.strictMatch)) - Number(Boolean(left.strictMatch));
        }
        if (Number(right.tokenHits ?? 0) !== Number(left.tokenHits ?? 0)) {
          return Number(right.tokenHits ?? 0) - Number(left.tokenHits ?? 0);
        }
        if (Number(Boolean(right.phraseMatch)) !== Number(Boolean(left.phraseMatch))) {
          return Number(Boolean(right.phraseMatch)) - Number(Boolean(left.phraseMatch));
        }
        if (right.semanticScore !== left.semanticScore) {
          return right.semanticScore - left.semanticScore;
        }
        return Number((right as Record<string, unknown>).momentumScore ?? 0) - Number((left as Record<string, unknown>).momentumScore ?? 0);
      });

    totalRow = { total: scored.length };
    videos = scored.slice(offset, offset + query.limit);
  }

  return {
    total: totalRow.total,
    page: query.page,
    limit: query.limit,
    videos: videos.map((video) => ({
      ...video,
      scoreBand: getScoreBand(Number(video.outlierScore)),
      trackedInProject: Boolean(video.trackedInProject),
      lists: JSON.parse(String(video.lists)),
    })),
  };
}

export function getVideoForDiscover(videoId: string) {
  const video = db.prepare(`
    SELECT
      videos.id AS videoId,
      videos.title,
      channels.name AS channelName,
      channels.id AS channelId,
      channels.handle AS channelHandle,
      channels.subscriber_count AS channelSubscribers,
      videos.views,
      videos.published_at AS publishedAt,
      videos.thumbnail_url AS thumbnailUrl,
      videos.outlier_score AS outlierScore,
      videos.momentum_score AS momentumScore,
      videos.view_velocity AS viewVelocity,
      videos.duration_seconds AS durationSeconds,
      videos.content_type AS contentType
    FROM videos
    INNER JOIN channels ON channels.id = videos.channel_id
    WHERE videos.id = ?
    LIMIT 1
  `).get(videoId) as Record<string, unknown> | undefined;

  if (!video) {
    return null;
  }

  return {
    ...video,
    scoreBand: getScoreBand(Number(video.outlierScore)),
  };
}

export async function getSimilarTopics(videoId: string, limit = 12) {
  const seed = db.prepare("SELECT id, title, channel_id FROM videos WHERE id = ?").get(videoId) as
    | { id: string; title: string; channel_id: string }
    | undefined;
  if (!seed) {
    return null;
  }

  const candidates = db
    .prepare(`
      SELECT
        videos.id AS videoId,
        videos.title,
        channels.name AS channelName,
        channels.id AS channelId,
        videos.outlier_score AS outlierScore,
        videos.view_velocity AS viewVelocity,
        videos.thumbnail_url AS thumbnailUrl
      FROM videos
      INNER JOIN channels ON channels.id = videos.channel_id
      WHERE videos.id != ?
      ORDER BY videos.outlier_score DESC
      LIMIT 250
    `)
    .all(videoId) as Array<Record<string, unknown>>;

  const candidateIds = candidates.map((candidate) => String(candidate.videoId));
  const embeddingScores = await embeddingsService.getSimilarityScores(videoId, candidateIds);

  return candidates
    .map((candidate) => {
      const lexical = similarityScore(seed.title, String(candidate.title));
      const embedding = embeddingScores?.get(String(candidate.videoId));
      return {
        ...candidate,
        mode: embeddingScores ? "embedding" : "lexical",
        similarity: embedding !== undefined ? Number(embedding.toFixed(4)) : lexical,
        lexicalSimilarity: lexical,
      };
    })
    .filter((candidate) => candidate.similarity > 0)
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, limit);
}

export async function getSimilarThumbnails(videoId: string, limit = 12) {
  const seed = db.prepare("SELECT id, thumbnail_url AS thumbnailUrl FROM videos WHERE id = ?").get(videoId) as
    | { id: string; thumbnailUrl: string | null }
    | undefined;
  if (!seed) {
    return null;
  }

  const seedHash = await ensureThumbnailHash(seed.id, seed.thumbnailUrl);
  if (!seedHash) {
    return [];
  }

  const candidates = db
    .prepare(`
      SELECT
        videos.id AS videoId,
        videos.title,
        channels.name AS channelName,
        channels.id AS channelId,
        videos.outlier_score AS outlierScore,
        videos.view_velocity AS viewVelocity,
        videos.thumbnail_url AS thumbnailUrl,
        thumbnail_features.perceptual_hash AS perceptualHash
      FROM videos
      INNER JOIN channels ON channels.id = videos.channel_id
      LEFT JOIN video_thumbnail_features AS thumbnail_features ON thumbnail_features.video_id = videos.id
      WHERE videos.id != ?
      ORDER BY videos.outlier_score DESC, videos.published_at DESC
      LIMIT 300
    `)
    .all(videoId) as Array<Record<string, unknown>>;

  const scored = await Promise.all(
    candidates.map(async (candidate) => {
      const candidateHash = typeof candidate.perceptualHash === "string"
        ? candidate.perceptualHash
        : await ensureThumbnailHash(String(candidate.videoId), candidate.thumbnailUrl as string | null | undefined);

      if (!candidateHash) {
        return null;
      }

      const distance = hexHammingDistance(seedHash, candidateHash);
      const totalBits = Math.max(seedHash.length, candidateHash.length) * 4;
      const similarity = Number((1 - distance / totalBits).toFixed(4));

      return {
        ...candidate,
        similarity,
      };
    }),
  );

  return scored
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
    .filter((candidate) => candidate.similarity > 0.45)
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, limit);
}

export function getNiches(days: number, limit = 25) {
  const rows = db
    .prepare(`
      SELECT videos.title, videos.outlier_score, channels.name AS channelName
      FROM videos
      INNER JOIN channels ON channels.id = videos.channel_id
      WHERE videos.published_at >= ?
      ORDER BY videos.outlier_score DESC
      LIMIT 500
    `)
    .all(new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()) as Array<{
    title: string;
    outlier_score: number;
    channelName: string;
  }>;

  const topicMap = new Map<string, { count: number; avgScore: number; channels: Set<string> }>();
  for (const row of rows) {
    const tokenized = row.title.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((token) => token.length > 3);
    for (const token of tokenized) {
      const current = topicMap.get(token) ?? { count: 0, avgScore: 0, channels: new Set<string>() };
      current.count += 1;
      current.avgScore += row.outlier_score;
      current.channels.add(row.channelName);
      topicMap.set(token, current);
    }
  }

  return [...topicMap.entries()]
    .filter(([, value]) => value.count >= 2)
    .map(([topic, value]) => ({
      topic,
      count: value.count,
      averageOutlierScore: Number((value.avgScore / value.count).toFixed(2)),
      channelCount: value.channels.size,
      opportunity: value.count * (value.avgScore / value.count),
    }))
    .sort((left, right) => right.opportunity - left.opportunity)
    .slice(0, limit);
}

export function getChannelPatterns(channelId: string) {
  const rows = db
    .prepare("SELECT title FROM videos WHERE channel_id = ? ORDER BY outlier_score DESC LIMIT 40")
    .all(channelId) as Array<{ title: string }>;

  const formatMap = new Map<string, number>();
  for (const row of rows) {
    const format = titleFormat(row.title);
    formatMap.set(format, (formatMap.get(format) ?? 0) + 1);
  }

  return [...formatMap.entries()]
    .map(([format, count]) => ({ format, count }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 5);
}

export async function getRelatedChannels(channelId: string) {
  const seedRows = db
    .prepare(`
      SELECT id, title
      FROM videos
      WHERE channel_id = ?
      ORDER BY outlier_score DESC
      LIMIT 20
    `)
    .all(channelId) as Array<{ id: string; title: string }>;

  const seedVideoIds = seedRows.map((row) => row.id);
  const genericKeywordStoplist = new Set([
    "tutorial",
    "tutorials",
    "video",
    "videos",
    "beginner",
    "beginners",
    "guide",
    "review",
    "tips",
    "tricks",
    "official",
    "search",
    "google",
    "year",
    "best",
    "complete",
    "ultimate",
  ]);
  const seedKeywordCounts = new Map<string, number>();
  for (const row of seedRows) {
    for (const token of tokenizeTitle(row.title)) {
      if (genericKeywordStoplist.has(token)) continue;
      seedKeywordCounts.set(token, (seedKeywordCounts.get(token) ?? 0) + 1);
    }
  }
  const seedKeywords = [...seedKeywordCounts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8)
    .map(([token]) => token);
  const seedFormats = new Set(seedRows.map((row) => titleFormat(row.title)));
  const seedChannel = db
    .prepare("SELECT subscriber_count AS subscriberCount FROM channels WHERE id = ?")
    .get(channelId) as { subscriberCount: number | null } | undefined;
  const seedSubscriberCount = Math.max(Number(seedChannel?.subscriberCount ?? 0), 1);

  const otherChannels = db
    .prepare(`
      SELECT DISTINCT channels.id, channels.name, channels.handle, channels.subscriber_count AS subscriberCount
      , channels.thumbnail_url AS thumbnailUrl
      FROM channels
      WHERE channels.id != ?
      ORDER BY channels.subscriber_count DESC
      LIMIT 50
    `)
    .all(channelId) as Array<{ id: string; name: string; handle: string | null; subscriberCount: number }>;

  const candidateVideoRows = db
    .prepare(`
      SELECT id, channel_id AS channelId, title
      FROM videos
      WHERE channel_id != ?
      ORDER BY outlier_score DESC
      LIMIT 1000
    `)
    .all(channelId) as Array<{ id: string; channelId: string; title: string }>;

  const candidateIds = candidateVideoRows.map((row) => row.id);
  let averagedEmbeddingScores: Map<string, number> | null = null;
  if (seedVideoIds.length > 0 && candidateIds.length > 0) {
    const perSeed = await Promise.all(seedVideoIds.map((seedId) => embeddingsService.getSimilarityScores(seedId, candidateIds)));
    if (perSeed.some(Boolean)) {
      const aggregate = new Map<string, { sum: number; count: number }>();
      for (const scoreMap of perSeed) {
        if (!scoreMap) continue;
        for (const [candidateId, score] of scoreMap.entries()) {
          const current = aggregate.get(candidateId) ?? { sum: 0, count: 0 };
          current.sum += score;
          current.count += 1;
          aggregate.set(candidateId, current);
        }
      }
      averagedEmbeddingScores = new Map(
        [...aggregate.entries()].map(([candidateId, value]) => [candidateId, value.count > 0 ? value.sum / value.count : 0]),
      );
    }
  }

  return otherChannels
    .map((channel) => {
      const candidateRows = candidateVideoRows.filter((row) => row.channelId === channel.id).slice(0, 20);
      const candidateTokens = new Set(candidateRows.flatMap((row) => tokenizeTitle(row.title)));
      const keywordMatches = seedKeywords.filter((keyword) => candidateTokens.has(keyword)).length;
      const keywordCoverage = seedKeywords.length > 0 ? keywordMatches / seedKeywords.length : 0;
      const candidateFormats = new Set(candidateRows.map((row) => titleFormat(row.title)));
      const formatOverlap = seedFormats.size > 0
        ? [...seedFormats].filter((format) => candidateFormats.has(format)).length / seedFormats.size
        : 0;
      const lexicalSimilarity = candidateRows.reduce((best, item) => {
        for (const source of seedRows) {
          best = Math.max(best, similarityScore(source.title, item.title));
        }
        return best;
      }, 0);
      const subscriberProximity = Math.max(
        0,
        1 - Math.min(
          Math.abs(Math.log10(Math.max(channel.subscriberCount, 1)) - Math.log10(seedSubscriberCount)) / 3,
          1,
        ),
      );

      if (!averagedEmbeddingScores) {
        const similarity = (lexicalSimilarity * 0.65) + (keywordCoverage * 0.2) + (formatOverlap * 0.1) + (subscriberProximity * 0.05);
        return {
          ...channel,
          similarity,
          keywordCoverage,
          matchMode: "lexical" as const,
        };
      }

      const embeddingValues = candidateRows
        .map((item) => averagedEmbeddingScores?.get(item.id) ?? null)
        .filter((value): value is number => typeof value === "number");

      const embeddingSimilarity = embeddingValues.length > 0
        ? embeddingValues.reduce((sum, value) => sum + value, 0) / embeddingValues.length
        : null;

      const similarity = embeddingSimilarity !== null
        ? (embeddingSimilarity * 0.55) + (lexicalSimilarity * 0.2) + (keywordCoverage * 0.15) + (formatOverlap * 0.05) + (subscriberProximity * 0.05)
        : (lexicalSimilarity * 0.65) + (keywordCoverage * 0.2) + (formatOverlap * 0.1) + (subscriberProximity * 0.05);

      return {
        ...channel,
        similarity,
        keywordCoverage,
        matchMode: embeddingSimilarity !== null ? "embedding" as const : "lexical" as const,
      };
    })
    .filter((channel) => channel.keywordCoverage > 0.12 || channel.similarity > 0.3)
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, 8);
}

export function normalizeScannedVideo(row: {
  title: string;
  duration: string | null;
  views: number;
  viewVelocity: number;
  outlierScore: number;
  channelSubscribers: number;
  channelMedianViews: number;
}) {
  const durationSeconds = parseDurationToSeconds(row.duration);
  return {
    durationSeconds,
    momentumScore: computeMomentumScore(
      row.outlierScore,
      row.viewVelocity,
      row.channelSubscribers,
      row.channelMedianViews,
    ),
  };
}
