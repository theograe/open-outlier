import { z } from "zod";
import type { FastifyInstance } from "fastify";

const allowedHosts = new Set([
  "yt3.ggpht.com",
  "i.ytimg.com",
  "yt3.googleusercontent.com",
]);

export async function registerImageRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/images/remote", async (request, reply) => {
    const query = z.object({
      url: z.string().url(),
    }).parse(request.query);

    const targetUrl = new URL(query.url);
    if (!allowedHosts.has(targetUrl.hostname)) {
      return reply.badRequest("Unsupported image host.");
    }

    const response = await fetch(targetUrl, {
      headers: {
        "user-agent": "OpenOutlier/1.0",
      },
    });

    if (!response.ok) {
      return reply.status(response.status).send("Image fetch failed.");
    }

    const contentType = response.headers.get("content-type") ?? "image/jpeg";
    const cacheControl = response.headers.get("cache-control") ?? "public, max-age=3600";
    const buffer = Buffer.from(await response.arrayBuffer());

    reply.header("content-type", contentType);
    reply.header("cache-control", cacheControl);
    return reply.send(buffer);
  });
}
