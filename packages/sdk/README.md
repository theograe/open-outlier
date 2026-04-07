# @openoutlier/sdk

Typed TypeScript client for the OpenOutlier discovery API.

## Install

```bash
npm install @openoutlier/sdk
```

## Usage

```ts
import { OpenOutlierClient } from "@openoutlier/sdk";

const client = new OpenOutlierClient({
  baseUrl: "http://localhost:3001",
  apiKey: process.env.OPENOUTLIER_API_KEY,
});

const results = await client.searchReferences(1, {
  contentType: "long",
  minScore: 3,
  sort: "momentum",
  limit: 10,
});

console.log(results);
```

```ts
await client.saveReference(1, {
  videoId: "abc123xyz89",
  tags: ["editing", "hook"],
});

await client.removeReference(1, 42);

const exported = await client.exportCollection(1, "json");
console.log(exported);
```

## Main use cases

- create and manage collections
- discover tracked channels
- trigger scans
- search the outlier feed
- save references into collections
- remove references from collections
- export collections for downstream agents or automations

If your local OpenOutlier instance is running without `API_KEY`, `apiKey` can be omitted.
