import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { useAction, useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import {
  ArrowDownRight,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { MoneyIcon } from '@/components/finances/icons'
import { AccountLogo, TickerLogo } from '@/components/finances/Logo'
import { PILL } from '@/components/finances/bits'
import { useDayStarts } from '@/components/track/useDayStarts'
import { money } from '@/lib/currency'
import type { Candidate } from '@/lib/market'
import { INCOME_CATEGORIES, SPEND_CATEGORIES } from '@/lib/money'

/* + ADD, by hand (27 Sep, mocked in design/treasury-mockup/add.html).
   A row per thing, of any kind — money in, money out, a transfer, a buy, a
   sell — each prefilled: his account (the last one he used), its currency,
   today. The same row a statement becomes after reading, filled by him
   instead of by the reader. Every field opens our own list — search, icons,
   "+ new" — never a browser select, date input or alert. */

type Kind = 'in' | 'out' | 'transfer' | 'buy' | 'sell'

const KINDS: Record<
  Kind,
  {
    label: string
    Icon: LucideIcon
    tone: string
    icon: string
    /* Its starter lights in its own colour when reached for (27 Sep). */
    hover: string
  }
> = {
  in: {
    label: 'money in',
    Icon: ArrowUpRight,
    tone: 'text-state-good bg-state-good/10 ring-state-good/30',
    icon: 'text-state-good',
    hover:
      'hover:bg-state-good/10 hover:ring-state-good/50 hover:shadow-[0_0_18px_-8px_var(--color-state-good)]',
  },
  out: {
    label: 'money out',
    Icon: ArrowDownRight,
    tone: 'text-state-danger bg-state-danger/10 ring-state-danger/30',
    icon: 'text-state-danger',
    hover:
      'hover:bg-state-danger/10 hover:ring-state-danger/50 hover:shadow-[0_0_18px_-8px_var(--color-state-danger)]',
  },
  transfer: {
    label: 'transfer',
    Icon: ArrowLeftRight,
    tone: 'text-lav-300 bg-lav-400/10 ring-lav-400/30',
    icon: 'text-lav-300',
    hover:
      'hover:bg-lav-400/10 hover:ring-lav-400/50 hover:shadow-[0_0_18px_-8px_var(--color-lav-400)]',
  },
  buy: {
    label: 'buy',
    Icon: TrendingUp,
    tone: 'text-lav-300 bg-lav-400/10 ring-lav-400/30',
    icon: 'text-lav-300',
    hover:
      'hover:bg-lav-400/10 hover:ring-lav-400/50 hover:shadow-[0_0_18px_-8px_var(--color-lav-400)]',
  },
  sell: {
    label: 'sell',
    Icon: TrendingDown,
    tone: 'text-lav-300 bg-lav-400/10 ring-lav-400/30',
    icon: 'text-lav-300',
    hover:
      'hover:bg-lav-400/10 hover:ring-lav-400/50 hover:shadow-[0_0_18px_-8px_var(--color-lav-400)]',
  },
}
const ORDER: Array<Kind> = ['in', 'out', 'transfer', 'buy', 'sell']

type Row = {
  id: number
  kind: Kind
  accountId: Id<'accounts'> | null
  toAccountId: Id<'accounts'> | null
  category: string | null
  amount: string
  currency: string
  day: number
  candidate: Candidate | null
  shares: string
  price: string
  priceCurrency: string
}

const LAST = 'add:lastAccount'
const remembered = (): string | null => {
  try {
    return localStorage.getItem(LAST)
  } catch {
    return null
  }
}
const remember = (id: string) => {
  try {
    localStorage.setItem(LAST, id)
  } catch {
    /* a private window: it simply is not remembered */
  }
}

const num = (s: string) => {
  const n = Number(s.replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}
const US = /nasdaq|nyse|nms|ngm|ncm|amex|bats|pnk|otc/i

const FIELD_BOX =
  'flex h-9 min-w-0 items-center gap-2 rounded-[10px] bg-lift/[0.045] px-2.5 text-[13px] text-foreground ring-1 ring-lift/10 ring-inset transition-shadow'

export function AddRows() {
  const accounts = useQuery(api.accounts.list, {})
  const spent = useQuery(api.logs.categories, { kind: 'expense' })
  const earned = useQuery(api.logs.categories, { kind: 'income' })
  const record = useMutation(api.money.record)
  const days = useDayStarts(1)
  const today = days.at(-1) as number
  const [rows, setRows] = useState<Array<Row>>([])
  const [made, setMade] = useState<{ in: Array<string>; out: Array<string> }>({
    in: [],
    out: [],
  })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [added, setAdded] = useState<string | null>(null)
  const [tried, setTried] = useState(false)
  const next = useRef(1)
  const focusId = useRef<number | null>(null)

  const list = accounts ?? []
  const brokers = list.filter((a) => a.kinds.includes('broker'))
  const byId = (id: Id<'accounts'> | null) =>
    list.find((a) => a._id === id) ?? null

  const categories = (kind: 'in' | 'out') => {
    const base = (kind === 'out' ? SPEND_CATEGORIES : INCOME_CATEGORIES).map(
      (c) => c.id,
    )
    const used = (kind === 'out' ? spent : earned) ?? []
    return [...new Set([...base, ...used, ...made[kind]])]
  }

  function fresh(kind: Kind, like?: Row): Row {
    const trade = kind === 'buy' || kind === 'sell'
    const pool = trade && brokers.length > 0 ? brokers : list
    const last = pool.find((a) => a._id === (like?.accountId ?? remembered()))
    const account = last ?? pool.at(0) ?? null
    const other = list.find((a) => a._id !== account?._id) ?? null
    return {
      id: next.current++,
      kind,
      accountId: account?._id ?? null,
      toAccountId:
        kind === 'transfer' ? (like?.toAccountId ?? other?._id ?? null) : null,
      category: kind === 'in' ? 'salary' : null,
      amount: '',
      currency: account?.currencies[0] ?? 'EUR',
      day: like?.day ?? today,
      candidate: null,
      shares: '',
      price: '',
      priceCurrency: 'USD',
    }
  }

  const add = (kind: Kind, like?: Row) => {
    const row = fresh(kind, like)
    focusId.current = row.id
    setRows((r) => [...r, row])
    setAdded(null)
    setError(null)
  }
  const patch = (id: number, p: Partial<Row>) =>
    setRows((r) => r.map((x) => (x.id === id ? { ...x, ...p } : x)))
  const drop = (id: number) => setRows((r) => r.filter((x) => x.id !== id))

  /* What each row still needs — named, and only shown once he tries. */
  const missing = (r: Row): Array<string> => {
    const m: Array<string> = []
    if (!r.accountId) m.push('account')
    if (r.kind === 'transfer') {
      if (!r.toAccountId) m.push('to')
      else if (r.toAccountId === r.accountId) m.push('to')
    }
    if ((r.kind === 'in' || r.kind === 'out') && !r.category) m.push('what')
    if (r.kind === 'buy' || r.kind === 'sell') {
      if (!r.candidate) m.push('what')
      if (!num(r.shares)) m.push('shares')
      if (!num(r.price)) m.push('price')
    } else if (!num(r.amount)) m.push('amount')
    return m
  }

  const inSum = rows
    .filter((r) => r.kind === 'in')
    .reduce((s, r) => s + (num(r.amount) ?? 0), 0)
  const outSum = rows
    .filter((r) => r.kind === 'out')
    .reduce((s, r) => s + (num(r.amount) ?? 0), 0)
  const open = rows.filter((r) => missing(r).length > 0).length

  async function save() {
    setTried(true)
    setError(null)
    if (rows.length === 0 || open > 0) return
    setBusy(true)
    try {
      const at = (day: number) =>
        day >= today ? Date.now() : day + 12 * 3_600_000
      await record({
        lines: rows.map((r) => {
          const occurredAt = at(r.day)
          if (r.kind === 'in' || r.kind === 'out')
            return {
              kind: r.kind,
              accountId: r.accountId as Id<'accounts'>,
              amount: num(r.amount) as number,
              currency: r.currency,
              category: r.category as string,
              occurredAt,
            }
          if (r.kind === 'transfer')
            return {
              kind: 'transfer' as const,
              fromAccountId: r.accountId as Id<'accounts'>,
              toAccountId: r.toAccountId as Id<'accounts'>,
              amount: num(r.amount) as number,
              currency: r.currency,
              occurredAt,
            }
          const c = r.candidate as Candidate
          return {
            kind: r.kind,
            accountId: r.accountId as Id<'accounts'>,
            candidate: {
              symbol: c.symbol,
              name: c.name,
              exchange: c.exchange,
              type: c.type,
            },
            shares: num(r.shares) as number,
            price: num(r.price) as number,
            priceCurrency: r.priceCurrency,
            occurredAt,
          }
        }),
      })
      const first = rows.at(0)
      if (first?.accountId) remember(first.accountId)
      setAdded(
        [
          `Added ${rows.length}`,
          inSum ? `+${money(inSum, 'EUR')}` : '',
          outSum ? `−${money(outSum, 'EUR')}` : '',
        ]
          .filter(Boolean)
          .join(' · '),
      )
      setRows([])
      setTried(false)
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message.replace(/^.*?ConvexError: /, '').split('\n')[0]
          : 'Not saved — try again.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="label-caps mr-1">or add</span>
        {ORDER.map((k) => {
          const { Icon, label, icon, hover } = KINDS[k]
          return (
            <button
              key={k}
              type="button"
              onClick={() => add(k)}
              className={`${PILL} text-foreground ring-lift/15 ${hover}`}
            >
              <Icon className={`size-3.5 ${icon}`} />
              {label}
            </button>
          )
        })}
      </div>

      {rows.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          {rows.map((r) => (
            <RowView
              key={r.id}
              row={r}
              accounts={list}
              account={byId(r.accountId)}
              categories={
                r.kind === 'in' || r.kind === 'out' ? categories(r.kind) : []
              }
              need={tried ? missing(r) : []}
              focus={focusId.current === r.id}
              today={today}
              onFocused={() => (focusId.current = null)}
              onPatch={(p) => patch(r.id, p)}
              onKind={(kind) =>
                patch(r.id, {
                  kind,
                  category: kind === 'in' ? 'salary' : null,
                  toAccountId:
                    kind === 'transfer'
                      ? (list.find((a) => a._id !== r.accountId)?._id ?? null)
                      : null,
                })
              }
              onCreate={(kind, name) =>
                setMade((m) => ({ ...m, [kind]: [...m[kind], name] }))
              }
              onAnother={() => add(r.kind, r)}
              onRemove={() => drop(r.id)}
            />
          ))}
        </div>
      ) : added ? (
        <p className="motion-land rounded-[14px] bg-state-good/[0.08] px-4 py-3 font-mono text-[12px] text-state-good ring-1 ring-state-good/30 ring-inset">
          <Check className="mr-2 inline size-3.5" />
          {added}
        </p>
      ) : null}

      {rows.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-lav-400/12 pt-3">
          <span className="min-w-0 flex-1 font-mono text-[12px] text-ink-400">
            {rows.length} row{rows.length > 1 ? 's' : ''}
            {inSum ? (
              <span className="text-state-good"> · +{money(inSum, 'EUR')}</span>
            ) : null}
            {outSum ? (
              <span className="text-state-danger">
                {' '}
                · −{money(outSum, 'EUR')}
              </span>
            ) : null}
            {tried && open > 0 ? (
              <span className="text-state-warn"> · {open} to finish</span>
            ) : null}
          </span>
          {error ? (
            <span className="w-full font-mono text-[11px] text-state-warn sm:order-last">
              {error}
            </span>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="motion-press inline-flex items-center gap-2 rounded-full bg-lav-400 px-5 py-2.5 font-mono text-[11px] font-medium tracking-[0.14em] text-background uppercase shadow-[0_0_22px_-8px_var(--system-shine)] disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
            add {rows.length}
          </button>
        </div>
      ) : null}
    </div>
  )
}

/* ---- One row ------------------------------------------------------------ */

function RowView({
  row: r,
  accounts,
  account,
  categories,
  need,
  focus,
  today,
  onFocused,
  onPatch,
  onKind,
  onCreate,
  onAnother,
  onRemove,
}: {
  row: Row
  accounts: Array<Doc<'accounts'>>
  account: Doc<'accounts'> | null
  categories: Array<string>
  need: Array<string>
  focus: boolean
  today: number
  onFocused: () => void
  onPatch: (p: Partial<Row>) => void
  onKind: (k: Kind) => void
  onCreate: (kind: 'in' | 'out', name: string) => void
  onAnother: () => void
  onRemove: () => void
}) {
  const amountRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!focus) return
    amountRef.current?.focus()
    onFocused()
  }, [focus, onFocused])
  const { Icon, label, tone } = KINDS[r.kind]
  const trade = r.kind === 'buy' || r.kind === 'sell'
  const warn = (f: string) => (need.includes(f) ? 'ring-state-warn/70' : '')
  const enter = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      onAnother()
    }
  }
  const accountItems = (except?: Id<'accounts'> | null) =>
    accounts
      .filter((a) => a._id !== except)
      .map((a) => ({
        key: a._id,
        label: a.name,
        icon: <AccountLogo name={a.name} domain={a.domain ?? null} size={20} />,
        sub: a.kinds.join(' · '),
      }))
  const currencies = account?.currencies ?? ['EUR']
  const catKind = r.kind === 'in' ? 'income' : 'expense'

  return (
    <div className="motion-arrive grid grid-cols-2 items-center gap-2 rounded-[14px] bg-lift/[0.03] p-2 ring-1 ring-lift/[0.07] ring-inset sm:grid-cols-[128px_150px_minmax(0,1fr)_180px_118px_28px]">
      {/* The kind: its badge, and a tap to change it. */}
      <Picker
        className={`col-span-2 w-fit sm:col-span-1 sm:w-auto ${tone} ring-1 ring-inset`}
        trigger={
          <>
            <Icon className="size-3.5 shrink-0" />
            <span className="font-mono text-[10px] tracking-[0.12em] whitespace-nowrap uppercase">
              {label}
            </span>
          </>
        }
        items={ORDER.map((k) => {
          const K = KINDS[k].Icon
          return {
            key: k,
            label: KINDS[k].label,
            icon: <K className={`size-4 ${KINDS[k].icon}`} />,
          }
        })}
        onPick={(k) => onKind(k as Kind)}
        plain
      />

      <Picker
        className={warn('account')}
        trigger={
          account ? (
            <>
              <AccountLogo
                name={account.name}
                domain={account.domain ?? null}
                size={20}
              />
              <span className="truncate">{account.name}</span>
            </>
          ) : (
            <span className="text-ink-500">account</span>
          )
        }
        items={accountItems()}
        placeholder="your accounts"
        onPick={(id) => {
          const a = accounts.find((x) => x._id === id)
          onPatch({
            accountId: id as Id<'accounts'>,
            currency: a?.currencies.includes(r.currency)
              ? r.currency
              : (a?.currencies[0] ?? 'EUR'),
          })
        }}
      />

      {r.kind === 'transfer' ? (
        <Picker
          className={warn('to')}
          trigger={
            <>
              <ArrowRight className="size-3.5 shrink-0 text-ink-500" />
              {r.toAccountId ? (
                (() => {
                  const to = accounts.find((a) => a._id === r.toAccountId)
                  return to ? (
                    <>
                      <AccountLogo
                        name={to.name}
                        domain={to.domain ?? null}
                        size={20}
                      />
                      <span className="truncate">{to.name}</span>
                    </>
                  ) : null
                })()
              ) : (
                <span className="text-ink-500">to which account?</span>
              )}
            </>
          }
          items={accountItems(r.accountId)}
          placeholder="to which account"
          onPick={(id) => onPatch({ toAccountId: id as Id<'accounts'> })}
        />
      ) : trade ? (
        <TickerPicker
          className={warn('what')}
          value={r.candidate}
          onPick={(c) =>
            onPatch({
              candidate: c,
              priceCurrency: US.test(c.exchange) ? 'USD' : 'EUR',
            })
          }
        />
      ) : (
        <Picker
          className={warn('what')}
          trigger={
            r.category ? (
              <>
                <MoneyIcon
                  kind={catKind}
                  category={r.category}
                  className="size-4 shrink-0 text-ink-400"
                />
                <span className="truncate">{r.category}</span>
              </>
            ) : (
              <span className="text-ink-500">what was it?</span>
            )
          }
          items={categories.map((c) => ({
            key: c,
            label: c,
            icon: (
              <MoneyIcon
                kind={catKind}
                category={c}
                className="size-4 text-ink-400"
              />
            ),
          }))}
          placeholder="search, or name a new one"
          onPick={(c) => onPatch({ category: c })}
          onCreate={(name) => {
            const c = name.trim().toLowerCase().slice(0, 24)
            onCreate(r.kind as 'in' | 'out', c)
            onPatch({ category: c })
          }}
        />
      )}

      {trade ? (
        <div
          className={`${FIELD_BOX} col-span-2 sm:col-span-1 ${need.includes('shares') || need.includes('price') ? 'ring-state-warn/70' : ''}`}
        >
          <input
            ref={amountRef}
            value={r.shares}
            onChange={(e) => onPatch({ shares: e.target.value })}
            onKeyDown={enter}
            inputMode="decimal"
            placeholder="shares"
            className="w-0 min-w-0 flex-1 bg-transparent text-right font-mono text-[13.5px] outline-none placeholder:text-ink-600"
          />
          <span className="font-mono text-ink-500">×</span>
          <input
            value={r.price}
            onChange={(e) => onPatch({ price: e.target.value })}
            onKeyDown={enter}
            inputMode="decimal"
            placeholder="price"
            className="w-0 min-w-0 flex-1 bg-transparent text-right font-mono text-[13.5px] outline-none placeholder:text-ink-600"
          />
          <Picker
            bare
            trigger={
              <span className="font-mono text-[11px] text-ink-400">
                {r.priceCurrency}
              </span>
            }
            items={['USD', 'EUR', 'GBP'].map((c) => ({ key: c, label: c }))}
            onPick={(c) => onPatch({ priceCurrency: c })}
            plain
          />
        </div>
      ) : (
        <div
          className={`${FIELD_BOX} col-span-2 sm:col-span-1 ${warn('amount')}`}
        >
          <span
            className={`font-mono text-[13.5px] ${r.kind === 'in' ? 'text-state-good' : r.kind === 'out' ? 'text-state-danger' : 'text-ink-500'}`}
          >
            {r.kind === 'in' ? '+' : r.kind === 'out' ? '−' : ''}
          </span>
          <input
            ref={amountRef}
            value={r.amount}
            onChange={(e) => onPatch({ amount: e.target.value })}
            onKeyDown={enter}
            inputMode="decimal"
            placeholder="0.00"
            className={`w-0 min-w-0 flex-1 bg-transparent text-right font-mono text-[13.5px] outline-none placeholder:text-ink-600 ${r.kind === 'in' ? 'text-state-good' : r.kind === 'out' ? 'text-state-danger' : 'text-foreground'}`}
          />
          {currencies.length > 1 ? (
            <Picker
              bare
              trigger={
                <span className="font-mono text-[11px] text-ink-400">
                  {r.currency}
                </span>
              }
              items={currencies.map((c) => ({ key: c, label: c }))}
              onPick={(c) => onPatch({ currency: c })}
              plain
            />
          ) : (
            <span className="border-l border-lift/10 pl-2 font-mono text-[11px] text-ink-400">
              {r.currency}
            </span>
          )}
        </div>
      )}

      <DayPicker day={r.day} today={today} onPick={(day) => onPatch({ day })} />

      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove this row"
        className="motion-press grid size-7 place-items-center justify-self-end rounded-full text-ink-500 hover:bg-lift/5 hover:text-state-danger"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}

