# DeployRadar Deployment Action

This GitHub Action triggers the DeployRadar public API to register a deployment
for a component and environment, with GitHub Actions metadata captured from the
current workflow run.

The alpha reports to the DeployRadar **development** API at
`https://app-dev.deployradar.com/api/deploy-radar/v1/deploy/cicd-unified`. It
sends the shared `integration`, `parameters`, and `context` contract with
`integration.type=github-actions`. There are no legacy routes or endpoint
fallbacks. Do not use this alpha for production deployment reporting.

GitHub hosts both the source and the action runtime in this repository.
Consumers do not install an npm package. GitHub executes the checked-in
`dist/index.js` using its Node 24 action runtime.

## Usage

```yaml
name: Deploy with DeployRadar

on:
  workflow_dispatch:
    inputs:
      releaseVersion:
        description: Release version to deploy
        required: false
        type: string
      componentName:
        description: Component name
        required: true
        type: string
      environment:
        description: Target environment name
        required: true
        type: string

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy application
        id: deploy
        run: ./deploy.sh

      - name: Trigger DeployRadar deployment
        if: ${{ always() }}
        uses: deployradar/github-actions-integration@v0.1.0-alpha.1
        with:
          releaseVersion: ${{ inputs.releaseVersion }}
          componentName: ${{ inputs.componentName }}
          environment: ${{ inputs.environment }}
          jobStatus: ${{ job.status }}
          apiKey: ${{ secrets.DEPLOYRADAR_API_KEY }}
```

## Inputs

| Input            | Required | Description                                             |
| ---------------- | -------- | ------------------------------------------------------- |
| `releaseVersion` | No       | Semantic version that should be deployed                |
| `componentName`  | Yes      | Component name in DeployRadar                           |
| `environment`    | Yes      | Destination environment (e.g. Production)               |
| `jobStatus`      | Yes      | Current GitHub Actions job status (`${{ job.status }}`) |
| `apiKey`         | Yes      | DeployRadar API key for authentication                  |
| `apiUrl`         | No       | Override for the DeployRadar deployment endpoint        |

Use `if: ${{ always() }}` on the DeployRadar step so GitHub runs it after a
failed deployment step and `jobStatus` reflects the pipeline state.

## Supported workflow triggers

The action supports deployment workflows triggered by the following events:

| Trigger             | Support                 | Source metadata sent to DeployRadar                                                                                    |
| ------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `workflow_dispatch` | Supported               | The branch or tag selected when the workflow is manually started and its latest commit.                                |
| `push`              | Supported               | The pushed branch or tag and its tip commit. The action rejects deleted branch and tag events.                         |
| `workflow_call`     | Supported conditionally | The called workflow inherits the caller's event metadata. Its caller must use one of the two supported triggers above. |

The action validates the trigger and required GitHub context before sending a
request. It rejects unsupported triggers, deleted branch/tag pushes, and any
payload that does not contain the required repository, source, and run fields.

The following triggers are **not supported** by this action at present:

- `pull_request`, `pull_request_target`, review, and comment events: their
  source metadata can describe a synthetic pull-request merge ref or the base
  branch instead of the code being deployed.
- `merge_group`: its SHA and ref identify a synthetic merge group.
- `schedule` and `repository_dispatch`: they default to the repository's default
  branch and do not identify an externally requested revision.
- All other GitHub Actions triggers.

`workflow_run` is a candidate for future support. It requires a dedicated mapper
using `github.event.workflow_run` metadata because the normal workflow SHA and
ref refer to the default branch, rather than the completed workflow's source
revision.

## Outputs

| Output   | Description                              |
| -------- | ---------------------------------------- |
| `status` | HTTP status code returned by DeployRadar |

## Captured GitHub Metadata

The action produces the shared CI/CD context shape:

- `repository`: full name, HTML URL, and name.
- `source`: ref, short ref name, SHA, and—on supported push events—the commit
  message and timestamp.
- `pipeline`: workflow name, run ID, run number, run URL, event name, actor, and
  job name.

`pipeline.pipelineId` is omitted because GitHub Actions does not expose a
workflow-definition ID in the action context.

## HTTP delivery behavior

Each deployment request has a 15-second timeout and makes at most three
attempts. The action retries only temporary delivery failures: network and
timeout errors, plus HTTP `408`, `429`, and `5xx` responses. It does not retry
ordinary `4xx` responses. Retry delays use exponential backoff and honour a
valid `Retry-After` response header, up to 30 seconds.

The current endpoint does not provide an idempotency contract, so it remains
possible for an ambiguous network failure to result in a duplicate deployment.
Supporting an idempotency key across the action and API is a potential future
enhancement.

## Versions and publication

The first release is `v0.1.0-alpha.1`. Use an exact version tag, or pin the
reviewed release commit SHA for stronger supply-chain control. There is no
moving major tag during alpha; `v1` will be introduced with the first stable 1.x
release. The integration reports the version from `package.json`.

The Marketplace display name is **DeployRadar Deployment**. A Marketplace
listing helps discovery; the `uses:` reference addresses this repository and
works independently of a listing once the repository is public.

Tag pushes run the release checks and prepare a draft GitHub Release. The checks
verify the version, endpoint, MIT license, committed runtime bundle, and that
the tagged source belongs to `main`. Only alpha versions may default to dev. A
future stable release requires the confirmed production endpoint in
`action.yml`, the runtime, and `package.json.deployradar.productionApiUrl`. The
repository owner completes Marketplace agreement and publication steps as
described in [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md).

## Testing and credentials

Routine CI uses mocks and the actual built bundle with a loopback HTTP receiver.
It never needs a DeployRadar key or sends requests to dev. Unit tests cover
push, manual and reusable-workflow context, rejected triggers, retries, status
mapping, and secret-safe error reporting. Bundle tests cover success, failure,
cancellation mapping, and redirect refusal.

For an explicitly authorized dev run, create a short-lived API key restricted to
the placeholder component, environment, and DEPLOYMENT operation. Store it as
`DEPLOYRADAR_API_KEY` in the test repository's Actions secrets. Dispatch
**Development API validation** with those resource names. It tests actual
successful and failed jobs; an independent job requires HTTP 200 evidence from
both. Read the deployments through the app API to verify persisted context.
Remove the secret and revoke the key afterward.

Before publishing, repeat consumption from a separate repository using the exact
release tag. Ordinary users need only their own scoped DeployRadar API key in a
GitHub secret. The API key is masked; response bodies are neither logged nor
exposed as action outputs. Redirects are rejected. `apiUrl` is an explicit
destination override for testing or a different deployment, not a failover
route.

Development testing on GitLab previously identified two backend defects:
deployment reads can fail after their creating API key is deleted, and dev can
still generate an incorrect deployment-run link. Capture safe evidence before
credential cleanup and report these separately from action delivery results.
