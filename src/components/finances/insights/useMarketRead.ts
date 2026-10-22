import { useQuery } from 'convex-helpers/react/cache/hooks'
import { useAction, useMutation } from 'convex/react'
import { useEffect, useState } from 'react'

import { api } from '../../../../convex/_generated/api'
import { monthAnswer } from './useMarket'
import type { Doc } from '../../../../convex/_generated/dataModel'
import type { ProAnswer } from '@/lib/claudeResult'
import { localModel } from '@/lib/localModel'
import type { Fact, Holding } from '@/lib/marketRead'
import { STALE_MS, marketFacts, monthKey } from '@/lib/marketRead'

/* The market read (I3): the month's stored read, and the press that makes
   one. Who pays is decided by where the page runs: the dev server answers
   on /__claude/market-read only on his Mac (vite/claudeRead.ts) — then
   Claude Code reads on his Pro plan; anywhere else, the API on credits. */

const CLAUDE_READ_PATH = '/__claude/market-read'
export type Path = 'pro' | 'api'
export type HeroState = 'idle' | 'reading' | 'done' | 'failed' | 'cap'

let knownPath: Path | null = null
export async function findPath(): Promise<Path> {
  if (knownPath) return knownPath
  try {
    const r = await fetch(CLAUDE_READ_PATH)
    const j = r.ok ? ((await r.json()) as { ready?: boolean }) : null
    knownPath = j?.ready === true ? 'pro' : 'api'
  } catch {
    knownPath = 'api'
  }
  return knownPath
}

export function useMarketRead(
  holdings: Array<Holding> | null,
  /** More facts from the room: band 3's allocation lines (I2). */
  extra: Array<Fact> = [],
  /** Facts that change inside the month (earnings): ASK gets them even
      after the month's read, which keeps its own. */
  live: Array<Fact> = [],
) {
  const month = monthKey(Date.now())
  const state = useQuery(api.marketReads.forMonth, { month })
  const run = useMutation(api.marketReads.run)
  const finishPro = useMutation(api.marketReads.finishPro)
  const failPro = useMutation(api.marketReads.failPro)
  const ask = useAction(api.insightsMarket.market)
  const [path, setPath] = useState<Path | null>(knownPath)
  /* Pressed, before the row says "reading": the hero answers at once. */
  const [pressed, setPressed] = useState(false)
  const [refused, setRefused] = useState<string | null>(null)

  useEffect(() => {
    void findPath().then(setPath)
  }, [])

  const row = state?.read ?? null
  const shown: Doc<'marketReads'> | null =
    row?.read !== undefined ? row : (state?.last ?? null)
  const stale =
    row?.status === 'reading' &&
    row.via === 'pro' &&
    Date.now() - (row.startedAt ?? 0) > STALE_MS
  const capped =
    path === 'api' && state !== undefined && state.spent >= state.cap
  const hero: HeroState =
    pressed || (row?.status === 'reading' && !stale)
      ? 'reading'
      : row?.status === 'done'
        ? 'done'
        : refused === 'CAP_REACHED' || (capped && row?.status !== 'failed')
          ? 'cap'
          : row?.status === 'failed' || stale || refused !== null
            ? 'failed'
            : 'idle'

  async function press() {
    if (path === null || holdings === null || pressed) return
    setPressed(true)
    setRefused(null)
    try {
      const m = await monthAnswer(ask)
      const facts = [...marketFacts(m, holdings), ...extra]
      const readId = await run({ facts, via: path })
      if (path === 'pro') {
        const answer = await fetch(CLAUDE_READ_PATH, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            facts,
            today: new Date().toISOString().slice(0, 10),
            model: localModel(),
          }),
        })
          .then((r) => r.json() as Promise<ProAnswer>)
          .catch((): ProAnswer => ({ ok: false, error: 'NOT REACHED' }))
        if (answer.ok) {
          const { ok: _, ...rest } = answer
          await finishPro({ readId, ...rest })
        } else await failPro({ readId, error: answer.error })
      }
    } catch (e) {
      setRefused(
        String((e as { data?: unknown }).data ?? '') === 'CAP_REACHED'
          ? 'CAP_REACHED'
          : 'NOT REACHED',
      )
    } finally {
      setPressed(false)
    }
  }

  /** What a question (ASK) is asked on: the month's read's own facts,
      else the room's numbers now. */
  async function factsNow(): Promise<Array<Fact>> {
    if (row?.status === 'done' && row.facts.length > 0) {
      const had = new Set(row.facts.map((f) => f.key))
      return [...row.facts, ...live.filter((f) => !had.has(f.key))]
    }
    const m = await monthAnswer(ask)
    return [...marketFacts(m, holdings ?? []), ...extra]
  }

  return {
    month,
    factsNow,
    loading: state === undefined,
    hero,
    row,
    /** The read on screen: this month's, else the last one kept. */
    shown,
    spent: state?.spent ?? 0,
    cap: state?.cap ?? 2,
    path,
    press,
    canPress:
      path !== null && holdings !== null && hero !== 'reading' && !capped,
  }
}
