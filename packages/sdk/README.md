# @openoutlier/sdk

Typed TypeScript client for the OpenOutlier workflow API.

## Install

```bash
npm install @openoutlier/sdk
```

## Usage

```ts
import { OpenOutlierClient } from "@openoutlier/sdk";

const client = new OpenOutlierClient({
  baseUrl: "http://localhost:3001",
  apiKey: process.env.OPENOUTLIER_API_KEY!,
});

const workflow = await client.runSeedVideoWorkflow({
  projectId: 1,
  sourceSetId: 1,
  seedVideoUrl: "https://www.youtube.com/watch?v=abc123xyz89",
  adaptationContext: "Adapt this for editing educators.",
});

console.log(workflow.output);
```

## Best default method

For most agents, start with:

- `runWorkflowAuto()`
- or `runSeedVideoWorkflow()`
