import { config, portOpen, connectManaged, safeError, sleep } from './runtime.mjs'

let browser
try {
  if (process.argv.length > 2) throw new Error('stop使用与start相同的PROJECT_ID/PROFILE/PORT配置，不接受位置端口参数。')
  const c = await config()
  if (!c.record) throw new Error('没有本项目的实例记录，未关闭任何浏览器。')
  if (!await portOpen(c.port)) console.log('本项目测试浏览器未运行。')
  else {
    browser = await connectManaged(c)
    const session = await browser.newBrowserCDPSession()
    await session.send('Browser.close').catch(() => {})
    for (let n = 0; n < 30 && await portOpen(c.port); n++) await sleep(200)
    if (await portOpen(c.port)) throw new Error('关闭未完成；未强制结束进程。')
    console.log(JSON.stringify({ closed: true, profile: c.profile, port: c.port }))
  }
} catch (error) { console.error(safeError(error)); process.exitCode = 1 }
finally { if (browser) await browser.close().catch(() => {}) }
