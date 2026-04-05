"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { OutlierCard } from "../../../../components/outlier-card";
import { apiFetch } from "../../../../lib/api";

type Video = {
  videoId: string;
  title: string;
  channelName: string;
  channelId?: string;
  channelMedianViews?: number;
  thumbnailUrl?: string | null;
  views: number;
  outlierScore: number;
  viewVelocity: number;
  scoreBand: string;
  contentType: string;
  channelSubscribers?: number;
  durationSeconds?: number;
  publishedAt?: string | null;
};

type SimilarItem = {
  videoId: string;
  title: string;
  similarity: number;
  thumbnailUrl?: string | null;
  channelName?: string;
  channelId?: string;
  outlierScore?: number;
  viewVelocity?: number;
};

type Collection = {
  id: number;
  name: string;
};

export default function SimilarDiscoverPage() {
  const params = useParams<{ videoId: string }>();
  const searchParams = useSearchParams();
  const videoId = params.videoId;
  const mode = searchParams.get("mode") === "topic" ? "topic" : "thumbnail";
  const [video, setVideo] = useState<Video | null>(null);
  const [similar, setSimilar] = useState<SimilarItem[]>([]);
  const [collectionId, setCollectionId] = useState<string>("");
  const [error, setError] = useState("");
  const [savedVideoIds, setSavedVideoIds] = useState<string[]>([]);
  const [trackedChannelIds, setTrackedChannelIds] = useState<string[]>([]);
  const [pendingVideoIds, setPendingVideoIds] = useState<string[]>([]);
  const [pendingChannelIds, setPendingChannelIds] = useState<string[]>([]);

  useEffect(() => {
    void apiFetch<Collection[]>("/api/collections")
      .then((rows) => {
        if (rows[0]) {
          setCollectionId(String(rows[0].id));
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!collectionId) {
      setSavedVideoIds([]);
      setTrackedChannelIds([]);
      return;
    }

    void Promise.all([
      apiFetch<Array<{ videoId: string }>>(`/api/collections/${collectionId}/references`),
      apiFetch<Array<{ id: string }>>("/api/tracked-channels"),
    ])
      .then(([references, channels]) => {
        setSavedVideoIds(references.map((item) => item.videoId));
        setTrackedChannelIds(channels.map((item) => item.id));
      })
      .catch(() => undefined);
  }, [collectionId]);

  useEffect(() => {
    setError("");
    void apiFetch<Video>(`/api/discover/video/${videoId}`)
      .then(setVideo)
      .catch((fetchError) => setError(fetchError instanceof Error ? fetchError.message : "Failed to load video."));

    const endpoint = mode === "thumbnail" ? "similar-thumbnails" : "similar-topics";
    void apiFetch<{ items: SimilarItem[] }>(`/api/discover/${endpoint}?videoId=${videoId}&limit=18`)
      .then((response) => setSimilar(response.items))
      .catch((fetchError) => setError(fetchError instanceof Error ? fetchError.message : "Failed to load similar videos."));
  }, [mode, videoId]);

  async function saveVideo(targetVideoId: string) {
    if (!collectionId) {
      setError("Pick a collection first on Browse.");
      return;
    }
    if (savedVideoIds.includes(targetVideoId) || pendingVideoIds.includes(targetVideoId)) {
      return;
    }

    setPendingVideoIds((current) => [...current, targetVideoId]);

    try {
      await apiFetch(`/api/collections/${collectionId}/references`, {
        method: "POST",
        body: JSON.stringify({
          videoId: targetVideoId,
          kind: "outlier",
          tags: ["saved-from-similar-browse"],
        }),
      });
      setSavedVideoIds((current) => current.includes(targetVideoId) ? current : [...current, targetVideoId]);
      setError("");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save video.");
    } finally {
      setPendingVideoIds((current) => current.filter((id) => id !== targetVideoId));
    }
  }

  async function saveChannel(channelId?: string) {
    if (!channelId) {
      setError("Missing channel id.");
      return;
    }
    if (trackedChannelIds.includes(channelId) || pendingChannelIds.includes(channelId)) {
      return;
    }

    setPendingChannelIds((current) => [...current, channelId]);

    try {
      await apiFetch("/api/tracked-channels", {
        method: "POST",
        body: JSON.stringify({
          channelId,
          relationship: "competitor",
        }),
      });
      setTrackedChannelIds((current) => current.includes(channelId) ? current : [...current, channelId]);
      setError("");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to track channel.");
    } finally {
      setPendingChannelIds((current) => current.filter((id) => id !== channelId));
    }
  }

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <div className="eyebrow">Discover</div>
          <h1 className="headline">{mode === "thumbnail" ? "Browse similar thumbnails" : "Browse similar topics"}</h1>
          <div className="subtle">Click any thumbnail to keep exploring. Click any title to open the original video.</div>
        </div>
        <div className="simple-toolbar">
          <Link className={`button secondary ${mode === "thumbnail" ? "active-mode" : ""}`} href={`/discover/video/${videoId}?mode=thumbnail`}>Thumbnails</Link>
          <Link className={`button secondary ${mode === "topic" ? "active-mode" : ""}`} href={`/discover/video/${videoId}?mode=topic`}>Topics</Link>
          <Link className="button secondary" href="/discover">Back to Discover</Link>
        </div>
      </header>

      {error ? <section className="panel">{error}</section> : null}

      {video ? (
        <section className="panel">
          <div className="eyebrow">Starting From</div>
          <div className="seed-video-shell">
            {video.thumbnailUrl ? <img src={video.thumbnailUrl} alt={video.title} /> : <div className="seed-video-placeholder">No thumbnail</div>}
            <div className="stack">
              <a href={`https://youtube.com/watch?v=${video.videoId}`} target="_blank" rel="noreferrer" className="seed-video-title">
                {video.title}
              </a>
              <div className="subtle">{video.channelName}</div>
              <div className="metrics">
                <span className={`pill ${video.scoreBand}`}>{video.outlierScore.toFixed(1)}x</span>
                <span className="pill">{video.views.toLocaleString()} views</span>
                <span className="pill">{Math.round(video.viewVelocity).toLocaleString()}/day</span>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <section className="panel">
        <div className="card-grid">
          {similar.map((item) => (
            <OutlierCard
              key={item.videoId}
              video={{
                videoId: item.videoId,
                title: item.title,
                channelName: item.channelName ?? "Unknown channel",
                channelId: item.channelId,
                thumbnailUrl: item.thumbnailUrl ?? null,
                views: 0,
                outlierScore: item.outlierScore ?? 0,
                viewVelocity: item.viewVelocity ?? 0,
                scoreBand: "warm",
                contentType: "long",
              }}
              similarHref={`/discover/video/${item.videoId}?mode=thumbnail`}
              similarTopicsHref={`/discover/video/${item.videoId}?mode=topic`}
              similarChannelsHref={item.channelId ? `/discover/channel/${item.channelId}` : undefined}
              onOpenSave={() => {
                void saveVideo(item.videoId);
              }}
              saveState={
                pendingVideoIds.includes(item.videoId)
                  ? "saving"
                  : savedVideoIds.includes(item.videoId)
                    ? "saved"
                    : "idle"
              }
              onTrackChannel={() => {
                void saveChannel(item.channelId);
              }}
              trackState={
                item.channelId && pendingChannelIds.includes(item.channelId)
                  ? "saving"
                  : item.channelId && trackedChannelIds.includes(item.channelId)
                    ? "saved"
                    : "idle"
              }
            />
          ))}
          {similar.length === 0 && !error ? <div className="subtle">No similar videos found yet.</div> : null}
        </div>
      </section>
    </div>
  );
}
