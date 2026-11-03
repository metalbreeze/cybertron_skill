# 程序、profile 与实例的选择

## 选择顺序

1. 检查项目已有的测试配置和运行实例，确认用途、账号环境、profile 与端口。
2. 同项目顺序测试优先复用。开一个新标签页不需要新 profile。
3. 无项目专属资料，或明确需要干净状态、另一账号、并行隔离时，再选新 profile。
4. 一份 profile 同时只交给一个进程。其他项目/日常浏览的目录不能只因“已经登录”就自动复用。

Chrome 程序可共用，profile 目录和端口各自隔离。安装程序所在目录不是 profile：
一个程序可以启动多个独立 user-data-dir，每个 user-data-dir 内又通常有 `Default` 等 Chrome 内部目录。

## 配置

| 配置 | 用途 |
|---|---|
| `PROJECT_ID` | 项目标识；默认项目根目录名加绝对路径摘要。移动目录/跨机器需稳定命名时显式指定 |
| `PROFILE` | 同项目内的资料名；默认等于项目标识。并行实例或另一个账号用不同名称 |
| `PORT` / `CDP_PORT` | 回环调试端口；默认使用实例记录，首次按profile名生成。两个变量不能冲突 |
| `CHROME_BIN` | 浏览器可执行文件、macOS `.app` 或已解压程序目录；首次启动/关闭后重启时使用 |
| `START_URL` | 新启动实例打开的页面，默认about:blank；复用实例时不导航现有标签页 |
| `CDP_TEST_BROWSER_HOME` | 本机运行资料根目录，默认 `~/.cdp-test-browser`；放在项目/git目录外 |

默认资料在 `profiles/<profile>`，实例记录在 `instances/<profile>.json`。
记录保存项目归属、端口及程序路径，不保存凭据。资料目录新建权限0700、记录0600。
默认端口若被不匹配实例占用，明确选一个空闲 `PORT` 重试；不关闭占用者、不悄悄换一个空 profile。

```bash
# 两个项目分别复用自己的资料；不绑定某个网站。
PROJECT_ID=storefront START_URL=https://shop.example "$K/scripts/start.sh"
PROJECT_ID=admin-console START_URL=https://admin.example "$K/scripts/start.sh"

# 同一项目确实需要并行时，资料名和端口都隔离。
PROJECT_ID=storefront PROFILE=storefront-worker2 PORT=9444 "$K/scripts/start.sh"
PROJECT_ID=storefront PROFILE=storefront-worker2 node "$K/scripts/cdp.mjs" status
```

## 已有资料与旧启动器

先确认旧资料是否确属该项目，并记录实际user-data-dir与占用情况。
已在此资料根目录中的旧测试profile可显式指定 `PROFILE` 继续使用。
若旧实例无法通过CDP查询启动参数（例如没有`--enable-automation`），脚本不会只认端口：
等原测试工作完成、正常关闭旧实例后，用同一PROFILE重新启动并登记，登录资料仍然保留。
不要为绕过核验关闭用户其他窗口、删除Singleton锁或重新创建一份空资料。

如果用户明确要求复制已登录的测试资料，只在源实例正常关闭后复制，保留私有权限，
排除Singleton锁、DevToolsActivePort及缓存，并为目标实例建立自己的记录。
默认不克隆资料；尤其不从日常浏览器复制整份个人登录环境。

## 支持与限制

启动器检测常见Playwright缓存与本机Chrome安装；显式CHROME_BIN优先且无效时不会静默回退。
macOS使用`open -na`启动，其他平台使用脱离父进程的独立进程。共享代码使用Node APIs；
真实浏览器验证以本次运行的平台为准，不能把单个平台的通过当成全部平台已验证。
系统安全提示、权限或登录阻塞按实际工具与用户授权处理，不禁用浏览器安全机制来绕过。

修改脚本后，在skill目录运行`npm test`检查配置与并发启动约束；需要真实Chrome验证时运行
`RUN_CHROME_TEST=1 CHROME_BIN=/path/to/chrome npm test`。
后者只访问本地fixture，用临时无登录profile检查复用、隔离、重启持久化和误关保护，结束后正常关闭自己创建的实例。
