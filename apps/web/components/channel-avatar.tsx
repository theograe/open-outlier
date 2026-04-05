"use client";

import { useMemo, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_OPENOUTLIER_API_URL ?? "http://localhost:3001";

function toProxyUrl(source: string): string {
  return `${API_URL}/api/images/remote?url=${encodeURIComponent(source)}`;
}

function initialsFor(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

export function ChannelAvatar({
  src,
  alt,
  name,
  className,
}: {
  src?: string | null;
  alt: string;
  name: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const proxiedSrc = useMemo(() => (src ? toProxyUrl(src) : null), [src]);

  if (!proxiedSrc || failed) {
    return <div className={`${className ?? ""} channel-avatar-fallback`.trim()} aria-label={alt}>{initialsFor(name)}</div>;
  }

  return (
    <img
      src={proxiedSrc}
      alt={alt}
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
