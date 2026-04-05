"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api";
import { OutlierCard } from "../../../components/outlier-card";

type CollectionReference = {
  id: number;
  videoId: string;
  title: string;
  thumbnailUrl: string | null;
  channelId: string;
  channelName: string;
  channelSubscribers: number;
  channelMedianViews: number;
  outlierScore: number;
  viewVelocity: number;
  views: number;
  durationSeconds: number;
  publishedAt: string | null;
};

type CollectionDetail = {
  id: number;
  name: string;
  niche: string | null;
};

export default function CollectionPage({ params }: { params: Promise<{ id: string }> }) {
  const [collection, setCollection] = useState<CollectionDetail | null>(null);
  const [references, setReferences] = useState<CollectionReference[]>([]);

  useEffect(() => {
    void params.then(async ({ id }) => {
      const [collectionDetail, savedReferences] = await Promise.all([
        apiFetch<CollectionDetail>(`/api/collections/${id}`),
        apiFetch<CollectionReference[]>(`/api/collections/${id}/references`),
      ]);
      setCollection(collectionDetail);
      setReferences(savedReferences);
    });
  }, [params]);

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <div className="eyebrow">Collection</div>
          <h1 className="headline">{collection?.name ?? "Loading..."}</h1>
          <div className="subtle">{collection?.niche ?? "Saved outliers"}</div>
        </div>
        <Link className="button secondary" href="/collections">Back to Collections</Link>
      </header>

      <section className="card-grid">
        {references.map((reference) => (
          <OutlierCard
            key={reference.id}
            video={{
              videoId: reference.videoId,
              title: reference.title,
              channelName: reference.channelName,
              channelId: reference.channelId,
              channelMedianViews: reference.channelMedianViews,
              channelSubscribers: reference.channelSubscribers,
              thumbnailUrl: reference.thumbnailUrl,
              views: reference.views,
              outlierScore: reference.outlierScore,
              viewVelocity: reference.viewVelocity,
              scoreBand: "warm",
              contentType: "long",
              durationSeconds: reference.durationSeconds,
              publishedAt: reference.publishedAt,
            }}
            similarHref={`/discover/video/${reference.videoId}?mode=thumbnail`}
            similarTopicsHref={`/discover/video/${reference.videoId}?mode=topic`}
            similarChannelsHref={`/discover/channel/${reference.channelId}`}
          />
        ))}
      </section>

      {references.length === 0 ? <section className="panel alt">No saved videos in this collection yet.</section> : null}
    </div>
  );
}
