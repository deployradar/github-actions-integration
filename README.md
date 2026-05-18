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

## Outputs

| Output     | Description                                    |
| ---------- | ---------------------------------------------- |
| `status`   | HTTP status code returned by DeployRadar       |
| `response` | Raw response body when the API returns content |

## Captured GitHub Metadata

The action automatically includes the GitHub repository object, event name,
commit SHA, ref, workflow, action, actor, job, run number, and run ID when those
values are available in the GitHub Actions context.
