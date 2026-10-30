import { useQuery } from 'convex-helpers/react/cache/hooks'
import { useAction, useConvex, useMutation } from 'convex/react'
import { useEffect, useMemo, useState } from 'react'

import { api } from '../../../../convex/_generated/api'
import type { BoardAnswer } from '../../../../convex/insightsBoard'
import { findPath } from './useMarketRead'
import type { Path } from './useMarketRead'
import { monthsBack } from '@/components/finances/flow/time'
import { useDayStarts } from '@/components/track/useDayStarts'
import type { ProAnswer } from '@/lib/claudeResult'
import { localModel } from '@/lib/localModel'
import { ideasFacts, spendOf } from '@/lib/ideasFacts'
import type { Cash, Holding } from '@/lib/ideasFacts'
import type { Fact } from '@/lib/marketRead'
import { STALE_MS } from '@/lib/marketRead'

/* IDEAS (29 Oct): the board's two halves. What is fetched when the tab
   opens — strip, movers, each ticker's facts — kept in page memory ten
   minutes and never stored; and the read, the newest stored row, made by
   a press of READ AGAIN on his Pro plan on localhost (Claude Code on his
   Mac) or on API credits deployed. */

const CLAUDE_IDEAS_PATH = '/__claude/ideas-read'
const KEEP_MS = 10 * 60_000
const kept = new Map<string, { at: number; answer: BoardAnswer }>()

/** The board's fetch for these tickers; null while it is asked. */
export function useBoard(symbols: Array<string>, on: boolean) {
  const ask = useAction(api.insightsBoard.board)
  const key = [...new Set(symbols)].sort().join(',')
  const hit = kept.get(key)
  const [answer, setAnswer] = useState<BoardAnswer | null>(
    hit && Date.now() - hit.at < KEEP_MS ? hit.answer : null,
  )
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!on) return
    const was = kept.get(key)
    if (was && Date.now() - was.at < KEEP_MS) return setAnswer(was.answer)
    let live = true
    setFailed(false)
    ask({ symbols: key === '' ? [] : key.split(',') })
      .then((a) => {
        kept.set(key, { at: Date.now(), answer: a })
        if (live) setAnswer(a)
      })
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [ask, key, on])
  return { answer, failed }
}

export type IdeasState = 'idle' | 'reading' | 'done' | 'failed' | 'cap'

/** The cash not invested, from the same numbers as the Overview. */
export function useCash(): Cash | null {
  const worth = useQuery(api.aggregate.worth, {})
  return useMemo(() => {
    if (!worth) return null
    const banks = worth.byAccount.reduce((t, a) => t + (a.cash ?? 0), 0)
    const broker = worth.byAccount.reduce((t, a) => t + (a.brokerCash ?? 0), 0)
    return { idle: worth.cash.total, banks, broker, worth: worth.total }
  }, [worth])
}

export function useIdeasRead(input: {
  cash: Cash | null
  held: ReadonlyArray<Holding> | null
  board: BoardAnswer | null
  extra: ReadonlyArray<Fact>
}) {
  const state = useQuery(api.ideasReads.latest, {})
  const run = useMutation(api.ideasReads.run)
  const finishPro = useMutation(api.ideasReads.finishPro)
  const failPro = useMutation(api.ideasReads.failPro)
  const convex = useConvex()
  const today = useDayStarts(1).at(-1) as number
  const [path, setPath] = useState<Path | null>(null)
  const [pressed, setPressed] = useState(false)
  const [refused, setRefused] = useState<string | null>(null)
  useEffect(() => {
    void findPath().then(setPath)
  }, [])

  const row = state?.row ?? null
  const stale =
    row?.status === 'reading' &&
    row.via === 'pro' &&
    Date.now() - row.startedAt > STALE_MS
  const capped =
    path === 'api' && state !== undefined && state.spent >= state.cap
  const status: IdeasState =
    pressed || (row?.status === 'reading' && !stale)
      ? 'reading'
      : refused === 'CAP_REACHED' || (capped && row?.status !== 'failed')
        ? 'cap'
        : row?.status === 'failed' || stale || refused !== null
          ? 'failed'
          : row?.status === 'done'
            ? 'done'
            : 'idle'
  const ready =
    path !== null &&
    input.cash !== null &&
    input.cash.idle > 0 &&
    input.held !== null &&
    input.board !== null

  async function press() {
    const { cash, held, board } = input
    if (!ready || pressed || cash === null || held === null || !board) return
    setPressed(true)
    setRefused(null)
    try {
      /* Spending, asked once on the press: no standing subscription. */
      const spans = monthsBack(today, 7)
      const ahead = await convex
        .query(api.aggregate.ahead, {
          today,
          days: 89,
          monthStart: spans[6].start,
          past: spans.slice(3, 6),
        })
        .catch(() => null)
      const facts = ideasFacts({
        cash,
        spend: ahead ? spendOf(ahead) : null,
        held,
        tickers: board.tickers,
        strip: board.strip,
        movers: board.movers,
        extra: input.extra,
      })
      const readId = await run({ facts, idle: cash.idle, via: path })
      if (path === 'pro') {
        const answer = await fetch(CLAUDE_IDEAS_PATH, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            facts,
            idle: Math.round(cash.idle),
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

  return {
    loading: state === undefined,
    row,
    shown: state?.shown ?? null,
    status,
    error: refused ?? row?.error ?? (stale ? 'NOT REACHED' : null),
    path,
    spent: state?.spent ?? 0,
    cap: state?.cap ?? 2,
    press,
    canPress: ready && status !== 'reading' && !capped,
  }
}