/* ---- Our own list ------------------------------------------------------- */

type Item = { key: string; label: string; icon?: React.ReactNode; sub?: string }

/**
 * A field that opens a list above everything (a portal — the rows below
 * never show through it): search at the top, icons, and "+ new" when
 * `onCreate` is given. `onSearch` fetches instead of filtering.
 */
function Picker({
  trigger,
  items,
  onPick,
  onCreate,
  onSearch,
  placeholder = 'search',
  className = '',
  plain = false,
  bare = false,
  keepOpen,
  children,
}: {
  trigger: React.ReactNode
  items: Array<Item>
  onPick: (key: string) => void
  onCreate?: (name: string) => void
  onSearch?: (q: string) => Promise<Array<Item>>
  placeholder?: string
  className?: string
  /** No search box: a short fixed list. */
  plain?: boolean
  /** No box of its own: sits inside another field. */
  bare?: boolean
  /** Items that open more of the list instead of closing it. */
  keepOpen?: (key: string) => boolean
  /** Shown under the list (the day picker's month). */
  children?: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [found, setFound] = useState<Array<Item> | null>(null)
  const [searching, setSearching] = useState(false)
  const [failed, setFailed] = useState(false)
  const [hl, setHl] = useState(0)
  const [pos, setPos] = useState<{
    top: number
    left: number
    width: number
    up: boolean
  } | null>(null)
  const anchor = useRef<HTMLButtonElement>(null)
  const pop = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open || !anchor.current) return
    const place = () => {
      const r = (anchor.current as HTMLButtonElement).getBoundingClientRect()
      const up = window.innerHeight - r.bottom < 300 && r.top > 300
      setPos({
        top: up ? r.top - 6 : r.bottom + 6,
        left: r.left,
        width: r.width,
        up,
      })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      const t = e.target as Node
      if (!pop.current?.contains(t) && !anchor.current?.contains(t)) close()
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        close()
      }
    }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc, true)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', esc, true)
    }
  }, [open])

  useEffect(() => {
    if (!open || !onSearch) return
    const text = q.trim()
    if (text.length < 1) {
      setFound(null)
      return
    }
    setSearching(true)
    setFailed(false)
    const t = setTimeout(() => {
      onSearch(text)
        .then((r) => setFound(r))
        .catch(() => setFailed(true))
        .finally(() => setSearching(false))
    }, 250)
    return () => clearTimeout(t)
  }, [q, open, onSearch])

  function close() {
    setOpen(false)
    setQ('')
    setFound(null)
    setHl(0)
  }

  const text = q.trim().toLowerCase()
  const shown = onSearch
    ? (found ?? [])
    : items.filter((i) => i.label.toLowerCase().includes(text))
  const canCreate =
    onCreate !== undefined &&
    text.length > 0 &&
    !items.some((i) => i.label.toLowerCase() === text)
  const pick = (key: string) => {
    onPick(key)
    if (!keepOpen?.(key)) close()
  }

  return (
    <>
      <button
        ref={anchor}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        className={
          bare
            ? `motion-press shrink-0 border-l border-lift/10 pl-2 ${className}`
            : `motion-press ${FIELD_BOX} w-full justify-start text-left hover:ring-lift/20 ${open ? 'ring-lav-400/60' : ''} ${className}`
        }
      >
        {trigger}
        {bare ? null : (
          <ChevronDown className="ml-auto size-3.5 shrink-0 text-ink-500" />
        )}
      </button>
      {open && pos
        ? createPortal(
            <div
              ref={pop}
              style={{
                position: 'fixed',
                left: Math.min(pos.left, window.innerWidth - 296),
                top: pos.up ? undefined : pos.top,
                bottom: pos.up ? window.innerHeight - pos.top : undefined,
                minWidth: Math.max(pos.width, 200),
                maxWidth: 320,
              }}
              className="motion-arrive z-[80] flex max-h-[300px] flex-col gap-0.5 overflow-auto rounded-[14px] bg-popover p-1.5 shadow-[0_24px_60px_-12px_rgb(0_0_0/0.8)] ring-1 ring-lav-400/30"
            >
              {plain ? null : (
                <input
                  autoFocus
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value)
                    setHl(0)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown')
                      setHl((h) =>
                        Math.min(h + 1, shown.length - (canCreate ? 0 : 1)),
                      )
                    if (e.key === 'ArrowUp') setHl((h) => Math.max(h - 1, 0))
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      if (hl < shown.length && shown[hl]) pick(shown[hl].key)
                      else if (canCreate) {
                        onCreate(q.trim())
                        close()
                      }
                    }
                  }}
                  placeholder={placeholder}
                  className="mb-1 rounded-[9px] bg-lift/[0.05] px-2.5 py-2 text-[13px] text-foreground outline-none placeholder:text-ink-500"
                />
              )}
              {searching ? (
                <span className="flex items-center gap-2 px-2.5 py-2 font-mono text-[11px] text-ink-500">
                  <Loader2 className="size-3 animate-spin" /> searching…
                </span>
              ) : failed ? (
                <span className="px-2.5 py-2 font-mono text-[11px] text-state-warn">
                  The search did not answer — try again.
                </span>
              ) : onSearch && text && found?.length === 0 ? (
                <span className="px-2.5 py-2 font-mono text-[11px] text-ink-500">
                  Nothing called “{q.trim()}”.
                </span>
              ) : onSearch && !text ? (
                <span className="px-2.5 py-2 font-mono text-[11px] text-ink-500">
                  A ticker, a name or an ISIN — CRWD, Netflix, S&amp;P 500…
                </span>
              ) : null}
              {shown.map((i, n) => (
                <button
                  key={i.key}
                  type="button"
                  onMouseEnter={() => setHl(n)}
                  onClick={() => pick(i.key)}
                  className={`flex items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left text-[13px] ${n === hl ? 'bg-lav-400/12 text-foreground' : 'text-ink-200'}`}
                >
                  {i.icon}
                  <span className="min-w-0 flex-1 truncate">{i.label}</span>
                  {i.sub ? (
                    <span className="shrink-0 font-mono text-[10.5px] text-ink-500">
                      {i.sub}
                    </span>
                  ) : null}
                </button>
              ))}
              {onCreate && !plain ? (
                canCreate ? (
                  <button
                    type="button"
                    onMouseEnter={() => setHl(shown.length)}
                    onClick={() => {
                      onCreate(q.trim())
                      close()
                    }}
                    className={`flex items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left text-[13px] text-lav-300 ${hl === shown.length ? 'bg-lav-400/12' : ''}`}
                  >
                    <Plus className="size-4" />
                    <span className="flex-1">new: “{q.trim()}”</span>
                    <span className="font-mono text-[10.5px] text-ink-500">
                      kept for next time
                    </span>
                  </button>
                ) : (
                  <span className="flex items-center gap-2.5 border-t border-lift/[0.07] px-2.5 pt-2 pb-1 font-mono text-[10.5px] text-ink-500">
                    <Plus className="size-3.5 text-lav-300" /> type above to
                    make a new one
                  </span>
                )
              ) : null}
              {children}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}

