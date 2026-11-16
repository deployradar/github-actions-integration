# Release checklist

## Agreed first alpha

- Version: `v0.1.0-alpha.1`; package and reported integration version match.
- Distribution: the existing `deployradar/github-actions-integration`
  repository.
- License: MIT; display name: DeployRadar Deployment.
- Endpoint: development `/api/deploy-radar/v1/deploy/cicd-unified` only.
- References: exact alpha tags or reviewed commit SHA; no moving major tag yet.
- Runtime: committed Node 24 bundle; no npm registry publication.

## Validate before publication

- [x] Run Node 24 unit tests, lint, format checks, and real-bundle mock tests.
- [x] Build and commit `dist/index.js`; require a clean rebuild in CI.
- [x] Test real dev success/failure delivery with a fresh scoped API key.
- [x] Independently verify HTTP status, saved state, version, and native
      context.
- [x] Remove the temporary Actions secret and revoke its API key.
- [x] Review the complete Git history and current files for credentials or
      private data.
- [x] Merge the reviewed release PR into `main`.
- [x] Tag that commit `v0.1.0-alpha.1`; run release checks and prepare draft
      notes.
- [x] Confirm public visibility, then make this repository public.
- [x] Run a separate consumer workflow against the exact release tag.

## Marketplace publication — completed 2026-10-18

- [x] GitHub accepted the display name, action metadata, and README.
- [x] GitHub confirmed the agreement prerequisite was satisfied; no legal terms
      were accepted by the agent.
- [x] GitHub accepted the publishing account's security prerequisites.
- [x] Select **Publish this Action to the GitHub Marketplace** on the existing
      release.
- [x] Choose **Deployment** as the primary category and retain the alpha
      prerelease.
- [x] Verify the public listing and exact-tag usage example, including anonymous
      access.

[Live Marketplace listing](https://github.com/marketplace/actions/deployradar-deployment).
Future publishers must satisfy GitHub's agreement and security requirements; see
the official
[Marketplace publishing instructions](https://docs.github.com/en/actions/how-tos/create-and-publish-actions/publish-in-github-marketplace).

## Later stable release

- [ ] Confirm a production ingestion URL; replace the alpha dev default
      directly.
- [ ] Record it as `package.json.deployradar.productionApiUrl`; do not add route
      fallbacks.
- [ ] Verify production delivery with an explicitly authorized scoped key.
- [ ] Publish the immutable stable version and introduce the documented moving
      `v1` tag.
- [ ] Coordinate API-supported idempotency before promising exactly-once
      delivery.
