import * as core from '@actions/core'
import * as github from '@actions/github'

const BASE_URL = 'https://dev.deployradar.com'
const DEPLOY_ENDPOINT = `${BASE_URL}/api/deploy-radar/v1/deploy/github-actions`
const INTEGRATION_VERSION = 'v0.0.1'

function resolveDeploymentState(inputState) {
  const trimmed = (inputState ?? '').trim()
  if (trimmed) {
    return trimmed.toUpperCase()
  }

  const jobStatus = (process.env.GITHUB_JOB_STATUS || process.env.JOB_STATUS || '').toLowerCase()
  if (jobStatus === 'failure' || jobStatus === 'cancelled') {
    return 'FAILURE'
  }

  return 'SUCCESS'
}

/**
 * Sends a deployment creation request to DeployRadar.
 * @returns {Promise<void>} Resolves when the deployment request completes.
 */
export async function run() {
  try {
    const releaseVersion = core.getInput('releaseVersion', { required: true })
    const componentName = core.getInput('componentName', { required: true })
    const environment = core.getInput('environment', { required: true })
    const apiKey = core.getInput('apiKey', { required: true })
    const deploymentStateInput = core.getInput('deploymentState')

    const deploymentState = resolveDeploymentState(deploymentStateInput)

    const { context } = github
    const repository = context.payload?.repository ?? null

    const payload = {
      integration: {
        version: INTEGRATION_VERSION,
        timestamp: new Date().toISOString()
      },
      parameters: {
        deploymentState,
        releaseVersion,
        componentName,
        environment
      },
      context: {
        repository,
        eventName: context.eventName,
        sha: context.sha,
        ref: context.ref,
        workflow: context.workflow,
        action: context.action,
        actor: context.actor,
        job: context.job,
        runNumber: context.runNumber,
        runId: context.runId
      }
    }

    core.info(
      `Creating deployment for component ${componentName} (${releaseVersion}) in ${environment}`
    )

    const authHeader = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`

    const response = await fetch(DEPLOY_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader
      },
      body: JSON.stringify(payload)
    })

    const responseText = await response.text().catch(() => '')

    if (!response.ok) {
      core.error(
        `DeployRadar API returned ${response.status} ${response.statusText}`
      )
      if (responseText) {
        core.error(responseText)
      }
      throw new Error('Failed to create deployment in DeployRadar')
    }

    if (responseText) {
      core.debug(`DeployRadar response: ${responseText}`)
    }

    core.info('Deployment request completed successfully.')

    core.setOutput('status', String(response.status))
    if (responseText) {
      core.setOutput('response', responseText)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    core.setFailed(message)
  }
}
