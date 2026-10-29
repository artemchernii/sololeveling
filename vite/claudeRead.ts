import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

import {
  askedModel,
  cleanEnv,
  parseClaudeResult,
} from '../src/lib/claudeResult'
import { MARKET_READ_SCHEMA, marketReadPrompt } from '../src/lib/marketRead'
import { ASK_SCHEMA, askPrompt, shotOf } from '../src/lib/marketAsk'
import type { Fact } from '../src/lib/marketRead'
import type { LineContext, ReadContext, Said } from '../src/lib/marketAsk'
import { IDEAS_SCHEMA, ideasPrompt } from '../src/lib/ideasRead'
import type { ProAnswer } from '../src/lib/claudeResult'
import { ROWS_SCHEMA, rowsPrompt } from '../src/lib/rowsAskPrompt'

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
/** ASK (I4): one question; web search always on since 29 Oct. */
export const CLAUDE_ASK_PATH = '/__claude/market-ask'
/** IDEAS (29 Oct): the board's plan for his idle cash. */
export const CLAUDE_IDEAS_PATH = '/__claude/ideas-read'
/** R7 Ask AI: a question about his rows; the page sends the rows it read. */
export const CLAUDE_ROWS_PATH = '/__claude/rows-ask'
const TIMEOUT_MS = 5 * 60_000

function claude(
  prompt: string,
  schema: unknown,
  web: boolean,
  model: string,
  /** A folder Claude Code may read (a dropped screenshot), else none. */
  readable?: string,
): Promise<ProAnswer> {
  const tools = [...(web ? ['WebSearch'] : []), ...(readable ? ['Read'] : [])]
  return new Promise((resolve) => {
    const child = spawn(
      'claude',
      [
        '-p',
        '--output-format',
        'json',
        '--model',
        model,
        '--json-schema',
        JSON.stringify(schema),
        '--tools',
        tools.join(','),
        ...(tools.length ? ['--allowedTools', tools.join(',')] : []),
        ...(readable ? ['--add-dir', readable] : []),
        '--no-session-persistence',
        '--strict-mcp-config',
      ],
      /* Outside the repo, so no CLAUDE.md or project settings ride along. */
      {
        cwd: tmpdir(),
        /* His own login, not the env of a session that started the dev server. */
        env: cleanEnv(process.env),
        stdio: ['pipe', 'pipe', 'ignore'],
      },
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
      resolve(
        out
          ? parseClaudeResult(out, model)
          : { ok: false, error: 'NOT REACHED' },
      )
    })
    child.stdin.end(prompt)
  })
}

function body(req: IncomingMessage, max = 200_000): Promise<string> {
  return new Promise((resolve, reject) => {
    let s = ''
    req.on('data', (b: Buffer) => {
      s += b.toString()
      if (s.length > max) reject(new Error('too big'))
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
      const route = (
        path: string,
        answer: (json: string) => Promise<ProAnswer>,
        /* A month of rows is a few hundred lines; three months fit. */
        max?: number,
      ) =>
        server.middlewares.use(path, (req, res) => {
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
              send(res, 200, await answer(await body(req, max)))
            } catch (e) {
              send(res, 400, {
                ok: false,
                error:
                  (e as Error).message === 'model'
                    ? 'MODEL REFUSED'
                    : 'BROKEN SHAPE',
              })
            }
          })()
        })
      route(CLAUDE_READ_PATH, (json) => {
        const { facts, today } = JSON.parse(json) as {
          facts: Array<Fact>
          today: string
        }
        return claude(
          marketReadPrompt(facts, today),
          MARKET_READ_SCHEMA,
          true,
          askedModel(json),
        )
      })
      route(CLAUDE_IDEAS_PATH, (json) => {
        const { facts, idle, today } = JSON.parse(json) as {
          facts: Array<Fact>
          idle: number
          today: string
        }
        return claude(
          ideasPrompt(facts, idle, today),
          IDEAS_SCHEMA,
          true,
          askedModel(json),
        )
      })
      route(
        CLAUDE_ASK_PATH,
        async (json) => {
          const { facts, read, question, today, history, line, shot } =
            JSON.parse(json) as {
              facts: Array<Fact>
              read: ReadContext | null
              question: string
              today: string
              history?: Array<Said>
              line?: LineContext | null
              shot?: string | null
            }
          const img = shot ? shotOf(shot) : null
          /* A dropped screenshot: a file in a folder of its own that
             Claude Code may read, gone when the answer is back. */
          const dir = img ? await mkdtemp(join(tmpdir(), 'ask-shot-')) : null
          const file = dir && img ? join(dir, `shot.${img.ext}`) : null
          if (file && img)
            await writeFile(file, Buffer.from(img.data, 'base64'))
          try {
            return await claude(
              askPrompt(facts, read, question, true, today, history ?? [], {
                line: line ?? null,
                shot: file,
              }),
              ASK_SCHEMA,
              true,
              askedModel(json),
              dir ?? undefined,
            )
          } finally {
            if (dir) await rm(dir, { recursive: true, force: true })
          }
        },
        8_000_000,
      )
      route(
        CLAUDE_ROWS_PATH,
        (json) =>
          claude(
            rowsPrompt(JSON.parse(json) as Parameters<typeof rowsPrompt>[0]),
            ROWS_SCHEMA,
            false,
            askedModel(json),
          ),
        2_000_000,
      )
    },
  }
}
