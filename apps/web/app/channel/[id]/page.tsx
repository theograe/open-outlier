"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api";

type ChannelResponse = {
  id: string;
  name: string;
  handle: string | null;
  subscriber_count: number | null;
  thumbnail_url: string | null;
  video_count: number;
  top_outlier_score: number | null;
  average_views: number | null;
  groups: Array<{ id: number; name: string; relationship: string }>;
  patternSummary: unknown;
  relatedChannels: unknown;
};

export default function ChannelPage({ params }: { params: Promise<{ id: string }> }) {
  const [channel, setChannel] = useState<ChannelResponse | null>(null);

  useEffect(() => {
    void params.then(({ id }) => apiFetch<ChannelResponse>(`/api/channels/${id}`).then(setChannel));
  }, [params]);

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <div className="eyebrow">Channel</div>
          <h1 className="headline">{channel?.name ?? "Loading channel..."}</h1>
          <div className="subtle">{channel?.handle ?? ""}</div>
        </div>
      </header>
      {channel ? (
        <>
          <section className="panel">
            <div className="metrics">
              <span className="pill">{Number(channel.subscriber_count ?? 0).toLocaleString()} subs</span>
              <span className="pill">{channel.video_count} videos</span>
              <span className="pill">{Number(channel.average_views ?? 0).toLocaleString()} avg views</span>
              <span className="pill">{Number(channel.top_outlier_score ?? 0).toFixed(1)}x top score</span>
            </div>
          </section>

          <section className="panel">
            <div className="eyebrow">Tracked In</div>
            <div className="list" style={{ marginTop: 12 }}>
              {channel.groups.map((group) => (
                <div key={group.id} className="list-row">
                  <span>{group.name}</span>
                  <span className="pill">{group.relationship}</span>
                </div>
              ))}
              {channel.groups.length === 0 ? <div className="subtle">Not attached to any tracked groups.</div> : null}
            </div>
          </section>

          <pre className="panel" style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify({
            patternSummary: channel.patternSummary,
            relatedChannels: channel.relatedChannels,
          }, null, 2)}</pre>
        </>
      ) : null}
    </div>
  );
}
