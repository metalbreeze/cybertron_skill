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
import re
import sys
from pathlib import Path
from datetime import datetime

# --- Secret redaction -------------------------------------------------------
# Conversations contain credentials: keys pasted by the user, tokens echoed
# back by an API, bearer headers in curl commands. An archive committed to git
# would leak all of them -- GitHub push protection blocks this, and on a
# private remote nothing would catch it at all. Redact before writing.
SECRET_PATTERNS = [
    (re.compile(r"sk-(?:proj-|ant-)?[A-Za-z0-9_\-]{20,}"), "sk-***REDACTED***"),
    (re.compile(r"gh[pousr]_[A-Za-z0-9]{20,}"), "ghp_***REDACTED***"),
    (re.compile(r"AKIA[0-9A-Z]{16}"), "AKIA***REDACTED***"),
    (re.compile(r"(?i)(bearer\s+)[A-Za-z0-9._\-]{20,}"), r"\1***REDACTED***"),
    (re.compile(r"\b[0-9a-f]{64}\b"), "***REDACTED-64HEX***"),
    (re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----",
                re.S), "-----BEGIN PRIVATE KEY-----***REDACTED***-----END PRIVATE KEY-----"),
]

# The patterns above only recognise well-known platform key shapes. Self-hosted
# credentials -- an ERP app secret, a service admin password, a JWT signing key --
# match none of them: scanning one real 2 MB archive found 89 occurrences of such
# secrets and 0 hits from the patterns above. So also redact literal strings listed
# one per line in redact.local.txt (gitignored, chmod 600; # starts a comment).
# Add a line whenever the project gains a credential, or it lands in the next archive.
_LOCAL_LIST = Path(__file__).with_name("redact.local.txt")
if _LOCAL_LIST.is_file():
    for _line in _LOCAL_LIST.read_text(encoding="utf-8", errors="replace").splitlines():
        _literal = _line.strip()
        if _literal and not _literal.startswith("#"):
            SECRET_PATTERNS.append(
                (re.compile(re.escape(_literal)), "***REDACTED-LOCAL***"))


def redact(text):
    """Strip credential-shaped strings. Best effort, not a guarantee -- see
    the skill's red-flag list before committing archives to a public repo."""
    for pat, repl in SECRET_PATTERNS:
        text = pat.sub(repl, text)
    return text


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
        fh.write(redact("\n".join(out)))
        fh.write("\n")

    print(f"rendered {turns} turns -> {dst}")


if __name__ == "__main__":
    main()
