import { getContentType, parseDurationToSeconds } from "@openoutlier/core";
import { db } from "../db.js";
import { listDiscoverOutliers, type DiscoverQuery } from "./discovery.js";
import { YoutubeClient, type ResolvedChannel } from "./youtube.js";
import type { ScanService } from "./scan-service.js";

type ProjectRecord = {
  id: number;
  name: string;
  niche: string | null;
  primary_channel_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

type BackingGroupRecord = {
  id: number;
  project_id: number;
  backing_list_id: number | null;
  name: string;
  role: string;
  discovery_mode: string;
  created_at: string;
  updated_at: string;
};

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  try {
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function extractVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    if (url.hostname.includes("youtube.com")) {
      return url.searchParams.get("v");
    }
    if (url.hostname.includes("youtu.be")) {
      return url.pathname.replace(/^\/+/, "").split("/")[0] ?? null;
    }
  } catch {
    return null;
  }

  return null;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export class WorkflowService {
  private readonly youtube = new YoutubeClient();
  private readonly scanService?: ScanService;

  constructor(scanService?: ScanService) {
    this.scanService = scanService;
  }

  listProjects() {
    const rows = db.prepare(`
      SELECT
        projects.*,
        channels.name AS primaryChannelName,
        COUNT(DISTINCT project_channels.channel_id) AS channelCount,
        COUNT(DISTINCT project_references.id) AS referenceCount,
        (
          SELECT videos.thumbnail_url
          FROM project_references preview_refs
          INNER JOIN videos ON videos.id = preview_refs.video_id
          WHERE preview_refs.project_id = projects.id
          ORDER BY preview_refs.created_at DESC
          LIMIT 1
        ) AS previewThumbnailUrl
      FROM projects
      LEFT JOIN channels ON channels.id = projects.primary_channel_id
      LEFT JOIN project_channels ON project_channels.project_id = projects.id
      LEFT JOIN project_references ON project_references.project_id = projects.id
      GROUP BY projects.id
      ORDER BY projects.updated_at DESC, projects.created_at DESC
    `).all() as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: Number(row.id),
      name: String(row.name),
      niche: row.niche ? String(row.niche) : null,
      status: String(row.status),
      primaryChannelId: row.primary_channel_id ? String(row.primary_channel_id) : null,
      primaryChannelName: row.primaryChannelName ? String(row.primaryChannelName) : null,
      channelCount: Number(row.channelCount ?? 0),
      referenceCount: Number(row.referenceCount ?? 0),
      previewThumbnailUrl: row.previewThumbnailUrl ? String(row.previewThumbnailUrl) : null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    }));
  }

  async createProjectAsync(input: {
    name: string;
    niche?: string | null;
    primaryChannelInput?: string | null;
  }) {
    let primaryChannel: ResolvedChannel | null = null;
    if (input.primaryChannelInput?.trim()) {
      primaryChannel = await this.youtube.resolveChannel(input.primaryChannelInput.trim());
      this.persistChannel(primaryChannel);
    }

    const slugBase = slugify(input.name);
    const slug = `${slugBase || "project"}-${Date.now().toString().slice(-6)}`;
    const result = db.prepare(`
      INSERT INTO projects (name, slug, niche, primary_channel_id, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(input.name, slug, input.niche ?? null, primaryChannel?.channelId ?? null);

    const projectId = Number(result.lastInsertRowid);
    this.ensureProjectBackingGroup(projectId);

    return this.getProject(projectId);
  }

  getProject(projectId: number) {
    const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId) as ProjectRecord | undefined;
    if (!project) {
      throw new Error("Project not found.");
    }

    const trackedChannels = db.prepare(`
      SELECT
        channels.id,
        channels.name,
        channels.handle,
        channels.subscriber_count AS subscriberCount,
        channels.thumbnail_url AS thumbnailUrl,
        project_channels.relationship
      FROM project_channels
      INNER JOIN channels ON channels.id = project_channels.channel_id
      WHERE project_channels.project_id = ?
      ORDER BY channels.subscriber_count DESC, channels.name ASC
    `).all(projectId) as Array<Record<string, unknown>>;

    const references = db.prepare(`
      SELECT
        project_references.id,
        project_references.video_id AS videoId,
        project_references.kind,
        project_references.notes,
        project_references.tags_json AS tagsJson,
        project_references.created_at AS createdAt,
        videos.title,
        videos.outlier_score AS outlierScore,
        videos.view_velocity AS viewVelocity,
        videos.views,
        channels.name AS channelName
      FROM project_references
      INNER JOIN videos ON videos.id = project_references.video_id
      INNER JOIN channels ON channels.id = videos.channel_id
      WHERE project_references.project_id = ?
      ORDER BY project_references.created_at DESC
      LIMIT 40
    `).all(projectId) as Array<Record<string, unknown>>;

    return {
      id: project.id,
      name: project.name,
      niche: project.niche,
      primaryChannelId: project.primary_channel_id,
      status: project.status,
      createdAt: project.created_at,
      updatedAt: project.updated_at,
      channelCount: trackedChannels.length,
      trackedChannels: trackedChannels.map((row) => ({
        id: String(row.id),
        name: String(row.name),
        handle: row.handle ? String(row.handle) : null,
        subscriberCount: Number(row.subscriberCount ?? 0),
        thumbnailUrl: row.thumbnailUrl ? String(row.thumbnailUrl) : null,
        relationship: String(row.relationship),
      })),
      references: references.map((row) => ({
        id: Number(row.id),
        videoId: String(row.videoId),
        title: String(row.title),
        channelName: String(row.channelName),
        outlierScore: Number(row.outlierScore ?? 0),
        viewVelocity: Number(row.viewVelocity ?? 0),
        views: Number(row.views ?? 0),
        kind: String(row.kind),
        notes: row.notes ? String(row.notes) : null,
        tags: parseJson(String(row.tagsJson), [] as string[]),
        createdAt: String(row.createdAt),
      })),
    };
  }

  deleteProject(projectId: number) {
    const existing = db.prepare("SELECT id FROM projects WHERE id = ?").get(projectId) as { id: number } | undefined;
    if (!existing) {
      throw new Error("Project not found.");
    }

    const backingListIds = (
      db.prepare("SELECT backing_list_id FROM source_sets WHERE project_id = ? AND backing_list_id IS NOT NULL").all(projectId) as Array<{ backing_list_id: number }>
    ).map((row) => row.backing_list_id);

    const deleteTransaction = db.transaction(() => {
      db.prepare("DELETE FROM projects WHERE id = ?").run(projectId);

      for (const listId of backingListIds) {
        db.prepare("DELETE FROM lists WHERE id = ?").run(listId);
      }
    });

    deleteTransaction();
  }

  listProjectChannels(projectId: number) {
    return db.prepare(`
      SELECT
        channels.id,
        channels.name,
        channels.handle,
        channels.subscriber_count AS subscriberCount,
        channels.thumbnail_url AS thumbnailUrl,
        project_channels.relationship
      FROM project_channels
      INNER JOIN channels ON channels.id = project_channels.channel_id
      WHERE project_channels.project_id = ?
      ORDER BY channels.subscriber_count DESC, channels.name ASC
    `).all(projectId).map((row) => ({
      id: String((row as Record<string, unknown>).id),
      name: String((row as Record<string, unknown>).name),
      handle: (row as Record<string, unknown>).handle ? String((row as Record<string, unknown>).handle) : null,
      subscriberCount: Number((row as Record<string, unknown>).subscriberCount ?? 0),
      thumbnailUrl: (row as Record<string, unknown>).thumbnailUrl ? String((row as Record<string, unknown>).thumbnailUrl) : null,
      relationship: String((row as Record<string, unknown>).relationship),
    }));
  }

  async addChannelToProject(projectId: number, input: { channelUrl?: string; channelId?: string; handle?: string; relationship?: string }) {
    const backingGroup = this.getProjectBackingGroup(projectId);
    if (!backingGroup) {
      throw new Error("Project not found.");
    }

    const channelInput = input.channelUrl ?? input.channelId ?? input.handle;
    if (!channelInput) {
      throw new Error("Provide channelUrl, channelId, or handle.");
    }

    const channel = await this.youtube.resolveChannel(channelInput);
    this.persistChannel(channel);
    this.attachChannelToProject(backingGroup, channel.channelId, input.relationship ?? "competitor");
    void this.scanService?.triggerChannelScan(channel.channelId).catch(() => undefined);
    return channel;
  }

  async discoverProjectChannels(projectId: number, input: { query?: string; niche?: string; limit?: number; autoAttach?: boolean }) {
    const backingGroup = this.getProjectBackingGroup(projectId);
    if (!backingGroup) {
      throw new Error("Project not found.");
    }

    const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId) as ProjectRecord | undefined;
    const searchQuery = input.query?.trim() || input.niche?.trim() || project?.niche || project?.name;
    if (!searchQuery) {
      throw new Error("Provide a discovery query or niche.");
    }

    const existingIds = new Set(
      (db.prepare("SELECT channel_id FROM project_channels WHERE project_id = ?").all(projectId) as Array<{ channel_id: string }>).map((row) => row.channel_id),
    );

    const suggestions = (await this.youtube.searchChannels(searchQuery, input.limit ?? 10))
      .filter((channel) => !existingIds.has(channel.channelId))
      .map((channel) => ({
        channelId: channel.channelId,
        channelName: channel.channelName,
        handle: channel.handle,
        subscriberCount: channel.subscriberCount,
      }));

    if (input.autoAttach) {
      for (const suggestion of suggestions) {
        const channel = await this.youtube.fetchChannelById(suggestion.channelId);
        this.persistChannel(channel);
        this.attachChannelToProject(backingGroup, channel.channelId, "discovered");
      }
    }

    return {
      projectId,
      query: searchQuery,
      suggestions,
      attachedCount: input.autoAttach ? suggestions.length : 0,
    };
  }

  private createBackingGroup(projectId: number, input: { name: string; role?: string; discoveryMode?: string }) {
    const project = db.prepare("SELECT name FROM projects WHERE id = ?").get(projectId) as { name: string } | undefined;
    if (!project) {
      throw new Error("Project not found.");
    }

    const listResult = db.prepare(`
      INSERT INTO lists (name, description, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `).run(`${project.name}: ${input.name}`, `Backing list for source set ${input.name}`);

    const backingGroupResult = db.prepare(`
      INSERT INTO source_sets (project_id, backing_list_id, name, role, discovery_mode, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(projectId, Number(listResult.lastInsertRowid), input.name, input.role ?? "competitors", input.discoveryMode ?? "manual");

    return db.prepare("SELECT * FROM source_sets WHERE id = ?").get(Number(backingGroupResult.lastInsertRowid)) as BackingGroupRecord;
  }

  private ensureProjectBackingGroup(projectId: number) {
    const existing = this.getProjectBackingGroup(projectId);
    if (existing) {
      return existing;
    }
    return this.createBackingGroup(projectId, {
      name: "Tracked Channels",
      role: "competitors",
      discoveryMode: "manual",
    });
  }

  private getProjectBackingGroup(projectId: number) {
    return db.prepare("SELECT * FROM source_sets WHERE project_id = ? ORDER BY id ASC LIMIT 1").get(projectId) as BackingGroupRecord | undefined;
  }

  async searchReferences(projectId: number, input: Partial<DiscoverQuery> & { saveTop?: number }) {
    const backingGroup = db.prepare("SELECT backing_list_id FROM source_sets WHERE project_id = ? ORDER BY id ASC LIMIT 1").get(projectId) as
      | { backing_list_id: number | null }
      | undefined;

    const result = await listDiscoverOutliers({
      listId: backingGroup?.backing_list_id ?? undefined,
      days: input.days ?? 365,
      sort: input.sort ?? "momentum",
      order: input.order ?? "desc",
      page: input.page ?? 1,
      limit: input.limit ?? 25,
      search: input.search,
      contentType: input.contentType ?? "all",
      minScore: input.minScore,
      maxScore: input.maxScore,
      minSubscribers: input.minSubscribers,
      maxSubscribers: input.maxSubscribers,
      minViews: input.minViews,
      maxViews: input.maxViews,
      minVelocity: input.minVelocity,
      maxVelocity: input.maxVelocity,
      minDurationSeconds: input.minDurationSeconds,
      maxDurationSeconds: input.maxDurationSeconds,
      channelId: input.channelId,
      projectId,
    });

    const savedReferenceIds: number[] = [];
    const topToSave = Math.max(0, input.saveTop ?? 0);
    for (const video of result.videos.slice(0, topToSave) as Array<Record<string, unknown>>) {
      const saved = this.saveReference(projectId, {
        videoId: String(video.videoId),
        kind: "outlier",
        tags: ["saved-from-search"],
      });
      savedReferenceIds.push(saved.id);
    }

    return {
      ...result,
      savedReferenceIds,
    };
  }

  saveReference(projectId: number, input: { videoId: string; kind?: string; notes?: string | null; tags?: string[] }) {
    const result = db.prepare(`
      INSERT INTO project_references (project_id, source_set_id, video_id, kind, notes, tags_json)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id, video_id) DO UPDATE SET
        source_set_id = excluded.source_set_id,
        kind = excluded.kind,
        notes = excluded.notes,
        tags_json = excluded.tags_json
      RETURNING id
    `).get(projectId, null, input.videoId, input.kind ?? "outlier", input.notes ?? null, JSON.stringify(input.tags ?? [])) as { id: number };

    return { id: Number(result.id), videoId: input.videoId };
  }

  removeReference(projectId: number, referenceId: number) {
    const result = db.prepare(`
      DELETE FROM project_references
      WHERE project_id = ? AND id = ?
    `).run(projectId, referenceId);

    if (result.changes === 0) {
      throw new Error("Reference not found.");
    }
  }

  listReferences(projectId: number) {
    const rows = db.prepare(`
      SELECT
        project_references.id,
        project_references.video_id AS videoId,
        project_references.kind,
        project_references.notes,
        project_references.tags_json AS tagsJson,
        project_references.created_at AS createdAt,
        videos.title,
        videos.thumbnail_url AS thumbnailUrl,
        videos.outlier_score AS outlierScore,
        videos.view_velocity AS viewVelocity,
        videos.views,
        videos.published_at AS publishedAt,
        videos.duration_seconds AS durationSeconds,
        channels.id AS channelId,
        channels.name AS channelName,
        channels.subscriber_count AS channelSubscribers,
        CASE
          WHEN channels.median_views > 0 THEN channels.median_views
          WHEN videos.outlier_score > 0 THEN CAST(ROUND(videos.views / videos.outlier_score) AS INTEGER)
          ELSE 0
        END AS channelMedianViews
      FROM project_references
      INNER JOIN videos ON videos.id = project_references.video_id
      INNER JOIN channels ON channels.id = videos.channel_id
      WHERE project_references.project_id = ?
      ORDER BY project_references.created_at DESC
    `).all(projectId) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: Number(row.id),
      videoId: String(row.videoId),
      title: String(row.title),
      thumbnailUrl: row.thumbnailUrl ? String(row.thumbnailUrl) : null,
      channelId: String(row.channelId),
      channelName: String(row.channelName),
      channelSubscribers: Number(row.channelSubscribers ?? 0),
      channelMedianViews: Number(row.channelMedianViews ?? 0),
      kind: String(row.kind),
      notes: row.notes ? String(row.notes) : null,
      tags: parseJson(String(row.tagsJson), [] as string[]),
      outlierScore: Number(row.outlierScore ?? 0),
      viewVelocity: Number(row.viewVelocity ?? 0),
      views: Number(row.views ?? 0),
      durationSeconds: Number(row.durationSeconds ?? 0),
      publishedAt: row.publishedAt ? String(row.publishedAt) : null,
      createdAt: String(row.createdAt),
    }));
  }

  exportCollection(projectId: number) {
    const project = this.getProject(projectId);
    const references = this.listReferences(projectId);

    return {
      collection: {
        id: project.id,
        name: project.name,
        niche: project.niche,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      },
      references,
      exportedAt: new Date().toISOString(),
    };
  }

  async importReferenceVideo(projectId: number, videoInput: string) {
    const videoId = extractVideoId(videoInput);
    if (!videoId) {
      throw new Error("Invalid video URL or video ID.");
    }

    const backingGroup = this.getProjectBackingGroup(projectId) ?? this.ensureProjectBackingGroup(projectId);

    const [video] = await this.youtube.fetchVideos([videoId]);
    if (!video) {
      throw new Error("Video not found on YouTube.");
    }

    if (!video.channelId) {
      throw new Error("Video channel could not be resolved.");
    }

    const channel = await this.youtube.fetchChannelById(video.channelId);
    this.persistChannel(channel);
    this.attachChannelToProject(backingGroup, channel.channelId, "reference_source");

    const channelRow = db.prepare("SELECT median_views, subscriber_count FROM channels WHERE id = ?").get(channel.channelId) as
      | { median_views: number | null; subscriber_count: number | null }
      | undefined;
    const medianViews = Math.max(channelRow?.median_views ?? 0, 1);
    const safeMedian = medianViews > 1 ? medianViews : Math.max(video.views, 1);
    const daysSincePublished = Math.max(
      (Date.now() - new Date(video.publishedAt ?? new Date().toISOString()).getTime()) / (1000 * 60 * 60 * 24),
      1,
    );
    const outlierScore = Number((video.views / safeMedian).toFixed(4));
    const viewVelocity = Number((video.views / daysSincePublished).toFixed(4));
    const momentumScore = Number((outlierScore + viewVelocity / 100).toFixed(4));
    const engagementRatio = video.views > 0 ? Number(((video.likes + video.comments) / video.views).toFixed(4)) : 0;

    const durationSeconds = parseDurationToSeconds(video.duration);
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
      channel.channelId,
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

    const reference = this.saveReference(projectId, {
      videoId: video.id,
      kind: "imported_video",
      tags: ["seed-video"],
    });

    return {
      id: reference.id,
      videoId: video.id,
      channelId: channel.channelId,
    };
  }

  private persistChannel(channel: ResolvedChannel) {
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
  }

  private attachChannelToProject(backingGroup: BackingGroupRecord, channelId: string, relationship: string) {
    db.prepare(`
      INSERT INTO source_set_channels (source_set_id, channel_id, relationship)
      VALUES (?, ?, ?)
      ON CONFLICT(source_set_id, channel_id) DO UPDATE SET relationship = excluded.relationship
    `).run(backingGroup.id, channelId, relationship);

    db.prepare(`
      INSERT INTO project_channels (project_id, channel_id, relationship)
      VALUES (?, ?, ?)
      ON CONFLICT(project_id, channel_id) DO UPDATE SET relationship = excluded.relationship
    `).run(backingGroup.project_id, channelId, relationship);

    if (backingGroup.backing_list_id) {
      db.prepare(`
        INSERT INTO list_channels (list_id, channel_id)
        VALUES (?, ?)
        ON CONFLICT(list_id, channel_id) DO NOTHING
      `).run(backingGroup.backing_list_id, channelId);
    }
  }
}
