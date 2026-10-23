import { expect, test } from 'vitest'

import { askedModel, cleanEnv, parseClaudeResult } from './claudeResult'

test('the structured answer and its usage, from what claude -p prints', () => {
  const r = parseClaudeResult(
    JSON.stringify({
      is_error: false,
      result: '',
      structured_output: { lead: 'Rates falling' },
      usage: {
        input_tokens: 1000,
        cache_read_input_tokens: 50_000,
        cache_creation_input_tokens: 2000,
        output_tokens: 3100,
        server_tool_use: { web_search_requests: 6 },
      },
      modelUsage: { 'claude-haiku-5-5': {}, 'claude-sonnet-5-5': {} },
    }),
  )
  expect(r).toEqual({
    ok: true,
    raw: '{"lead":"Rates falling"}',
    model: 'claude-sonnet-5-5',
    inputTokens: 53_000,
    outputTokens: 3100,
    searches: 6,
  })
})

test("Claude Code's own searches count, read per model", () => {
  const r = parseClaudeResult(
    JSON.stringify({
      result: 'x',
      usage: { server_tool_use: { web_search_requests: 0 } },
      modelUsage: {
        'claude-sonnet-5-5': { webSearchRequests: 2 },
        'claude-haiku-5-5': { webSearchRequests: 1 },
      },
    }),
  )
  expect(r.ok && r.searches).toBe(3)
})

test('signed out, an error, or nothing printed is a failed read', () => {
  expect(
    parseClaudeResult(
      JSON.stringify({
        is_error: true,
        result: 'Failed to authenticate: OAuth session expired',
      }),
    ),
  ).toEqual({ ok: false, error: 'CLAUDE SIGNED OUT' })
  expect(parseClaudeResult(JSON.stringify({ is_error: true }))).toEqual({
    ok: false,
    error: 'NOT REACHED',
  })
  expect(parseClaudeResult('oops')).toEqual({
    ok: false,
    error: 'BROKEN SHAPE',
  })
})

test('claude -p starts on his own login: no session or API key env', () => {
  expect(
    cleanEnv({
      PATH: '/usr/bin',
      HOME: '/Users/a',
      ANTHROPIC_BASE_URL: 'http://host',
      ANTHROPIC_API_KEY: 'k',
      CLAUDECODE: '1',
      CLAUDE_CODE_ENTRYPOINT: 'desktop',
      CLAUDE_CONFIG_DIR: '/x',
      NODE_ENV: undefined,
    }),
  ).toEqual({ PATH: '/usr/bin', HOME: '/Users/a' })
})

test('the stamp names the model it was started with, not a helper', () => {
  const out = JSON.stringify({
    result: 'x',
    modelUsage: { 'claude-haiku-5-5': {}, 'claude-opus-5-5': {} },
  })
  const r = parseClaudeResult(out, 'claude-opus-5-5')
  expect(r.ok && r.model).toBe('claude-opus-5-5')
  const h = parseClaudeResult(
    JSON.stringify({ result: 'x', modelUsage: { 'claude-sonnet-5-5': {} } }),
    'claude-haiku-5-5',
  )
  expect(h.ok && h.model).toBe('claude-haiku-5-5')
})

test('the route allows only the three models, Sonnet when none is sent', () => {
  expect(askedModel('{}')).toBe('claude-sonnet-5-5')
  for (const m of ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5'])
    expect(askedModel(JSON.stringify({ model: m }))).toBe(m)
  for (const m of ['claude-opus-4', 'gpt-5', '', 5, null])
    expect(() => askedModel(JSON.stringify({ model: m }))).toThrow('model')
})
