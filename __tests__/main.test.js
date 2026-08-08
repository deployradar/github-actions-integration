/**
 * Unit tests for the action's main functionality, src/main.js
 */
import { afterEach, beforeEach, jest } from '@jest/globals'
const core = await import('../__fixtures__/core')
const github = await import('../__fixtures__/github')
const { deletedPushContext, pushContext, workflowCallFromPushContext } =
  await import('../__fixtures__/github-contexts')
const defaultGitHubContext = structuredClone(github.context)

jest.unstable_mockModule('@actions/core', () => core)
jest.unstable_mockModule('@actions/github', () => github)

const main = await import('../src/main')

describe('action', () => {
  beforeEach(() => {
    setGitHubContext(defaultGitHubContext)

    core.getInput.mockImplementation((name) => {
      const inputs = {
        releaseVersion: '3.1.1',
        componentName: 'aurora-gateway',
        environment: 'Production',
        jobStatus: 'success',
        apiKey: 'test-key'
      }
      return inputs[name] ?? ''
    })

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      statusText: 'Created',
      text: jest.fn().mockResolvedValue('{"result":"ok"}')
    })
  })

  afterEach(() => {
    jest.restoreAllMocks()
    jest.resetAllMocks()
    delete global.fetch
  })

  function useImmediateRetryDelays() {
    jest.spyOn(global, 'setTimeout').mockImplementation((callback) => {
      callback()
      return 0
    })
  }

  function response({ status, statusText, text = '', retryAfter } = {}) {
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText,
      text: jest.fn().mockResolvedValue(text),
      headers: {
        get: jest
          .fn()
          .mockImplementation((name) =>
            name.toLowerCase() === 'retry-after' ? retryAfter : null
          )
      }
    }
  }

  function setGitHubContext(context) {
    for (const propertyName of Object.keys(github.context)) {
      delete github.context[propertyName]
    }

    Object.assign(github.context, structuredClone(context))
  }

  it('calls the DeployRadar API', async () => {
    await main.run()

    const [url, options] = global.fetch.mock.calls[0]

    expect(url).toBe(
      'https://app-dev.deployradar.com/api/deploy-radar/v1/deploy/github-actions'
    )
    expect(options).toEqual(
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-key'
        }
      })
    )

    const payload = JSON.parse(options.body)
    expect(payload).toMatchObject({
      integration: {
        type: 'github-actions',
        version: '2.3.4',
        timestamp: expect.any(String)
      },
      parameters: {
        componentName: 'aurora-gateway',
        environment: 'Production',
        releaseVersion: '3.1.1',
        deploymentState: 'SUCCESS'
      },
      context: {
        repository: {
          full_name: 'deployradar/github-actions-integration',
          html_url: 'https://github.com/deployradar/github-actions-integration',
          name: 'github-actions-integration'
        },
        source: {
          branch: 'refs/heads/main',
          branchName: 'main',
          sha: '83fff8ade43591d553b9c7fec102901920f15b84'
        },
        pipeline: {
          name: 'scripty',
          runId: '21005190828',
          runNumber: '1',
          runUri:
            'https://github.com/deployradar/github-actions-integration/actions/runs/21005190828',
          eventName: 'workflow_dispatch',
          actor: 'fwende',
          jobName: 'scripty'
        }
      }
    })
    expect(core.setOutput).toHaveBeenCalledWith('status', '201')
    expect(core.setOutput).toHaveBeenCalledWith('response', '{"result":"ok"}')
  })

  it('sets a failed status when the API rejects', async () => {
    useImmediateRetryDelays()
    global.fetch.mockRejectedValue(new TypeError('network down'))

    await main.run()

    expect(core.setFailed).toHaveBeenCalledWith('network down')
    expect(global.fetch).toHaveBeenCalledTimes(3)
  })

  it('sets a failed status when the API returns an error', async () => {
    global.fetch.mockResolvedValue(
      response({
        status: 400,
        statusText: 'Bad Request',
        text: 'boom'
      })
    )

    await main.run()

    expect(core.setFailed).toHaveBeenCalledWith(
      'Failed to create deployment in DeployRadar'
    )
  })

  it('retries a temporary server error and completes when a later attempt succeeds', async () => {
    useImmediateRetryDelays()
    global.fetch
      .mockResolvedValueOnce(
        response({
          status: 503,
          statusText: 'Service Unavailable',
          text: 'temporarily unavailable'
        })
      )
      .mockResolvedValueOnce(
        response({
          status: 201,
          statusText: 'Created',
          text: '{"result":"ok"}'
        })
      )

    await main.run()

    expect(global.fetch).toHaveBeenCalledTimes(2)
    expect(core.warning).toHaveBeenCalledWith(
      'DeployRadar API returned 503 on attempt 1 of 3; retrying in 500ms.'
    )
    expect(core.setOutput).toHaveBeenCalledWith('status', '201')
  })

  it('retries a timed-out request and includes a timeout signal', async () => {
    useImmediateRetryDelays()
    const timeout = new Error('request timed out')
    timeout.name = 'TimeoutError'
    global.fetch
      .mockRejectedValueOnce(timeout)
      .mockResolvedValueOnce(response({ status: 201, statusText: 'Created' }))

    await main.run()

    expect(global.fetch).toHaveBeenCalledTimes(2)
    expect(global.fetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
    expect(core.setOutput).toHaveBeenCalledWith('status', '201')
  })

  it('does not retry a non-transient client error', async () => {
    global.fetch.mockResolvedValue(
      response({
        status: 400,
        statusText: 'Bad Request',
        text: 'invalid request'
      })
    )

    await main.run()

    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(core.setFailed).toHaveBeenCalledWith(
      'Failed to create deployment in DeployRadar'
    )
  })

  it('honours Retry-After for a rate-limited response', async () => {
    useImmediateRetryDelays()
    global.fetch
      .mockResolvedValueOnce(
        response({
          status: 429,
          statusText: 'Too Many Requests',
          retryAfter: '0'
        })
      )
      .mockResolvedValueOnce(response({ status: 201, statusText: 'Created' }))

    await main.run()

    expect(global.fetch).toHaveBeenCalledTimes(2)
    expect(core.warning).toHaveBeenCalledWith(
      'DeployRadar API returned 429 on attempt 1 of 3; retrying in 0ms.'
    )
  })

  it('uses the pipeline status and API URL when provided', async () => {
    core.getInput.mockImplementation((name) => {
      const inputs = {
        releaseVersion: '3.1.1',
        componentName: 'aurora-gateway',
        environment: 'Production',
        jobStatus: 'failure',
        apiKey: 'Bearer test-key',
        apiUrl: 'https://example.com/deploy'
      }
      return inputs[name] ?? ''
    })

    await main.run()

    const [url, options] = global.fetch.mock.calls[0]
    const payload = JSON.parse(options.body)

    expect(url).toBe('https://example.com/deploy')
    expect(options.headers.Authorization).toBe('Bearer test-key')
    expect(payload.parameters.deploymentState).toBe('FAILURE')
    expect(payload.context.source.sha).toBe(
      '83fff8ade43591d553b9c7fec102901920f15b84'
    )
  })

  it('allows releaseVersion to be omitted', async () => {
    core.getInput.mockImplementation((name) => {
      const inputs = {
        componentName: 'aurora-gateway',
        environment: 'Production',
        jobStatus: 'success',
        apiKey: 'test-key'
      }
      return inputs[name] ?? ''
    })

    await main.run()

    const [, options] = global.fetch.mock.calls[0]
    const payload = JSON.parse(options.body)

    expect(payload.parameters).toEqual({
      componentName: 'aurora-gateway',
      environment: 'Production',
      deploymentState: 'SUCCESS'
    })
  })

  it('maps cancelled jobs to failed deployments', async () => {
    core.getInput.mockImplementation((name) => {
      const inputs = {
        releaseVersion: '3.1.1',
        componentName: 'aurora-gateway',
        environment: 'Production',
        jobStatus: 'cancelled',
        apiKey: 'test-key'
      }
      return inputs[name] ?? ''
    })

    await main.run()

    const [, options] = global.fetch.mock.calls[0]
    const payload = JSON.parse(options.body)

    expect(payload.parameters.deploymentState).toBe('FAILURE')
  })

  it('rejects unknown job statuses before calling the API', async () => {
    core.getInput.mockImplementation((name) => {
      const inputs = {
        releaseVersion: '3.1.1',
        componentName: 'aurora-gateway',
        environment: 'Production',
        jobStatus: 'unknown',
        apiKey: 'test-key'
      }
      return inputs[name] ?? ''
    })

    await main.run()

    expect(global.fetch).not.toHaveBeenCalled()
    expect(core.setFailed).toHaveBeenCalledWith(
      'jobStatus must be one of success, failure, cancelled'
    )
  })

  it('rejects unsupported workflow triggers before calling the API', async () => {
    github.context.eventName = 'schedule'

    await main.run()

    expect(global.fetch).not.toHaveBeenCalled()
    expect(core.setFailed).toHaveBeenCalledWith(
      'Unsupported GitHub event "schedule". Supported events are push and workflow_dispatch.'
    )
  })

  it('rejects push events that delete a ref before calling the API', async () => {
    setGitHubContext(deletedPushContext)

    await main.run()

    expect(global.fetch).not.toHaveBeenCalled()
    expect(core.setFailed).toHaveBeenCalledWith(
      'Push events that delete a branch or tag are not supported'
    )
  })

  it('rejects a payload that omits required repository context', async () => {
    github.context.payload.repository.html_url = ''

    await main.run()

    expect(global.fetch).not.toHaveBeenCalled()
    expect(core.setFailed).toHaveBeenCalledWith(
      'Missing required GitHub Actions context fields: repository.html_url, pipeline.runUri'
    )
  })

  it('maps commit metadata from a normal push', async () => {
    setGitHubContext(pushContext)

    await main.run()

    const [, options] = global.fetch.mock.calls[0]
    const payload = JSON.parse(options.body)

    expect(payload.context.source).toEqual({
      branch: 'refs/heads/main',
      branchName: 'main',
      sha: 'c9976f8f9bf3f0f2c0ab45a744a6e2c6c143b387',
      commitMessage: 'Deploy aurora gateway',
      commitDateTime: '2026-08-08T13:30:00Z'
    })
    expect(payload.context.pipeline.eventName).toBe('push')
  })

  it('uses the caller context in a reusable workflow', async () => {
    setGitHubContext(workflowCallFromPushContext)

    await main.run()

    const [, options] = global.fetch.mock.calls[0]
    const payload = JSON.parse(options.body)

    expect(payload.context.pipeline).toMatchObject({
      name: 'Caller deployment workflow',
      eventName: 'push',
      jobName: 'deploy-from-reusable-workflow',
      runId: '21005190830',
      runNumber: '43'
    })
    expect(payload.context.source.sha).toBe(
      'c9976f8f9bf3f0f2c0ab45a744a6e2c6c143b387'
    )
  })
})
