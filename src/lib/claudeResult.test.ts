import { expect, test } from 'vitest'

import { parseClaudeResult } from './claudeResult'

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
  expect(parseClaudeResult('oops')).toEqual({ ok: false, error: 'BROKEN SHAPE' })
})
