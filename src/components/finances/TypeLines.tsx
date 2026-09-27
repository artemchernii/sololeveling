import { useEffect, useMemo, useRef, useState } from 'react'
import { useAction, useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import {
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpRight,
  Check,
  Loader2,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { FIELD, PILL_LOUD, PILL_QUIET } from '@/components/finances/bits'
import { TickerLogo } from '@/components/finances/Logo'
import { Sparks } from '@/components/track/Sparks'
import { useDayStarts } from '@/components/track/useDayStarts'
import { money } from '@/lib/currency'
import { preferClass } from '@/lib/intake'
import type { Candidate } from '@/lib/market'
import { SPEND_CATEGORIES } from '@/lib/money'
import { parseLines } from '@/lib/money-lines'
import type { LineKind, ParsedLine } from '@/lib/money-lines'

/* Typing money (27 Sep, "adding money"): a line each, in his own words,
   read back as rows he can check — the same kind of list a statement
   fills. One line is a list of one. Whatever the line could not tell (an
   account, what it was, a ticker) is asked in the row, not in a form. */

const KIND: Record<
  LineKind,
  { label: string; tone: string; Icon: typeof ArrowUpRight; starter: string }
> = {
  in: {
    label: 'money in',
    tone: 'text-state-good bg-state-good/10 ring-state-good/30',
    Icon: ArrowUpRight,
    starter: 'in ',
  },
  out: {
    label: 'money out',
    tone: 'text-state-danger bg-state-danger/10 ring-state-danger/30',
    Icon: ArrowDownRight,
    starter: 'out ',
  },
  transfer: {
    label: 'transfer',
    tone: 'text-lav-300 bg-lav-400/10 ring-lav-400/35',
    Icon: ArrowLeftRight,
    starter: 'transfer ',
  },
  buy: {
    label: 'buy',
    tone: 'text-lav-300 bg-lav-400/10 ring-lav-400/35',
    Icon: TrendingUp,
    starter: 'bought ',
  },
  sell: {
    label: 'sell',
    tone: 'text-lav-300 bg-lav-400/10 ring-lav-400/35',
    Icon: TrendingDown,
    starter: 'sold ',
  },
}

const IN_CATEGORIES = [
  'salary',
  'bonus',
  'irs return',
  'gift',
  'refund',
  'dividend',
  'interest',
  'other',
]

const DAY_FMT = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})

/* What he changed in a row, on top of what the line said. Kept by the
   line's text, so editing one line never moves another's choices. */
type Fix = {
  accountId?: Id<'accounts'>
  fromId?: Id<'accounts'>
  toId?: Id<'accounts'>
  category?: string
  candidate?: Candidate | null
}

