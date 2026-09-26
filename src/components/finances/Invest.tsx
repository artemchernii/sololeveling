import { useEffect, useRef, useState } from 'react'
import { useAction, useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import {
  CandlestickChart,
  Check,
  ImageUp,
  Loader2,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import {
  FIELD,
  PILL_LOUD,
  PILL_QUIET,
  Panel,
  Sparkline,
} from '@/components/finances/bits'
import { Sparks } from '@/components/track/Sparks'
import { useDayStarts } from '@/components/track/useDayStarts'
import { agoLabel } from '@/lib/format'
import { IMPORT_MODEL_NAME, MAX_IMPORT_IMAGES } from '@/lib/market'
import type { Candidate } from '@/lib/market'
import { euros } from '@/lib/money'
import { Veiled, VeilToggle } from '@/components/finances/Veil'

const DATE = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
})

/* Investments (Finances F4, 26 Sep). What he holds, per account: each
   position's shares (the sum of its trades), its worth at the last stored
   close and rate — with the time that close is for — what he put in, and
   the line of stored closes. No gain, no loss, no percent: held back.

   Two ways in: a buy or sell typed with the ticker found by search, or a
   broker screenshot read by Claude Haiku 4.5 into rows he checks and
   confirms. */
export function Invest() {
  const data = useQuery(api.aggregate.positions, {})
  const accounts = useQuery(api.accounts.list, {})
  const imports = useQuery(api.invest.openImports, {})
  const [mode, setMode] = useState<'trade' | 'import' | null>(null)
  /* Any account can hold shares — Revolut is a bank with a broker inside
     (26 Sep). Brokers first, since that is where most trades go. */
  const pickable = [...(accounts ?? [])].sort(
    (a, b) => Number(b.kind === 'broker') - Number(a.kind === 'broker'),
  )

  return (
    <div className="flex flex-col gap-3">
      <Panel
        title="investments"
        aside={
          <>
            <VeilToggle />
            <button
              type="button"
              onClick={() => setMode(mode === 'import' ? null : 'import')}
              className={mode === 'import' ? PILL_LOUD : PILL_QUIET}
            >
              <ImageUp className="size-3" />
              screenshot
            </button>
            <button
              type="button"
              onClick={() => setMode(mode === 'trade' ? null : 'trade')}
              className={mode === 'trade' ? PILL_LOUD : PILL_QUIET}
            >
              <Plus className="size-3" />
              trade
            </button>
          </>
        }
      >
        {accounts !== undefined && accounts.length === 0 ? (
          <p className="text-[13.5px] text-ink-400">
            Add your broker accounts on the Balances tab first — TR, 212 — then
            bring your positions in here.
          </p>
        ) : null}
        {mode === 'import' && pickable.length > 0 ? (
          <StartImport accounts={pickable} onStarted={() => setMode(null)} />
        ) : null}
        {mode === 'trade' && pickable.length > 0 ? (
          <AddTrade accounts={pickable} onDone={() => setMode(null)} />
        ) : null}

        {data === undefined ? null : data.rows.length === 0 ? (
          mode === null && (accounts?.length ?? 0) > 0 ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CandlestickChart className="size-6 text-area" />
              <p className="max-w-sm text-[13.5px] text-ink-400">
                Take a screenshot of your portfolio in Trade Republic. It is
                read once, you check each ticker, the shares and your price, and
                they land here.
              </p>
              <button
                type="button"
                onClick={() => setMode('import')}
                className={PILL_LOUD}
              >
                <ImageUp className="size-3" />
                import a screenshot
              </button>
            </div>
          ) : null
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span
                key={data.totalEur}
                className="motion-pop text-[34px] leading-none font-light text-foreground"
              >
                <Veiled>{euros(data.totalEur)}</Veiled>
              </span>
              <span className="font-mono text-[11px] text-ink-500">
                {data.oldestPriceAsOf === null
                  ? 'prices on their way'
                  : `at closes as of ${DATE.format(new Date(data.oldestPriceAsOf))} · ${'Yahoo Finance'}`}
                {data.unvalued > 0
                  ? ` · ${data.unvalued} without a price yet`
                  : ''}
              </span>
            </div>
            {(accounts ?? [])
              .filter((a) => data.rows.some((r) => r.accountId === a._id))
              .map((a) => (
                <div key={a._id} className="flex flex-col gap-1.5">
                  <span className="label-caps">{a.name}</span>
                  {data.rows
                    .filter((r) => r.accountId === a._id)
                    .map((r, i) => (
                      <PositionRow
                        key={r.instrumentId}
                        row={r}
                        delay={i * 40}
                      />
                    ))}
                </div>
              ))}
          </>
        )}
      </Panel>

      {(imports ?? []).map((imp) => (
        <ImportReview
          key={imp._id}
          imp={imp}
          accountName={
            accounts?.find((a) => a._id === imp.accountId)?.name ?? ''
          }
        />
      ))}
    </div>
  )
}

