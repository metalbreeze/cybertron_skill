# 操作当前项目的测试浏览器

同一项目始终带相同的PROJECT_ID/PROFILE配置。`PORT`或`CDP_PORT`若显式指定，应与实例记录一致。

| 命令 | 作用 |
|---|---|
| `tabs` | 列出序号、去掉查询参数/fragment后的地址及标题 |
| `status` | 显示当前项目、profile、端口及选中标签页 |
| `new <url>` | 新开自己的标签页，返回序号；不动其他标签页 |
| `goto <url>` | 在已选中的任务页导航，输出页面文字 |
| `text` | 读取页面文字；较长时明确提示输出范围，FULL=1显示完整内容 |
| `shot <file.png>` | 截图，路径由任务决定 |
| `click <按钮名>` | 点击唯一、可见且可访问名称精确匹配的按钮；有歧义时失败 |
| `get <同源路径>` | 借当前测试登录读取接口 |
| `post <同源路径> '<JSON>'` | 按任务授权调用接口；不会因是测试浏览器就自动获得写入许可 |
| `wait-leave <URL片段> [秒]` | 有界等待1–60秒，例如等待用户登录；未完成时可以再次等待 |

例如：

```bash
PROJECT_ID=my-project node "$K/scripts/cdp.mjs" new https://example.com/dashboard
PROJECT_ID=my-project CDP_TAB=1 node "$K/scripts/cdp.mjs" text
PROJECT_ID=my-project CDP_MATCH=/dashboard node "$K/scripts/cdp.mjs" shot /tmp/dashboard.png
```

多个页面匹配时不会默认操作第一个。需要更细的locator或iframe操作时写Playwright脚本，
先读取可访问结构/页面再决定定位器；处理弹窗和动画时，以实际可见状态为依据。
默认上下文带已有测试登录，使用 `browser.contexts()[0]`；不要另建无登录的context来冒充验证。
通过helper连接时会验证资料目录，推荐自定义脚本也复用它：

```js
// 将此示例保存在skill目录外；路径来自当前安装位置。
import { pathToFileURL } from 'node:url'
const runtime = await import(pathToFileURL(`${process.env.SKILL_DIR}/scripts/runtime.mjs`).href)
const browser = await runtime.connectManaged(await runtime.config())
const page = await browser.contexts()[0].newPage()
try {
  await page.goto('https://example.com/dashboard')
  await page.bringToFront() // 后台窗口/遮挡可能让组件动画停住。
  // 读取页面，按当前任务验证。
} finally {
  await page.close()    // 只关自己新开的标签。
  await browser.close() // connectOverCDP连接在此只断开，浏览器仍在。
}
```

不要读取cookie数据库、导出登录态、关闭他人标签页或把含业务数据的工件随skill发布。
CLI默认省略URL查询参数及fragment，但这不是完整的数据脱敏器；分享截图/响应前仍需核对任务范围。
同源查询不跟随重定向，单次请求最多15秒，避免把请求转发到未选定的网站或无限等待。

API依据：[Playwright connectOverCDP](https://playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp)、
[CDP Browser.getBrowserCommandLine](https://chromedevtools.github.io/devtools-protocol/tot/Browser/#method-getBrowserCommandLine)、
[Node detached进程](https://nodejs.org/api/child_process.html#optionsdetached)。
