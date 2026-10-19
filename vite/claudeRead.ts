import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

import { parseClaudeResult } from '../src/lib/claudeResult'
import {
  MARKET_READ_MODEL,
  MARKET_READ_SCHEMA,
  marketReadPrompt,
} from '../src/lib/marketRead'
import type { Fact } from '../src/lib/marketRead'
import type { ProAnswer } from '../src/lib/claudeResult'

/* The market read on his Pro plan (I3, 19 Oct: "On localhost the read and
   ASK go through Claude Code on his Mac"). Artem allowed one Start server
   function for this, but in `vite dev` the app's server half runs inside
   workerd (the Cloudflare plugin), which cannot start a program. So it is
   this: a route of the Vite dev server itself, in Node.

   It exists only under `vite dev` (`apply: 'serve'`) — a build, and so
   the deployed Worker, never has it, and the page then reads through the
   API. Browser tests (E2E_RUN) get no route either, so they never call
   out. A request must come from the page's own origin as JSON, so another
   site open in the browser cannot spend the plan. */

export const CLAUDE_READ_PATH = '/__claude/market-read'
const TIMEOUT_MS = 5 * 60_000

function claude(prompt: string): Promise<ProAnswer> {
  return new Promise((resolve) => {
    const child = spawn(
      'claude',
      [
        '-p',
        '--output-format',
        'json',
        '--model',
        MARKET_READ_MODEL,
        '--json-schema',
        JSON.stringify(MARKET_READ_SCHEMA),
        '--tools',
        'WebSearch',
        '--allowedTools',
        'WebSearch',
        '--no-session-persistence',
        '--strict-mcp-config',
      ],
      /* Outside the repo, so no CLAUDE.md or project settings ride along. */
      { cwd: tmpdir(), stdio: ['pipe', 'pipe', 'ignore'] },
    )
    let out = ''
    const timer = setTimeout(() => child.kill(), TIMEOUT_MS)
    child.stdout.on('data', (b: Buffer) => (out += b.toString()))
    child.on('error', () => {
      clearTimeout(timer)
      resolve({ ok: false, error: 'NO CLAUDE CODE' })
    })
    child.on('close', () => {
      clearTimeout(timer)
      resolve(out ? parseClaudeResult(out) : { ok: false, error: 'NOT REACHED' })
    })
    child.stdin.end(prompt)
  })
}

function body(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let s = ''
    req.on('data', (b: Buffer) => {
      s += b.toString()
      if (s.length > 200_000) reject(new Error('too big'))
    })
    req.on('end', () => resolve(s))
    req.on('error', reject)
  })
}

const send = (res: ServerResponse, status: number, json: unknown) => {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(json))
}

export function claudeRead(): Plugin {
  return {
    name: 'claude-read',
    apply: 'serve',
    configureServer(server) {
      if (process.env.E2E_RUN) return
      server.middlewares.use(CLAUDE_READ_PATH, (req, res) => {
        void (async () => {
          if (req.method === 'GET') return send(res, 200, { ready: true })
          const origin = req.headers.origin
          if (
            req.method !== 'POST' ||
            !req.headers['content-type']?.startsWith('application/json') ||
            !origin ||
            new URL(origin).host !== req.headers.host
          )
            return send(res, 403, { ok: false, error: 'REFUSED' })
          try {
            const { facts, today } = JSON.parse(await body(req)) as {
              facts: Array<Fact>
              today: string
            }
            send(res, 200, await claude(marketReadPrompt(facts, today)))
          } catch {
            send(res, 400, { ok: false, error: 'BROKEN SHAPE' })
          }
        })()
      })
    },
  }
}
