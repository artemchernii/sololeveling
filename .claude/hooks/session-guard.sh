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
  # The meter for the ⏱ Session line: minutes since the first entry, the
  # context the last reply carried, and output tokens written so far.
  meter=$(jq -rs '
    (map(.timestamp // empty) | first) as $start
    | (map(select(.message.usage)) | map(.message.usage)) as $u
    | ($u | last // {}) as $l
    | [ ((now - ($start | sub("\\.[0-9]+Z$"; "Z") | fromdate)) / 60 | floor),
        ((($l.input_tokens // 0) + ($l.cache_read_input_tokens // 0)
          + ($l.cache_creation_input_tokens // 0)) / 1000 | floor),
        (($u | map(.output_tokens // 0) | add // 0) / 1000 | floor),
        ($u | length) ] | @tsv' "$transcript" 2>/dev/null)
  if [ -n "$meter" ]; then
    read -r mins ctx out calls <<< "$meter"
    msgs+=("meter: ${mins} min · context ${ctx}k · written ${out}k · ${calls} model calls")
  fi
fi
cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || exit 0
lines=$(git diff --shortstat master...HEAD 2>/dev/null | awk '{print $4 + $6}')
if [ -n "$lines" ] && [ "$lines" -gt 1000 ]; then
  msgs+=("This branch changes $lines lines against master (limit 1000). Split it: open a PR for what is done, start the rest on a new branch.")
fi
[ ${#msgs[@]} -gt 0 ] && printf '[session-guard] %s\n' "${msgs[@]}"
exit 0
