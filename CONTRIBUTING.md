# Contributing

Thanks for helping with OpenOutlier.

## Local development

1. Install dependencies with `npm install`
2. Copy `.env.example` to `.env`
3. Fill in your API keys
4. Run `npm run dev`

## Before opening a PR

- run `npm run build`
- run `npm run lint`
- run `npm run test`

## Project conventions

- keep the backend API and workflow contract stable
- prefer adding reusable logic in `packages/core` or service layers, not directly in route handlers
- keep UI work secondary to the workflow engine and API
- preserve compatibility routes when possible unless a breaking change is intentional and documented
- use `apply_patch`-style small, reviewable edits

## Scope

OpenOutlier is currently focused on the OSS MVP:

- agent-first workflow orchestration
- YouTube outlier discovery and reference saving
- grounded concept adaptation
- reference-based thumbnail generation

Hosted infrastructure, billing, and multi-tenant SaaS features should stay behind clear boundaries rather than being mixed into local MVP code paths.
