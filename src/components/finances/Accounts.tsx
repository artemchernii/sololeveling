import { useMemo, useState } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { Pencil, Plus, Search } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import type { FunctionReturnType } from 'convex/server'
import { FIELD, PILL_LOUD, PILL_QUIET, Panel } from '@/components/finances/bits'
import { DropFiles } from '@/components/finances/Add'
import { IntakeFlow } from '@/components/finances/Intake'
import { AccountLogo } from '@/components/finances/Logo'
import { dayEndsBack } from '@/components/finances/WorthChart'
import { OpenAccount } from '@/components/finances/OpenAccount'
import { Sheet } from '@/components/finances/Sheet'
import { Veiled } from '@/components/finances/Veil'
import { SkeletonRows } from '@/components/Skeleton'
import { useDayStarts } from '@/components/track/useDayStarts'
import { ACCOUNT_KINDS, CURRENCIES, money } from '@/lib/currency'
import type { AccountKind } from '@/lib/currency'
import { agoLabel } from '@/lib/format'
import { freshness } from '@/lib/freshness'
import { monthRange } from '@/lib/month'
import { ProfitPill, paidSums } from '@/components/finances/Portfolio'
import { PRODUCTS, productIn, searchProducts } from '@/lib/institutions'
import type { Product } from '@/lib/institutions'
import { euros } from '@/lib/money'
import { failureMessage } from '@/lib/convex-errors'

/* Accounts, in the Overview room (Treasury, 27 Sep). His, not hard-coded:
   filter by what they are, add one, edit or delete one, update one. Each
   card shows what the account holds in all, a line per currency pocket
   (a USD pocket with the euros it is worth), what its investments are worth
   when it holds any, and how fresh it is. */

const KIND_STYLE: Record<AccountKind, string> = {
  bank: 'text-acct-bank ring-acct-bank/35 bg-acct-bank/8',
  broker: 'text-lav-300 ring-lav-400/40 bg-lav-400/10',
  cash: 'text-acct-cash ring-acct-cash/35 bg-acct-cash/8',
}

export function KindBadge({ kind }: { kind: AccountKind }) {
  return (
    <span
      className={`rounded-[6px] px-1.5 py-0.5 font-mono text-[9.5px] tracking-[0.14em] uppercase ring-1 ring-inset ${KIND_STYLE[kind]}`}
    >
      {kind}
    </span>
  )
}

export function Accounts() {
  const data = useQuery(api.aggregate.balances, {})
  const worth = useQuery(api.aggregate.worth, {})
  const accounts = useQuery(api.accounts.list, {})
  const today = useDayStarts(1).at(-1) as number
  const dayEnds = useMemo(() => dayEndsBack(today, 365), [today])
  const history = useQuery(api.aggregate.cashHistory, { dayEnds })
  const { monthStart, nextStart } = monthRange(today)
  const positions = useQuery(api.aggregate.positions, {})
  const month = useQuery(api.aggregate.accountMonth, {
    start: monthStart,
    end: nextStart,
  })
  const [kind, setKind] = useState<AccountKind | 'all'>('all')
  const [editing, setEditing] = useState<Doc<'accounts'> | 'new' | null>(null)
  const [updating, setUpdating] = useState<Doc<'accounts'> | null>(null)
  const [opened, setOpened] = useState<Id<'accounts'> | null>(null)
  const openRow = data?.accounts.find((a) => a.accountId === opened)
  const openDoc = accounts?.find((a) => a._id === opened) ?? null
  const investedOf = (id: Id<'accounts'>) =>
    worth?.byAccount.find((x) => x.accountId === id)?.invested ?? null

  const list = (data?.accounts ?? []).filter(
    (a) => kind === 'all' || a.kinds.includes(kind),
  )

  return (
    <Panel
      title="accounts"
      aside={
        <>
          <div className="flex flex-wrap gap-1.5">
            {(['all', ...ACCOUNT_KINDS] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={kind === k ? PILL_LOUD : PILL_QUIET}
              >
                {k}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setEditing('new')}
            className={PILL_QUIET}
          >
            <Plus className="size-3" />
            account
          </button>
        </>
      }
    >
      {data === undefined || accounts === undefined ? (
        <SkeletonRows rows={3} twoLine rowClassName="py-4" />
      ) : data.accounts.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <p className="max-w-sm text-[13.5px] text-ink-400">
            Add where your money sits — a bank, a broker, the cash in your
            wallet. Then drop a statement or a screenshot on + and it fills
            itself.
          </p>
          <button
            type="button"
            onClick={() => setEditing('new')}
            className={PILL_LOUD}
          >
            <Plus className="size-3" />
            first account
          </button>
        </div>
      ) : list.length === 0 ? (
        <p className="py-4 text-center text-[13px] text-ink-500">
          No {kind} accounts.
        </p>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((a, i) => (
            <AccountCard
              key={a.accountId}
              row={a}
              index={i}
              invested={investedOf(a.accountId)}
              onOpen={() => setOpened(a.accountId)}
              month={
                month?.accounts.find((m) => m.accountId === a.accountId) ?? null
              }
              monthStart={monthStart}
              held={(() => {
                const rows = positions?.rows.filter(
                  (r) => r.accountId === a.accountId,
                )
                return rows?.length ? paidSums(rows) : null
              })()}
              line={
                history?.accounts
                  .find((h) => h.accountId === a.accountId)
                  ?.values.slice(-30) ?? []
              }
              onEdit={() => {
                const doc = accounts.find((x) => x._id === a.accountId)
                if (doc) setEditing(doc)
              }}
              onUpdate={() => {
                const doc = accounts.find((x) => x._id === a.accountId)
                if (doc) setUpdating(doc)
              }}
            />
          ))}
        </div>
      )}

      <StillCounted />
      <AccountSheet account={editing} onClose={() => setEditing(null)} />
      <OpenAccount
        account={openDoc}
        total={
          openRow
            ? Math.round(
                (openRow.cashEur + (investedOf(openRow.accountId) ?? 0)) * 100,
              ) / 100
            : 0
        }
        meta={openRow ? freshness(openRow.pockets, Date.now()).label : ''}
        onClose={() => setOpened(null)}
        onUpdate={() => openDoc && setUpdating(openDoc)}
      />
      <UpdateSheet account={updating} onClose={() => setUpdating(null)} />
    </Panel>
  )
}