type Position = {
  accountId: Id<'accounts'>
  instrumentId: Id<'instruments'>
  symbol: string
  name: string
  type: string
  currency: string
  shares: number
  putIn: number
  price: number | null
  priceAsOf: number | null
  valueEur: number | null
}

function PositionRow({ row, delay }: { row: Position; delay: number }) {
  const today = useDayStarts(1).at(-1) as number
  const line = useQuery(api.invest.priceLine, {
    instrumentId: row.instrumentId,
    since: today - 90 * 86_400_000,
  })
  const [open, setOpen] = useState(false)

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{ animationDelay: `${delay}ms` }}
        className={`motion-press motion-land flex min-h-16 items-center gap-3 rounded-[14px] px-2.5 py-2 text-left ring-1 transition-colors ring-inset ${
          open
            ? 'bg-lav-400/8 ring-lav-400/35'
            : 'ring-lift/8 hover:ring-lift/20'
        }`}
      >
        <span className="grid h-9 min-w-14 place-items-center rounded-[10px] bg-(--area)/15 px-2 font-mono text-[11px] tracking-[0.06em] text-area">
          {row.symbol.split('.')[0]}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[14px] text-foreground">
            {row.name}
          </span>
          <span className="truncate font-mono text-[11px] text-ink-500">
            <Veiled>
              {row.shares} sh · put in {euros(row.putIn)}
            </Veiled>
          </span>
        </span>
        <Sparkline
          className="hidden h-8 w-20 sm:block"
          points={(line ?? []).map((p) => ({ t: p.asOf, v: p.price }))}
        />
        <span className="flex flex-col items-end">
          <span className="font-mono text-[15px] font-light text-foreground">
            {row.valueEur === null ? (
              '—'
            ) : (
              <Veiled>{euros(row.valueEur)}</Veiled>
            )}
          </span>
          <span className="font-mono text-[10.5px] text-ink-500">
            {row.price === null || row.priceAsOf === null
              ? 'price on its way'
              : `${row.price} ${row.currency} · ${DATE.format(new Date(row.priceAsOf))}`}
          </span>
        </span>
      </button>
      {open ? (
        <Trades accountId={row.accountId} instrumentId={row.instrumentId} />
      ) : null}
    </div>
  )
}

function Trades({
  accountId,
  instrumentId,
}: {
  accountId: Id<'accounts'>
  instrumentId: Id<'instruments'>
}) {
  const rows = useQuery(api.invest.trades, { accountId, instrumentId })
  const remove = useMutation(api.invest.removeTrade)
  return (
    <div className="motion-arrive ml-6 flex flex-col border-l border-lav-400/20 py-1 pl-2.5">
      {(rows ?? []).map((t) => (
        <div
          key={t._id}
          className="group flex min-h-9 items-center gap-2.5 text-[13px]"
        >
          <span
            className={`w-10 font-mono text-[10.5px] tracking-[0.12em] uppercase ${
              t.side === 'buy' ? 'text-area' : 'text-ink-300'
            }`}
          >
            {t.side}
          </span>
          <span className="flex-1 text-ink-200">
            <Veiled>
              {t.shares} × {euros(t.priceEur)}
            </Veiled>
            {t.importId ? (
              <span className="ml-2 font-mono text-[10px] text-ink-600">
                from screenshot
              </span>
            ) : null}
          </span>
          <span className="font-mono text-[11px] text-ink-500">
            {DATE.format(new Date(t.occurredAt))}
          </span>
          <button
            type="button"
            aria-label="Remove this trade"
            onClick={() => void remove({ tradeId: t._id })}
            className="grid size-5 place-items-center rounded-[6px] text-ink-700 opacity-0 group-hover:opacity-100 hover:text-state-danger [@media(hover:none)]:opacity-100"
          >
            <X className="size-3" />
          </button>
        </div>
      ))}
    </div>
  )
}

