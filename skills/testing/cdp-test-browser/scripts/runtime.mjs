import { createHash } from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import { constants } from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const hash = (value) => createHash('sha256').update(value).digest('hex').slice(0, 8)
export function validName(value) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(value)) throw new Error('PROJECT_ID/PROFILE 仅允许1–80个字母、数字、连字符或下划线。')
  return value
}
export function validPort(value) {
  if (!/^\d+$/.test(String(value)) || Number(value) < 1024 || Number(value) > 65535) throw new Error('调试端口必须是1024–65535之间的整数。')
  return Number(value)
}
async function readRecord(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')) }
  catch (error) { if (error.code === 'ENOENT') return null; throw new Error('实例记录损坏，请检查：' + file) }
}

export async function config(env = process.env, cwd = process.cwd()) {
  let projectRoot = path.resolve(cwd)
  try { projectRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch {}
  const slug = path.basename(projectRoot).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 55) || 'project'
  const project = validName(env.PROJECT_ID || `${slug}-${hash(projectRoot)}`)
  const profile = validName(env.PROFILE || project)
  const root = path.resolve(env.CDP_TEST_BROWSER_HOME || path.join(os.homedir(), '.cdp-test-browser'))
  const recordFile = path.join(root, 'instances', profile + '.json')
  const record = await readRecord(recordFile)
  if (record && (record.kind !== 'cdp-test-browser' || record.project !== project || record.profile !== profile)) throw new Error('该profile已归属于另一项目；确认原归属后选择相应PROJECT_ID，或为当前项目另选PROFILE。')
  if (env.PORT && env.CDP_PORT && env.PORT !== env.CDP_PORT) throw new Error('PORT与CDP_PORT不一致，请只指定一个端口。')
  const port = validPort(env.CDP_PORT || env.PORT || record?.port || 9300 + parseInt(hash(profile), 16) % 10000)
  return { root, project, projectRoot, profile, port, recordFile, record, dir: path.join(root, 'profiles', profile), lock: path.join(root, 'locks', profile + '.lock') }
}

export async function portOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port })
    const done = (value) => { socket.destroy(); resolve(value) }
    socket.setTimeout(500, () => done(false))
    socket.once('connect', () => done(true))
    socket.once('error', () => done(false))
  })
}

