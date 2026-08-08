import * as core from '@actions/core'
import * as github from '@actions/github'

const DEFAULT_DEPLOY_ENDPOINT =
  'https://app-dev.deployradar.com/api/deploy-radar/v1/deploy/github-actions'
const INTEGRATION_TYPE = 'github-actions'
const INTEGRATION_VERSION = '2.3.4'
const SUPPORTED_EVENTS = new Set(['push', 'workflow_dispatch'])
const REQUEST_TIMEOUT_MS = 15_000
const MAX_REQUEST_ATTEMPTS = 3
const RETRY_BASE_DELAY_MS = 500
const MAX_RETRY_DELAY_MS = 30_000

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

export function buildGitHubContext() {
  const repository = github.context.payload?.repository ?? null
  const headCommit = github.context.payload?.head_commit ?? null

  return {
    repository: {
      full_name: repository?.full_name,
      html_url: repository?.html_url,
      name: repository?.name
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

function validateTrigger() {
  const eventName = github.context.eventName

  if (!SUPPORTED_EVENTS.has(eventName)) {
    throw new Error(
      `Unsupported GitHub event "${eventName}". Supported events are push and workflow_dispatch.`
    )
  }

  if (eventName === 'push' && github.context.payload?.deleted === true) {
    throw new Error('Push events that delete a branch or tag are not supported')
  }
}

function getMissingRequiredContextFields(context) {
  const requiredFields = [
    ['repository.full_name', context.repository.full_name],
    ['repository.html_url', context.repository.html_url],
    ['repository.name', context.repository.name],
    ['source.branch', context.source.branch],
    ['source.branchName', context.source.branchName],
    ['source.sha', context.source.sha],
    ['pipeline.runId', context.pipeline.runId],
    ['pipeline.runNumber', context.pipeline.runNumber],
    ['pipeline.runUri', context.pipeline.runUri],
    ['pipeline.jobName', context.pipeline.jobName]
  ]

  return requiredFields
    .filter(([, value]) => typeof value !== 'string' || !value.trim())
    .map(([fieldName]) => fieldName)
}

function validateRequiredContext(context) {
  const missingFields = getMissingRequiredContextFields(context)

  if (missingFields.length) {
    throw new Error(
      `Missing required GitHub Actions context fields: ${missingFields.join(', ')}`
    )
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

function validateApiUrl(apiUrl) {
  let parsedUrl

  try {
    parsedUrl = new URL(apiUrl)
  } catch {
    throw new Error('apiUrl must be a valid HTTP(S) URL')
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error('apiUrl must be a valid HTTP(S) URL')
  }
}

function isRetryableResponse(response) {
  return (
    response.status === 408 ||
    response.status === 429 ||
    (response.status >= 500 && response.status <= 599)
  )
}

function isRetryableFetchError(error) {
  return (
    error instanceof TypeError ||
    error?.name === 'AbortError' ||
    error?.name === 'TimeoutError' ||
    error?.name === 'FetchError'
  )
}

function retryAfterDelay(response) {
  const retryAfter = response?.headers?.get?.('retry-after')

  if (!retryAfter) {
    return undefined
  }

  const seconds = Number(retryAfter)
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, MAX_RETRY_DELAY_MS)
  }

  const retryAt = Date.parse(retryAfter)
  if (!Number.isNaN(retryAt)) {
    return Math.min(Math.max(retryAt - Date.now(), 0), MAX_RETRY_DELAY_MS)
  }

  return undefined
}

function retryDelay(attempt, response) {
  return (
    retryAfterDelay(response) ??
    Math.min(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1), MAX_RETRY_DELAY_MS)
  )
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function postDeployment(apiUrl, authHeader, payload) {
  validateApiUrl(apiUrl)

  for (let attempt = 1; attempt <= MAX_REQUEST_ATTEMPTS; attempt += 1) {
    let response

    try {
      response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      })
    } catch (error) {
      if (!isRetryableFetchError(error) || attempt === MAX_REQUEST_ATTEMPTS) {
        throw error
      }

      const delay = retryDelay(attempt)
      core.warning(
        `DeployRadar request failed on attempt ${attempt} of ${MAX_REQUEST_ATTEMPTS}; retrying in ${delay}ms.`
      )
      await wait(delay)
      continue
    }

    const responseText = await response.text().catch(() => '')

    if (!isRetryableResponse(response) || attempt === MAX_REQUEST_ATTEMPTS) {
      return { response, responseText }
    }

    const delay = retryDelay(attempt, response)
    core.warning(
      `DeployRadar API returned ${response.status} on attempt ${attempt} of ${MAX_REQUEST_ATTEMPTS}; retrying in ${delay}ms.`
    )
    await wait(delay)
  }

  throw new Error('DeployRadar request exhausted without a response')
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

    validateTrigger()

    const deploymentState = resolveDeploymentState(jobStatus)
    const context = buildGitHubContext()
    validateRequiredContext(context)

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

    const { response, responseText } = await postDeployment(
      apiUrl,
      authHeader,
      payload
    )

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
