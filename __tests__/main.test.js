/**
 * Unit tests for the action's main functionality, src/main.js
 */
import { afterEach, beforeEach, jest } from '@jest/globals'
const core = await import('../__fixtures__/core')
const github = await import('../__fixtures__/github')

jest.unstable_mockModule('@actions/core', () => core)
jest.unstable_mockModule('@actions/github', () => github)

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
  })

  it('calls the DeployRadar API', async () => {
    await main.run()

    expect(global.fetch).toHaveBeenCalledWith(
      'https://dev.deployradar.com/api/deploy-radar/v1/deploy/github-actions',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-key'
        },
        body: JSON.stringify({
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
      })
    )
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
