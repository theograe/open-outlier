import type { IdeaGenerationKind, PromptSourceVideo } from "./types.js";

const STOP_WORDS = new Set([
  "about",
  "after",
  "before",
  "from",
  "have",
  "into",
  "just",
  "like",
  "made",
  "more",
  "than",
  "that",
  "their",
  "them",
  "they",
  "this",
  "what",
  "when",
  "with",
  "your",
  "you",
  "how",
  "why",
  "video",
  "youtube",
]);

export function tokenizeTitle(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3)
    .filter((token) => !STOP_WORDS.has(token));
}

export function summarizePatterns(videos: PromptSourceVideo[]): string[] {
  const counts = new Map<string, number>();

  for (const video of videos) {
    for (const token of tokenizeTitle(video.title)) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([token]) => token);
}

export function buildGroundedPrompt(kind: IdeaGenerationKind, videos: PromptSourceVideo[], context?: string): string {
  const lines = videos.map(
    (video, index) =>
      `${index + 1}. ${video.title} | ${video.channelName} | ${video.views} views | ${video.outlierScore.toFixed(1)}x | velocity ${video.viewVelocity.toFixed(1)}`,
  );

  return [
    `You are helping a YouTube strategist create ${kind.replaceAll("_", " ")} outputs grounded only in proven outlier videos.`,
    context ? `Goal: ${context}` : null,
    "Use the source videos below as evidence. Reference recurring patterns, topics, and packaging angles. Avoid generic advice.",
    "Source videos:",
    ...lines,
  ]
    .filter(Boolean)
    .join("\n");
}

export function heuristicGeneration(kind: IdeaGenerationKind, videos: PromptSourceVideo[], context?: string): string {
  const patterns = summarizePatterns(videos);
  const lead = context ? `Focus: ${context}. ` : "";

  if (kind === "title_set") {
    return JSON.stringify({
      titles: patterns.slice(0, 5).map((pattern, index) => `${index + 1}. ${capitalize(pattern)} ideas creators can steal right now`),
      sources: videos.map((video) => video.videoId),
    });
  }

  if (kind === "thumbnail_brief") {
    return JSON.stringify({
      concept: `${lead}Use one dominant object, a short contrast phrase, and visual emphasis around ${patterns[0] ?? "the winning topic"}.`,
      references: videos.slice(0, 3).map((video) => ({ videoId: video.videoId, title: video.title })),
    });
  }

  return JSON.stringify({
    summary: `${lead}Recurring angles: ${patterns.join(", ")}.`,
    ideas: patterns.slice(0, 5).map((pattern, index) => ({
      label: `${capitalize(pattern)} angle ${index + 1}`,
      rationale: `Grounded in ${videos.slice(0, 2).map((video) => video.title).join(" + ")}.`,
    })),
    sources: videos.map((video) => video.videoId),
  });
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
