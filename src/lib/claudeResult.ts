/* What `claude -p --output-format json` prints when the market read runs
   on his Mac (I3, the Pro-plan path in vite/claudeRead.ts): the answer —
   `structured_output` when a JSON schema was given, else the result
   text — and what it used, read from its own usage. */

export type ProAnswer =
  | {
      ok: true
      raw: string
      model: string
      inputTokens: number
      outputTokens: number
      searches: number
    }
  | { ok: false; error: string }

const n = (x: unknown) => (typeof x === 'number' && x > 0 ? x : 0)

export function parseClaudeResult(stdout: string): ProAnswer {
  let d: Record<string, unknown>
  try {
    d = JSON.parse(stdout) as Record<string, unknown>
  } catch {
    return { ok: false, error: 'BROKEN SHAPE' }
  }
  if (d.is_error === true) {
    const said = typeof d.result === 'string' ? d.result : ''
    return {
      ok: false,
      error: /auth|log ?in|expired/i.test(said)
        ? 'CLAUDE SIGNED OUT'
        : 'NOT REACHED',
    }
  }
  const raw =
    d.structured_output !== undefined && d.structured_output !== null
      ? JSON.stringify(d.structured_output)
      : typeof d.result === 'string'
        ? d.result
        : ''
  if (raw === '') return { ok: false, error: 'NOTHING BACK' }
  const u = (d.usage ?? {}) as Record<string, unknown>
  const tools = (u.server_tool_use ?? {}) as Record<string, unknown>
  const models = Object.keys(d.modelUsage ?? {})
  return {
    ok: true,
    raw,
    model: models.find((m) => m.includes('sonnet')) ?? models.at(0) ?? 'claude',
    inputTokens:
      n(u.input_tokens) +
      n(u.cache_read_input_tokens) +
      n(u.cache_creation_input_tokens),
    outputTokens: n(u.output_tokens),
    /* Claude Code's own WebSearch is counted per model, not as a server
       tool (21 Oct: every Pro answer said 0 searches). */
    searches: Math.max(
      n(tools.web_search_requests),
      Object.values(
        (d.modelUsage ?? {}) as Record<string, Record<string, unknown>>,
      ).reduce((sum, m) => sum + n(m.webSearchRequests), 0),
    ),
  }
}

/**
 * The environment `claude -p` is started with: the dev server's, without
 * what a Claude session that started the dev server leaves in it (20 Oct:
 * a dev server started from a session handed its child that session's
 * host sign-in, and the read said CLAUDE SIGNED OUT). An API key goes too,
 * so the read always runs on his own Pro login, never on credits.
 */
export function cleanEnv(
  env: Record<string, string | undefined>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) continue
    if (/^(ANTHROPIC_|CLAUDE_|CLAUDECODE$|CLAUDE$)/.test(k)) continue
    out[k] = v
  }
  return out
}
