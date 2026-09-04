---
name: portable-claude-project
description: Use when 要让一个项目"整个文件夹搬走/换台机器 clone 下来"之后 AI 助手仍然完整可用；出现这些信号时：用户说"迁移到其他机器"、"换台电脑继续"、"整个项目挪过去"、"别的 agent / claude cli 也能用"；用户问"session 记录存哪了 / 怎么导出 / 会不会丢"、"~/.claude 里的东西怎么跟着项目走"、"关闭 session 的时候自动保存"；用户想把 `/export` 做成自动触发；用户准备把 memory / skills / 会话历史留在 `~/.claude/` 就以为万事大吉。
---

# 让项目自带全部上下文：可搬迁的 Claude 项目

**一句话规则：凡是"换台机器就必须还在"的东西，都必须落在 repo 里；`~/.claude/` 只放跨项目通用的私有记忆。会话记录是唯一没有配置项能自动落进 repo 的，必须用 `SessionEnd` hook 主动搬 —— 因为 `/export` 是交互命令，hook 调不动它。**

## 默认状态下什么会丢

新手直觉是"配好 `CLAUDE.md` 就行了"。实际清点一个真实项目，搬走之后丢的是这些：

| 东西 | 默认位置 | 跟着 repo 走？ | 补救 |
|---|---|---|---|
| 源码 / `CLAUDE.md` / `.claude/**` | repo 内 | ✅ | 无需处理 |
| **会话记录 `.jsonl`** | `~/.claude/projects/<编码路径>/` | ❌ **无任何配置项可改** | `SessionEnd` hook（见下） |
| auto memory | `~/.claude/projects/<编码路径>/memory/` | ❌ | `autoMemoryDirectory` 设置项 |
| 个人 skills | `~/.claude/skills/` | ❌ | 拷进 repo 的 `.claude/skills/` |
| 全局 `CLAUDE.md` | `~/.claude/CLAUDE.md` | ❌ | 该项目用得上的段落抄进项目 `CLAUDE.md` |
| 插件 | `~/.claude/plugins/` | ⚠️ 只带声明 | `.claude/settings.json` 里写 `enabledPlugins`，新机器重新拉取 |
| 密钥 / SSH key | 机器上、服务器上 | ❌ **且不该进 git** | 单独写 `docs/PORTING.md` runbook 记位置 |

关键认知：**`~/.claude/projects/<编码路径>/` 这个目录名是绝对路径编码出来的**。项目在新机器上换了路径，这个目录就对不上了 —— 即使手工拷贝也要重命名。所以正解是压根别依赖它。

## 会话记录：为什么必须用 hook，不能用 `/export`

用户常见的想法是"关 session 的时候自动跑一下 `/export docs/session-YYYY-MM-DD.txt`"。**这条路走不通**，两个独立原因：

1. **hook 跑的是 shell 命令，驱动不了交互式 UI。** `/export` 是 slash command，只有人在会话里敲才有效。hook 能做的是 command / HTTP / MCP / subagent，没有"替我敲一个 slash command"这一项。
2. **skill 自带的 hook 只在该 skill 被激活期间加载。** 想靠"把 hook 写进 SKILL.md frontmatter"来保证会话结束时触发是不可靠的 —— 会话结束时那个 skill 未必是激活状态。

正解：**`SessionEnd` hook 直接搬运 `.jsonl`，自己渲染可读版**。`SessionEnd` 的 stdin 会收到 JSON，里面有 `transcript_path`，指向那个 `.jsonl` 的完整路径。

## 落地：三个文件

### 1. `.claude/settings.json`（提交进 git）

```json
{
  "autoMemoryDirectory": ".claude/memory",
  "hooks": {
    "SessionEnd": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/archive-session.sh",
            "timeout": 120,
            "statusMessage": "Archiving session transcript into docs/sessions/"
          }
        ]
      }
    ]
  }
}
```

`matcher` 留空 = 所有结束方式都触发（`/clear`、`/quit`、Ctrl+C、关标签页）。填 `clear`/`resume`/`logout`/`prompt_input_exit`/`other` 可只匹配其一。

### 2. `.claude/hooks/archive-session.sh`

