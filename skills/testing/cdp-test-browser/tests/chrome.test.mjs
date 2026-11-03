import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import http from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { config, portOpen } from '../scripts/runtime.mjs'

const run = promisify(execFile)
const skill = fileURLToPath(new URL('../', import.meta.url))
async function freePort() {
  const socket = net.createServer()
  await new Promise((resolve) => socket.listen(0, '127.0.0.1', resolve))
  const port = socket.address().port
  await new Promise((resolve) => socket.close(resolve))
  return port
}

test('real Chrome reuses/persists project A, isolates B, and refuses wrong-profile stop', { skip: process.env.RUN_CHROME_TEST !== '1', timeout: 90000 }, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-chrome-smoke-'))
  let unexpectedRequests = 0
  const otherOrigin = http.createServer((request, response) => { unexpectedRequests++; response.end('unexpected') })
  await new Promise((resolve) => otherOrigin.listen(0, '127.0.0.1', resolve))
  const site = http.createServer((request, response) => {
    if (request.url === '/api/redirect') { response.writeHead(307, { Location: `http://127.0.0.1:${otherOrigin.address().port}/receive` }); response.end(); return }
    if (request.url === '/api/read') { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ fixture: true, method: request.method })); return }
    response.setHeader('Content-Type', 'text/html; charset=utf-8')
    response.end(`<title>CDP skill fixture</title><h1>Project fixture</h1><p id="state"></p><button onclick="localStorage.setItem('fixture-state','Saved');document.getElementById('state').textContent='Saved'">Save fixture marker</button><script>document.getElementById('state').textContent=localStorage.getItem('fixture-state')||'Empty';</script>`)
  })
  await new Promise((resolve) => site.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${site.address().port}/?token=fixture-only#not-for-logs`
  const env = { ...process.env, CDP_TEST_BROWSER_HOME: root, PROJECT_ID: 'fixture-a', START_URL: url, PORT: String(await freePort()) }
  delete env.PROFILE; delete env.CDP_PORT
  const other = { ...env, PROJECT_ID: 'fixture-b', PORT: String(await freePort()) }
  const command = (name, args = [], vars = env) => run(process.execPath, [path.join(skill, 'scripts', name), ...args], { env: vars, cwd: skill, timeout: 25000 })
  try {
    assert.equal(JSON.parse((await command('start.mjs')).stdout).reused, false)
    const firstVersion = await (await fetch(`http://127.0.0.1:${env.PORT}/json/version`)).json()
    assert.equal(JSON.parse((await command('start.mjs')).stdout).reused, true)
    const reusedVersion = await (await fetch(`http://127.0.0.1:${env.PORT}/json/version`)).json()
    assert.equal(reusedVersion.webSocketDebuggerUrl, firstVersion.webSocketDebuggerUrl)
    await assert.rejects(command('start.mjs', ['--port', '9333']))
    const status = (await command('cdp.mjs', ['status'])).stdout
    assert.ok(!status.includes('fixture-only') && !status.includes('not-for-logs'))
    await command('cdp.mjs', ['click', 'Save fixture marker'])
    assert.match((await command('cdp.mjs', ['text'])).stdout, /Saved/)
    assert.match((await command('cdp.mjs', ['get', '/api/read'])).stdout, /"fixture":true/)
    await assert.rejects(command('cdp.mjs', ['post', '/api/redirect', '{"fixture":"not-secret"}']))
    assert.equal(unexpectedRequests, 0, 'same-origin helper must not forward a body to a redirect target')

    assert.equal(JSON.parse((await command('start.mjs', [], other)).stdout).reused, false)
    assert.match((await command('cdp.mjs', ['text'], other)).stdout, /Empty/)
    await assert.rejects(command('stop.mjs', [other.PORT]))
    assert.equal(await portOpen(Number(env.PORT)), true)
    await assert.rejects(command('start.mjs', [], { ...other, PORT: env.PORT }))

    // Deliberately corrupt only fixture B's record: stop must not terminate A.
    const c = await config(other, skill)
    const saved = await fs.readFile(c.recordFile, 'utf8')
    await fs.writeFile(c.recordFile, JSON.stringify({ ...JSON.parse(saved), port: Number(env.PORT) }))
    await assert.rejects(command('stop.mjs', [], { ...other, PORT: env.PORT }))
    assert.equal(await portOpen(Number(env.PORT)), true)
    await fs.writeFile(c.recordFile, saved)
    await command('stop.mjs', [], other)
    assert.equal(await portOpen(Number(env.PORT)), true)

    await command('stop.mjs')
    assert.equal(await portOpen(Number(env.PORT)), false)
    await command('start.mjs')
    assert.match((await command('cdp.mjs', ['text'])).stdout, /Saved/)
    await command('stop.mjs')
  } finally {
    for (const vars of [env, other]) await command('stop.mjs', [], vars).catch(() => {})
    await new Promise((resolve) => site.close(resolve))
    await new Promise((resolve) => otherOrigin.close(resolve))
    if (!await portOpen(Number(env.PORT)) && !await portOpen(Number(other.PORT))) await fs.rm(root, { recursive: true, force: true })
    else console.error('保留尚在使用的测试资料目录：' + root)
  }
})
