import { config, findChrome, portOpen, connectManaged, launchChrome, saveRecord, withLaunchLock, sleep, safeError } from './runtime.mjs'

try {
  if (process.argv.length > 2) throw new Error('start通过PROJECT_ID/PROFILE/PORT/CHROME_BIN/START_URL环境变量配置，不接受位置参数。')
  const c = await config()
  // Check the driver dependency before creating any browser process.
  await import('playwright-core')
  await withLaunchLock(c, async () => {
    Object.assign(c, await config())
    if (await portOpen(c.port)) {
      const browser = await connectManaged(c, false)
      await browser.close()
      await saveRecord(c, c.actualBinary)
      console.log(JSON.stringify({ reused: true, project: c.project, profile: c.profile, port: c.port, user_data_dir: c.dir }))
      return
    }
    // Changing a stopped instance's port is allowed; a live old instance is not duplicated.
    if (c.record?.port !== undefined && c.record.port !== c.port && await portOpen(c.record.port)) throw new Error('该profile的原调试端口仍在运行；复用原实例或先正常关闭它。')
    const binary = await findChrome()
    if (process.env.START_URL && !/^(https?:\/\/|about:blank$)/.test(process.env.START_URL)) throw new Error('START_URL仅支持http(s)或about:blank。')
    await launchChrome(binary, c, process.env.START_URL)
    let last
    const deadline = Date.now() + 15000
    while (Date.now() < deadline) {
      if (await portOpen(c.port)) {
        try {
          const browser = await connectManaged(c, false)
          await browser.close()
          await saveRecord(c, binary)
          console.log(JSON.stringify({ reused: false, project: c.project, profile: c.profile, port: c.port, user_data_dir: c.dir, binary }))
          return
        } catch (error) { last = error }
      }
      await sleep(500)
    }
    throw last || new Error('浏览器启动超时；检查测试窗口和资料目录占用情况。')
  })
} catch (error) {
  console.error(error.code === 'ERR_MODULE_NOT_FOUND' ? '先在本skill目录运行npm ci安装驱动依赖。' : safeError(error))
  process.exitCode = 1
}
