import { config, connectManaged, shortUrl, safeError, sleep } from './runtime.mjs'

const [command = 'status', arg, body] = process.argv.slice(2)
let browser
const output = (text) => {
  if (process.env.FULL === '1' || text.length <= 8000) console.log(text)
  else console.log(text.slice(0, 8000) + `\n[已显示前8000/${text.length}字符；FULL=1查看完整内容]`)
}
try {
  const c = await config()
  browser = await connectManaged(c)
  const context = browser.contexts()[0]
  if (!context) throw new Error('没有可用的持久浏览器上下文。')
  const pages = context.pages()
  if (command === 'tabs') {
    for (const [index, page] of pages.entries()) console.log(JSON.stringify({ index, url: shortUrl(page.url()), title: await page.title() }))
  } else if (command === 'new') {
    if (arg && !/^https?:\/\//.test(arg)) throw new Error('new仅接受http(s)地址。')
    const page = await context.newPage()
    if (arg) await page.goto(arg, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.bringToFront()
    console.log(JSON.stringify({ index: context.pages().indexOf(page), url: shortUrl(page.url()) }))
  } else {
    let selected = pages.filter((p) => /^https?:/.test(p.url()))
    if (process.env.CDP_TAB !== undefined) {
      if (!/^\d+$/.test(process.env.CDP_TAB)) throw new Error('CDP_TAB必须是tabs输出中的序号。')
      selected = pages[Number(process.env.CDP_TAB)] ? [pages[Number(process.env.CDP_TAB)]] : []
    } else if (process.env.CDP_MATCH) selected = pages.filter((p) => p.url().includes(process.env.CDP_MATCH))
    if (selected.length === 0 && pages.length === 1 && !process.env.CDP_MATCH && process.env.CDP_TAB === undefined) selected = pages
    if (selected.length !== 1) throw new Error('没有唯一匹配的标签页；先用tabs，再指定CDP_TAB或CDP_MATCH。')
    const page = selected[0]
    await page.bringToFront()
    switch (command) {
      case 'status': console.log(JSON.stringify({ project: c.project, profile: c.profile, port: c.port, url: shortUrl(page.url()), title: await page.title() })); break
      case 'goto':
        if (!arg || !/^https?:\/\//.test(arg)) throw new Error('goto需要http(s)地址。')
        await page.goto(arg, { waitUntil: 'domcontentloaded', timeout: 30000 })
        console.log('URL:', shortUrl(page.url())); output(await page.innerText('body')); break
      case 'text': console.log('URL:', shortUrl(page.url())); output(await page.innerText('body')); break
      case 'shot':
        if (!arg) throw new Error('shot需要输出图片路径。')
        await page.screenshot({ path: arg }); console.log('已保存截图：' + arg); break
      case 'click': {
        if (!arg) throw new Error('click需要按钮的可访问名称。')
        const locator = page.getByRole('button', { name: arg, exact: true })
        await locator.click({ timeout: 15000 })
        console.log('已点击，当前URL:', shortUrl(page.url())); break
      }
      case 'get':
      case 'post': {
        if (!arg || !arg.startsWith('/') || arg.startsWith('//') || new URL(arg, page.url()).origin !== new URL(page.url()).origin) throw new Error('get/post仅接受当前网站同源的绝对路径。')
        if (body !== undefined) JSON.parse(body)
        const result = await page.evaluate(async ({ method, target, payload }) => {
          const controller = new AbortController()
          const timer = setTimeout(() => controller.abort(), 15000)
          try {
            const response = await fetch(target, { method, credentials: 'include', redirect: 'error', signal: controller.signal, headers: payload === undefined ? undefined : { 'Content-Type': 'application/json' }, body: payload })
            return { status: response.status, text: await response.text() }
          } finally { clearTimeout(timer) }
        }, { method: command.toUpperCase(), target: arg, payload: command === 'post' ? body ?? '{}' : undefined })
        console.log('HTTP', result.status); output(result.text); break
      }
      case 'wait-leave': {
        const seconds = Number(body ?? 60)
        if (!arg || !Number.isFinite(seconds) || seconds < 1 || seconds > 60) throw new Error('wait-leave需要URL片段及1–60秒的等待上限。')
        const deadline = Date.now() + seconds * 1000
        while (page.url().includes(arg) && Date.now() < deadline) await sleep(500)
        if (page.url().includes(arg)) throw new Error('等待结束，页面仍未离开指定地址；需要时可再次等待。')
        console.log('当前URL:', shortUrl(page.url())); break
      }
      default: throw new Error('命令：tabs/status/new/goto/text/shot/click/get/post/wait-leave。')
    }
  }
} catch (error) { console.error(safeError(error)); process.exitCode = 1 }
finally { if (browser) await browser.close().catch(() => {}) }
