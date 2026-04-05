import { OpenOutlierClient } from "../packages/sdk/dist/index.js";

const client = new OpenOutlierClient({
  baseUrl: process.env.OPENOUTLIER_BASE_URL ?? "http://localhost:3001",
  apiKey: process.env.OPENOUTLIER_API_KEY ?? process.env.API_KEY ?? "",
});

const collectionId = Number(process.env.OPENOUTLIER_COLLECTION_ID ?? "1");

const search = await client.searchReferences(collectionId, {
  contentType: "long",
  days: 365,
  minScore: 3,
  sort: "momentum",
  limit: 10,
});

console.log(JSON.stringify(search, null, 2));