/* Type "tsla" or an ISIN; pick what the market calls it. */
function TickerSearch({
  initial = '',
  onPick,
}: {
  initial?: string
  onPick: (c: Candidate) => void
}) {
  const search = useAction(api.market.search)
  const [q, setQ] = useState(initial)
  const [results, setResults] = useState<Array<Candidate> | null>(null)
  const [busy, setBusy] = useState(false)
  const seq = useRef(0)

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) {
      setResults(null)
      return
    }
    const mine = ++seq.current
    setBusy(true)
    const timer = setTimeout(() => {
      search({ q: term })
        .then((r) => {
          if (mine === seq.current) setResults(r)
        })
        .catch(() => {
          if (mine === seq.current) setResults([])
        })
        .finally(() => {
          if (mine === seq.current) setBusy(false)
        })
    }, 300)
    return () => clearTimeout(timer)
  }, [q, search])

  return (
    <div className="flex flex-col gap-1.5">
      <label className={`${FIELD} flex items-center gap-2`}>
        {busy ? (
          <Loader2 className="size-4 animate-spin text-lav-400" />
        ) : (
          <Search className="size-4 text-ink-500" />
        )}
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="tsla, vwce, an ISIN…"
          aria-label="Find a ticker"
          className="w-full bg-transparent focus:outline-none"
        />
      </label>
      {results !== null ? (
        results.length === 0 ? (
          <span className="px-1 font-mono text-[11px] text-ink-500">
            nothing found
          </span>
        ) : (
          <div className="flex flex-col">
            {results.map((c) => (
              <button
                key={c.symbol}
                type="button"
                onClick={() => onPick(c)}
                className="motion-press flex items-center gap-2.5 rounded-[10px] px-2 py-1.5 text-left hover:bg-lav-400/10"
              >
                <span className="w-20 shrink-0 font-mono text-[12px] text-area">
                  {c.symbol}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-ink-100">
                  {c.name}
                </span>
                <span className="font-mono text-[10.5px] text-ink-500">
                  {c.exchange} · {c.type.toLowerCase()}
                </span>
              </button>
            ))}
          </div>
        )
      ) : null}
    </div>
  )
}

function AccountPick({
  accounts,
  value,
  onChange,
}: {
  accounts: Array<Doc<'accounts'>>
  value: Id<'accounts'>
  onChange: (id: Id<'accounts'>) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {accounts.map((a) => (
        <button
          key={a._id}
          type="button"
          aria-pressed={value === a._id}
          onClick={() => onChange(a._id)}
          className={value === a._id ? PILL_LOUD : PILL_QUIET}
        >
          {a.name}
        </button>
      ))}
    </div>
  )
}

