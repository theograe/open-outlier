import type { ScoreBand } from "./types.js";

export function parseDurationToSeconds(duration: string | null | undefined): number {
  if (!duration) {
    return 0;
  }

  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) {
    return 0;
  }

  const [, hours, minutes, seconds] = match;
  return (Number(hours ?? 0) * 3600) + (Number(minutes ?? 0) * 60) + Number(seconds ?? 0);
}

export function getContentType(durationSeconds: number): "long" | "short" {
  return durationSeconds <= 180 ? "short" : "long";
}

export function getScoreBand(score: number): ScoreBand {
  if (score >= 10) {
    return "fire";
  }
  if (score >= 5) {
    return "hot";
  }
  return "warm";
}

export function computeChannelSizeFactor(subscribers: number, medianViews: number): number {
  if (subscribers <= 0) {
    return 1;
  }

  const reachRatio = medianViews / Math.max(subscribers, 1);
  return Number(Math.max(0.5, Math.min(2, 1 + (0.15 - reachRatio))).toFixed(4));
}

export function computeMomentumScore(score: number, velocity: number, subscribers: number, medianViews: number): number {
  const sizeFactor = computeChannelSizeFactor(subscribers, medianViews);
  const velocityFactor = Math.log10(Math.max(velocity, 1));
  return Number((score * sizeFactor * Math.max(1, velocityFactor)).toFixed(4));
}
