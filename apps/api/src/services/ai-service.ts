import { buildGroundedPrompt, heuristicGeneration, type IdeaGenerationKind, type LlmProviderConfig, type PromptSourceVideo } from "@openoutlier/core";
import { config } from "../config.js";

export class AiService {
  async generate(params: {
    kind: IdeaGenerationKind;
    provider: LlmProviderConfig | null;
    videos: PromptSourceVideo[];
    context?: string;
  }): Promise<{ output: string; model: string; mode: "provider" | "heuristic" }> {
    const { kind, provider, videos, context } = params;
    if (!provider || !provider.apiKey) {
      return {
        output: heuristicGeneration(kind, videos, context),
        model: "heuristic",
        mode: "heuristic",
      };
    }

    const prompt = buildGroundedPrompt(kind, videos, context);
    const model = provider.model ?? config.defaultLlmModel;

    try {
      if (provider.provider === "openai") {
        const response = await fetch("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${provider.apiKey}`,
          },
          body: JSON.stringify({
            model,
            input: `${prompt}\n\nReturn compact JSON only.`,
          }),
        });
        const json = (await response.json()) as { output_text?: string };
        return {
          output: json.output_text ?? heuristicGeneration(kind, videos, context),
          model,
          mode: "provider",
        };
      }

      if (provider.provider === "anthropic") {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": provider.apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model,
            max_tokens: 800,
            messages: [{ role: "user", content: `${prompt}\n\nReturn compact JSON only.` }],
          }),
        });
        const json = (await response.json()) as { content?: Array<{ text?: string }> };
        return {
          output: json.content?.[0]?.text ?? heuristicGeneration(kind, videos, context),
          model,
          mode: "provider",
        };
      }

      if (provider.provider === "openrouter") {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${provider.apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: `${prompt}\n\nReturn compact JSON only.` }],
          }),
        });
        const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
        return {
          output: json.choices?.[0]?.message?.content ?? heuristicGeneration(kind, videos, context),
          model,
          mode: "provider",
        };
      }
    } catch {
      return {
        output: heuristicGeneration(kind, videos, context),
        model: "heuristic",
        mode: "heuristic",
      };
    }

    return {
      output: heuristicGeneration(kind, videos, context),
      model: "heuristic",
      mode: "heuristic",
    };
  }
}