function AddTrade({
  accounts,
  onDone,
}: {
  accounts: Array<Doc<'accounts'>>
  onDone: () => void
}) {
  const add = useMutation(api.invest.addTrade)
  const [accountId, setAccountId] = useState(accounts[0]._id)
  const [ticker, setTicker] = useState<Candidate | null>(null)
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [shares, setShares] = useState('')
  const [price, setPrice] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [error, setError] = useState<string | null>(null)
  const [burst, setBurst] = useState(0)

  async function save() {
    if (ticker === null) return
    const at = new Date(`${date}T12:00:00`).getTime()
    try {
      await add({
        accountId,
        candidate: ticker,
        side,
        shares: Number(shares.replace(',', '.')),
        priceEur: Number(price.replace(',', '.')),
        occurredAt: Math.min(at, Date.now()),
      })
      setBurst((b) => b + 1)
      setTimeout(onDone, 500)
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message.replace(/^.*: /, '').split('\n')[0]
          : 'Not saved',
      )
    }
  }

  return (
    <div className="motion-arrive flex flex-col gap-2.5 rounded-[14px] bg-lav-400/6 p-3 ring-1 ring-lav-400/25 ring-inset">
      <AccountPick
        accounts={accounts}
        value={accountId}
        onChange={setAccountId}
      />
      {ticker === null ? (
        <TickerSearch onPick={setTicker} />
      ) : (
        <div className="flex items-center gap-2">
          <span className="font-mono text-[13px] text-area">
            {ticker.symbol}
          </span>
          <span className="min-w-0 flex-1 truncate text-[13px] text-ink-200">
            {ticker.name}
          </span>
          <button
            type="button"
            onClick={() => setTicker(null)}
            className={PILL_QUIET}
          >
            change
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {(['buy', 'sell'] as const).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={side === s}
            onClick={() => setSide(s)}
            className={side === s ? PILL_LOUD : PILL_QUIET}
          >
            {s}
          </button>
        ))}
        <input
          inputMode="decimal"
          value={shares}
          onChange={(e) => setShares(e.target.value)}
          placeholder="shares"
          aria-label="Shares"
          className={`${FIELD} w-24`}
        />
        <label className={`${FIELD} inline-flex w-36 items-center gap-1`}>
          <span className="text-ink-400">€</span>
          <input
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="per share"
            aria-label="Price per share in euros"
            className="w-full bg-transparent focus:outline-none"
          />
        </label>
        <input
          type="date"
          value={date}
          max={new Date().toISOString().slice(0, 10)}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Date"
          className={FIELD}
        />
        <button
          type="button"
          disabled={ticker === null}
          onClick={() => void save()}
          className={`relative ${PILL_LOUD} disabled:opacity-40`}
        >
          <Check className="size-3" />
          save
          {burst > 0 ? <Sparks key={burst} count={12} reach={34} /> : null}
        </button>
      </div>
      {error ? (
        <span className="font-mono text-[11px] text-state-warn">{error}</span>
      ) : null}
    </div>
  )
}

function StartImport({
  accounts,
  onStarted,
}: {
  accounts: Array<Doc<'accounts'>>
  onStarted: () => void
}) {
  const uploadUrl = useMutation(api.attachments.generateUploadUrl)
  const start = useMutation(api.invest.startImport)
  const [accountId, setAccountId] = useState(
    (accounts.find((a) => /^tr$|trade republic/i.test(a.name)) ?? accounts[0])
      ._id,
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  async function send(files: Array<File>) {
    if (files.length === 0) return
    if (files.length > MAX_IMPORT_IMAGES) {
      setError(`At most ${MAX_IMPORT_IMAGES} screenshots at once.`)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const stored = []
      for (const file of files) {
        const url = await uploadUrl({})
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': file.type },
          body: file,
        })
        const { storageId } = (await res.json()) as {
          storageId: Id<'_storage'>
        }
        stored.push({ storageId, contentType: file.type, size: file.size })
      }
      const result = await start({ accountId, files: stored })
      if (!result.ok) setError(result.error)
      else onStarted()
    } catch {
      setError('The screenshot did not upload — try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        void send([...e.dataTransfer.files])
      }}
      className="motion-arrive flex flex-col gap-2.5 rounded-[14px] bg-lav-400/6 p-3 ring-1 ring-lav-400/25 ring-inset"
    >
      <span className="label-caps">into which account</span>
      <AccountPick
        accounts={accounts}
        value={accountId}
        onChange={setAccountId}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
        className="motion-press flex min-h-24 flex-col items-center justify-center gap-2 rounded-[12px] border border-dashed border-lav-400/40 text-[13px] text-ink-300 transition-colors hover:bg-lav-400/8 hover:text-foreground"
      >
        {busy ? (
          <Loader2 className="size-5 animate-spin text-lav-400" />
        ) : (
          <ImageUp className="size-5 text-area" />
        )}
        {busy
          ? 'uploading…'
          : `Drop or choose up to ${MAX_IMPORT_IMAGES} screenshots of your positions`}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        hidden
        onChange={(e) => void send([...(e.target.files ?? [])])}
      />
      {error ? (
        <span className="font-mono text-[11px] text-state-warn">{error}</span>
      ) : null}
    </div>
  )
}

