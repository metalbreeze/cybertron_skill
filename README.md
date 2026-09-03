# Claude Skills 合集

一组从真实项目实践中提炼出来的可复用 Claude Skills（`SKILL.md`）。它们不绑定某个具体技术栈或行业，
专注于把"踩过一次坑之后总结出的方法论"沉淀成可以被 Claude 在未来任何项目里直接触发、直接照做的
检查清单和流程。覆盖两大主题：**协作纪律**（如何诚实、清晰地和用户沟通——不糊弄、不静默截断用户数据、
不说内部黑话）与 **工程方法**（跨层一致性检查、从编码源而非渲染物读结构、项目文档体系搭建、
第三方 API 查阅法）。

## Skills 一览

| 分类 | Skill | 一句话用途 |
|---|---|---|
| 协作纪律 discipline | [no-fudging](skills/discipline/no-fudging/SKILL.md) | 没验证过的「字段/数据对应关系」不能用肯定语气冒充确定答案 |
| 协作纪律 discipline | [no-internal-jargon](skills/discipline/no-internal-jargon/SKILL.md) | 对用户说话用「名称 + 平台ID」，不说内部数据库序号/开发代号 |
| 协作纪律 discipline | [no-silent-truncation](skills/discipline/no-silent-truncation/SKILL.md) | 用户输入超限时要校验并提示，不能悄悄截断/钳制/丢弃 |
| 工程方法 engineering | [cross-layer-consistency](skills/engineering/cross-layer-consistency/SKILL.md) | 字段/联动要在 UI→前端payload→后端→第三方接口 四层都落实，缺一层就是 bug |
| 工程方法 engineering | [read-the-encoding](skills/engineering/read-the-encoding/SKILL.md) | 结构性事实只能从编码源（DOM/schema/源码）读，不能从渲染物/转写稿读 |
| 文档流程 docs-process | [organizing-project-docs](skills/docs-process/organizing-project-docs/SKILL.md) | 项目文档四分法：原文快照/内部理解/外部API参考/踩坑笔记 各自独立成文 |
| 文档流程 docs-process | [claude-md-entry-point](skills/docs-process/claude-md-entry-point/SKILL.md) | CLAUDE.md 精简作 AI 会话入口，详细状态放 docs/status.md，AI 私有记忆只留跨项目经验 |
| 集成对接 integration | [third-party-api-lookup](skills/integration/third-party-api-lookup/SKILL.md) | 查阅/逆向第三方开放平台 API，从 DOM 编码源抓字段层级，落库+回读验证 |

> 根目录的 `SKILL.md`（`cybertron-studio`）是一个独立的全栈脚手架 skill（React 前端 + Go 后端 +
> SQLite/MySQL/PostgreSQL），与上表 7 个方法论型 skill 性质不同，按需单独使用。

## 怎么用

- **单个引入**：把某个 skill 目录（例如 `skills/discipline/no-fudging/`）整个拷贝进
  `~/.claude/skills/`（全局生效）或项目内 `.claude/skills/`（仅该项目生效），Claude Code 会根据
  `SKILL.md` 里的 `description` 自动匹配触发时机。
- **整库参考**：也可以把整个仓库克隆下来，当成一份"方法论清单"直接查阅，按需摘取段落写进自己的
  项目规范里。
- 每个 `SKILL.md` 都是自包含的：一句话规则 + 真实案例 + 该怎么做的对照表 + 红旗自查清单，可以直接
  读、直接照做，不需要额外上下文。
