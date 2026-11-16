import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'

const metadata = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url))
)
const action = await readFile(new URL('../action.yml', import.meta.url), 'utf8')
const source = await readFile(
  new URL('../src/main.js', import.meta.url),
  'utf8'
)
const endpoint = action.match(/default: (https:\/\/\S+)/)?.[1]
const version = metadata.version
assert.match(
  version,
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/
)
assert.equal(
  process.env.RELEASE_TAG,
  `v${version}`,
  'Tag must match package.json version'
)
assert.ok(
  source.includes(`'${endpoint}'`),
  'Action and runtime endpoint must match'
)
const url = new URL(endpoint)
assert.equal(url.protocol, 'https:')
assert.equal(url.pathname, '/api/deploy-radar/v1/deploy/cicd-unified')
assert.equal(url.username + url.password + url.search + url.hash, '')
if (url.hostname === 'app-dev.deployradar.com') {
  assert.match(
    version,
    /^\d+\.\d+\.\d+-alpha(?:\.|$)/,
    'Only alpha releases may default to dev'
  )
} else {
  assert.equal(
    endpoint,
    metadata.deployradar?.productionApiUrl,
    'Confirm the production URL before stable publication'
  )
}
assert.match(
  await readFile(new URL('../LICENSE', import.meta.url), 'utf8'),
  /^MIT License/
)
// Release callers fetch full history before checking the candidate commit.
execFileSync('git', ['merge-base', '--is-ancestor', 'HEAD', 'origin/main'])
execFileSync('git', [
  'diff',
  '--exit-code',
  '--',
  'dist/index.js',
  'package.json',
  'action.yml'
])
console.log(
  `Reviewed release ${process.env.RELEASE_TAG}: endpoint, version, license and main ancestry verified`
)
