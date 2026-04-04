import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type MockJson = Record<string, unknown>;

function jsonResponse(payload: MockJson, init?: { status?: number; headers?: Record<string, string> }) {
  return new Response(JSON.stringify(payload), {
    status: init?.status ?? 200,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

describe("workflow routes", () => {
  let tempDir: string;
  let databasePath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "openoutlier-api-test-"));
    databasePath = path.join(tempDir, "test.db");

    process.env.YOUTUBE_API_KEY = "test-youtube";
    process.env.API_KEY = "local-dev";
    process.env.OPENAI_API_KEY = "test-openai";
    process.env.KIE_API_KEY = "test-kie";
    process.env.DATABASE_PATH = databasePath;
    process.env.OPENOUTLIER_MEDIA_ROOT = path.join(tempDir, "media");

    let openAiCall = 0;

    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.startsWith("https://www.googleapis.com/youtube/v3/videos")) {
        return jsonResponse({
          items: [
            {
              id: "abc123xyz89",
              snippet: {
                title: "Premiere Reel Editing Secrets",
                channelId: "UCseedchannel01",
                publishedAt: "2026-02-01T00:00:00Z",
                thumbnails: {
                  high: { url: "https://img.youtube.test/thumb.jpg" },
                },
              },
              statistics: {
                viewCount: "250000",
                likeCount: "9000",
                commentCount: "300",
              },
              contentDetails: {
                duration: "PT12M15S",
              },
            },
          ],
        });
      }

      if (url.startsWith("https://www.googleapis.com/youtube/v3/channels")) {
        const parsed = new URL(url);
        const forHandle = parsed.searchParams.get("forHandle");
        const id = parsed.searchParams.get("id");

        if (forHandle === "seedcreator") {
          return jsonResponse({
            items: [
              {
                id: "UCseedchannel01",
                snippet: {
                  title: "Seed Creator",
                  customUrl: "@seedcreator",
                  thumbnails: {
                    high: { url: "https://img.youtube.test/channel.jpg" },
                  },
                },
                statistics: {
                  subscriberCount: "88000",
                },
                contentDetails: {
                  relatedPlaylists: {
                    uploads: "UUseedchannel01",
                  },
                },
              },
            ],
          });
        }

        if (id === "UCseedchannel01") {
          return jsonResponse({
            items: [
              {
                id: "UCseedchannel01",
                snippet: {
                  title: "Seed Creator",
                  customUrl: "@seedcreator",
                  thumbnails: {
                    high: { url: "https://img.youtube.test/channel.jpg" },
                  },
                },
                statistics: {
                  subscriberCount: "88000",
                },
                contentDetails: {
                  relatedPlaylists: {
                    uploads: "UUseedchannel01",
                  },
                },
              },
            ],
          });
        }

        if (id?.includes("UCdiscovered01")) {
          return jsonResponse({
            items: [
              {
                id: "UCdiscovered01",
                snippet: {
                  title: "Discovered Editing Channel",
                  customUrl: "@discoveredediting",
                  thumbnails: {
                    high: { url: "https://img.youtube.test/discovered.jpg" },
                  },
                },
                statistics: {
                  subscriberCount: "125000",
                },
                contentDetails: {
                  relatedPlaylists: {
                    uploads: "UUdiscovered01",
                  },
                },
              },
            ],
          });
        }
      }

      if (url.startsWith("https://www.googleapis.com/youtube/v3/search")) {
        return jsonResponse({
          items: [
            {
              snippet: {
                channelId: "UCdiscovered01",
              },
            },
          ],
        });
      }

      if (url === "https://api.openai.com/v1/responses") {
        openAiCall += 1;
        const outputs = [
          JSON.stringify({
            summary: "Editing education concepts grounded in reel editing references.",
            ideas: [{ label: "Reel editing system", rationale: "Based on the imported reference." }],
          }),
          JSON.stringify({
            titles: [
              "Premiere Pro Reel Editing Workflow That Actually Converts",
              "How Editors Package Viral Reels in Premiere Pro",
            ],
          }),
          JSON.stringify({
            concept: "Use a bold before/after layout with one focal editing timeline.",
          }),
        ];

        return jsonResponse({
          output_text: outputs[Math.min(openAiCall - 1, outputs.length - 1)],
        });
      }

      throw new Error(`Unhandled fetch URL in test: ${url}`);
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("lets an agent start from a seed video and auto-run through concept adaptation", async () => {
    const { buildApp } = await import("../src/app.js");
    const app = buildApp();

    try {
      const createProject = await app.inject({
        method: "POST",
        url: "/api/projects",
        headers: { "x-api-key": "local-dev" },
        payload: {
          name: "Agent Seed Project",
          niche: "editing education",
        },
      });
      expect(createProject.statusCode).toBe(201);
      const project = createProject.json();
      expect(project.sourceSets).toHaveLength(1);

      const runAuto = await app.inject({
        method: "POST",
        url: "/api/workflow-runs/run-auto",
        headers: { "x-api-key": "local-dev" },
        payload: {
          projectId: project.id,
          sourceSetId: project.sourceSets[0].id,
          seedVideoUrl: "https://www.youtube.com/watch?v=abc123xyz89",
          stopAfterStage: "concept_adaptation",
          input: {
            adaptationContext: "Create final ideas, titles, and thumbnail direction for editing educators.",
          },
        },
      });

      expect(runAuto.statusCode).toBe(201);
      const workflow = runAuto.json();
      expect(workflow.status).toBe("completed");
      expect(workflow.currentStage).toBe("completed");
      expect(Object.keys(workflow.output)).toEqual([
        "concept_adaptation",
      ]);
      expect(workflow.output.concept_adaptation.concept.sourceReferenceIds.length).toBe(1);
      expect(workflow.output.concept_adaptation.concept.sourceVideoIds).toContain("abc123xyz89");

      const references = await app.inject({
        method: "GET",
        url: `/api/projects/${project.id}/references`,
        headers: { "x-api-key": "local-dev" },
      });
      expect(references.statusCode).toBe(200);
      expect(references.json()).toHaveLength(1);
      expect(references.json()[0].videoId).toBe("abc123xyz89");
    } finally {
      await app.close();
    }
  }, 15000);

  it("discovers channels for a source set and creates a workflow run with a custom start stage", async () => {
    const { buildApp } = await import("../src/app.js");
    const app = buildApp();

    try {
      const projectResponse = await app.inject({
        method: "POST",
        url: "/api/projects",
        headers: { "x-api-key": "local-dev" },
        payload: {
          name: "Discovery Project",
          niche: "premiere pro tutorials",
          primaryChannelInput: "@seedcreator",
        },
      });
      expect(projectResponse.statusCode).toBe(201);
      const project = projectResponse.json();

      const discoverResponse = await app.inject({
        method: "POST",
        url: `/api/source-sets/${project.sourceSets[0].id}/discover`,
        headers: { "x-api-key": "local-dev" },
        payload: {
          query: "english premiere pro tutorial channel",
          limit: 5,
          autoAttach: false,
        },
      });

      expect(discoverResponse.statusCode).toBe(200);
      const discovered = discoverResponse.json();
      expect(discovered.suggestions).toHaveLength(1);
      expect(discovered.suggestions[0].channelId).toBe("UCdiscovered01");

      const workflowResponse = await app.inject({
        method: "POST",
        url: "/api/workflow-runs",
        headers: { "x-api-key": "local-dev" },
        payload: {
          projectId: project.id,
          sourceSetId: project.sourceSets[0].id,
          startStage: "reference_research",
          input: {
            search: "premiere",
            saveTop: 0,
          },
        },
      });

      expect(workflowResponse.statusCode).toBe(201);
      const workflow = workflowResponse.json();
      expect(workflow.currentStage).toBe("reference_research");
      expect(workflow.stages[0].status).toBe("completed");
      expect(workflow.stages[0].output.skipped).toBe(true);
    } finally {
      await app.close();
    }
  }, 15000);
});
