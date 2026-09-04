# 进口拼布材料商城（linglong）项目状态

> 最后更新：2026-09-05（本次会话结束时存档）。
> 本文件是详版状态；AI 会话入口见同目录 [CLAUDE.md](CLAUDE.md)
> （应同步放在项目根 `/Users/shu/workspace/linglong/CLAUDE.md`）。

## 项目一句话

面向公司客户的 B2B 订购商城，不含在线支付（现金年结）。管理员从管家婆 ERP 同步 SKU、
在其上手工组合成"商品"、管理用户与订单；订单经管理员审核后推 ERP 销售单。
用户不能自注册。本地目录 `/Users/shu/workspace/linglong/`（**不是 git repo**），
线上 https://chulyfabrics.com 。

---

## 一、当前阶段

已上线可用。本次会话（跨多轮，约 200+ 条用户指令）完成了品牌改版 + 订单审核流程 +
图库上传三条主线，并做完第二次服务器迁移。

| 主线 | 状态 |
|---|---|
| ERP 对接（商品同步 / 库存同步 / 推销售单 / OAuth） | ✅ 已上线 |
| 商品（Goods）体系 + 图片库 | ✅ 已上线 |
| 订单审核流程（`awaiting_review`） | ✅ 本次会话完成 |
| 品牌改版（Moda 配色 / 亚麻底纹 / 拼布 icon） | ✅ 本次会话完成 |
| 图库上传（图片/视频/zip，中文名↔ASCII 路径） | ✅ 本次会话完成，**待用户在 UI 上做最终验收** |
| 服务器迁移 show → silver → wagon | ✅ 完成 |

---

## 二、订单状态模型（本次会话收敛过）

订单**不再自动推 ERP**，先进审核队列。

| 状态 | 中文 | 谁写 | 触发 |
|---|---|---|---|
| `awaiting_review` | 待审核 | `CreateOrder` | 用户提交订单的初始状态 |
| `pending` | 待发货 | `AdminApproveOrder` | 管理员点「通过」→ **同步**调 `erp.saleorder.add`，推成功才落 |
| `partial_shipped` | 部分发货 | `webhook.go` | ERP 推送发货消息，部分明细已发 |
| `shipped` | 已发货 | `webhook.go` | ERP 推送发货消息，明细发完 |
| `cancelled` | 已取消 | `AdminRejectOrder` / `AdminCloseOrder` | 审核取消；或对 `pending`/`partial_shipped` 关闭 |

- 「关闭」只对 `pending` / `partial_shipped` 开放，**不通知 ERP**（线下沟通后的收尾）。
- 历史上的 `confirmed` / `processing` / `delivered` 查过数据库和日志**从未出现过**，已删除，别加回来。
- `GET /api/admin/order-items-stats` 汇总 `awaiting_review` + `pending` 的未发货量
  （= 将要从 ERP 扣掉的量），界面按**负数**显示，`cancelled` 不计入。

## 三、权限约定

- 创建 `role=admin` 账号：**只有登录名字面为 `admin` 的主账号可以**（`handlers/users.go`）。
  其他管理员只能建普通用户。
- 用户/管理员均可自助改密码：客户端右上角、手机汉堡菜单、管理后台侧栏。
- 客户登录与管理员登录是**两个不同 URL**（`/login` 与 `/admin/login`）；
  401 拦截器要按 `pathname.startsWith('/admin')` 决定跳哪个，且**登录请求本身失败时不跳转**
  （否则管理员登录失败会被弹到客户登录页）。

## 四、图片库

- 索引 `uploads/image_map.json`：**key = 中文展示名**，`path`/`og` = ASCII 路径，`type` = image|video。
  图片视频**共用一个图床**，前端靠 `type` 打 🎬 角标区分，只有一个「+添加」入口。
- 入库两条路：`python tools/convert_images.py` 批量导入；`POST /api/admin/library/upload` 界面上传。
- 上传时中文名经 `asciiSlug()`（go-pinyin）转拼音落盘：`樱花粉.jpg` → `ying-hua-fen.jpg`，
  索引仍以中文为 key ⇒ **用户看中文、URL 是 ASCII**。
- 上限：单文件 20MB / zip 200MB / 包内 500 条目；防 Zip Slip 路径穿越；`io.LimitReader`；
  索引读-改-写用 `sync.Mutex` + 临时文件 rename 原子落盘。