/* Tickers from the market (Yahoo, through market.search), with logos. */
function TickerPicker({
  value,
  onPick,
  className,
}: {
  value: Candidate | null
  onPick: (c: Candidate) => void
  className: string
}) {
  const search = useAction(api.market.search)
  const last = useRef<Array<Candidate>>([])
  const onSearch = useCallback(
    async (q: string) => {
      const found = await search({ q })
      last.current = found
      return found.map((c) => ({
        key: c.symbol,
        label: `${c.symbol} · ${c.name}`,
        icon: <TickerLogo symbol={c.symbol} size={20} />,
        sub: `${c.exchange}${c.type === 'ETF' ? ' · ETF' : c.type === 'MUTUALFUND' ? ' · fund' : ''}`,
      }))
    },
    [search],
  )
  return (
    <Picker
      className={className}
      trigger={
        value ? (
          <>
            <TickerLogo symbol={value.symbol} size={20} />
            <span className="truncate">
              {value.symbol}{' '}
              <span className="text-ink-500">· {value.name}</span>
            </span>
          </>
        ) : (
          <span className="truncate text-ink-500">search a ticker or fund</span>
        )
      }
      items={[]}
      onSearch={onSearch}
      placeholder="CRWD, Netflix, S&P 500…"
      onPick={(symbol) => {
        const c = last.current.find((x) => x.symbol === symbol)
        if (c) onPick(c)
      }}
    />
  )
}

