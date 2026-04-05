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
  apiKey: process.env.OPENOUTLIER_API_KEY ?? "",
});

const results = await client.searchReferences(1, {
  contentType: "long",
  minScore: 3,
  sort: "momentum",
  limit: 10,
});

console.log(results);
```

## Main use cases

- create and manage collections
- discover tracked channels
- trigger scans
- search the outlier feed
- save references into collections

If your local OpenOutlier instance is running without `API_KEY`, you can pass an empty string for `apiKey`.
