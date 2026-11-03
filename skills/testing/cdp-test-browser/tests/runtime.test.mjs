import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { config, saveRecord, shortUrl, validName, validPort, withLaunchLock } from '../scripts/runtime.mjs'

test('one Git project retains its profile from nested directories; another project is isolated', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-config-'))
  try {
    const a = path.join(root, 'project-a'), b = path.join(root, 'project-b')
    await fs.mkdir(path.join(a, 'nested'), { recursive: true }); await fs.mkdir(b)
    execFileSync('git', ['init', '-q', a]); execFileSync('git', ['init', '-q', b])
    const env = { CDP_TEST_BROWSER_HOME: path.join(root, 'runtime') }
    const first = await config(env, a), nested = await config(env, path.join(a, 'nested')), other = await config(env, b)
    assert.equal(first.profile, nested.profile)
    assert.equal(first.port, nested.port)
    assert.notEqual(first.dir, other.dir)
    await saveRecord(first, '/test/chrome')
    const resumed = await config(env, a)
    assert.equal(resumed.record.port, first.port)
    assert.equal(resumed.dir, first.dir)
    assert.equal((await fs.stat(first.recordFile)).mode & 0o777, 0o600)
  } finally { await fs.rm(root, { recursive: true, force: true }) }
})

test('a profile cannot silently change project ownership', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-ownership-'))
  try {
    const first = await config({ CDP_TEST_BROWSER_HOME: root, PROJECT_ID: 'storefront', PROFILE: 'shared' })
    await saveRecord(first, '/test/chrome')
    await assert.rejects(config({ CDP_TEST_BROWSER_HOME: root, PROJECT_ID: 'backoffice', PROFILE: 'shared' }), /另一项目/)
    const record = JSON.parse(await fs.readFile(first.recordFile))
    assert.equal(record.project, 'storefront')
  } finally { await fs.rm(root, { recursive: true, force: true }) }
})

test('profile traversal and malformed/conflicting ports are rejected', async () => {
  for (const name of ['../default', '/profile', 'name with spaces', '', 'a'.repeat(81)]) assert.throws(() => validName(name))
  for (const port of ['9333x', 0, 1023, 65536, -1]) assert.throws(() => validPort(port))
  await assert.rejects(config({ PROJECT_ID: 'demo', PORT: '9333', CDP_PORT: '9334' }), /不一致/)
})

test('parallel starters share a launch lease rather than creating two processes', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-lease-'))
  try {
    const c = await config({ CDP_TEST_BROWSER_HOME: root, PROJECT_ID: 'demo' })
    let active = 0, maximum = 0
    await Promise.all([1, 2, 3].map(() => withLaunchLock(c, async () => {
      active++; maximum = Math.max(maximum, active)
      await new Promise((resolve) => setTimeout(resolve, 20)); active--
    })))
    assert.equal(maximum, 1)
    await assert.rejects(fs.stat(c.lock), { code: 'ENOENT' })
  } finally { await fs.rm(root, { recursive: true, force: true }) }
})

test('routine URL output omits credentials, query tokens and fragments', () => {
  const output = shortUrl('https://user:password@example.com/dashboard?token=private#secret')
  assert.equal(output, 'https://example.com/dashboard')
})