/* The day: today · yesterday · a small month of our own. */
function DayPicker({
  day,
  today,
  onPick,
}: {
  day: number
  today: number
  onPick: (day: number) => void
}) {
  const [month, setMonth] = useState(() => {
    const d = new Date(day)
    return new Date(d.getFullYear(), d.getMonth(), 1).getTime()
  })
  const [open, setOpen] = useState(false)
  const DAY = 86_400_000
  const back = (n: number) => {
    const d = new Date(today)
    d.setDate(d.getDate() - n)
    return d.getTime()
  }
  const label =
    day === today
      ? 'today'
      : day === back(1)
        ? 'yesterday'
        : new Intl.DateTimeFormat(undefined, {
            day: 'numeric',
            month: 'short',
          }).format(day)
  const m = new Date(month)
  const first = (m.getDay() + 6) % 7
  const inMonth = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate()
  const cells = Array.from({ length: first + inMonth }, (_, i) =>
    i < first
      ? null
      : new Date(m.getFullYear(), m.getMonth(), i - first + 1).getTime(),
  )
  return (
    <Picker
      trigger={
        <>
          <CalendarDays className="size-3.5 shrink-0 text-ink-500" />
          <span className="truncate">{label}</span>
        </>
      }
      items={[
        { key: String(today), label: 'today' },
        { key: String(back(1)), label: 'yesterday' },
        { key: 'pick', label: open ? 'hide the month' : 'another day…' },
      ].map((i) => ({
        ...i,
        icon: <CalendarDays className="size-4 text-ink-500" />,
      }))}
      plain
      keepOpen={(k) => k === 'pick'}
      onPick={(k) => {
        if (k === 'pick') setOpen((o) => !o)
        else onPick(Number(k))
      }}
      className="col-span-1"
    >
      {open ? (
        <div className="grid grid-cols-7 gap-0.5 p-1 font-mono text-[11px]">
          <button
            type="button"
            onClick={() =>
              setMonth(new Date(m.getFullYear(), m.getMonth() - 1, 1).getTime())
            }
            className="grid place-items-center text-ink-400"
          >
            <ChevronLeft className="size-3.5" />
          </button>
          <span className="col-span-5 text-center text-ink-300">
            {new Intl.DateTimeFormat(undefined, {
              month: 'long',
              year: 'numeric',
            }).format(month)}
          </span>
          <button
            type="button"
            disabled={month + 31 * DAY > today}
            onClick={() =>
              setMonth(new Date(m.getFullYear(), m.getMonth() + 1, 1).getTime())
            }
            className="grid place-items-center text-ink-400 disabled:opacity-30"
          >
            <ChevronRight className="size-3.5" />
          </button>
          {cells.map((c, i) =>
            c === null ? (
              <span key={i} />
            ) : (
              <button
                key={i}
                type="button"
                disabled={c > today}
                onClick={() => {
                  onPick(c)
                  setOpen(false)
                }}
                className={`h-7 rounded-[7px] ${c === day ? 'bg-lav-400 text-background' : 'text-ink-200 hover:bg-lav-400/12'} disabled:opacity-25`}
              >
                {new Date(c).getDate()}
              </button>
            ),
          )}
        </div>
      ) : null}
    </Picker>
  )
}
