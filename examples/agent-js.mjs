import { OpenOutlierClient } from "../packages/sdk/dist/index.js";

const client = new OpenOutlierClient({
  baseUrl: process.env.OPENOUTLIER_BASE_URL ?? "http://localhost:3001",
  apiKey: process.env.OPENOUTLIER_API_KEY ?? process.env.API_KEY ?? "",
});

const workflow = await client.runSeedVideoWorkflow({
  projectId: Number(process.env.OPENOUTLIER_PROJECT_ID ?? "1"),
  sourceSetId: process.env.OPENOUTLIER_SOURCE_SET_ID ? Number(process.env.OPENOUTLIER_SOURCE_SET_ID) : undefined,
  seedVideoUrl: "https://www.youtube.com/watch?v=abc123xyz89",
  adaptationContext: "Adapt this for editing educators and return the best idea, titles, and thumbnail direction.",
});

console.log(JSON.stringify(workflow, null, 2));
