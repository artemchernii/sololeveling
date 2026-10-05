#!/usr/bin/env bash
# UserPromptSubmit hook: says when to start a new session or split a PR,
# so a long session does not burn the Pro plan's budget and a PR stays
# reviewable. Prints a reminder; never blocks.
input=$(cat)
transcript=$(printf '%s' "$input" | sed -n 's/.*"transcript_path":"\([^"]*\)".*/\1/p')
msgs=()
if [ -n "$transcript" ] && [ -f "$transcript" ]; then
  bytes=$(wc -c < "$transcript" | tr -d ' ')
  # A rough line, not a token count: the transcript also holds images
  # and tool output. 4 MB is well past a focused slice.
  if [ "$bytes" -gt 4000000 ]; then
    msgs+=("Session transcript is $((bytes / 1000000)) MB. Finish the current step, update the handoff memory, and tell Artem to start a new session.")
  fi
fi
cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || exit 0
lines=$(git diff --shortstat master...HEAD 2>/dev/null | awk '{print $4 + $6}')
if [ -n "$lines" ] && [ "$lines" -gt 1000 ]; then
  msgs+=("This branch changes $lines lines against master (limit 1000). Split it: open a PR for what is done, start the rest on a new branch.")
fi
[ ${#msgs[@]} -gt 0 ] && printf '[session-guard] %s\n' "${msgs[@]}"
exit 0