export function TypeLines() {
  const accounts = useQuery(api.accounts.list, {})
  const record = useMutation(api.money.record)
  const today = useDayStarts(1).at(-1) as number
  const [text, setText] = useState('')
  const [fixes, setFixes] = useState<Record<string, Fix>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<number | null>(null)
  const [burst, setBurst] = useState(0)
  const box = useRef<HTMLTextAreaElement>(null)

  const lines = useMemo(
    () =>
      parseLines(text, {
        accounts: (accounts ?? []).map((a) => ({
          id: a._id,
          name: a.name,
          kinds: a.kinds,
          currencies: a.currencies,
        })),
        today,
        now: Date.now(),
      }),
    [text, accounts, today],
  )

  const rows = lines.map((l) => resolve(l, fixes[l.text] ?? {}))
  const ready = rows.length > 0 && rows.every((r) => r.problems.length === 0)

  function fix(line: string, patch: Fix) {
    setFixes((f) => ({ ...f, [line]: { ...f[line], ...patch } }))
  }

  function start(kind: LineKind) {
    const lead = text.length === 0 || text.endsWith('\n') ? '' : '\n'
    setText(text + lead + KIND[kind].starter)
    setDone(null)
    requestAnimationFrame(() => {
      const el = box.current
      if (!el) return
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
    })
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const { written } = await record({ lines: rows.map((r) => r.args!) })
      setText('')
      setFixes({})
      setDone(written)
      setBurst((b) => b + 1)
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message.replace(/^.*?ConvexError: /, '').split('\n')[0]
          : 'Not saved',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="label-caps mr-1">or type it</span>
        {(Object.keys(KIND) as Array<LineKind>).map((k) => {
          const { Icon, label } = KIND[k]
          return (
            <button
              key={k}
              type="button"
              onClick={() => start(k)}
              className={PILL_QUIET}
            >
              <Icon className="size-3" />
              {label}
            </button>
          )
        })}
      </div>
      <textarea
        ref={box}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setDone(null)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && ready) {
            e.preventDefault()
            void save()
          }
        }}
        rows={Math.min(8, Math.max(3, text.split('\n').length + 1))}
        spellCheck={false}
        aria-label="Type money, a line each"
        placeholder={
          'in 2900 salary bpi\nbpi → tr 2000\nbought 3 msft 402 tr\nout 1200 laptop revolut yesterday'
        }
        className={`${FIELD} resize-none font-mono text-[13px] leading-relaxed`}
      />
      {rows.length > 0 && accounts ? (
        <div className="flex flex-col gap-1.5">
          {rows.map((r, i) => (
            <LineRow
              key={`${i}:${r.line.text}`}
              row={r}
              accounts={accounts}
              onFix={(patch) => fix(r.line.text, patch)}
            />
          ))}
        </div>
      ) : null}
      {error ? (
        <span className="font-mono text-[11px] text-state-warn">{error}</span>
      ) : null}
      {done !== null ? (
        <span className="motion-land font-mono text-[11.5px] text-state-good">
          ✓ added {done} — the balances have moved
        </span>
      ) : null}
      {rows.length > 0 ? (
        <button
          type="button"
          disabled={!ready || saving}
          onClick={() => void save()}
          className={`${PILL_LOUD} relative justify-center py-3 disabled:opacity-40`}
        >
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
          {ready
            ? `add ${rows.length === 1 ? 'it' : `all ${rows.length}`} · ⌘↵`
            : `${rows.reduce((n, r) => n + r.problems.length, 0)} to answer`}
          {burst > 0 ? <Sparks key={burst} count={12} reach={40} /> : null}
        </button>
      ) : null}
    </div>
  )

  /* The line and his fixes, made into what `money.record` takes — or the
     things still missing. */
  function resolve(line: ParsedLine, f: Fix) {
    const problems: Array<string> = []
    const own = (id: string | undefined) =>
      (accounts ?? []).find((a) => a._id === id)
    const accountId =
      f.accountId ?? (line.accountId as Id<'accounts'> | undefined)
    const fromId = f.fromId ?? (line.fromId as Id<'accounts'> | undefined)
    const toId = f.toId ?? (line.toId as Id<'accounts'> | undefined)
    const category = f.category ?? line.category
    let args: Parameters<typeof record>[0]['lines'][number] | undefined
    if (line.kind === null) {
      problems.push('an amount')
    } else if (line.kind === 'in' || line.kind === 'out') {
      if (line.amount === undefined) problems.push('an amount')
      if (!accountId) problems.push('which account')
      if (!category) problems.push('what it was')
      const a = own(accountId)
      if (a && !a.currencies.includes(line.currency))
        problems.push(`${a.name} holds no ${line.currency}`)
      if (problems.length === 0) {
        args = {
          kind: line.kind,
          accountId: accountId!,
          amount: line.amount!,
          currency: line.currency,
          category: category!,
          note: line.note,
          occurredAt: line.occurredAt,
        }
      }
    } else if (line.kind === 'transfer') {
      if (line.amount === undefined) problems.push('an amount')
      if (!fromId) problems.push('from which account')
      if (!toId) problems.push('to which account')
      if (fromId && fromId === toId) problems.push('two different accounts')
      if (problems.length === 0) {
        args = {
          kind: 'transfer',
          fromAccountId: fromId!,
          toAccountId: toId!,
          amount: line.amount!,
          currency: line.currency,
          note: line.note,
          occurredAt: line.occurredAt,
        }
      }
    } else {
      if (!line.symbol) problems.push('which ticker')
      if (line.shares === undefined) problems.push('how many shares')
      if (line.price === undefined) problems.push('the price per share')
      if (!accountId) problems.push('which broker')
      if (f.candidate === null) problems.push('a ticker it can find')
      if (problems.length === 0 && f.candidate) {
        args = {
          kind: line.kind,
          accountId: accountId!,
          candidate: {
            symbol: f.candidate.symbol,
            name: f.candidate.name,
            exchange: f.candidate.exchange,
            type: f.candidate.type,
          },
          shares: line.shares!,
          price: line.price!,
          priceCurrency: line.currency,
          occurredAt: line.occurredAt,
        }
      } else if (problems.length === 0) {
        problems.push('finding the ticker')
      }
    }
    return { line, fix: f, accountId, fromId, toId, category, problems, args }
  }
}

