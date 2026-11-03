---
name: cdp-test-browser
description: 使用独立、持久的 Chrome 测试实例，通过 CDP 与 Playwright 验证网站、复用测试登录和截图。适用于真实浏览器 E2E、测试 Chrome/profile 配置及多项目隔离；单元测试或不需要浏览器的接口检查不必使用。
---

# 项目测试 Chrome

复用本项目的持久 profile；只有首次使用、干净环境、不同账号或并行测试需要隔离时才新建。
Chrome 程序目录、user-data-dir 和调试端口是三项独立配置，换 instance 不等于换 profile。
先遵循用户指定的浏览器和宿主工具限制；需要独立本地测试实例且允许CDP时使用本skill脚本，不绕过工具限制。

## 先识别，再启动

- 已有适用的测试实例就复用，不接管日常浏览器或其他项目的 profile。
- 优先使用已安装的 Chrome for Testing；`CHROME_BIN` 可指定可执行文件、`.app` 或程序目录。
  没有合适程序时再按任务需要安装，不能为了开新 instance 就覆盖旧安装或重置资料。
- 默认按 Git 项目根目录（非 Git 项目按当前目录）生成 profile 名和端口；需要跨机器/移动目录后
  保持名称时，固定一个 `PROJECT_ID`。同一项目的命令始终使用同一组配置。
- 同一个 profile 同时只运行一个浏览器进程。端口响应并不足以证明是正确实例；脚本通过
  CDP 核对实际 user-data-dir 和端口，不匹配就停止，不关闭占用者或删除 Chrome 的锁。

## 准备与使用

下文 `$K` 指本 skill 的安装目录，由实际位置确定；不写死某个用户、项目或缓存版本。
需要 Node.js 18+。首次在该 skill 目录运行 `npm ci`，只安装驱动，不下载浏览器。

```bash
# 在被测试项目目录执行；相同项目以后复用同一条配置。
PROJECT_ID=my-project START_URL=https://example.com "$K/scripts/start.sh"
PROJECT_ID=my-project node "$K/scripts/cdp.mjs" tabs
PROJECT_ID=my-project node "$K/scripts/cdp.mjs" status
PROJECT_ID=my-project node "$K/scripts/cdp.mjs" shot /tmp/my-project.png
```

已有正确实例时 `start.sh` 返回 `reused:true`。资料与实例记录默认在
`~/.cdp-test-browser/` 下，独立于 skill 与项目代码目录，重新安装 skill 不丢登录资料。
脚本不更改 Chrome 安装或系统默认浏览器；CDP 只连接本机回环地址。

详细配置、已有 profile 的迁移和并行使用见 [profile-strategy.md](references/profile-strategy.md)。
需要按钮操作、同源查询或自己的 Playwright 脚本时读 [browser-operations.md](references/browser-operations.md)。

## 登录与验证范围

- 真实账号登录交给用户在测试窗口完成，不读取日常浏览器资料或导出 cookie/token。
  若任务明确授权自动化专用测试账号，按该授权和隔离环境执行，不把测试凭据写进 skill。
- 页面操作、上传、删除和同源 POST 是否可执行，取决于当前任务授权；skill 不提供额外授权。
  查看现有业务数据无需制造一条真实业务记录；能用 mock 验证写入路径时保留实际副作用边界。
- 先看页面/可访问结构，再按明确的可见目标操作；点击后核对实际结果。截图与接口读回按任务选用。
- 多个标签页时使用 `tabs` 后明确指定 `CDP_TAB` 或唯一 `CDP_MATCH`，不猜哪个页面属于当前任务。

## 收尾

顺序测试只关闭自己新开的标签页并断开连接，保留供用户/后续会话复用的测试实例。
仅在用户要求关闭或本次临时隔离实例用完时，使用相同项目配置运行：

```bash
PROJECT_ID=my-project node "$K/scripts/stop.mjs"
```

`stop.mjs` 核对实例后正常关闭，让 profile 落盘；不会按端口号强杀未知进程。
资料、登录态、trace、截图和接口响应可能含业务数据，按任务范围存放与分享，勿提交进公共仓库。
