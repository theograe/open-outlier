import { config } from "../config.js";
import { db, getSetting } from "../db.js";

type EmbeddingRow = {
  video_id: string;
  provider: string;
  model: string;
  source_text: string;
  embedding_json: string;
};

function cosineSimilarity(left: number[], right: number[]): number {
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  const size = Math.min(left.length, right.length);
  for (let index = 0; index < size; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] * left[index];
    rightMagnitude += right[index] * right[index];
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return 0;
  }

  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

function parseEmbedding(json: string): number[] {
  try {
    return JSON.parse(json) as number[];
  } catch {
    return [];
  }
}

export class EmbeddingsService {
  private getOpenAiKey(): string | null {
    const explicit = getSetting("openai_embeddings_api_key");
    if (explicit) {
      return explicit;
    }

    if (config.openAiApiKey) {
      return config.openAiApiKey;
    }

    const activeProvider = db
      .prepare("SELECT api_key FROM llm_providers WHERE provider = 'openai' AND is_active = 1 ORDER BY id DESC LIMIT 1")
      .get() as { api_key: string | null } | undefined;

    return activeProvider?.api_key ?? null;
  }

  private getEmbeddingsModel(): string {
    return getSetting("embeddings_model") ?? config.defaultEmbeddingsModel;
  }

  async ensureEmbeddings(videoIds: string[]): Promise<"openai" | "fallback"> {
    const uniqueIds = [...new Set(videoIds)];
    if (uniqueIds.length === 0) {
      return "fallback";
    }

    const providerKey = this.getOpenAiKey();
    if (!providerKey) {
      return "fallback";
    }

    const placeholders = uniqueIds.map(() => "?").join(", ");
    const existing = db
      .prepare(`SELECT video_id, source_text FROM video_text_embeddings WHERE video_id IN (${placeholders})`)
      .all(...uniqueIds) as Array<{ video_id: string; source_text: string }>;

    const existingMap = new Map(existing.map((row) => [row.video_id, row.source_text]));
    const candidates = db
      .prepare(`SELECT id, title FROM videos WHERE id IN (${placeholders})`)
      .all(...uniqueIds) as Array<{ id: string; title: string }>;

    const missing = candidates.filter((candidate) => existingMap.get(candidate.id) !== candidate.title);
    if (missing.length === 0) {
      return "openai";
    }

    const model = this.getEmbeddingsModel();
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${providerKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: missing.map((item) => item.title),
      }),
    });

    if (!response.ok) {
      return "fallback";
    }

    const json = (await response.json()) as { data?: Array<{ embedding: number[]; index: number }> };
    const transaction = db.transaction(() => {
      for (const item of json.data ?? []) {
        const candidate = missing[item.index];
        if (!candidate) {
          continue;
        }

        db.prepare(`
          INSERT INTO video_text_embeddings (video_id, provider, model, source_text, embedding_json, updated_at)
          VALUES (?, 'openai', ?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(video_id) DO UPDATE SET
            provider = excluded.provider,
            model = excluded.model,
            source_text = excluded.source_text,
            embedding_json = excluded.embedding_json,
            updated_at = CURRENT_TIMESTAMP
        `).run(candidate.id, model, candidate.title, JSON.stringify(item.embedding));
      }
    });

    transaction();
    return "openai";
  }

  async getSimilarityScores(seedVideoId: string, candidateIds: string[]): Promise<Map<string, number> | null> {
    const mode = await this.ensureEmbeddings([seedVideoId, ...candidateIds]);
    if (mode !== "openai") {
      return null;
    }

    const placeholders = [seedVideoId, ...candidateIds].map(() => "?").join(", ");
    const rows = db
      .prepare(`SELECT video_id, embedding_json FROM video_text_embeddings WHERE video_id IN (${placeholders})`)
      .all(seedVideoId, ...candidateIds) as EmbeddingRow[];

    const embeddings = new Map(rows.map((row) => [row.video_id, parseEmbedding(row.embedding_json)]));
    const seed = embeddings.get(seedVideoId);
    if (!seed) {
      return null;
    }

    const scores = new Map<string, number>();
    for (const candidateId of candidateIds) {
      const candidate = embeddings.get(candidateId);
      if (!candidate) {
        continue;
      }
      scores.set(candidateId, cosineSimilarity(seed, candidate));
    }

    return scores;
  }

  async getQuerySimilarityScores(queryText: string, candidateIds: string[]): Promise<Map<string, number> | null> {
    const uniqueIds = [...new Set(candidateIds)];
    if (uniqueIds.length === 0) {
      return null;
    }

    const providerKey = this.getOpenAiKey();
    if (!providerKey) {
      return null;
    }

    const mode = await this.ensureEmbeddings(uniqueIds);
    if (mode !== "openai") {
      return null;
    }

    const placeholders = uniqueIds.map(() => "?").join(", ");
    const rows = db
      .prepare(`SELECT video_id, embedding_json FROM video_text_embeddings WHERE video_id IN (${placeholders})`)
      .all(...uniqueIds) as EmbeddingRow[];

    const embeddings = new Map(rows.map((row) => [row.video_id, parseEmbedding(row.embedding_json)]));
    const model = this.getEmbeddingsModel();
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${providerKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: queryText,
      }),
    });

    if (!response.ok) {
      return null;
    }

    const json = (await response.json()) as { data?: Array<{ embedding: number[] }> };
    const queryEmbedding = json.data?.[0]?.embedding;
    if (!queryEmbedding) {
      return null;
    }

    const scores = new Map<string, number>();
    for (const candidateId of uniqueIds) {
      const candidate = embeddings.get(candidateId);
      if (!candidate) {
        continue;
      }
      scores.set(candidateId, cosineSimilarity(queryEmbedding, candidate));
    }

    return scores;
  }
}
