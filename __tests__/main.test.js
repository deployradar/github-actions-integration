/**
 * Unit tests for the action's main functionality, src/main.js
 */
import { afterEach, beforeEach, jest } from '@jest/globals'
const core = await import('../__fixtures__/core')

jest.unstable_mockModule('@actions/core', () => core)

const main = await import('../src/main')

describe('action', () => {
  beforeEach(() => {
    core.getInput.mockImplementation((name) => {
      const inputs = {
        releaseVersion: '3.1.1',
        componentId: 'Comp-1',
        environment: 'Production',
        apiKey: 'test-key'
      }
      return inputs[name]
    })

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
  })

  it('calls the DeployRadar API', async () => {
    await main.run()

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.deployradar.com/api/deploy-radar/v1/deploy',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'test-key'
        },
        body: JSON.stringify({
          releaseVersion: '3.1.1',
          componentId: 'Comp-1',
          environment: 'Production'
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
