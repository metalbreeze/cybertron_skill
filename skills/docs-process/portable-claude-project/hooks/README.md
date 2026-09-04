# 可直接拷走的实现

这三个文件是 `SKILL.md` 里描述的机制的可运行版本，已在真实项目上跑通
（3.0 MB / 560 轮的会话 → 148 KB 可读 Markdown，四种异常输入均 `exit 0`）。

## 安装

```bash
mkdir -p <your-project>/.claude/hooks
cp archive-session.sh render_transcript.py <your-project>/.claude/hooks/
chmod +x <your-project>/.claude/hooks/archive-session.sh

# 把 settings.snippet.json 的内容并进 <your-project>/.claude/settings.json
```

再加一行 `.gitignore`：

```gitignore
docs/sessions/*.jsonl
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
