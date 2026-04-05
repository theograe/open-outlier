"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiFetch } from "../../../../lib/api";
import { ChannelAvatar } from "../../../../components/channel-avatar";

type RelatedChannel = {
  id: string;
  name: string;
  handle: string | null;
  subscriberCount: number;
  thumbnailUrl?: string | null;
  similarity: number;
};

type ChannelResponse = {
  id: string;
  name: string;
  handle: string | null;
  subscriber_count: number | null;
  thumbnail_url: string | null;
  relatedChannels: RelatedChannel[];
};

type TrackedChannel = {
  id: string;
};

function getChannelHref(channelId: string, handle: string | null): string {
  if (handle) {
    return `https://youtube.com/${handle.replace(/^@?/, "@")}`;
  }
  return `https://youtube.com/channel/${channelId}`;
}

export default function SimilarChannelsPage() {
  const params = useParams<{ channelId: string }>();
  const channelId = params.channelId;
  const [channel, setChannel] = useState<ChannelResponse | null>(null);
  const [trackedChannelIds, setTrackedChannelIds] = useState<string[]>([]);
  const [pendingChannelIds, setPendingChannelIds] = useState<string[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    void apiFetch<TrackedChannel[]>("/api/tracked-channels")
      .then((channels) => setTrackedChannelIds(channels.map((item) => item.id)))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    void apiFetch<ChannelResponse>(`/api/channels/${channelId}`)
      .then(setChannel)
      .catch((fetchError) => setError(fetchError instanceof Error ? fetchError.message : "Failed to load channel."));
  }, [channelId]);

  async function saveChannel(targetChannelId: string) {
    if (trackedChannelIds.includes(targetChannelId) || pendingChannelIds.includes(targetChannelId)) {
      return;
    }
    setPendingChannelIds((current) => [...current, targetChannelId]);
    try {
      await apiFetch("/api/tracked-channels", {
        method: "POST",
        body: JSON.stringify({
          channelId: targetChannelId,
          relationship: "competitor",
        }),
      });
      setTrackedChannelIds((current) => current.includes(targetChannelId) ? current : [...current, targetChannelId]);
      setError("");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to track channel.");
    } finally {
      setPendingChannelIds((current) => current.filter((id) => id !== targetChannelId));
    }
  }

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <div className="eyebrow">Discover</div>
          <h1 className="headline">Browse similar channels</h1>
          <div className="subtle">Use this to expand your niche with creators adjacent to the one you started from.</div>
        </div>
        <Link className="button secondary" href="/discover">Back to Discover</Link>
      </header>

      {error ? <section className="panel">{error}</section> : null}

      {channel ? (
        <section className="seed-channel-panel">
          <a
            href={getChannelHref(channel.id, channel.handle)}
            target="_blank"
            rel="noreferrer"
            className="seed-channel-link"
          >
            <ChannelAvatar
              src={channel.thumbnail_url}
              alt={channel.name}
              name={channel.name}
              className="seed-channel-image"
            />
          </a>
          <a
            href={getChannelHref(channel.id, channel.handle)}
            target="_blank"
            rel="noreferrer"
            className="seed-channel-body seed-channel-link"
          >
            <div className="eyebrow">Starting channel</div>
            <h2 className="seed-channel-title">{channel.name}</h2>
            <div className="subtle">{channel.handle ?? ""}</div>
            <div className="metrics">
              <span className="pill">{Number(channel.subscriber_count ?? 0).toLocaleString()} subs</span>
            </div>
          </a>
          <div className="seed-channel-actions">
            <button
              type="button"
              className={`button secondary ${trackedChannelIds.includes(channel.id) ? "is-success" : ""}`}
              onClick={() => void saveChannel(channel.id)}
              disabled={trackedChannelIds.includes(channel.id) || pendingChannelIds.includes(channel.id)}
            >
              {pendingChannelIds.includes(channel.id) ? "Tracking..." : trackedChannelIds.includes(channel.id) ? "Tracked" : "Track channel"}
            </button>
          </div>
        </section>
      ) : null}

      <section className="channel-grid">
        {channel?.relatedChannels.map((item) => (
          <Link key={item.id} href={`/discover/channel/${item.id}`} className="channel-card">
            <ChannelAvatar
              src={item.thumbnailUrl}
              alt={item.name}
              name={item.name}
              className="channel-card-image"
            />
            <div className="channel-card-body">
              <div className="channel-card-title">{item.name}</div>
              <div className="subtle">{item.handle ?? ""}</div>
              <div className="metrics">
                <span className="pill">{item.subscriberCount.toLocaleString()} subs</span>
                <span className="pill">{(item.similarity * 100).toFixed(0)}% match</span>
              </div>
              <button
                type="button"
                className={`button secondary button-small channel-track-button ${trackedChannelIds.includes(item.id) ? "is-success" : ""}`}
                onClick={(event) => {
                  event.preventDefault();
                  void saveChannel(item.id);
                }}
                disabled={trackedChannelIds.includes(item.id) || pendingChannelIds.includes(item.id)}
              >
                {pendingChannelIds.includes(item.id) ? "Tracking..." : trackedChannelIds.includes(item.id) ? "Tracked" : "Track channel"}
              </button>
            </div>
          </Link>
        ))}
        {channel && channel.relatedChannels.length === 0 ? <div className="subtle">No similar channels found yet.</div> : null}
      </section>
    </div>
  );
}
