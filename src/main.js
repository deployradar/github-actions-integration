import * as core from '@actions/core'
import * as github from '@actions/github'

const DEFAULT_DEPLOY_ENDPOINT =
  'https://app-dev.deployradar.com/api/deploy-radar/v1/deploy/github-actions'
const INTEGRATION_VERSION = 'v0.0.1'

function getInput(name, options = {}) {
  const value = core.getInput(name) ?? ''

  if (value.trim()) {
    return value
  }

  if (options.required) {
    throw new Error(`${name} input is required`)
  }

  return ''
}

function resolveDeploymentState(jobStatus) {
  const status = (jobStatus ?? '').trim().toLowerCase()
  if (status === 'success') {
    return 'SUCCESS'
  }

  if (status === 'failure' || status === 'cancelled') {
    return 'FAILURE'
  }

  throw new Error('jobStatus must be one of success, failure, cancelled')
}

function buildGitHubContext() {
  const repository = github.context.payload?.repository ?? null

  return {
    eventName: github.context.eventName,
    sha: github.context.sha,
    ref: github.context.ref,
    workflow: github.context.workflow,
    action: github.context.action,
    actor: github.context.actor,
    job: github.context.job,
    runNumber: github.context.runNumber,
    runId: github.context.runId,
    repository: repository || undefined
  }
}

function buildDeploymentPayload({
  releaseVersion,
  componentName,
  environment,
  deploymentState,
  context
}) {
  return {
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
    context
  }
}

function compactObject(value) {
  if (Array.isArray(value)) {
    return value.length ? value : undefined
  }

  if (!value || typeof value !== 'object') {
    return value
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([entryKey, entryValue]) => [entryKey, compactObject(entryValue)])
      .filter(([, entryValue]) => entryValue !== undefined && entryValue !== '')
  )
}

/**
 * Sends a deployment creation request to DeployRadar.
 * @returns {Promise<void>} Resolves when the deployment request completes.
 */
export async function run() {
  try {
    const releaseVersion = getInput('releaseVersion', { required: false })
    const componentName = getInput('componentName', {
      required: true
    })
    const environment = getInput('environment', { required: true })
    const jobStatus = getInput('jobStatus', { required: true })
    const apiKey = getInput('apiKey', { required: true })
    const apiUrl = getInput('apiUrl') || DEFAULT_DEPLOY_ENDPOINT

    if (!apiKey.trim()) {
      throw new Error('apiKey input is empty')
    }

    const deploymentState = resolveDeploymentState(jobStatus)
    const context = buildGitHubContext()

    core.debug(`jobStatus: ${jobStatus}`)
    core.debug(`deploymentState: ${deploymentState}`)
    core.debug(`context sha: ${context?.sha ?? 'unknown'}`)

    const payload = compactObject(
      buildDeploymentPayload({
        deploymentState,
        releaseVersion,
        componentName,
        environment,
        context
      })
    )

    core.debug(`payload: ${JSON.stringify(payload)}`)

    core.info(
      `Creating deployment for component ${componentName} (${releaseVersion || context.sha}) in ${environment}`
    )

    const authHeader = apiKey.startsWith('Bearer ')
      ? apiKey
      : `Bearer ${apiKey}`

    const response = await fetch(apiUrl, {
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
