# DeployRadar Deployment Action

This GitHub Action triggers the DeployRadar public API to register a deployment
for a component and environment, with GitHub Actions metadata captured from the
current workflow run.

The action posts to the current DeployRadar deployment ingestion endpoint,
`https://app-dev.deployradar.com/api/deploy-radar/v1/deploy/github-actions`,
using the GitHub Actions-specific `GithubActionsDeploymentRequest` payload
expected by the API.

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
        uses: release-tracker/deployradar-action@main
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

| Output     | Description                                    |
| ---------- | ---------------------------------------------- |
| `status`   | HTTP status code returned by DeployRadar       |
| `response` | Raw response body when the API returns content |

## Captured GitHub Metadata

The action produces the shared CI/CD context shape:

- `repository`: full name, HTML URL, and name.
- `source`: ref, short ref name, SHA, and—on supported push events—the commit
  message and timestamp.
- `pipeline`: workflow name, run ID, run number, run URL, event name, actor, and
  job name.

`pipeline.pipelineId` is omitted because GitHub Actions does not expose a
workflow-definition ID in the action context.
