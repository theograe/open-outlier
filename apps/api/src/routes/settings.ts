import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import { db, getSetting, upsertSetting } from "../db.js";
import type { ScanService } from "../services/scan-service.js";

export async function registerSettingsRoutes(app: FastifyInstance, scanService: ScanService): Promise<void> {
  app.get("/api/settings", async () => {
    return {
      productName: "OpenOutlier",
      scanSchedule: getSetting("scan_schedule") ?? config.scanSchedule,
      defaultOutlierThreshold: Number(getSetting("default_outlier_threshold") ?? config.defaultOutlierThreshold),
      embeddingsModel: getSetting("embeddings_model") ?? config.defaultEmbeddingsModel,
      imageGenerationProvider: "kie-nano-banana-2",
      imageGenerationConfigured: Boolean(getSetting("kie_api_key") ?? config.kieApiKey),
      imageGenerationModel: getSetting("kie_image_model") ?? config.kieImageModel,
      defaultCharacterProfileId: Number(getSetting("default_character_profile_id") ?? 0) || null,
      youtubeApiKeyConfigured: Boolean(process.env.YOUTUBE_API_KEY),
      apiKeyConfigured: Boolean(process.env.API_KEY),
    };
  });

  app.put("/api/settings/scan-schedule", async (request) => {
    const schema = z.object({
      cron: z.string().min(1),
    });

    const body = schema.parse(request.body);
    scanService.updateSchedule(body.cron);
    return { scanSchedule: body.cron };
  });

  app.put("/api/settings", async (request) => {
    const schema = z.object({
      defaultOutlierThreshold: z.number().positive().optional(),
      embeddingsModel: z.string().min(1).optional(),
    });

    const body = schema.parse(request.body);
    if (body.defaultOutlierThreshold !== undefined) {
      upsertSetting("default_outlier_threshold", String(body.defaultOutlierThreshold));
    }
    if (body.embeddingsModel !== undefined) {
      upsertSetting("embeddings_model", body.embeddingsModel);
    }

    return {
      productName: "OpenOutlier",
      scanSchedule: getSetting("scan_schedule") ?? config.scanSchedule,
      defaultOutlierThreshold: Number(getSetting("default_outlier_threshold") ?? config.defaultOutlierThreshold),
      embeddingsModel: getSetting("embeddings_model") ?? config.defaultEmbeddingsModel,
      imageGenerationProvider: "kie-nano-banana-2",
      imageGenerationConfigured: Boolean(getSetting("kie_api_key") ?? config.kieApiKey),
      imageGenerationModel: getSetting("kie_image_model") ?? config.kieImageModel,
      defaultCharacterProfileId: Number(getSetting("default_character_profile_id") ?? 0) || null,
    };
  });

  app.get("/api/settings/image-generation", async () => ({
    provider: "kie-nano-banana-2",
    configured: Boolean(getSetting("kie_api_key") ?? config.kieApiKey),
    model: getSetting("kie_image_model") ?? config.kieImageModel,
  }));

  app.put("/api/settings/image-generation", async (request) => {
    const body = z.object({
      apiKey: z.string().optional().nullable(),
      model: z.string().optional(),
    }).parse(request.body);

    if (body.apiKey !== undefined) {
      upsertSetting("kie_api_key", body.apiKey ?? "");
    }
    if (body.model !== undefined) {
      upsertSetting("kie_image_model", body.model);
    }

    return {
      provider: "kie-nano-banana-2",
      configured: Boolean(getSetting("kie_api_key") ?? config.kieApiKey),
      model: getSetting("kie_image_model") ?? config.kieImageModel,
    };
  });

  app.get("/api/settings/llm-providers", async () => {
    return db
      .prepare(`
        SELECT id, name, provider, mode, oauth_config_json AS oauthConfigJson, model, is_active AS isActive, created_at AS createdAt,
          CASE WHEN api_key IS NOT NULL AND api_key != '' THEN 1 ELSE 0 END AS hasApiKey
        FROM llm_providers
        ORDER BY is_active DESC, created_at DESC
      `)
      .all();
  });

  app.post("/api/settings/llm-providers", async (request, reply) => {
    const body = z.object({
      name: z.string().min(1),
      provider: z.enum(["openai", "anthropic", "openrouter"]),
      mode: z.enum(["api_key", "oauth"]).default("api_key"),
      apiKey: z.string().optional().nullable(),
      oauthConfigJson: z.string().optional().nullable(),
      model: z.string().optional().nullable(),
      setActive: z.boolean().default(false),
    }).parse(request.body);

    if (body.setActive) {
      db.prepare("UPDATE llm_providers SET is_active = 0").run();
    }

    const result = db.prepare(`
      INSERT INTO llm_providers (name, provider, mode, api_key, oauth_config_json, model, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      body.name,
      body.provider,
      body.mode,
      body.apiKey ?? null,
      body.oauthConfigJson ?? null,
      body.model ?? null,
      body.setActive ? 1 : 0,
    );

    reply.code(201);
    return { id: Number(result.lastInsertRowid), ...body };
  });

  app.post("/api/settings/llm-providers/:id/activate", async (request) => {
    const id = Number((request.params as { id: string }).id);
    db.prepare("UPDATE llm_providers SET is_active = 0").run();
    db.prepare("UPDATE llm_providers SET is_active = 1 WHERE id = ?").run(id);
    return { activeProviderId: id };
  });
}
