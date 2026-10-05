#!/usr/bin/env bash
# UserPromptSubmit hook: says when to start a new session or split a PR,
# so a long session does not burn the Pro plan's budget and a PR stays
# reviewable. Prints a reminder; never blocks.
input=$(cat)
transcript=$(printf '%s' "$input" | sed -n 's/.*"transcript_path":"\([^"]*\)".*/\1/p')
msgs=()
if [ -n "$transcript" ] && [ -f "$transcript" ]; then
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
    # 5 Oct, Artem: "start new session because we reached 500k context".
    if [ "$ctx" -ge 500 ]; then
      msgs+=("Context is ${ctx}k (limit 500k). Finish the current step, update the handoff memory, and tell Artem to start a new session.")
    fi
  fi
fi
cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || exit 0
lines=$(git diff --shortstat origin/master...HEAD 2>/dev/null | awk '{print $4 + $6}')
if [ -n "$lines" ] && [ "$lines" -gt 1000 ]; then
  msgs+=("This branch changes $lines lines against master (limit 1000). Split it: open a PR for what is done, start the rest on a new branch.")
fi
# Rule 5: a file under ~500 lines. Name any file this branch touches
# that is over it, so the split happens in the slice, not later.
big=$(git diff --name-only origin/master...HEAD -- '*.ts' '*.tsx' 2>/dev/null \
  | while read -r f; do
      [ -f "$f" ] && n=$(wc -l < "$f" | tr -d ' ') && [ "$n" -gt 500 ] && printf '%s (%s) ' "$f" "$n"
    done)
if [ -n "$big" ]; then
  msgs+=("Files over 500 lines on this branch: ${big}— split the part you touch into its own file before the PR.")
fi
[ ${#msgs[@]} -gt 0 ] && printf '[session-guard] %s\n' "${msgs[@]}"
exit 0
