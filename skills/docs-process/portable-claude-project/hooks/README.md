# 可直接拷走的实现

这三个文件是 `SKILL.md` 里描述的机制的可运行版本，已在真实项目上跑通
（3.0 MB / 560 轮的会话 → 148 KB 可读 Markdown，四种异常输入均 `exit 0`）。

## 安装

```bash
mkdir -p <your-project>/.claude/hooks
cp archive-session.sh render_transcript.py <your-project>/.claude/hooks/
chmod +x <your-project>/.claude/hooks/archive-session.sh

# 项目自己的凭据字面量表（必做，理由见下）
cp redact.local.txt.example <your-project>/.claude/hooks/redact.local.txt
chmod 600 <your-project>/.claude/hooks/redact.local.txt
$EDITOR <your-project>/.claude/hooks/redact.local.txt

# 把 settings.snippet.json 的内容并进 <your-project>/.claude/settings.json
```

`.gitignore`：

```gitignore
docs/sessions/*.jsonl
docs/sessions/*.md              # 归档仍留在磁盘上，只是不进远端
.claude/hooks/redact.local.txt  # 这份就是密钥清单本身
```

## 装完先验一次，别等到真的关会话才发现不工作

```bash
cd <your-project>
printf '%s' '{"session_id":"test-1234","transcript_path":"'"$HOME"'/.claude/projects/<编码路径>/<session>.jsonl"}' \
  | CLAUDE_PROJECT_DIR=$(pwd) bash .claude/hooks/archive-session.sh
ls docs/sessions/
```

`<编码路径>` 是项目绝对路径把 `/` 换成 `-`，例如
`/Users/me/work/proj` → `-Users-me-work-proj`。

## ⚠️ 提交归档前必须扫密钥

`render_transcript.py` 内置的脱敏只认**知名平台的 key 形状**（`sk-` / `ghp_` / `AKIA` /
64-hex / `Bearer`）。实测一份真实归档（8000+ 轮 / 2.0 MB）：

| | 命中 |
|---|---|
| 内置通用正则 | **0** |
| 项目真实凭据（管理员口令 / ERP appsecret / 签名密钥 / JWT secret…） | **89** |

**不是漏几个，是一个都接不住** —— 自建服务的密码根本没有"形状"。
所以 `redact.local.txt`（字面量表）不是可选项，补完后同一份归档复扫 **89 → 0**。

**项目新增凭据 = 同时补一行**，否则它下次会话就明文进归档。

**public repo 建议直接 `docs/sessions/*.md` 也 gitignore** —— 归档仍写在磁盘上，
整个文件夹拷走时照样跟着走，只是不进公开远端。

详见 `../SKILL.md` 的「会话归档会泄密」一节。