```bash
#!/usr/bin/env bash
set -uo pipefail

PAYLOAD=$(cat)
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
OUT_DIR="$PROJECT_DIR/docs/sessions"
RENDERER="$PROJECT_DIR/.claude/hooks/render_transcript.py"

read -r TRANSCRIPT SESSION_ID <<EOF
$(printf '%s' "$PAYLOAD" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
    print(d.get("transcript_path", "-"), d.get("session_id", "-"))
except Exception:
    print("- -")
' 2>/dev/null)
EOF

[ "${TRANSCRIPT:--}" = "-" ] && exit 0
[ -f "$TRANSCRIPT" ] || exit 0

SHORT_ID="${SESSION_ID:0:8}"
[ "${SHORT_ID:--}" = "-" ] && SHORT_ID="unknown"
BASE="$OUT_DIR/$(date +%Y-%m-%d)-${SHORT_ID}"

mkdir -p "$OUT_DIR" || exit 0
cp "$TRANSCRIPT" "${BASE}.jsonl" 2>/dev/null || exit 0
[ -f "$RENDERER" ] && python3 "$RENDERER" "${BASE}.jsonl" "${BASE}.md" 2>/dev/null
exit 0
```

**每条错误路径都 `exit 0`** —— hook 挂掉不该拖累会话正常结束。写完记得 `chmod +x`。

### 3. `.claude/hooks/render_transcript.py`

`.jsonl` 是内部格式（版本间会变、单个会话能到几 MB），不适合直接当归档读物。渲染一份 Markdown：

- 只保留 `type` 为 `user` / `assistant` 的记录，跳过 `custom-title`/`mode`/`queue-operation` 等元数据行
- `assistant` 的 `message.content` 是 block 数组，`type` 有 `text`/`thinking`/`tool_use`/`tool_result`
- **丢掉 `thinking`**（内部推理不进归档），**截断 `tool_result`**（否则一条几 MB）
- 整个解析要防御式写：格式变了就跳过，不要抛异常

实测一个 3.0 MB 的 `.jsonl` 渲染出来 148 KB，560 轮对话，可读。

### git 策略

```gitignore
# 可读版进 git，原始 .jsonl 留本地（几 MB/次，且是内部格式）
docs/sessions/*.jsonl
```

`.md` 提交 → clone 到新机器能读历史；`.jsonl` 不提交 → repo 不会几十次会话就膨胀到 GB。整个文件夹**物理搬移**时 `.jsonl` 照样跟着走，两种搬迁方式都覆盖到了。

## 个人 skills 的搬迁陷阱

把 `~/.claude/skills/foo/` 拷进 repo 的 `.claude/skills/foo/` 时注意优先级：

```
enterprise  >  personal (~/.claude/skills/)  >  project (.claude/skills/)  >  bundled
```

**personal 压过 project。** 所以在原机器上"拷一份到项目里"不会生效（个人版仍然赢），要验证得去新机器、或者用 `skillOverrides` 把个人版关掉：

```json
{ "skillOverrides": { "foo": "off" } }
```

顺带一个好处：project skills 在 Cowork / cloud session 里能用，personal skills 不能 —— 搬进 repo 等于顺手把云端场景也解决了。

## 不能进 git 的：写 runbook

密钥、SSH key、服务器上的 systemd 配置，**不要为了"可搬迁"就塞进 repo**。写一份 `docs/PORTING.md` 记清楚"这些东西在哪、新机器上要怎么补"：

```markdown
## 换机器要手工补的
- `OPENAI_API_KEY` → 生产机 `/etc/systemd/system/<svc>.service`（chmod 600）
- 部署用 SSH key → `~/.ssh/<name>`，从密码管理器取
- 全局 `~/.claude/CLAUDE.md` → 从旧机器拷，或看本文件末尾摘录
```

## ⚠️ 会话归档会泄密 —— 这是本 skill 最容易翻车的地方

**会话记录里有凭据。** 用户粘贴过的 key、API 回给你的 token、curl 命令里的
`Authorization: Bearer ...`，全都逐字躺在 `.jsonl` 里。把归档提交进 git =
把这些凭据提交进 git。

真实案例：第一次装完这套机制、第一次提交归档，GitHub push protection 直接拒绝：

```
remote:   —— OpenAI API Key ————————————————————————
remote:    locations:
remote:      - path: docs/sessions/2026-09-04-90e71024.md:634
```

扫一遍那份归档，实际有 **1 个 OpenAI key + 10 个 64-hex bearer token**。
GitHub 只认得出第一个 —— 另外 10 个是自建服务的 token，没有任何平台会替你拦。

