import * as core from '@actions/core'

const BASE_URL = 'https://dev.deployradar.com'
const DEPLOY_ENDPOINT = `${BASE_URL}/api/deploy-radar/v1/deploy`

/**
 * Sends a deployment creation request to DeployRadar.
 * @returns {Promise<void>} Resolves when the deployment request completes.
 */
export async function run() {
  try {
    const releaseVersion = core.getInput('releaseVersion', { required: true })
    const componentId = core.getInput('componentId', { required: true })
    const environment = core.getInput('environment', { required: true })
    const apiKey = core.getInput('apiKey', { required: true })

    const payload = {
      releaseVersion,
      componentId,
      environment
    }

    core.info(
      `Creating deployment for component ${componentId} (${releaseVersion}) in ${environment}`
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
