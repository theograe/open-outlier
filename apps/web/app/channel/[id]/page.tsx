"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api";

export default function ChannelPage({ params }: { params: Promise<{ id: string }> }) {
  const [channel, setChannel] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    void params.then(({ id }) => apiFetch<Record<string, unknown>>(`/api/channels/${id}`).then(setChannel));
  }, [params]);

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <div className="eyebrow">Channel</div>
          <h1 className="headline">{String(channel?.name ?? "Loading channel...")}</h1>
        </div>
      </header>
      {channel ? <pre className="panel">{JSON.stringify(channel, null, 2)}</pre> : null}
    </div>
  );
}
