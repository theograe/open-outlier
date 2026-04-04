"use client";

type Video = {
  videoId: string;
  title: string;
  channelName: string;
  thumbnailUrl: string | null;
  views: number;
  outlierScore: number;
  viewVelocity: number;
  scoreBand: string;
  contentType: string;
  channelSubscribers?: number;
  durationSeconds?: number;
  publishedAt?: string | null;
};

function formatCompactDuration(durationSeconds?: number): string {
  if (!durationSeconds) return "";
  const hours = Math.floor(durationSeconds / 3600);
  const minutes = Math.floor((durationSeconds % 3600) / 60);
  const seconds = durationSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function OutlierCard({
  video,
  mode = "details",
  onSelect,
}: {
  video: Video;
  mode?: "details" | "thumbnails";
  onSelect?: (video: Video) => void;
}) {
  if (mode === "thumbnails") {
    return (
      <article className="thumb-card" onClick={() => onSelect?.(video)} style={{ cursor: onSelect ? "pointer" : "default" }}>
        <div className="thumb-card-media">
          {video.thumbnailUrl ? <img src={video.thumbnailUrl} alt={video.title} /> : <div className="thumb" />}
          <div className="thumb-card-overlay">
            <div className="metrics" style={{ marginBottom: 8 }}>
              <span className={`pill ${video.scoreBand}`}>{video.outlierScore.toFixed(1)}x</span>
              <span className="pill">{video.contentType}</span>
              {video.durationSeconds ? <span className="pill">{formatCompactDuration(video.durationSeconds)}</span> : null}
            </div>
            <h3 style={{ margin: 0, fontSize: 17 }}>{video.title}</h3>
            <div className="subtle" style={{ marginTop: 6 }}>{video.channelName}</div>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="card" onClick={() => onSelect?.(video)} style={{ cursor: onSelect ? "pointer" : "default" }}>
      {video.thumbnailUrl ? <img src={video.thumbnailUrl} alt={video.title} /> : <div className="thumb" />}
      <div className="card-body">
        <div className="metrics" style={{ marginBottom: 10 }}>
          <span className={`pill ${video.scoreBand}`}>{video.outlierScore.toFixed(1)}x</span>
          <span className="pill">{video.contentType}</span>
          <span className="pill">{Math.round(video.viewVelocity).toLocaleString()}/day</span>
        </div>
        <h3 style={{ margin: "0 0 8px", fontSize: 20 }}>{video.title}</h3>
        <div className="subtle" style={{ marginBottom: 14 }}>{video.channelName}</div>
        <div className="metrics">
          <span className="pill">{video.views.toLocaleString()} views</span>
          {video.channelSubscribers ? <span className="pill">{video.channelSubscribers.toLocaleString()} subs</span> : null}
          {video.durationSeconds ? <span className="pill">{formatCompactDuration(video.durationSeconds)}</span> : null}
        </div>
      </div>
    </article>
  );
}