type Resolved = {
  line: ParsedLine
  fix: Fix
  accountId?: Id<'accounts'>
  fromId?: Id<'accounts'>
  toId?: Id<'accounts'>
  category?: string
  problems: Array<string>
}

function LineRow({
  row,
  accounts,
  onFix,
}: {
  row: Resolved
  accounts: Array<Doc<'accounts'>>
  onFix: (patch: Fix) => void
}) {
  const { line } = row
  const kind = line.kind ? KIND[line.kind] : null
  const trade = line.kind === 'buy' || line.kind === 'sell'
  const brokers = accounts.filter((a) => a.kinds.includes('broker'))
  const amount =
    trade && line.shares !== undefined && line.price !== undefined
      ? line.shares * line.price
      : line.amount
  const sign = line.kind === 'in' || line.kind === 'sell' ? '+' : '−'
  const ok = row.problems.length === 0
  return (
    <div
      className={`motion-land flex flex-col gap-2 rounded-[12px] p-2.5 ring-1 ring-inset ${ok ? 'bg-lift/[0.03] ring-lift/10' : 'bg-state-warn/[0.04] ring-state-warn/25'}`}
    >
      <div className="flex items-center gap-2.5">
        {kind ? (
          <span
            className={`inline-flex shrink-0 items-center gap-1 rounded-[6px] px-1.5 py-0.5 font-mono text-[9.5px] tracking-[0.12em] uppercase ring-1 ring-inset ${kind.tone}`}
          >
            <kind.Icon className="size-3" />
            {kind.label}
          </span>
        ) : (
          <span className="font-mono text-[10.5px] text-state-warn">
            not read yet
          </span>
        )}
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-500">
          {line.text}
        </span>
        {amount !== undefined ? (
          <span
            className={`shrink-0 font-mono text-[13.5px] ${line.kind === 'in' ? 'text-state-good' : line.kind === 'out' ? 'text-ink-100' : 'text-lav-300'}`}
          >
            {line.kind === 'transfer' ? '' : sign}
            {money(Math.round(amount * 100) / 100, line.currency)}
          </span>
        ) : null}
        {ok ? <Check className="size-3.5 shrink-0 text-state-good" /> : null}
      </div>
      {line.kind ? (
        <div className="flex flex-wrap items-center gap-1.5 pl-0.5">
          {line.kind === 'transfer' ? (
            <>
              <AccountSelect
                accounts={accounts}
                value={row.fromId}
                placeholder="from which?"
                onChange={(id) => onFix({ fromId: id })}
              />
              <span className="text-ink-500">→</span>
              <AccountSelect
                accounts={accounts.filter((a) => a._id !== row.fromId)}
                value={row.toId}
                placeholder="to which?"
                onChange={(id) => onFix({ toId: id })}
              />
            </>
          ) : (
            <AccountSelect
              accounts={trade ? brokers : accounts}
              value={row.accountId}
              placeholder={
                trade ? 'which broker?' : line.kind === 'in' ? 'into?' : 'from?'
              }
              onChange={(id) => onFix({ accountId: id })}
            />
          )}
          {line.kind === 'out' ? (
            <select
              value={row.category ?? ''}
              onChange={(e) => onFix({ category: e.target.value })}
              aria-label="What it was"
              className={chip(!!row.category)}
            >
              {row.category ? null : <option value="">what was it?</option>}
              {SPEND_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          ) : null}
          {line.kind === 'in' ? (
            <select
              value={row.category ?? 'other'}
              onChange={(e) => onFix({ category: e.target.value })}
              aria-label="What came in"
              className={chip(true)}
            >
              {[...new Set([row.category ?? 'other', ...IN_CATEGORIES])].map(
                (c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ),
              )}
            </select>
          ) : null}
          {trade && line.symbol ? (
            <TickerPick
              symbol={line.symbol}
              value={row.fix.candidate}
              onChange={(c) => onFix({ candidate: c })}
            />
          ) : null}
          {trade && line.shares !== undefined && line.price !== undefined ? (
            <span className="font-mono text-[11px] text-ink-400">
              {line.shares} sh × {money(line.price, line.currency)}
            </span>
          ) : null}
          <span className="ml-auto font-mono text-[10.5px] text-ink-500">
            {Date.now() - line.occurredAt < 60_000
              ? 'now'
              : DAY_FMT.format(new Date(line.occurredAt))}
          </span>
        </div>
      ) : null}
      {row.problems.length > 0 ? (
        <span className="font-mono text-[10.5px] text-state-warn">
          needs {row.problems.join(' · ')}
        </span>
      ) : null}
    </div>
  )
}

const chip = (ok: boolean) =>
  `rounded-[8px] bg-lift/[0.05] px-2 py-1 font-mono text-[11.5px] ring-1 ring-inset ${ok ? 'text-ink-100 ring-lift/15' : 'text-state-warn ring-state-warn/45'}`

function AccountSelect({
  accounts,
  value,
  placeholder,
  onChange,
}: {
  accounts: Array<Doc<'accounts'>>
  value: Id<'accounts'> | undefined
  placeholder: string
  onChange: (id: Id<'accounts'>) => void
}) {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value as Id<'accounts'>)}
      aria-label={placeholder}
      className={chip(!!value)}
    >
      {value ? null : <option value="">{placeholder}</option>}
      {accounts.map((a) => (
        <option key={a._id} value={a._id}>
          {a.name}
        </option>
      ))}
    </select>
  )
}

