#!/usr/bin/env python3
"""Render a Claude Code .jsonl transcript into readable Markdown.

Used by the SessionEnd hook. A hook cannot call the interactive `/export`
command, so this reproduces the useful part of it: the human-readable
conversation, minus internal reasoning and minus multi-megabyte tool output.

Usage: render_transcript.py <input.jsonl> <output.md>

The .jsonl schema is internal to Claude Code and changes between versions,
so this is deliberately defensive: anything unrecognised is skipped rather
than raising.
"""
import json
import sys
from datetime import datetime

MAX_TOOL_CHARS = 800  # tool results can be megabytes; keep the archive readable


def blocks_to_text(content):
    """Flatten a message's content into (text, notes) where notes are tool calls."""
    if isinstance(content, str):
        return content, []
    if not isinstance(content, list):
        return "", []

    parts, notes = [], []
    for b in content:
        if not isinstance(b, dict):
            continue
        kind = b.get("type")
        if kind == "text":
            parts.append(b.get("text", ""))
        elif kind == "thinking":
            continue  # internal reasoning stays out of the archive
        elif kind == "tool_use":
            notes.append(f"→ called `{b.get('name', '?')}`")
        elif kind == "tool_result":
            raw = b.get("content", "")
            if isinstance(raw, list):
                raw = "".join(
                    x.get("text", "") for x in raw if isinstance(x, dict)
                )
            raw = str(raw).strip()
            if len(raw) > MAX_TOOL_CHARS:
                raw = raw[:MAX_TOOL_CHARS] + f"\n… [{len(raw)} chars total, truncated]"
            if raw:
                notes.append(f"← result:\n```\n{raw}\n```")
    return "\n".join(p for p in parts if p), notes


def main():
    if len(sys.argv) < 3:
        sys.exit("usage: render_transcript.py <input.jsonl> <output.md>")
    src, dst = sys.argv[1], sys.argv[2]

    out, first_ts, last_ts, turns = [], None, None, 0

    with open(src, encoding="utf-8") as fh:
        for line in fh:
            try:
                rec = json.loads(line)
            except Exception:
                continue
            if rec.get("type") not in ("user", "assistant"):
                continue

            ts = rec.get("timestamp")
            if ts:
                first_ts = first_ts or ts
                last_ts = ts

            msg = rec.get("message") or {}
            text, notes = blocks_to_text(msg.get("content"))
            if not text and not notes:
                continue

            turns += 1
            who = "User" if rec.get("type") == "user" else "Claude"
            out.append(f"\n---\n\n## {who}\n")
            if text:
                out.append(text)
            for n in notes:
                out.append(f"\n_{n}_" if n.startswith("→") else f"\n{n}")

    header = [
        "# Session transcript",
        "",
        f"- Source: `{src}`",
        f"- Rendered: {datetime.now().isoformat(timespec='seconds')}",
        f"- Turns: {turns}",
    ]
    if first_ts:
        header.append(f"- Span: {first_ts} → {last_ts}")
    header += [
        "",
        "> Internal reasoning is omitted and tool output is truncated to "
        f"{MAX_TOOL_CHARS} chars. The adjacent `.jsonl` is the complete record.",
        "",
    ]

    with open(dst, "w", encoding="utf-8") as fh:
        fh.write("\n".join(header))
        fh.write("\n".join(out))
        fh.write("\n")

    print(f"rendered {turns} turns -> {dst}")


if __name__ == "__main__":
    main()
