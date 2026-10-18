# GitHub Action alpha validation

Validated on 2026-10-18. Version: `0.1.0-alpha.1`. The only default ingestion
route is
`https://app-dev.deployradar.com/api/deploy-radar/v1/deploy/cicd-unified`. No
legacy route fallback is provided.

## Implementation checks

- Node 24: 23 unit tests and a real-bundle HTTP smoke test passed.
- The bundle smoke test covers success, failure, cancelled-status mapping,
  allowlisted metadata, suppressed response bodies, and redirect refusal.
- ESLint, Prettier, actionlint 1.7.12, and the Linux CI clean rebuild passed.
- The release gate passed an isolated Git fixture; mismatched tags and a stable
  version pointing to dev were rejected.
- Runtime dependency audit: zero known vulnerabilities after compatible updates.
  A moderate advisory remains in the Jest-only coverage chain through
  `sprintf-js`; no forced Jest downgrade or breaking dependency update was made.
- A credential-pattern scan of 175 unique historical Git blobs found no matches.

The bundle test caught and prevented Node 24-incompatible JSON import syntax
from being distributed. Rollup now emits import attributes using `with`. The
runtime reads its integration version from the repository's `package.json`.

## Real development delivery

[Workflow run 39113653889](https://github.com/deployradar/github-actions-integration/actions/runs/39113653889)
tested commit `2e8cbbae3ac307971509ee641821febbcc34378a` from
`codex/publish-github-alpha`, without an endpoint override. Both native jobs
called the checked-in action using `uses: ./`.

| Native job          | Reported state | HTTP | Saved deployment                       |
| ------------------- | -------------- | ---- | -------------------------------------- |
| Success             | SUCCESS        | 200  | `9705cf2c-8373-485e-9bb6-51d4bb2cc19a` |
| Intentional exit 42 | FAILURE        | 200  | `a1d6caaf-8ffc-4f57-a8ab-ad0ee39b002b` |

An independent workflow job required delivery artifacts for both outcomes, so an
allowed failure could not hide a reporting error. Authenticated app API reads
independently verified the saved state, resource names, alpha version,
repository, branch/ref, source SHA, workflow, run ID/URL, actor, event, and job.
Manual dispatch correctly omitted unavailable commit message and date.

Placeholder component and environment: `github-action-alpha-test`. API access
was limited to that component, environment, and DEPLOYMENT operation, with a
one-day maximum lifetime. The temporary secret is named
`DEPLOYRADAR_DEV_TEST_API_KEY`; the existing repository secret was not changed.

## Backend limitations

The dev backend still derives `/actions/run/<id>` instead of the correct
`/actions/runs/<id>` stored in `runUri`. Reads of records created with a deleted
API key can also fail with HTTP 500 because the backend dereferences the missing
key while mapping `createdBy`. These were already reproduced during the GitLab
test. Persisted-record evidence is captured before credential cleanup.

## Publication

Public visibility is explicitly approved. Marketplace display name:
**DeployRadar Deployment**; license: MIT. The action repository is both the
canonical source and distribution. No npm package publication is required. Exact
alpha tag: `v0.1.0-alpha.1`; no moving major tag is created during alpha.

The release workflow validates the source and prepares draft release notes.
Publication, an independent exact-tag consumer test, and credential cleanup are
recorded in a follow-up once complete. Marketplace agreement acceptance, if
outstanding, must be completed by the organization owner.

Safe evidence is in [alpha-evidence](alpha-evidence/). No account passwords, API
keys, GitHub tokens, or runner credentials are included.