type BalanceRow = FunctionReturnType<
  typeof api.aggregate.balances
>['accounts'][number]

/* One account (27 Sep, as mocked on :3950 — "our current in app are faded
   and weak"): lit panel, bright badges, the balance big with its last 30
   days beside it, each pocket, its investments, this month, and a footer
   that says where the balance came from and what to do when it is old. */
function AccountCard({
  row: a,
  index,
  invested,
  month,
  monthStart,
  held,
  line,
  onEdit,
  onUpdate,
  onOpen,
}: {
  row: BalanceRow
  index: number
  invested: number | null
  month: {
    net: number
    in: number
    out: number
    moves: number
    bought: number
    sold: number
    trades: number
  } | null
  /** Local midnight of the 1st: what "since" says. */
  monthStart: number
  /** A broker's positions: paid and worth where both are known. */
  held: { paid: number; value: number; known: number } | null
  line: Array<number | null>
  onEdit: () => void
  onUpdate: () => void
  /** The account, opened: its rows, balances and files (A.4). */
  onOpen: () => void
}) {
  const f = freshness(a.pockets, Date.now())
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Open ${a.name}`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (
          e.target === e.currentTarget &&
          (e.key === 'Enter' || e.key === ' ')
        ) {
          e.preventDefault()
          onOpen()
        }
      }}
      style={{ animationDelay: `${index * 40}ms` }}
      className="motion-arrive flex h-full cursor-pointer flex-col gap-3.5 rounded-[18px] bg-lift/[0.055] p-4 ring-1 ring-lift/[0.12] transition-shadow ring-inset hover:ring-lav-400/40"
    >
      <div className="flex items-start gap-3">
        <AccountLogo name={a.name} domain={a.domain} size={40} />
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="truncate text-[17px] leading-none text-foreground">
            {a.name}
          </span>
          <span className="flex flex-wrap gap-1">
            {a.kinds.map((k) => (
              <KindBadge key={k} kind={k} />
            ))}
          </span>
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onEdit()
          }}
          aria-label={`Edit or delete ${a.name}`}
          className={PILL_QUIET}
        >
          <Pencil className="size-3" />
          edit
        </button>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-[30px] leading-none font-light text-foreground">
          <Veiled>
            {euros(Math.round((a.cashEur + (invested ?? 0)) * 100) / 100)}
          </Veiled>
        </span>
        {/* The line is cash only. Where shares are held, cash spent on them
            would draw as a loss (27 Sep, TR's red line), so it waits for
            stored closes to draw the whole account. */}
        {invested !== null && invested > 0 ? null : <Sparkline values={line} />}
      </div>
      <div className="flex flex-col gap-1.5 font-mono text-[12.5px]">
        {a.pockets
          /* "$0 ≈ €0" is noise beside a pocket that holds something. */
          .filter(
            (p) =>
              (p.value !== null && p.value !== 0) || a.pockets.length === 1,
          )
          .map((p) => (
            <span
              key={p.currency}
              className="flex items-center justify-between gap-2"
            >
              <span className="text-ink-400">
                free cash{' '}
                <span className="rounded-[5px] bg-lift/[0.08] px-1.5 py-0.5 text-[10.5px] text-ink-200">
                  {p.currency}
                </span>
              </span>
              <span className="text-ink-100">
                {p.value === null ? (
                  <span className="text-ink-500">not read</span>
                ) : (
                  <Veiled>
                    {money(p.value, p.currency)}
                    {p.currency !== 'EUR' && p.eur !== null ? (
                      <span className="text-ink-500"> ≈ {euros(p.eur)}</span>
                    ) : null}
                  </Veiled>
                )}
              </span>
            </span>
          ))}
        {invested !== null && invested > 0 ? (
          <span className="flex items-center justify-between gap-2">
            <span className="text-ink-400">investments</span>
            <span className="text-ink-100">
              <Veiled>{euros(invested)}</Veiled>
            </span>
          </span>
        ) : null}
        {a.kinds.includes('broker') && !a.kinds.includes('bank') ? (
          /* A broker's month (4 Oct: "brokers are sad without one line …
             bought sold stocks since 1st day of month"), and where its
             positions stand since bought. */
          <>
            <span className="flex items-center justify-between gap-2">
              <span className="text-ink-400">
                since 1{' '}
                {new Date(monthStart).toLocaleDateString('en-GB', {
                  month: 'short',
                })}
              </span>
              {month && month.trades > 0 ? (
                <span className="flex flex-wrap justify-end gap-x-2.5 text-[12px]">
                  {month.bought ? (
                    <span className="text-lav-300">
                      <Veiled>bought {euros(month.bought)}</Veiled>
                    </span>
                  ) : null}
                  {month.sold ? (
                    <span className="text-ink-200">
                      <Veiled>sold {euros(month.sold)}</Veiled>
                    </span>
                  ) : null}
                </span>
              ) : (
                <span className="text-[12px] text-ink-500">no trades yet</span>
              )}
            </span>
            {held && held.known > 0 ? (
              <span className="flex items-center justify-between gap-2">
                <span className="text-ink-400">since bought</span>
                <ProfitPill
                  profit={held.value - held.paid}
                  base={held.paid}
                  small
                />
              </span>
            ) : null}
          </>
        ) : null}
        {a.kinds.includes('bank') && month !== null && month.net !== 0 ? (
          /* "since 1 Oct", and what makes it (4 Oct: "explain what are
             those this month +374 … I dont get those nums"). */
          <span className="flex flex-col gap-0.5">
            <span className="flex items-center justify-between gap-2">
              <span className="text-ink-400">
                since 1{' '}
                {new Date(monthStart).toLocaleDateString('en-GB', {
                  month: 'short',
                })}
              </span>
              <span
                className={
                  month.net > 0 ? 'text-state-good' : 'text-state-danger'
                }
              >
                <Veiled>
                  {month.net > 0 ? '+' : '−'}
                  {euros(Math.abs(month.net))}
                </Veiled>
              </span>
            </span>
            <span className="flex flex-wrap justify-end gap-x-2.5 text-[11px]">
              {month.in ? (
                <span className="text-state-good/80">
                  <Veiled>in +{euros(month.in)}</Veiled>
                </span>
              ) : null}
              {month.out ? (
                <span className="text-state-danger/80">
                  <Veiled>spent −{euros(month.out)}</Veiled>
                </span>
              ) : null}
              {month.moves ? (
                <span className="text-lav-300">
                  <Veiled>
                    transfers {month.moves > 0 ? '+' : '−'}
                    {euros(Math.abs(month.moves))}
                  </Veiled>
                </span>
              ) : null}
            </span>
          </span>
        ) : null}
      </div>
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-lift/[0.08] pt-3">
        <span
          title={f.todo ?? undefined}
          className={`min-w-0 font-mono text-[11px] ${f.stale ? 'text-state-warn' : 'text-ink-400'}`}
        >
          {f.label}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onUpdate()
          }}
          className={
            f.stale
              ? 'motion-press shrink-0 rounded-full bg-state-warn/12 px-3 py-1.5 font-mono text-[10.5px] tracking-[0.12em] text-state-warn uppercase ring-1 ring-state-warn/50 ring-inset'
              : PILL_QUIET
          }
        >
          update
        </button>
      </div>
    </div>
  )
}

/* The last 30 days of an account's cash, green when it ended higher than
   it began, red when lower — a direction, never a grade. */
function Sparkline({ values }: { values: Array<number | null> }) {
  const pts = values
    .map((v, i) => (v === null ? null : { i, v }))
    .filter((p): p is { i: number; v: number } => p !== null)
  if (pts.length < 2) return <span className="flex-1" />
  const min = Math.min(...pts.map((p) => p.v))
  const max = Math.max(...pts.map((p) => p.v))
  const span = max - min || 1
  const w = 120
  const h = 32
  const first = pts[0] as { v: number }
  const last = pts[pts.length - 1] as { v: number }
  const tone =
    last.v > first.v
      ? 'text-state-good'
      : last.v < first.v
        ? 'text-state-danger'
        : 'text-ink-500'
  const d = pts
    .map(
      (p, n) =>
        `${n === 0 ? 'M' : 'L'}${((p.i / (values.length - 1)) * w).toFixed(1)},${(h - 3 - ((p.v - min) / span) * (h - 6)).toFixed(1)}`,
    )
    .join(' ')
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className={`ml-auto h-8 w-full max-w-[140px] ${tone}`}
      aria-hidden
    >
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/* Deleted accounts whose rows still count (27 Sep: a test account holding
   the same statement as his Revolut made "this month" count twice). One
   line each, and an erase that asks first. */
function StillCounted() {
  const gone = useQuery(api.accounts.retired, {})
  const erase = useMutation(api.accounts.erase)
  const [asking, setAsking] = useState<Id<'accounts'> | null>(null)
  const counted = (gone ?? []).filter((g) => g.rows + g.trades > 0)
  if (counted.length === 0) return null
  return (
    <div className="mt-3 flex flex-col gap-1.5 border-t border-lift/[0.06] pt-3">
      {counted.map((g) => (
        <div
          key={g.accountId}
          className="motion-land flex flex-wrap items-center gap-2 font-mono text-[11px] text-ink-500"
        >
          <span className="min-w-0 flex-1">
            Deleted, still counted:{' '}
            <span className="text-ink-300">{g.name}</span> · {g.rows} row
            {g.rows === 1 ? '' : 's'}
            {g.trades > 0
              ? ` · ${g.trades} trade${g.trades === 1 ? '' : 's'}`
              : ''}
          </span>
          {asking === g.accountId ? (
            <>
              <span className="text-state-warn">
                Erase them? Transfers to your other accounts keep their side.
              </span>
              <button
                type="button"
                onClick={() => setAsking(null)}
                className={PILL_QUIET}
              >
                keep
              </button>
              <button
                type="button"
                onClick={() =>
                  void erase({ accountId: g.accountId }).then(() =>
                    setAsking(null),
                  )
                }
                className="motion-press inline-flex items-center rounded-full bg-state-danger/14 px-3 py-1 text-[10.5px] tracking-[0.12em] text-state-danger uppercase ring-1 ring-state-danger/45 ring-inset"
              >
                erase
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setAsking(g.accountId)}
              className={PILL_QUIET}
            >
              erase
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

/* Add, edit, delete — one sheet. Delete asks first, and says what it means:
   gone from every list and total; what it paid and earned stays. */
function AccountSheet({
  account,
  onClose,
}: {
  account: Doc<'accounts'> | 'new' | null
  onClose: () => void
}) {
  const editing = account !== null && account !== 'new' ? account : null
  return (
    <Sheet
      open={account !== null}
      title={editing ? `edit · ${editing.name}` : 'new account'}
      onClose={onClose}
    >
      {account !== null ? (
        <AccountForm
          key={editing?._id ?? 'new'}
          account={editing}
          onDone={onClose}
        />
      ) : null}
    </Sheet>
  )
}

export function AccountForm({
  account,
  onDone,
}: {
  account: Doc<'accounts'> | null
  onDone: () => void
}) {
  const [picked, setPicked] = useState<Product | 'other' | null>(
    account
      ? (PRODUCTS.find((p) => p.institution === account.institution) ??
          productIn(account.name) ??
          'other')
      : null,
  )
  if (picked === null) {
    return <PickBank onPick={setPicked} />
  }
  return (
    <AccountDetails
      account={account}
      product={picked === 'other' ? null : picked}
      onChangeBank={account ? undefined : () => setPicked(null)}
      onDone={onDone}
    />
  )
}

/* Step one: which bank. The ones he is likely to have, with their marks;
   a search for the rest; "other" for anything the app does not know. */
function PickBank({ onPick }: { onPick: (p: Product | 'other') => void }) {
  const [q, setQ] = useState('')
  const list = searchProducts(q)
  return (
    <>
      <label className={`${FIELD} flex items-center gap-2`}>
        <Search className="size-4 text-ink-500" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Which bank or broker?"
          aria-label="Find a bank or broker"
          className="w-full bg-transparent focus:outline-none"
        />
      </label>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {list.map((p, i) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onPick(p)}
            style={{ animationDelay: `${i * 20}ms` }}
            className="motion-land motion-press flex items-center gap-2.5 rounded-[14px] bg-lift/[0.035] p-2.5 text-left ring-1 ring-lift/10 ring-inset hover:ring-lav-400/45"
          >
            <AccountLogo name={p.name} domain={p.domain ?? null} size={30} />
            <span className="flex min-w-0 flex-col gap-1">
              <span className="truncate text-[13.5px] text-foreground">
                {p.name}
              </span>
              <span className="flex gap-1">
                {p.kinds.map((k) => (
                  <KindBadge key={k} kind={k} />
                ))}
              </span>
            </span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => onPick('other')}
          className="motion-press flex items-center gap-2.5 rounded-[14px] border border-dashed border-lift/20 p-2.5 text-left text-[13.5px] text-ink-300 hover:border-lav-400/45"
        >
          <Plus className="size-4" />
          {q.trim() ? `“${q.trim()}” — not listed` : 'another one'}
        </button>
      </div>
    </>
  )
}

/* Step two: what the bank did not already say — the name he calls it,
   currencies, the endings that let a statement find it, and what it holds
   today (or on the day he knows). */
function AccountDetails({
  account,
  product,
  onChangeBank,
  onDone,
}: {
  account: Doc<'accounts'> | null
  product: Product | null
  onChangeBank?: () => void
  onDone: () => void
}) {
  const today = useDayStarts(1).at(-1) as number
  const create = useMutation(api.accounts.create)
  const update = useMutation(api.accounts.update)
  const remove = useMutation(api.accounts.remove)
  const erase = useMutation(api.accounts.erase)
  const setBalance = useMutation(api.accounts.setBalance)
  const [name, setName] = useState(account?.name ?? product?.name ?? '')
  const [kinds, setKinds] = useState<Array<AccountKind>>(
    account?.kinds ?? (product ? product.kinds : ['bank']),
  )
  const [currencies, setCurrencies] = useState<Array<string>>(
    account?.currencies ?? product?.currencies ?? ['EUR'],
  )
  const [domain, setDomain] = useState(account?.domain ?? product?.domain ?? '')
  const [iban, setIban] = useState((account?.ibanTails ?? []).join(', '))
  const [cards, setCards] = useState((account?.cardTails ?? []).join(', '))
  const [opening, setOpening] = useState<Record<string, string>>({})
  const [asOf, setAsOf] = useState(() => new Date().toISOString().slice(0, 10))
  const [more, setMore] = useState(false)
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /* Adding "Cash" when there is a Cash already means more notes in the same
     wallet, not a second wallet: the new currencies join the one he has. */
  const others = useQuery(api.accounts.list, account ? 'skip' : {})
  const twin = account
    ? undefined
    : others?.find((a) => a.name.toLowerCase() === name.trim().toLowerCase())

  const toggle = <T,>(list: Array<T>, x: T) =>
    list.includes(x) ? list.filter((y) => y !== x) : [...list, x]
  const shown = more
    ? CURRENCIES
    : [...new Set([...CURRENCIES.slice(0, 6), ...currencies])]
  const tails = (s: string) =>
    s
      .split(/[,\s]+/)
      .map((x) => x.trim())
      .filter(Boolean)

  async function save() {
    setError(null)
    try {
      const args = {
        name,
        kinds,
        currencies,
        domain: domain.trim() || undefined,
        product: product?.id,
        ibanTails: tails(iban),
        cardTails: tails(cards),
      }
      let id = account?._id ?? twin?._id
      if (account) await update({ accountId: account._id, ...args })
      else if (twin) {
        await update({
          accountId: twin._id,
          name: twin.name,
          kinds: twin.kinds,
          currencies: [...new Set([...twin.currencies, ...currencies])],
          domain: twin.domain,
        })
      } else id = await create(args)
      /* A day in the past is true at its end; today is true now. */
      const day = new Date(`${asOf}T23:59:59`).getTime()
      for (const c of currencies) {
        const raw = (opening[c] as string | undefined)?.trim()
        if (!raw || !id) continue
        const n = Number(raw.replace(/\s/g, '').replace(',', '.'))
        if (!Number.isFinite(n)) throw new Error(`${c}: not a number`)
        await setBalance({
          accountId: id,
          currency: c,
          value: n,
          dayStart: today,
          asOf: day >= Date.now() ? undefined : day,
        })
      }
      onDone()
    } catch (e) {
      setError(
        failureMessage(e) ?? (e instanceof Error ? e.message : 'Not saved'),
      )
    }
  }

  return (
    <>
      <div className="flex items-center gap-3">
        <AccountLogo name={name || '?'} domain={domain || null} size={40} />
        <input
          autoFocus={!product}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="What you call it"
          aria-label="Name"
          className={`${FIELD} min-w-0 flex-1`}
        />
        {onChangeBank ? (
          <button type="button" onClick={onChangeBank} className={PILL_QUIET}>
            change
          </button>
        ) : null}
      </div>
      {product ? (
        <span className="flex items-center gap-2 text-[12.5px] text-ink-400">
          {product.kinds.map((k) => (
            <KindBadge key={k} kind={k} />
          ))}
          {product.kinds.length > 1
            ? 'Its cash and its investments, in one account.'
            : product.kinds[0] === 'broker'
              ? 'Its free cash, and its investments from a screenshot.'
              : product.kinds[0] === 'cash'
                ? 'The notes in your wallet — counted, not read.'
                : 'Its statements fill it; transfers to your other accounts are matched.'}
        </span>
      ) : (
        <>
          <span className="label-caps">what it is</span>
          <div className="flex flex-wrap gap-1.5">
            {ACCOUNT_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={kinds.includes(k)}
                onClick={() => setKinds((ks) => toggle(ks, k))}
                className={kinds.includes(k) ? PILL_LOUD : PILL_QUIET}
              >
                {k}
              </button>
            ))}
          </div>
          <label className={`${FIELD} flex items-center gap-2`}>
            <span className="shrink-0 font-mono text-[10.5px] text-ink-500">
              logo from
            </span>
            <input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="mybank.com"
              aria-label="Website for the logo"
              className="w-full bg-transparent focus:outline-none"
            />
          </label>
        </>
      )}
      <span className="label-caps">currencies it holds</span>
      <div className="flex flex-wrap gap-1.5">
        {shown.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={currencies.includes(c)}
            onClick={() => setCurrencies((cs) => toggle(cs, c))}
            className={currencies.includes(c) ? PILL_LOUD : PILL_QUIET}
          >
            {c}
          </button>
        ))}
        {!more ? (
          <button
            type="button"
            onClick={() => setMore(true)}
            className={PILL_QUIET}
          >
            more…
          </button>
        ) : null}
      </div>
      {kinds.includes('cash') && kinds.length === 1 ? null : (
        <>
          <span className="label-caps">how statements show it · optional</span>
          <div className="grid grid-cols-2 gap-2">
            <label className={`${FIELD} flex items-center gap-2`}>
              <span className="shrink-0 font-mono text-[10.5px] text-ink-500">
                IBAN …
              </span>
              <input
                inputMode="numeric"
                value={iban}
                onChange={(e) => setIban(e.target.value)}
                placeholder="0120"
                aria-label="Last four digits of the IBAN"
                className="w-full bg-transparent font-mono focus:outline-none"
              />
            </label>
            <label className={`${FIELD} flex items-center gap-2`}>
              <span className="shrink-0 font-mono text-[10.5px] text-ink-500">
                card ••
              </span>
              <input
                inputMode="numeric"
                value={cards}
                onChange={(e) => setCards(e.target.value)}
                placeholder="2789"
                aria-label="Last four digits of its cards"
                className="w-full bg-transparent font-mono focus:outline-none"
              />
            </label>
          </div>
          <span className="text-[12px] text-ink-500">
            The last four digits. A transfer from PT50…0120 then lands on this
            account by itself.
          </span>
        </>
      )}
      {account ? null : (
        <>
          <span className="label-caps">what it holds · optional</span>
          {currencies.map((c) => (
            <label key={c} className={`${FIELD} flex items-center gap-2`}>
              <span className="rounded-[4px] bg-lift/[0.06] px-1.5 font-mono text-[10.5px] text-ink-300">
                {c}
              </span>
              <input
                inputMode="decimal"
                value={opening[c] ?? ''}
                onChange={(e) =>
                  setOpening({ ...opening, [c]: e.target.value })
                }
                placeholder={
                  kinds.includes('broker') ? 'free cash, not investments' : '0'
                }
                aria-label={`${name} ${c} now`}
                className="w-full bg-transparent text-[16px] focus:outline-none"
              />
            </label>
          ))}
          <label className={`${FIELD} flex items-center gap-2`}>
            <span className="shrink-0 font-mono text-[10.5px] text-ink-500">
              as of
            </span>
            <input
              type="date"
              value={asOf}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setAsOf(e.target.value)}
              className="w-full bg-transparent focus:outline-none"
            />
          </label>
          <span className="text-[12px] text-ink-500">
            Or leave it — drop a statement or a screenshot on + and it is read
            from there, with the day it is true.
          </span>
        </>
      )}
      {twin ? (
        <span className="text-[12.5px] text-ink-300">
          You already have {twin.name} ({twin.currencies.join(', ')}). This adds
          to it — a currency left blank keeps what it holds.
        </span>
      ) : null}
      {error ? (
        <span className="font-mono text-[11px] text-state-warn">{error}</span>
      ) : null}
      <button
        type="button"
        onClick={() => void save()}
        className={`${PILL_LOUD} justify-center py-3`}
      >
        {account
          ? 'save'
          : twin
            ? `add to ${twin.name}`
            : `add ${name || 'account'}`}
      </button>
      {account ? (
        <div className="flex flex-col gap-2 border-t border-lift/[0.07] pt-4">
          {asking ? (
            <>
              <span className="text-[14px] text-foreground">
                Delete {account.name}?
              </span>
              <span className="text-[12.5px] text-ink-500">
                It leaves every list and total. What it paid and earned stays in
                your history — those things happened. If only the name is wrong,
                edit it instead.
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAsking(false)}
                  className={`${PILL_QUIET} flex-1 justify-center py-2.5`}
                >
                  keep it
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void remove({ accountId: account._id }).then(onDone)
                  }
                  className="motion-press inline-flex flex-1 items-center justify-center rounded-full bg-state-danger/14 py-2.5 font-mono text-[10.5px] tracking-[0.12em] text-state-danger uppercase ring-1 ring-state-danger/45 ring-inset"
                >
                  delete
                </button>
              </div>
              <button
                type="button"
                onClick={() =>
                  void erase({ accountId: account._id }).then(onDone)
                }
                className="self-center font-mono text-[10.5px] tracking-[0.1em] text-ink-500 uppercase underline-offset-4 hover:text-state-danger hover:underline"
              >
                a test, or read twice? erase it with its history
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setAsking(true)}
              className="motion-press inline-flex items-center justify-center rounded-full bg-state-danger/10 py-2.5 font-mono text-[10.5px] tracking-[0.12em] text-state-danger uppercase ring-1 ring-state-danger/40 ring-inset"
            >
              delete {account.name}
            </button>
          )}
        </div>
      ) : null}
    </>
  )
}

/* Update: type each currency, or drop a statement or screenshot of this
   account — the same reader as +, told which account it is. A drop turns
   this sheet into the reading and its review, as + does (27 Sep: it used
   to close and leave him where he started, the read out of sight). */
export function UpdateSheet({
  account,
  onClose,
}: {
  account: Doc<'accounts'> | null
  onClose: () => void
}) {
  const [tab, setTab] = useState<'type' | 'file'>('type')
  const [intakeId, setIntakeId] = useState<Id<'intakes'> | null>(null)
  const close = () => {
    setIntakeId(null)
    onClose()
  }
  return (
    <Sheet
      open={account !== null}
      title={
        intakeId ? 'check it' : account ? `update · ${account.name}` : 'update'
      }
      onClose={close}
      onBack={intakeId ? () => setIntakeId(null) : undefined}
      wide={intakeId !== null || tab === 'file'}
    >
      {account && intakeId ? (
        <IntakeFlow
          intakeId={intakeId}
          onBack={() => setIntakeId(null)}
          onDone={close}
        />
      ) : account ? (
        <>
          <div className="flex gap-1 rounded-[12px] bg-lift/[0.04] p-1">
            {(['type', 'file'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`flex-1 rounded-[9px] py-2 font-mono text-[11px] tracking-[0.12em] uppercase ${tab === t ? 'bg-lav-400/16 text-foreground ring-1 ring-lav-400/40 ring-inset' : 'text-ink-400'}`}
              >
                {t === 'type' ? 'type it' : 'statement or screenshot'}
              </button>
            ))}
          </div>
          {tab === 'type' ? (
            <TypeBalances key={account._id} account={account} onDone={close} />
          ) : (
            <DropFiles accountId={account._id} onStarted={setIntakeId} />
          )}
        </>
      ) : null}
    </Sheet>
  )
}

function TypeBalances({
  account,
  onDone,
}: {
  account: Doc<'accounts'>
  onDone: () => void
}) {
  const today = useDayStarts(1).at(-1) as number
  const data = useQuery(api.aggregate.balances, {})
  const setBalance = useMutation(api.accounts.setBalance)
  const pockets =
    data?.accounts.find((a) => a.accountId === account._id)?.pockets ?? []
  const [values, setValues] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [same, setSame] = useState<Set<string>>(new Set())

  /* "Still the same" (5 Oct): the number it shows, recorded as today in
     one press — the window closes once nothing is left to say. */
  async function keepSame(c: string, value: number) {
    setError(null)
    try {
      await setBalance({
        accountId: account._id,
        currency: c,
        value,
        dayStart: today,
      })
      const next = new Set(same).add(c)
      if (account.currencies.every((x) => next.has(x))) onDone()
      else setSame(next)
    } catch (e) {
      setError(
        failureMessage(e) ?? (e instanceof Error ? e.message : 'Not saved'),
      )
    }
  }

  async function save() {
    setError(null)
    try {
      for (const c of account.currencies) {
        /* An untouched field still saves what it shows: "still 5000" is a
           reading too, and it clears "8d ago" (5 Oct — Save did nothing). */
        const shown = pockets.find((x) => x.currency === c)?.value
        const raw = values[c] ?? (shown == null ? '' : String(shown))
        if (raw.trim() === '') continue
        const n = Number(raw.replace(/\s/g, '').replace(',', '.'))
        if (!Number.isFinite(n)) throw new Error(`${c}: not a number`)
        await setBalance({
          accountId: account._id,
          currency: c,
          value: n,
          dayStart: today,
        })
      }
      onDone()
    } catch (e) {
      setError(
        failureMessage(e) ?? (e instanceof Error ? e.message : 'Not saved'),
      )
    }
  }

  return (
    <>
      <span className="text-[12.5px] text-ink-400">
        Free cash in it now, without its investments.
      </span>
      {account.currencies.map((c) => {
        const p = pockets.find((x) => x.currency === c)
        return (
          <label key={c} className={`${FIELD} flex items-center gap-2`}>
            <span className="rounded-[4px] bg-lift/[0.06] px-1.5 font-mono text-[10.5px] text-ink-300">
              {c}
            </span>
            <input
              inputMode="decimal"
              value={
                values[c] ??
                (p?.value === null || p?.value === undefined
                  ? ''
                  : String(p.value))
              }
              onChange={(e) => setValues({ ...values, [c]: e.target.value })}
              placeholder="0"
              aria-label={`${account.name} ${c}`}
              className="w-full bg-transparent text-[18px] focus:outline-none"
            />
            {p?.recordedAt && !same.has(c) ? (
              <span className="shrink-0 font-mono text-[10.5px] text-ink-500">
                {agoLabel(p.recordedAt)}
              </span>
            ) : null}
            {typeof p?.value === 'number' && !(c in values) ? (
              <button
                type="button"
                disabled={same.has(c)}
                onClick={() => void keepSame(c, p.value as number)}
                className="motion-press shrink-0 rounded-full bg-state-good/10 px-3 py-1.5 font-mono text-[10.5px] tracking-[0.08em] whitespace-nowrap text-state-good uppercase ring-1 ring-state-good/40 ring-inset disabled:opacity-60"
              >
                {same.has(c) ? '✓ saved' : '✓ still the same'}
              </button>
            ) : null}
          </label>
        )
      })}
      {error ? (
        <span className="font-mono text-[11px] text-state-warn">{error}</span>
      ) : null}
      <button
        type="button"
        onClick={() => void save()}
        className={`${PILL_LOUD} justify-center py-3`}
      >
        save
      </button>
    </>
  )
}
