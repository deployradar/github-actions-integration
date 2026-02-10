# DeployRadar Deployment Action

This GitHub Action triggers the DeployRadar public API to register a deployment
for a component, release version, and environment.

## Usage

```yaml
name: Deploy with DeployRadar

on:
  workflow_dispatch:
    inputs:
      releaseVersion:
        description: Release version to deploy
        required: true
        type: string
      componentName:
        description: Component name
        required: true
        type: string
      environment:
        description: Target environment name
        required: true
        type: string
      deploymentState:
        description: Deployment state (SUCCESS/FAILURE)
        required: false
        type: string
      apiKey:
        description: DeployRadar API key
        required: true
        type: string

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger DeployRadar deployment
        uses: release-tracker/deployradar-action@main
        with:
          releaseVersion: ${{ inputs.releaseVersion }}
          componentName: ${{ inputs.componentName }}
          environment: ${{ inputs.environment }}
          deploymentState: ${{ inputs.deploymentState }}
          apiKey: ${{ inputs.apiKey }}
```

## Inputs

| Input            | Required | Description                               |
| ---------------- | -------- | ----------------------------------------- |
| `releaseVersion` | Yes      | Semantic version that should be deployed  |
| `componentName`  | Yes      | Component name in DeployRadar             |
| `environment`    | Yes      | Destination environment (e.g. Production) |
| `deploymentState` | No      | Deployment state (SUCCESS/FAILURE)        |
| `apiKey`         | Yes      | DeployRadar API key for authentication    |

## Outputs

| Output     | Description                                    |
| ---------- | ---------------------------------------------- |
| `status`   | HTTP status code returned by DeployRadar       |
| `response` | Raw response body when the API returns content |

## Dependency License Management

This template includes a GitHub Actions workflow,
[`licensed.yml`](./.github/workflows/licensed.yml), that uses
[Licensed](https://github.com/licensee/licensed) to check for dependencies with
missing or non-compliant licenses. This workflow is initially disabled. To
enable the workflow, follow the below steps.

1. Open [`licensed.yml`](./.github/workflows/licensed.yml)
1. Uncomment the following lines:

   ```yaml
   # pull_request:
   #   branches:
   #     - main
   # push:
   #   branches:
   #     - main
   ```

1. Save and commit the changes

Once complete, this workflow will run any time a pull request is created or
changes pushed directly to `main`. If the workflow detects any dependencies with
missing or non-compliant licenses, it will fail the workflow and provide details
on the issue(s) found.

### Updating Licenses

Whenever you install or update dependencies, you can use the Licensed CLI to
update the licenses database. To install Licensed, see the project's
[Readme](https://github.com/licensee/licensed?tab=readme-ov-file#installation).

To update the cached licenses, run the following command:

```bash
licensed cache
```

To check the status of cached licenses, run the following command:

```bash
licensed status
```