/* The ticker he typed, found: the exact symbol when the market has it,
   else the likeliest share. Undefined while looking; null when nothing. */
function TickerPick({
  symbol,
  value,
  onChange,
}: {
  symbol: string
  value: Candidate | null | undefined
  onChange: (c: Candidate | null) => void
}) {
  const search = useAction(api.market.search)
  const [found, setFound] = useState<Array<Candidate> | null>(null)
  const change = useRef(onChange)
  change.current = onChange
  useEffect(() => {
    let live = true
    setFound(null)
    const t = setTimeout(() => {
      search({ q: symbol }).then(
        (list) => {
          if (!live) return
          const top = list.slice(0, 6)
          setFound(top)
          const exact = top.findIndex(
            (c) => c.symbol.toUpperCase() === symbol.toUpperCase(),
          )
          const pick = exact >= 0 ? exact : preferClass(symbol, top)
          change.current(pick >= 0 ? top[pick] : null)
        },
        () => live && change.current(null),
      )
    }, 350)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [symbol, search])
  if (found === null) {
    return (
      <span className="inline-flex items-center gap-1 font-mono text-[11px] text-ink-500">
        <Loader2 className="size-3 animate-spin" /> finding {symbol}
      </span>
    )
  }
  if (found.length === 0) {
    return (
      <span className="font-mono text-[11px] text-state-warn">
        no ticker {symbol}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      {value ? <TickerLogo symbol={value.symbol} size={20} /> : null}
      <select
        value={value?.symbol ?? ''}
        onChange={(e) =>
          onChange(found.find((c) => c.symbol === e.target.value) ?? null)
        }
        aria-label={`Ticker for ${symbol}`}
        className={chip(!!value)}
      >
        {found.map((c) => (
          <option key={c.symbol} value={c.symbol}>
            {c.symbol} · {c.name} · {c.exchange}
          </option>
        ))}
      </select>
    </span>
  )
}
