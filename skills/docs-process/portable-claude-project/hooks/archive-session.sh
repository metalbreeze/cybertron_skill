#!/usr/bin/env bash
# SessionEnd hook — archive this session's transcript into the repo so the
# history travels with a `git clone` instead of being stranded in ~/.claude.
#
# Claude Code passes a JSON payload on stdin containing `transcript_path`,
# `session_id` and `cwd`. A hook cannot invoke the interactive `/export`
# command, so we copy the raw .jsonl and render our own readable .md.
#
# Writes into docs/sessions/:
#   <date>-<short-id>.jsonl   raw transcript (exact, but internal format)
#   <date>-<short-id>.md      readable rendering (what /export would give you)
#
# Never fails the session: every error path still exits 0.

set -uo pipefail

PAYLOAD=$(cat)
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
OUT_DIR="$PROJECT_DIR/docs/sessions"
RENDERER="$PROJECT_DIR/.claude/hooks/render_transcript.py"

# Pull both fields in one pass.
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
