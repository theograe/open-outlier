# OSS MVP Release Checklist

## Product

- confirm `README.md` matches the actual product model and setup flow
- verify the local UI can create a project, add channels, discover channels, and run a seed workflow
- verify the API can run `run-auto` from a seed video URL
- verify thumbnail generation works with valid `KIE_API_KEY`

## Quality

- run `npm run test`
- run `npm run lint`
- run `npm run build`
- verify no secrets are tracked in git

## Repo hygiene

- review `.env.example`
- review `LICENSE`
- review `CONTRIBUTING.md`
- review `docs/API.md`
- review `.gitignore`

## GitHub

- set repo description and topics
- add a short project summary to the About section
- enable Issues and Discussions if desired
- pin a getting-started issue after launch

## Post-release

- collect first-time setup pain points from users
- migrate more of the UI from legacy list routes to workflow-native routes
- harden long-running jobs before hosted rollout
