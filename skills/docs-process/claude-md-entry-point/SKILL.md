---
name: claude-md-entry-point
description: Use when 需要让 AI 助手在新会话里"自动接续"上次的项目进度/约束/待办；出现这些信号时：用户说"保存 session / info"、"下次继续"、"新会话怎么接上"、"记录进度"；用户问"CLAUDE.md 里该写什么 / 项目状态放哪 Claude 才能读到 / ~/.claude 的 memory 和 repo 里的文档怎么分工"；一份文档越写越长导致每次会话开头都被塞满不相关的历史；准备把项目状态元数据写进 `~/.claude/**/memory/` 却发现换台机器 / 用另一个 CLI 打开就丢了；准备把所有状态都塞进 CLAUDE.md 使其膨胀成几百行。
---

# CLAUDE.md 作为入口：分层项目状态文档

**一句话规则：`CLAUDE.md` 精简作入口(几十行内),只写"下一次会话最必须知道的",详细内容拆到 `docs/` 里由它索引;项目状态跟着 repo 走(git 追踪、跨机器、跨 CLI/desktop),AI 私有记忆(`~/.claude/**/memory/`)只留跨项目通用的经验教训。**

## 为什么这么分

一个反例:把整份 200 行的项目状态塞进 `CLAUDE.md`。后果:
- 每开一次新会话都往上下文里塞进 200 行,大部分和当前任务无关 → 上下文预算浪费,长会话更容易触发压缩;
- 状态改动频繁 → `CLAUDE.md` 频繁大 diff,PR review 噪音大;
- 别的协作者(人)也要读 `CLAUDE.md`,发现全是 AI 视角的进度记录反而看不到项目本身的关键约束。

另一个反例:全部写进 `~/.claude/projects/<encoded-path>/memory/`。后果:
- 换台机器 clone 下来 → 全丢;
- 用另一个客户端(比如 Codex、其他 CLI)打开 → 全丢;
- 别人协作 → 看不到,不知道有;
- 只有 Claude Code 一家能读。

分层方案兼得两者:CLAUDE.md 保证"这台机器/这个客户端/这次会话"能自动加载;详细文档保证"跟着 repo 走、别人也能看、AI 需要时能读到";`~/.claude` 只留 AI 私有的、跨项目通用的经验。

## 三层布局

```
repo-root/
├── CLAUDE.md                # 精简入口, ≤ 50 行, 每次会话自动加载
├── docs/
│   ├── README.md            # 面向人的完整文档索引 (见 [[organizing-project-docs]])
│   ├── status.md            # 详细当前状态: 阶段/决策/待办/未决问题
│   └── ...                  # 客户原文 / 内部理解 / API 参考 / Gotchas (四分法)
└── ...
~/.claude/projects/<encoded-path>/memory/
├── MEMORY.md                # 索引
└── feedback_*.md            # 跨项目通用的协作经验/教训(不放具体项目状态)
```

## `CLAUDE.md` 该写什么(≤ 50 行)

必写:
1. **项目一句话是什么** —— 一行,足以让第一次进来的 AI 明白语境
2. **当前阶段** —— 一行,如 "所有 20 个 task 已完成,进入验证/微调阶段"
3. **硬约束 / 陷阱** —— 3–5 条,例如"`SCREENING_DATE` 是占位值、`X` 未核对"这类会影响结论正确性的
4. **入口路径索引** —— 指向 `docs/README.md`(全量索引)、`docs/status.md`(详细状态)、以及 3-5 个最常用的具体文件
5. **常用命令** —— `pytest` / 执行 notebook / build 等 3-5 条

不写(挪去 `docs/status.md`):
- 详细的分阶段进度、每个 task 的 commit SHA
- 详细的统计结果表(除非只有一张关键结论表)
- 完整的待办列表(留 3-5 条最紧的即可)
- 决策历史 / 变更日志

不写(挪去 `~/.claude/**/memory/` 的 feedback 类):
- 跨项目通用的协作经验("下次遇到 X 时该怎样")
- 用户偏好、协作风格
- 从 bug 里学到的教训

## `docs/status.md` 该写什么(可以详细)

- **项目全貌**:数据、目标、当前范围
- **完整决策记录**:关键 pivot 何时发生、为什么、影响哪些代码
- **完整待办**:分类、优先级、需要谁提供什么信息才能继续
- **完整统计结果**(如适用):数值、置信区间、解读
- **已知问题清单**:每条一段 —— 现象、影响、修复难度、需谁定
- **变更日志**:按日期倒序,一句话一次

跟着 repo,别人 clone 也能读。想让哪些细节被 AI 用起来,在 `CLAUDE.md` 里加一句"详见 `docs/status.md#XXX`"即可。

## `~/.claude/**/memory/` 只留什么

按 auto-memory 的 4 类:
- **user**: 用户角色/偏好/知识(跨项目)
- **feedback**: 从会话里学到的协作经验(跨项目)
- **project**: 只留**指针**,不放具体状态 —— 例如 `project_X.md` 里就一句"详见该项目 repo 的 `CLAUDE.md` 和 `docs/status.md`"
- **reference**: 指向外部系统(Linear/Grafana 等)的资源位置

**具体项目的进度、待办、决策不放这里** —— 那些必须跟 repo。

## 何时更新哪层

| 触发 | 更新 CLAUDE.md | 更新 docs/status.md | 更新 ~/.claude memory |
|---|---|---|---|
| 完成一个 task | ❌ | ✅ (进度 / 变更日志) | ❌ |
| 硬约束/占位值出现 | ✅ | ✅ (加入已知问题) | ❌ |
| 项目阶段大切换 | ✅ | ✅ | ❌ |
| 学到一条跨项目的经验 | ❌ | ❌ | ✅ (feedback) |
| 关键决策/pivot | ✅ (一句话) | ✅ (完整记录) | ❌ |

## 危险信号自查

- `CLAUDE.md` 超过 80 行 → 挪东西去 `docs/status.md`
- 想把项目状态写进 `~/.claude/**/memory/project_*.md` → 停,应该写进 repo 的 `docs/status.md`,memory 只放指针
- 换台机器 clone 下来 AI 就"失忆" → 说明关键状态没放 repo
- `CLAUDE.md` 里写"上次我们..."/"用户说..." → 挪去 `docs/status.md` 的决策记录 或 `~/.claude` 的 feedback
- `docs/status.md` 存在但 `CLAUDE.md` 不引用它 → AI 不会自动读,加索引
- 一份跨项目的经验写进具体项目的 `docs/` → 挪到 `~/.claude/**/memory/feedback_*.md`
- 新会话开头 AI 不知道最紧的待办是什么 → `CLAUDE.md` 里"当前阶段"或"硬约束"漏了

## 与 [[organizing-project-docs]] 的分工

- `organizing-project-docs` 讲 **`docs/` 内部怎么分类**(原文/理解/API/Gotchas 四分法),偏"人 + AI 都用的知识库怎么组织"
- 本 skill 讲 **AI 会话入口怎么设计**(CLAUDE.md 精简 + 分层索引),偏"AI 每次开局怎么最快接上"
- 两者叠加使用:`CLAUDE.md` 里指向 `docs/README.md`(由 organizing-project-docs 规范其内部结构),`docs/status.md` 作为独立一份和四分法并列 —— 因为 status 是"我们做到哪了 / 还欠什么",跟"客户说什么 / 官方说什么 / 我们理解什么"是另一个维度。
