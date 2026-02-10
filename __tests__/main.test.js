/**
 * Unit tests for the action's main functionality, src/main.js
 */
import { afterEach, beforeEach, jest } from '@jest/globals'
import { writeFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
const core = await import('../__fixtures__/core')

jest.unstable_mockModule('@actions/core', () => core)

const main = await import('../src/main')

describe('action', () => {
  beforeEach(() => {
    core.getInput.mockImplementation((name) => {
      const inputs = {
        releaseVersion: '3.1.1',
        componentName: 'aurora-gateway',
        environment: 'Production',
        apiKey: 'test-key'
      }
      return inputs[name]
    })

    process.env.GITHUB_JOB_STATUS = 'success'
    process.env.GITHUB_EVENT_NAME = 'workflow_dispatch'
    process.env.GITHUB_SHA = '83fff8ade43591d553b9c7fec102901920f15b84'
    process.env.GITHUB_REF = 'refs/heads/main'
    process.env.GITHUB_WORKFLOW = 'scripty'
    process.env.GITHUB_ACTION = 'script'
    process.env.GITHUB_ACTOR = 'fwende'
    process.env.GITHUB_JOB = 'scripty'
    process.env.GITHUB_RUN_NUMBER = '1'
    process.env.GITHUB_RUN_ID = '21005190828'

    const eventPath = join(tmpdir(), 'github-event.json')
    process.env.GITHUB_EVENT_PATH = eventPath
    writeFileSync(
      eventPath,
      JSON.stringify({
        repository: {
          full_name: 'deployradar/github-actions-integration',
          html_url: 'https://github.com/deployradar/github-actions-integration',
          name: 'github-actions-integration',
          pushed_at: '2026-01-14T18:22:09Z'
        }
      }),
      'utf8'
    )

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      statusText: 'Created',
      text: jest.fn().mockResolvedValue('{"result":"ok"}')
    })
  })

  afterEach(() => {
    jest.resetAllMocks()
    delete global.fetch
    delete process.env.GITHUB_JOB_STATUS
    delete process.env.GITHUB_EVENT_NAME
    delete process.env.GITHUB_SHA
    delete process.env.GITHUB_REF
    delete process.env.GITHUB_WORKFLOW
    delete process.env.GITHUB_ACTION
    delete process.env.GITHUB_ACTOR
    delete process.env.GITHUB_JOB
    delete process.env.GITHUB_RUN_NUMBER
    delete process.env.GITHUB_RUN_ID
    if (process.env.GITHUB_EVENT_PATH) {
      try {
        unlinkSync(process.env.GITHUB_EVENT_PATH)
      } catch {}
      delete process.env.GITHUB_EVENT_PATH
    }
  })

  it('calls the DeployRadar API', async () => {
    await main.run()

    const [url, options] = global.fetch.mock.calls[0]

    expect(url).toBe('https://dev.deployradar.com/api/deploy-radar/v1/deploy/github-actions')
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
    expect(payload).toEqual({
      integration: {
        version: 'v0.0.1',
        timestamp: expect.any(String)
      },
      parameters: {
        deploymentState: 'SUCCESS',
        releaseVersion: '3.1.1',
        componentName: 'aurora-gateway',
        environment: 'Production'
      },
      context: {
        repository: {
          full_name: 'deployradar/github-actions-integration',
          html_url: 'https://github.com/deployradar/github-actions-integration',
          name: 'github-actions-integration',
          pushed_at: '2026-01-14T18:22:09Z'
        },
        eventName: 'workflow_dispatch',
        sha: '83fff8ade43591d553b9c7fec102901920f15b84',
        ref: 'refs/heads/main',
        workflow: 'scripty',
        action: 'script',
        actor: 'fwende',
        job: 'scripty',
        runNumber: 1,
        runId: 21005190828
      }
    })
    expect(core.setOutput).toHaveBeenCalledWith('status', '201')
    expect(core.setOutput).toHaveBeenCalledWith('response', '{"result":"ok"}')
  })

  it('sets a failed status when the API rejects', async () => {
    global.fetch.mockRejectedValue(new Error('network down'))

    await main.run()

    expect(core.setFailed).toHaveBeenCalledWith('network down')
  })

  it('sets a failed status when the API returns an error', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: jest.fn().mockResolvedValue('boom')
    })

    await main.run()

    expect(core.setFailed).toHaveBeenCalledWith(
      'Failed to create deployment in DeployRadar'
    )
  })
})
