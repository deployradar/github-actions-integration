import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('the distributed bundle sends allowlisted context and never follows redirects', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'deployradar-action-'))
  const requests = []
  let redirect = false
  const receiver = createServer(async (request, response) => {
    let body = ''
    for await (const chunk of request) body += chunk
    requests.push({
      path: request.url,
      authorization: request.headers.authorization,
      body
    })
    response.writeHead(
      redirect ? 302 : 200,
      redirect ? { Location: '/should-not-receive-key' } : {}
    )
    response.end('remote-body-must-not-be-logged')
  })
  await new Promise((resolve) => receiver.listen(0, '127.0.0.1', resolve))
  try {
    await writeFile(join(dir, 'outputs'), '')
    const endpoint = `http://127.0.0.1:${receiver.address().port}/deploy`
    const eventPath = join(dir, 'event.json')
    await writeFile(
      eventPath,
      JSON.stringify({
        repository: {
          full_name: 'deployradar/example',
          name: 'example',
          html_url: 'https://github.com/deployradar/example'
        },
        head_commit: {
          message: 'A deployment',
          timestamp: '2026-10-18T00:00:00Z'
        },
        secretExtra: 'must-not-send'
      })
    )
    const invoke = (status) =>
      new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ['dist/index.js'], {
          env: {
            ...process.env,
            GITHUB_EVENT_PATH: eventPath,
            GITHUB_EVENT_NAME: 'push',
            GITHUB_REF: 'refs/tags/v0.1.0-alpha.1',
            GITHUB_SHA: 'a'.repeat(40),
            GITHUB_WORKFLOW: 'Bundle smoke',
            GITHUB_RUN_ID: '123',
            GITHUB_RUN_NUMBER: '4',
            GITHUB_ACTOR: 'test',
            GITHUB_JOB: 'deploy',
            GITHUB_SERVER_URL: 'https://github.com',
            GITHUB_OUTPUT: join(dir, 'outputs'),
            INPUT_COMPONENTNAME: 'example',
            INPUT_ENVIRONMENT: 'test',
            INPUT_JOBSTATUS: status,
            INPUT_APIKEY: 'mock-key',
            INPUT_APIURL: endpoint
          },
          stdio: ['ignore', 'pipe', 'pipe']
        })
        let output = ''
        child.stdout.on('data', (chunk) => {
          output += chunk
        })
        child.stderr.on('data', (chunk) => {
          output += chunk
        })
        child.on('error', reject)
        child.on('close', (code) => resolve({ code, output }))
      })
    for (const [status, expected] of [
      ['success', 'SUCCESS'],
      ['failure', 'FAILURE'],
      ['cancelled', 'FAILURE']
    ]) {
      const result = await invoke(status)
      assert.equal(result.code, 0, result.output)
      assert.ok(!result.output.includes('remote-body-must-not-be-logged'))
      const request = requests.at(-1)
      assert.equal(request.authorization, 'Bearer mock-key')
      const payload = JSON.parse(request.body)
      assert.equal(payload.parameters.deploymentState, expected)
      assert.equal(payload.integration.version, '0.1.0-alpha.1')
      assert.equal(payload.context.source.branch, 'refs/tags/v0.1.0-alpha.1')
      assert.equal(
        payload.context.pipeline.runUri,
        'https://github.com/deployradar/example/actions/runs/123'
      )
      assert.ok(!request.body.includes('must-not-send'))
    }
    assert.match(await readFile(join(dir, 'outputs'), 'utf8'), /200/)
    redirect = true
    const before = requests.length
    const redirected = await invoke('success')
    assert.equal(redirected.code, 1)
    assert.ok(requests.length > before)
    assert.ok(requests.every((request) => request.path === '/deploy'))
  } finally {
    receiver.closeAllConnections()
    await new Promise((resolve) => receiver.close(resolve))
    await rm(dir, { recursive: true, force: true })
  }
})
