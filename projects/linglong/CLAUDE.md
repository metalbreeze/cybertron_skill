# 进口拼布材料商城（linglong）项目入口

B2B 内部订购商城（不含支付，现金年结），对接管家婆 ERP。
本地目录 `/Users/shu/workspace/linglong/`，线上 https://chulyfabrics.com 。
**该目录本身不是 git repo**，靠文件夹整体拷贝 + 本存档搬迁。

## 技术栈 / 拓扑

React 19 + TS + Vite + TanStack Query + Zustand + Tailwind ／ Go(Gin+GORM+SQLite)。
`client → 443 nginx(SSL termination) → 127.0.0.1:8081 linglong-backend`，
静态站点 `/opt/linglong/dist`，服务器 SSH 别名 `wagon`（旧的 `silver`/`show` 已迁出）。
**8081 而非 8080**：wagon 上 8080 被另一个项目占用。

## 硬约束 / 陷阱（动代码前必读）

- **`c.SaveUploadedFile(f, dst)` 必须显式传 `0o755`**。Gin 会无条件 `os.Chmod(目标目录, perm)`，
  缺省 `0o750` → nginx(`www-data`) 失去 x 位 → **整个 uploads 目录 403**。
  三个调用点都在往 `uploads/` 根写，任意一次 SKU 图上传就能锁死全站图床。
- **字段名以数字结尾必须显式 `gorm:"column:"`**。GORM 的 snake_case 不在结尾数字前加下划线：
  `WholesalePrice1` → `wholesale_price1`（不是 `wholesale_price_1`）。曾导致批发价静默全 NULL +
  SKU 搜索 500 + 编辑商品白屏 + 绑定看似全丢。
- **nginx `client_max_body_size` 缺省 1M**，图库 zip 上传必须放开（线上 220M，后端 zip 上限 200M）。
  没放开时 413 由 nginx 直接返回 HTML，后端日志一片空白，前端 `data.error` 是 undefined。
- **zip 文件名的 UTF-8 标志位（bit 11）单向可信**：Windows 资源管理器和 macOS Finder/ditto
  都不置位，但字节一个是 GBK 一个是 UTF-8。必须 `!utf8.ValidString(name)` 才回退 GBK。
- **前端部署必须 `rsync -az --delete`，不能 `scp`**：scp 从不删远端多余文件，
  Vite 带 hash 的资源会堆积（曾攒到 35 个历史 CSS，把"字体不生效"的排查带偏很久）。
- **ERP 接口 timestamp 必须是 CST(UTC+8) 的 `2006-01-02 15:04:05`**，不是 UnixMilli。
- **ERP 同步永不覆盖 price**；`Product.stock` 是 `float64`（ERP 返回小数）。
- 未经证实的 ERP 方法名**不许试探性调用**（配额 + 副作用），先问用户。

## 凭据（不在本仓库，本仓库是 public）

`ADMIN_PASSWORD` / `JWT_SECRET` / `WEBHOOK_SECRET` / `ERP_APP_KEY` / `ERP_APP_SECRET` /
`ERP_SIGN_KEY` 全部只在 **wagon 的 `/etc/systemd/system/linglong-backend.service`**，
以及本机 `.claude/hooks/redact.local.txt`（gitignore + chmod 600，用于会话归档脱敏）。

⚠️ 项目本地的 `CLAUDE.md` 目前仍**明文列着这些值**。`git init` + 推远端之前必须先换成占位符。

## 索引

- **详版状态/待办/决策记录**：`projects/linglong/status.md`（本仓库）
- 项目内文档索引：`docs/README.md`；踩坑笔记 `docs/gotchas.md`；换机器 runbook `docs/PORTING.md`
- AI 上下文落盘方式（skills/记忆/会话归档）：`.claude/README.md`
- 会话归档：`docs/sessions/`（SessionEnd hook 自动写；`.jsonl` 和 `.md` 都 gitignore）

## 常用命令

```bash
# 后端：交叉编译 → 停服务（防 Text file busy）→ 上传 → 起服务
cd backend && GOOS=linux GOARCH=amd64 go build -o linglong-server .
ssh wagon 'sudo systemctl stop linglong-backend'
scp backend/linglong-server wagon:/opt/linglong/linglong-backend
ssh wagon 'sudo systemctl start linglong-backend && systemctl is-active linglong-backend'

# 前端：必须 --delete
cd frontend && npm run build && rsync -az --delete dist/ wagon:/opt/linglong/dist/

ssh wagon 'sudo journalctl -u linglong-backend --no-pager -n 50'
```
