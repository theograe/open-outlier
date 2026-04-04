"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";

type IdeaRun = {
  id: number;
  kind: string;
  title: string | null;
  model: string | null;
  created_at: string;
  result: unknown;
};
type ThumbnailGeneration = {
  id: number;
  status: string;
  prompt: string;
  downloadUrls: string[];
  resultUrls: string[];
  provider?: string;
};

export default function IdeasPage() {
  const [ideas, setIdeas] = useState<IdeaRun[]>([]);
  const [thumbnailGenerations, setThumbnailGenerations] = useState<ThumbnailGeneration[]>([]);

  useEffect(() => {
    void Promise.all([
      apiFetch<IdeaRun[]>("/api/ideas"),
      apiFetch<ThumbnailGeneration[]>("/api/thumbnails/generations"),
    ]).then(([ideaRuns, thumbnailRuns]) => {
      setIdeas(ideaRuns);
      setThumbnailGenerations(thumbnailRuns);
    });
  }, []);

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <div className="eyebrow">Ideas</div>
          <h1 className="headline">Grounded outputs from proven winners</h1>
        </div>
      </header>

      <section className="panel">
        <div className="list">
          {ideas.map((idea) => (
            <div key={idea.id} className="panel alt">
              <div className="metrics" style={{ marginBottom: 10 }}>
                <span className="pill">{idea.kind}</span>
                <span className="pill">{idea.model ?? "heuristic"}</span>
              </div>
              <strong>{idea.title ?? "Untitled run"}</strong>
              <pre style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}>{JSON.stringify(idea.result, null, 2)}</pre>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2 style={{ marginTop: 0 }}>Thumbnail generations</h2>
        <div className="list">
          {thumbnailGenerations.map((generation) => (
            <div key={generation.id} className="panel alt">
              <div className="metrics" style={{ marginBottom: 10 }}>
                <span className="pill">{generation.status}</span>
                <span className="pill">{generation.provider ?? "kie-nano-banana-2"}</span>
              </div>
              <div style={{ marginBottom: 12 }}>{generation.prompt}</div>
              <div className="vision-board">
                {generation.downloadUrls.map((url) => (
                  <div className="vision-item" key={url}>
                    <img src={url} alt="Generated thumbnail" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