export async function connectManaged(c, requireRecord = true) {
  if (requireRecord && (!c.record || c.record.port !== c.port)) throw new Error('没有匹配的实例记录；请先在本项目运行start.sh。')
  const { chromium } = await import('playwright-core')
  let browser
  try {
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${c.port}`, { timeout: 2500 })
    const session = await browser.newBrowserCDPSession()
    const { arguments: args } = await session.send('Browser.getBrowserCommandLine')
    await session.detach()
    if (!args.includes(`--user-data-dir=${c.dir}`) || !args.includes(`--remote-debugging-port=${c.port}`)) throw new Error('profile/端口与配置不匹配')
    c.actualBinary = args[0]
    return browser
  } catch {
    if (browser) await browser.close().catch(() => {}) // Disconnect; never terminate an unverified browser.
    throw new Error(`无法确认端口${c.port}属于所选测试profile，未接管或关闭它。旧实例请先确认资料目录并正常关闭，再用同一profile重启。`)
  }
}

async function executable(candidate) {
  try { await fs.access(candidate, constants.X_OK); return candidate } catch { return null }
}
async function resolveBinary(candidate) {
  const direct = await executable(candidate)
  if (direct && !(await fs.stat(candidate)).isDirectory()) return direct
  for (const suffix of ['Contents/MacOS/Google Chrome for Testing', 'Contents/MacOS/Chromium', 'Contents/MacOS/Google Chrome', 'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', 'Chromium.app/Contents/MacOS/Chromium', 'chrome', 'chrome.exe']) {
    const found = await executable(path.join(candidate, suffix))
    if (found && !(await fs.stat(found)).isDirectory()) return found
  }
  return null
}

export async function findChrome(env = process.env) {
  if (env.CHROME_BIN) {
    const found = await resolveBinary(path.resolve(env.CHROME_BIN))
    if (!found) throw new Error('CHROME_BIN没有指向可执行的Chrome、.app或浏览器程序目录。')
    return found
  }
  const home = os.homedir()
  const caches = [env.PLAYWRIGHT_BROWSERS_PATH, path.join(home, 'Library/Caches/ms-playwright'), path.join(home, '.cache/ms-playwright'), env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'ms-playwright')].filter(Boolean)
  for (const cache of caches) {
    let versions
    try { versions = (await fs.readdir(cache)).filter((x) => /^chromium-\d+$/.test(x)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true })) } catch { continue }
    for (const version of versions) {
      for (const platform of ['chrome-mac-arm64', 'chrome-mac-x64', 'chrome-mac', 'chrome-linux64', 'chrome-linux', 'chrome-win64', 'chrome-win']) {
        const found = await resolveBinary(path.join(cache, version, platform))
        if (found) return found
      }
    }
  }
  for (const candidate of ['/Applications/Google Chrome for Testing.app', '/Applications/Google Chrome.app', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', env.PROGRAMFILES && path.join(env.PROGRAMFILES, 'Google/Chrome/Application/chrome.exe')].filter(Boolean)) {
    const found = await resolveBinary(candidate)
    if (found) return found
  }
  throw new Error('没有找到Chrome。先指定CHROME_BIN；确实需要安装时，在skill目录运行npx playwright-core install chromium。')
}

export async function withLaunchLock(c, work) {
  await fs.mkdir(path.dirname(c.lock), { recursive: true, mode: 0o700 })
  const deadline = Date.now() + 20000
  for (;;) {
    try { await fs.mkdir(c.lock, { mode: 0o700 }); break }
    catch (error) {
      if (error.code !== 'EEXIST') throw error
      if (Date.now() > deadline) throw new Error('启动锁仍被占用：' + c.lock + '；先确认没有启动器运行，不删除Chrome的profile锁。')
      await sleep(100)
    }
  }
  try { return await work() } finally { await fs.rmdir(c.lock) }
}

export async function saveRecord(c, binary) {
  await fs.mkdir(path.dirname(c.recordFile), { recursive: true, mode: 0o700 })
  const temporary = c.recordFile + '.' + process.pid + '.tmp'
  await fs.writeFile(temporary, JSON.stringify({ kind: 'cdp-test-browser', project: c.project, projectRoot: c.projectRoot, profile: c.profile, port: c.port, binary }, null, 2) + '\n', { mode: 0o600 })
  await fs.rename(temporary, c.recordFile)
}

export async function launchChrome(binary, c, url) {
  await fs.mkdir(c.dir, { recursive: true, mode: 0o700 })
  if ((await fs.lstat(c.dir)).isSymbolicLink()) throw new Error('测试profile不能是指向其他资料目录的符号链接。')
  for (const name of ['SingletonLock', 'SingletonSocket']) {
    try { await fs.lstat(path.join(c.dir, name)) } catch (e) { if (e.code === 'ENOENT') continue; throw e }
    throw new Error('所选profile有浏览器占用标记；确认原实例并正常关闭，不自动删除锁或新建替代profile。')
  }
  const args = [`--remote-debugging-address=127.0.0.1`, `--remote-debugging-port=${c.port}`, `--user-data-dir=${c.dir}`, '--enable-automation', '--no-first-run', '--no-default-browser-check', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--window-size=1440,900', url || 'about:blank']
  const appEnd = binary.indexOf('.app/')
  let child
  if (process.platform === 'darwin' && appEnd !== -1) child = spawn('/usr/bin/open', ['-na', binary.slice(0, appEnd + 4), '--args', ...args], { stdio: 'ignore' })
  else child = spawn(binary, args, { detached: true, stdio: 'ignore' })
  await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject) })
  child.unref()
}

export function shortUrl(value) {
  try { const u = new URL(value); u.username = ''; u.password = ''; u.search = ''; u.hash = ''; return u.toString() } catch { return '(非URL)' }
}
export function safeError(error) { return String(error.message || error).replace(/https?:\/\/[^\s'"<>]+/g, (value) => shortUrl(value)) }
