import { tokenizeTitle } from "@openoutlier/core";
import { db } from "../db.js";

export type PulluphoopsIdea = {
  seed: {
    videoId: string;
    title: string;
    channel: string;
    views: number;
    outlierScore: number;
    url: string;
  };
  angle: string;
  hooks: string[];
  clipSearches: string[];
  editNotes: string[];
};

type VideoRow = {
  id: string;
  title: string;
  channel: string;
  views: number;
  outlierScore: number;
};

const BASKETBALL_TERMS = [
  "nba",
  "basketball",
  "lebron",
  "jordan",
  "kobe",
  "curry",
  "shaq",
  "kd",
  "durant",
  "bronny",
  "luka",
  "wemby",
  "giannis",
  "dunk",
  "playoffs",
  "finals",
];

const STOP_TOKENS = new Set([
  "nba",
  "basketball",
  "shorts",
  "short",
  "viral",
  "highlights",
  "highlight",
  "clip",
  "clips",
]);

function extractSubject(title: string): string {
  const tokens = tokenizeTitle(title)
    .filter((token) => token.length > 2)
    .filter((token) => !STOP_TOKENS.has(token));
  return tokens.slice(0, 4).join(" ") || title.replace(/[#|].*$/g, "").trim();
}

function extractAngle(title: string): string {
  const lower = title.toLowerCase();
  if (/never|forgot|unknown|secret|hidden/.test(lower)) return "forgotten story / hidden context";
  if (/crazy|insane|wild|shocking/.test(lower)) return "shock moment with proof";
  if (/why|how/.test(lower)) return "explain the reason behind the moment";
  if (/beef|fight|trash|angry|mad/.test(lower)) return "conflict and emotion";
  if (/rookie|young|prime|old/.test(lower)) return "before-and-after career contrast";
  return "outlier moment breakdown";
}

function buildHooks(title: string): string[] {
  const subject = extractSubject(title);
  return [
    `this ${subject} moment makes way more sense when you know what happened before it`,
    `everyone remembers the highlight, but nobody talks about the reason it happened`,
    `this is one of those nba clips that looks normal until you know the backstory`,
    `the wild part about this play is not the play itself, it’s what it revealed`,
    `you can tell exactly who controlled the game from this one possession`,
  ];
}

function buildClipSearches(title: string): string[] {
  const subject = extractSubject(title);
  return [
    `${subject} full play`,
    `${subject} interview after game`,
    `${subject} crowd reaction`,
    `${subject} slow motion replay`,
    `${subject} context before play`,
  ];
}

export function generatePulluphoopsIdeas(limit = 12, days = 365): { ideas: PulluphoopsIdea[]; sourceCount: number } {
  const publishedAfter = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const termClause = BASKETBALL_TERMS.map((_, index) => `videos.title LIKE @term${index}`).join(" OR ");
  const params: Record<string, string | number> = { publishedAfter, limit };
  BASKETBALL_TERMS.forEach((term, index) => {
    params[`term${index}`] = `%${term}%`;
  });

  const rows = db
    .prepare(`
      SELECT
        videos.id,
        videos.title,
        channels.name AS channel,
        videos.views,
        videos.outlier_score AS outlierScore
      FROM videos
      INNER JOIN channels ON channels.id = videos.channel_id
      WHERE videos.published_at >= @publishedAfter
        AND videos.content_type = 'short'
        AND (${termClause})
      ORDER BY videos.outlier_score DESC, videos.views DESC
      LIMIT @limit
    `)
    .all(params) as VideoRow[];

  return {
    sourceCount: rows.length,
    ideas: rows.map((row) => ({
      seed: {
        videoId: row.id,
        title: row.title,
        channel: row.channel,
        views: row.views,
        outlierScore: row.outlierScore,
        url: `https://youtube.com/watch?v=${row.id}`,
      },
      angle: extractAngle(row.title),
      hooks: buildHooks(row.title),
      clipSearches: buildClipSearches(row.title),
      editNotes: [
        "open on the most confusing/emotional frame, then explain context",
        "use 2-3 fast source clips before the main highlight so it feels researched, not reposted",
        "keep the first sentence under 8 words and make the viewer need the next clip",
      ],
    })),
  };
}