type Draft = {
  keep: boolean
  candidate: Candidate | null
  isin?: string
  shares: string
  price: string
}

function ImportReview({
  imp,
  accountName,
}: {
  imp: Doc<'portfolioImports'>
  accountName: string
}) {
  const confirm = useMutation(api.invest.confirmImport)
  const discard = useMutation(api.invest.discardImport)
  const [drafts, setDrafts] = useState<Array<Draft>>([])
  const [searching, setSearching] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  /* The rows arrive once, when the reading lands; from then they are his
     to edit here. */
  useEffect(() => {
    if (imp.status !== 'ready') return
    setDrafts(
      imp.rows.map((r) => ({
        keep: true,
        candidate: r.candidates[0] ?? null,
        isin: r.isin,
        shares: r.shares === undefined ? '' : String(r.shares),
        price: r.priceEur === undefined ? '' : String(r.priceEur),
      })),
    )
  }, [imp.status, imp.rows])

  const set = (i: number, patch: Partial<Draft>) =>
    setDrafts((d) => d.map((x, j) => (j === i ? { ...x, ...patch } : x)))

  const kept = drafts.filter((d) => d.keep)
  const num = (s: string) => Number(s.replace(',', '.'))
  const complete = (d: Draft) =>
    d.candidate !== null && num(d.shares) > 0 && num(d.price) > 0
  const ready = kept.length > 0 && kept.every(complete)

  async function save() {
    setSaving(true)
    setError(null)
    try {
      await confirm({
        importId: imp._id,
        occurredAt: Date.now(),
        rows: kept.map((d) => ({
          candidate: d.candidate as Candidate,
          isin: d.isin,
          shares: num(d.shares),
          priceEur: num(d.price),
        })),
      })
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message.replace(/^.*: /, '').split('\n')[0]
          : 'Not saved',
      )
      setSaving(false)
    }
  }

  return (
    <section className="system-frame system-open motion-arrive flex flex-col gap-3 p-4 sm:p-5">
      <div className="flex items-center gap-2 border-b border-lav-400/20 pb-3">
        <span className="system-title flex-1">
          [ portfolio import · {accountName} ]
        </span>
        <button
          type="button"
          onClick={() => void discard({ importId: imp._id })}
          className="inline-flex items-center gap-1 font-mono text-[10.5px] tracking-[0.12em] text-ink-500 uppercase hover:text-state-danger"
        >
          <Trash2 className="size-3" />
          discard
        </button>
      </div>

      {imp.status === 'reading' ? (
        <ReadingNow since={imp._creationTime} />
      ) : imp.status === 'failed' ? (
        <p className="text-[13.5px] text-state-warn">{imp.error}</p>
      ) : (
        <>
          <p className="text-[12.5px] text-ink-400">
            Read by {imp.model ?? IMPORT_MODEL_NAME}
            {imp.readAt ? ` ${agoLabel(imp.readAt)}` : ''}. Check each ticker,
            the shares and your average price — nothing is saved until you
            confirm.
          </p>
          <div className="flex flex-col gap-2">
            {imp.rows.map((row, i) => {
              const d = drafts[i] as Draft | undefined
              if (d === undefined) return null
              return (
                <div
                  key={i}
                  style={{ animationDelay: `${i * 50}ms` }}
                  className={`motion-land flex flex-col gap-2 rounded-[14px] p-2.5 ring-1 ring-inset transition-opacity ${
                    d.keep ? 'ring-lift/12' : 'opacity-45 ring-lift/6'
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={d.keep}
                      aria-label={`Keep ${row.name}`}
                      onClick={() => set(i, { keep: !d.keep })}
                      className={`grid size-5 shrink-0 place-items-center rounded-[6px] ${
                        d.keep
                          ? 'bg-lav-400 text-background'
                          : 'ring-1 ring-lift/25'
                      }`}
                    >
                      {d.keep ? (
                        <Check className="size-3" strokeWidth={3} />
                      ) : null}
                    </button>
                    <span className="min-w-0 flex-1 truncate text-[13.5px] text-foreground">
                      {row.name}
                      {row.isin ? (
                        <span className="ml-2 font-mono text-[10.5px] text-ink-500">
                          {row.isin}
                        </span>
                      ) : null}
                    </span>
                    {row.valueEur !== undefined ? (
                      <span className="font-mono text-[11px] text-ink-500">
                        shown {euros(row.valueEur)}
                      </span>
                    ) : null}
                  </div>
                  {d.keep ? (
                    <div className="flex flex-wrap items-center gap-2 pl-7">
                      {searching === i ? (
                        <div className="w-full">
                          <TickerSearch
                            initial={row.isin ?? row.name}
                            onPick={(c) => {
                              set(i, { candidate: c })
                              setSearching(null)
                            }}
                          />
                        </div>
                      ) : (
                        <select
                          value={d.candidate?.symbol ?? ''}
                          onChange={(e) => {
                            if (e.target.value === '__search') {
                              setSearching(i)
                              return
                            }
                            set(i, {
                              candidate:
                                row.candidates.find(
                                  (c) => c.symbol === e.target.value,
                                ) ?? d.candidate,
                            })
                          }}
                          aria-label={`Ticker for ${row.name}`}
                          className={`${FIELD} max-w-full font-mono text-[12.5px] ${
                            d.candidate === null ? 'ring-state-warn/50' : ''
                          }`}
                        >
                          {d.candidate === null ? (
                            <option value="">pick a ticker</option>
                          ) : null}
                          {d.candidate !== null &&
                          !row.candidates.some(
                            (c) => c.symbol === d.candidate?.symbol,
                          ) ? (
                            <option value={d.candidate.symbol}>
                              {d.candidate.symbol} · {d.candidate.name}
                            </option>
                          ) : null}
                          {row.candidates.map((c) => (
                            <option key={c.symbol} value={c.symbol}>
                              {c.symbol} · {c.exchange} · {c.name}
                            </option>
                          ))}
                          <option value="__search">search another…</option>
                        </select>
                      )}
                      <input
                        inputMode="decimal"
                        value={d.shares}
                        onChange={(e) => set(i, { shares: e.target.value })}
                        placeholder="shares"
                        aria-label={`Shares of ${row.name}`}
                        className={`${FIELD} w-24 ${num(d.shares) > 0 ? '' : 'ring-state-warn/50'}`}
                      />
                      <label
                        className={`${FIELD} inline-flex w-36 items-center gap-1 ${
                          num(d.price) > 0 ? '' : 'ring-state-warn/50'
                        }`}
                      >
                        <span className="text-ink-400">€</span>
                        <input
                          inputMode="decimal"
                          value={d.price}
                          onChange={(e) => set(i, { price: e.target.value })}
                          placeholder="avg price"
                          aria-label={`Your average price for ${row.name}`}
                          className="w-full bg-transparent focus:outline-none"
                        />
                      </label>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!ready || saving}
              onClick={() => void save()}
              className={`${PILL_LOUD} disabled:opacity-40`}
            >
              <Check className="size-3" />
              confirm {kept.length}{' '}
              {kept.length === 1 ? 'position' : 'positions'}
            </button>
            {!ready && kept.length > 0 ? (
              <span className="font-mono text-[11px] text-state-warn">
                each kept row needs a ticker, shares and a price
              </span>
            ) : null}
            {error ? (
              <span className="font-mono text-[11px] text-state-warn">
                {error}
              </span>
            ) : null}
          </div>
        </>
      )}
    </section>
  )
}

/* The reader at work: the System's title breathing and the real seconds
   since it was asked — the same as the Vault's. */
function ReadingNow({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(tick)
  }, [])
  return (
    <div className="relative flex items-center gap-3 overflow-hidden rounded-[10px] bg-lav-400/8 px-3 py-3 ring-1 ring-lav-400/30 ring-inset">
      <span className="motion-sweep pointer-events-none absolute inset-y-0 left-0 w-1/2" />
      <Loader2 className="size-5 shrink-0 animate-spin text-lav-400" />
      <span className="flex flex-col gap-1">
        <span className="system-title system-pulse text-[12px]">
          [ reading portfolio ]
        </span>
        <span className="font-mono text-[11px] text-ink-400">
          {IMPORT_MODEL_NAME} · {Math.max(0, Math.round((now - since) / 1000))}s
        </span>
      </span>
    </div>
  )
}
