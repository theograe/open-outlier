import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { generatePulluphoopsIdeas } from "../services/pulluphoops-service.js";

export async function registerPulluphoopsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/pulluphoops/ideas", async (request) => {
    const query = z
      .object({
        limit: z.coerce.number().int().min(1).max(50).default(12),
        days: z.coerce.number().int().min(1).max(2000).default(365),
      })
      .parse(request.query);

    return generatePulluphoopsIdeas(query.limit, query.days);
  });
}