- 跳过 `__MACOSX/`、`._*`、`.DS_Store`、`Thumbs.db`。

## 五、踩坑记录

完整四段式（现象/官方怎么说/实测/我们怎么处理）在项目内 `docs/gotchas.md`。摘要：

| # | 坑 | 一句话 |
|---|---|---|
| G-01 | Gin `SaveUploadedFile` chmod 目标目录 | 缺省 0o750 → nginx 读不到 → 全站 uploads 403。必须显式传 `0o755` |
| G-02 | GORM 结尾数字不加下划线 | `WholesalePrice1` → `wholesale_price1`。批发价静默全 NULL + 搜索 500 + 白屏 |
| G-03 | nginx `client_max_body_size` 缺省 1M | 2.2MB 的 zip 在到达后端前就 413，后端日志空白 |
| G-04 | zip UTF-8 标志位单向可信 | Windows 和 macOS 都不置位但字节相反。已回写进 skill `read-the-encoding` |
| G-05 | 中文展示名 / ASCII 落盘名 | 复用 `image_map.json` 既有 key 约定，不需要新表 |
| G-06 | `scp -r` 从不删文件 | 35 个残留 CSS 让"字体不生效"排查跑偏。改 `rsync -az --delete` |
| G-07 | 会话归档脱敏正则 0 命中 | 真实归档：通用正则 0，项目凭据 89 处。已回写进 skill `portable-claude-project` |

## 六、决策记录

- **状态收敛**：先查数据库和日志确认 `confirmed`/`processing`/`delivered` 从未出现，才删。
  没有凭"看着没用"就删。
- **绑定模式**：三种模式（单SKU/一维/二维）代码保留，但**界面隐藏选择器，默认单 SKU**。
- **「库存统计」页**：先做出来，后按用户要求改名并**从导航隐藏**（路由还在）。
- **字体**：站酷快乐体 → 江城圆体 → **全部回退**，标题与正文统一用系统字体栈。
  中途为查"字体不生效"才发现 G-06 的 scp 残留问题。
- **配色**：改为 Moda Fabrics 风格（teal `#12A89D` + navy `#003249`），替换原来的宝蓝色系。
- **背景**：亚麻布底纹只用于登录页和抬头，内容区保持白色。2.3MB PNG → 14KB 平铺 JPEG。
- **对用户措辞**：一律「名称（平台ID）」，不说内部 db id。
- **缺工具先问**：引入 `golang.org/x/image` 和 `go-pinyin` 之前都先报给用户决定，没有自作主张装。

## 七、待办

- [ ] **图库 zip 上传的 UI 端到端验收**（本次会话未完成的唯一一项）。
      两个阻塞原因（nginx 413、macOS UTF-8 标志位）都已修复并部署，
      15MB zip 实测完整送达（返回 401 缺 token，而非 413），macOS 包和 Windows GBK 包
      都在真实端点上解出正确中文名。但**没有做成认证态的完整上传**——
      systemd 里的 `ADMIN_PASSWORD` 与数据库已不一致（用户改过密码），而我不猜密码。
- [ ] `ERP_DEFAULT_BTYPE_ID` 仍是 `0`，需从 ERP 查出真实往来单位 ID
- [ ] `JWT_SECRET` 仍是默认值，建议换随机强口令
- [ ] wagon 上给 chulyfabrics.com 配 acme.sh 自动续期（证书是从旧机 silver 拷来的，无自动续期）
- [ ] `git init` + 推远端前，先把项目内 `CLAUDE.md` 的明文凭据换成占位符
- [ ] ③ 外部 API 参考尚未按"一接口一篇 + 真实 request/response 样本"落盘
- [ ] 管理后台残余的 `blue-*` 强调色未全部换成 teal 品牌色（已提议，用户未要求）

## 八、换机器接续

1. clone 本仓库，把 `projects/linglong/CLAUDE.md` 拷到项目根
2. 项目文件夹整体拷贝（**注意 `docs/sessions/` 和 `.claude/hooks/redact.local.txt` 不进 git，靠物理拷贝**）
3. 按项目内 `docs/PORTING.md` 补齐凭据、SSH key、证书
4. `./.claude/sync-skills.sh` 刷新方法论 skills
