"use client";

import Link from "next/link";

type Video = {
  videoId: string;
  title: string;
  channelName: string;
  channelId?: string;
  channelMedianViews?: number;
  trackedInProject?: boolean;
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

function formatCompactNumber(value?: number): string {
  if (!value) return "0";
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatRelativeDate(dateString?: string | null): string {
  if (!dateString) return "";
  const published = new Date(dateString).getTime();
  const diff = Date.now() - published;
  const day = 24 * 60 * 60 * 1000;
  const year = 365 * day;
  const month = 30 * day;

  if (diff >= year) return `${Math.max(1, Math.round(diff / year))}y ago`;
  if (diff >= month) return `${Math.max(1, Math.round(diff / month))}mo ago`;
  if (diff >= day) return `${Math.max(1, Math.round(diff / day))}d ago`;
  return "Today";
}

function outlierTone(score: number): string {
  if (score >= 100) return "tone-5";
  if (score >= 30) return "tone-4";
  if (score >= 10) return "tone-3";
  if (score >= 3) return "tone-2";
  return "tone-1";
}

export function OutlierCard({
  video,
  onOpenSave,
  onTrackChannel,
  onDismiss,
  saveState = "idle",
  trackState = "idle",
  dismissState = "idle",
  similarHref,
  similarChannelsHref,
}: {
  video: Video;
  onOpenSave?: (video: Video) => void;
  onTrackChannel?: (video: Video) => void;
  onDismiss?: (video: Video) => void;
  saveState?: "idle" | "saving" | "saved";
  trackState?: "idle" | "saving" | "saved";
  dismissState?: "idle" | "saving";
  similarHref?: string;
  similarChannelsHref?: string;
}) {
  const browseHref = similarHref ?? `/discover/video/${video.videoId}`;
  const channelsHref = similarChannelsHref ?? (video.channelId ? `/discover/channel/${video.channelId}` : "#");
  const youtubeHref = `https://youtube.com/watch?v=${video.videoId}`;
  const statsLine = `${formatCompactNumber(video.views)} views vs ${formatCompactNumber(video.channelMedianViews)} avg`;
  const metaLine = `${formatCompactNumber(video.channelSubscribers)} subs`;

  return (
    <article className="outlier-tile">
      <div className="outlier-media">
        <Link href={browseHref} className="outlier-media-link">
          {video.thumbnailUrl ? (
            <img src={video.thumbnailUrl} alt={video.title} />
          ) : (
            <div className="outlier-media-placeholder">No thumbnail</div>
          )}
        </Link>
        <div className="outlier-hover">
          <div className="outlier-hover-corner outlier-hover-top-right">
            <span className="tooltip-anchor" data-tooltip="Hide video">
              <button
                type="button"
                className="hover-icon-button hover-icon-button-dismiss"
                disabled={dismissState !== "idle"}
                onClick={() => {
                  if (dismissState === "idle") {
                    onDismiss?.(video);
                  }
                }}
                aria-label="Hide video forever"
              >
                {dismissState === "saving" ? "…" : "×"}
              </button>
            </span>
          </div>
          <div className="outlier-hover-corner outlier-hover-center">
            <Link href={browseHref} className="hover-action-button">
              View similar
            </Link>
          </div>
        </div>
        <div className="outlier-media-controls">
          {video.durationSeconds ? (
            <div className="outlier-duration subtle-duration">{formatCompactDuration(video.durationSeconds)}</div>
          ) : null}
          <div className="outlier-media-actions">
            <span className="tooltip-anchor" data-tooltip={trackState === "saved" ? "Tracked" : "Track channel"}>
              <button
                type="button"
                className={`hover-icon-button ${trackState === "saved" ? "is-success" : ""}`}
                disabled={!video.channelId || trackState !== "idle"}
                onClick={() => {
                  if (trackState === "idle") {
                    onTrackChannel?.(video);
                  }
                }}
                aria-label={trackState === "saved" ? "Tracked channel" : "Track channel"}
              >
                {trackState === "saving" ? (
                  "…"
                ) : trackState === "saved" ? (
                  "✓"
                ) : (
                  <span className="icon-plus" aria-hidden="true">+</span>
                )}
              </button>
            </span>
            <span className="tooltip-anchor" data-tooltip={saveState === "saved" ? "Saved" : "Save video"}>
              <button
                type="button"
                className={`hover-icon-button ${saveState === "saved" ? "is-success" : ""}`}
                disabled={saveState === "saving"}
                onClick={() => onOpenSave?.(video)}
                aria-label="Save video"
              >
                {saveState === "saving" ? (
                  "…"
                ) : saveState === "saved" ? (
                  "✓"
                ) : (
                  <svg className="icon-bookmark" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M4.25 2.25h7.5a.5.5 0 0 1 .5.5v10.2a.3.3 0 0 1-.49.234L8 10.08l-3.76 3.104a.3.3 0 0 1-.49-.234V2.75a.5.5 0 0 1 .5-.5Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            </span>
          </div>
        </div>
      </div>
      <div className="outlier-body">
        <div className="outlier-title-row">
          <a className="outlier-title-link" href={youtubeHref} target="_blank" rel="noreferrer">
            <span className="outlier-title">
              <span className={`outlier-chip ${outlierTone(video.outlierScore)}`}>{video.outlierScore.toFixed(1)}x</span>{" "}
              {video.title}
            </span>
          </a>
        </div>
        {video.channelId ? (
          <Link className="outlier-meta outlier-channel-link" href={channelsHref}>
            {video.channelName} · {metaLine}
          </Link>
        ) : (
          <div className="outlier-meta">{video.channelName} · {metaLine}</div>
        )}
        <div className="outlier-stats-row">
          <span>{statsLine}</span>
          <span>{formatRelativeDate(video.publishedAt)}</span>
        </div>
      </div>
    </article>
  );
}