### 两道防线，都要上

**第一道：渲染时脱敏。** `render_transcript.py` 里加正则替换，覆盖常见形状：

```python
SECRET_PATTERNS = [
    (re.compile(r"sk-(?:proj-|ant-)?[A-Za-z0-9_\-]{20,}"), "sk-***REDACTED***"),
    (re.compile(r"gh[pousr]_[A-Za-z0-9]{20,}"),             "ghp_***REDACTED***"),
    (re.compile(r"AKIA[0-9A-Z]{16}"),                       "AKIA***REDACTED***"),
    (re.compile(r"(?i)(bearer\s+)[A-Za-z0-9._\-]{20,}"),   r"\1***REDACTED***"),
    (re.compile(r"\b[0-9a-f]{64}\b"),                      "***REDACTED-64HEX***"),
    (re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----", re.S),
     "-----BEGIN PRIVATE KEY-----***REDACTED***-----END PRIVATE KEY-----"),
]
```

**但这是正则匹配，不是保证。** 自建服务的 token 格式千奇百怪，形状对不上就漏。

**第二道：public repo 直接别提交归档。**

```gitignore
docs/sessions/*.jsonl
docs/sessions/*.md      # public repo 加这行；private repo 可以去掉
```

代价很小：归档文件仍然写在磁盘上，**整个文件夹拷走时照样跟着走** ——
只有 `git clone` 这一条路拿不到。而"搬迁项目"这个原始需求，物理搬移是主场景。

### 装完必做的验证

提交前扫一遍，别指望平台兜底：

```bash
python3 - <<'EOF'
import re, pathlib, sys
pats = {
    "OpenAI":  r"sk-(?:proj-|ant-)?[A-Za-z0-9_\-]{20,}",
    "GitHub":  r"gh[pousr]_[A-Za-z0-9]{20,}",
    "AWS":     r"AKIA[0-9A-Z]{16}",
    "64-hex":  r"\b[0-9a-f]{64}\b",
}
bad = 0
for f in pathlib.Path("docs/sessions").glob("*.md"):
    t = f.read_text(errors="replace")
    for name, pat in pats.items():
        n = len(re.findall(pat, t))
        if n:
            print(f"{f.name}: {name} x{n}")
            bad += n
print("CLEAN" if not bad else f"*** {bad} SECRETS -- DO NOT COMMIT ***")
EOF
```

## 红旗自查

- 想让 hook 去调 `/export` → 停，hook 驱动不了交互命令，改成搬 `.jsonl`
- 把 hook 写进 SKILL.md 的 frontmatter 指望会话结束时触发 → 停，skill hook 只在 skill 激活期间加载，要写进 `.claude/settings.json`
- 打算用 `CLAUDE_CONFIG_DIR` 把会话记录挪进项目 → 停，那是全局设置，会把**所有**项目的数据一起搬走
- 手工拷 `~/.claude/projects/<编码路径>/` 到新机器 → 目录名是绝对路径编码的，新机器路径不同就对不上，必须重命名
- 会话归档目录没进 `.gitignore` 做 `.jsonl` 过滤 → 几十次会话后 repo 膨胀到 GB
- 密钥为了"可搬迁"进了 git → 停，写 runbook 指路，不搬实体
- **把会话归档提交进 public repo 之前没扫过密钥 → 停，先跑上面那段扫描；
  会话里有你粘过的每一个 key**
- 以为 GitHub push protection 会兜底 → 它只认得出主流平台的 key 格式，
  自建服务的 token 一个都拦不住
- 渲染器没做脱敏就往 private repo 提交归档 → private 不等于安全，
  协作者、被 fork、将来转 public 都会暴露
- 新机器 clone 下来 AI 说"我不知道这个项目在做什么" → `CLAUDE.md` 没覆盖到，见 [[claude-md-entry-point]]

## 与相邻 skill 的分工

- [[claude-md-entry-point]] 讲**分层**：`CLAUDE.md` 精简作入口，详细状态去 `docs/status.md`，AI 私有记忆留 `~/.claude`。
- [[organizing-project-docs]] 讲 `docs/` **内部怎么分类**（四分法）。
- 本 skill 讲**搬迁机制**：哪些东西默认丢、用什么配置项/hook 把它们钉进 repo。前两者假定"该进 repo 的已经在 repo 里"，本 skill 负责让这个假定成立。
