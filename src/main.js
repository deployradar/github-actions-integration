import * as core from '@actions/core'
import * as github from '@actions/github'

const DEFAULT_DEPLOY_ENDPOINT =
  'https://app-dev.deployradar.com/api/deploy-radar/v1/deploy/github-actions'
const INTEGRATION_TYPE = 'github-actions'
const INTEGRATION_VERSION = '2.3.4'

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

function branchNameFromRef(ref) {
  return (ref ?? '').replace(/^refs\/(?:heads|tags)\//, '')
}

function buildRunUri(repository, serverUrl, runId) {
  if (!runId) {
    return ''
  }

  const repositoryUrl =
    repository?.html_url ||
    (repository?.full_name && serverUrl
      ? `${serverUrl}/${repository.full_name}`
      : '')

  return repositoryUrl ? `${repositoryUrl}/actions/runs/${runId}` : ''
}

function buildRepository(repository) {
  const repositoryFullName =
    repository?.full_name ||
    (github.context.repo?.owner && github.context.repo?.repo
      ? `${github.context.repo.owner}/${github.context.repo.repo}`
      : '')
  const serverUrl = (github.context.serverUrl ?? '').replace(/\/+$/, '')

  return {
    full_name: repositoryFullName,
    html_url:
      repository?.html_url ||
      (repositoryFullName && serverUrl
        ? `${serverUrl}/${repositoryFullName}`
        : ''),
    name: repository?.name || github.context.repo?.repo
  }
}

export function buildGitHubContext() {
  const repository = buildRepository(github.context.payload?.repository)
  const headCommit = github.context.payload?.head_commit ?? null

  return {
    repository: {
      full_name: repository.full_name,
      html_url: repository.html_url,
      name: repository.name
    },
    source: {
      branch: github.context.ref,
      branchName: branchNameFromRef(github.context.ref),
      sha: github.context.sha,
      // Available for push events only; workflow_dispatch does not include it.
      commitMessage: headCommit?.message,
      commitDateTime: headCommit?.timestamp
    },
    pipeline: {
      // GitHub Actions context exposes the workflow name but not its numeric ID.
      name: github.context.workflow,
      runId: String(github.context.runId ?? ''),
      runNumber: String(github.context.runNumber ?? ''),
      runUri: buildRunUri(
        repository,
        github.context.serverUrl,
        github.context.runId
      ),
      eventName: github.context.eventName,
      actor: github.context.actor,
      jobName: github.context.job
    }
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
      type: INTEGRATION_TYPE,
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
    core.debug(`context sha: ${context.source?.sha ?? 'unknown'}`)

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
      `Creating deployment for component ${componentName} (${releaseVersion || context.source?.sha}) in ${environment}`
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
