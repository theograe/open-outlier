"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch, apiFetchRaw } from "../../../lib/api";
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
  const [collectionId, setCollectionId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [pendingRemoveIds, setPendingRemoveIds] = useState<number[]>([]);

  useEffect(() => {
    void params.then(async ({ id }) => {
      setCollectionId(Number(id));
      const [collectionDetail, savedReferences] = await Promise.all([
        apiFetch<CollectionDetail>(`/api/collections/${id}`),
        apiFetch<CollectionReference[]>(`/api/collections/${id}/references`),
      ]);
      setCollection(collectionDetail);
      setReferences(savedReferences);
    });
  }, [params]);

  async function removeReference(referenceId: number) {
    if (!collectionId || pendingRemoveIds.includes(referenceId)) {
      return;
    }

    setPendingRemoveIds((current) => [...current, referenceId]);
    setError("");
    try {
      await apiFetch(`/api/collections/${collectionId}/references/${referenceId}`, { method: "DELETE" });
      setReferences((current) => current.filter((reference) => reference.id !== referenceId));
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Failed to remove saved video.");
    } finally {
      setPendingRemoveIds((current) => current.filter((id) => id !== referenceId));
    }
  }

  async function exportCollection(format: "json" | "csv") {
    if (!collectionId) {
      return;
    }

    try {
      const response = await apiFetchRaw(`/api/collections/${collectionId}/export?format=${format}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${collection?.name?.trim().replace(/\s+/g, "-").toLowerCase() || `collection-${collectionId}`}.${format}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Failed to export collection.");
    }
  }

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <div className="eyebrow">Collection</div>
          <h1 className="headline">{collection?.name ?? "Loading..."}</h1>
          <div className="subtle">{collection?.niche ?? "Saved outliers"}</div>
        </div>
        <div className="simple-toolbar">
          <button type="button" className="button secondary" onClick={() => void exportCollection("json")}>Export JSON</button>
          <button type="button" className="button secondary" onClick={() => void exportCollection("csv")}>Export CSV</button>
          <Link className="button secondary" href="/collections">Back to Collections</Link>
        </div>
      </header>

      {error ? <section className="panel panel-error">{error}</section> : null}

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
            similarHref={`/discover/video/${reference.videoId}`}
            similarChannelsHref={`/discover/channel/${reference.channelId}`}
            onRemove={() => {
              void removeReference(reference.id);
            }}
            removeState={pendingRemoveIds.includes(reference.id) ? "saving" : "idle"}
            topRightTooltip="Remove from collection"
          />
        ))}
      </section>

      {references.length === 0 ? <section className="panel alt">No saved videos in this collection yet.</section> : null}
    </div>
  );
}
