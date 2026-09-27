import { useState } from 'react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { ChevronRight } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import type { FunctionReturnType } from 'convex/server'

import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { AddButton } from '@/components/finances/Add'
import { UpdateSheet } from '@/components/finances/Accounts'
import { AccountLogo } from '@/components/finances/Logo'
import { SetupSheet } from '@/components/finances/Setup'
import { Sheet } from '@/components/finances/Sheet'
import { Veiled, VeilToggle } from '@/components/finances/Veil'
import { Skeleton } from '@/components/Skeleton'
import { freshness as balanceFreshness } from '@/lib/freshness'
import { useDayStarts } from '@/components/track/useDayStarts'
import { areaVars } from '@/lib/areas'
import { money } from '@/lib/currency'
import { monthRange } from '@/lib/month'
import { euros } from '@/lib/money'

/* [ TREASURY ] — the hero, as mocked on :3950 and approved (27 Sep: "Good,
   I like it"). Left: what is his — capital · cash · investments, this
   month in and out, the cash / invested bar, and one plain line saying how
   fresh it is. Right, over his photo: where it is — Investments, Banks,
   Cash — three rows of one height however many accounts there are, each
   opening its accounts in a sheet. Top: check-in (what is out of date —
   its logos when one or two, a count from three), show / hide, + add.

   Every number is a sanctioned one: balances and positions from `worth` and
   `balances` (readings plus what moved since), this month from `moneySums`
   and `accountMonth` (sums of his rows). Nothing is estimated. */

const DAY_MS = 86_400_000

type Row = FunctionReturnType<typeof api.aggregate.balances>['accounts'][number]
type Group = 'investments' | 'banks' | 'cash'

const WEEKDAY = new Intl.DateTimeFormat('en', { weekday: 'long' })
const SHORT = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short' })

/* "balances as of today · market prices: Friday's close" */
function freshness(
  oldestCash: number | null,
  oldestPrice: number | null,
  today: number,
): string {
  const day = (t: number) =>
    t >= today
      ? 'today'
      : t >= today - DAY_MS
        ? 'yesterday'
        : t >= today - 6 * DAY_MS
          ? WEEKDAY.format(new Date(t))
          : SHORT.format(new Date(t))
  const parts: Array<string> = []
  if (oldestCash !== null) parts.push(`balances as of ${day(oldestCash)}`)
  if (oldestPrice !== null) {
    parts.push(`market prices: ${day(oldestPrice)}'s close`)
  }
  return parts.join(' · ')
}

export function TreasuryHero() {
  const today = useDayStarts(1).at(-1) as number
  const now = Date.now()
  const { monthStart, nextStart } = monthRange(today)
  const worth = useQuery(api.aggregate.worth, {})
  const balances = useQuery(api.aggregate.balances, {})
  const accounts = useQuery(api.accounts.list, {})
  const sums = useQuery(api.aggregate.moneySums, {
    start: monthStart,
    end: nextStart,
  })
  const month = useQuery(api.aggregate.accountMonth, {
    start: monthStart,
    end: nextStart,
  })
  const [open, setOpen] = useState<Group | 'checkin' | null>(null)
  const [updating, setUpdating] = useState<Doc<'accounts'> | null>(null)
  const [setup, setSetup] = useState(false)

  const loading = worth === undefined || balances === undefined
  const empty = !loading && balances.accounts.length === 0
  const cash = worth?.cash.total ?? 0
  const invested = worth?.invested.total ?? 0
  const rows = balances?.accounts ?? []
  const investedBy = (id: Id<'accounts'>) =>
    worth?.byAccount.find((w) => w.accountId === id)?.invested ?? 0
  const monthOf = (id: Id<'accounts'>) =>
    month?.accounts.find((m) => m.accountId === id)?.net ?? null

  const brokers = rows.filter((a) => a.kinds.includes('broker'))
  const banks = rows.filter((a) => a.kinds.includes('bank'))
  const wallets = rows.filter(
    (a) => a.kinds.includes('cash') && !a.kinds.includes('bank'),
  )
  /* A broker that is only a broker keeps its cash with its investments; a
     bank that is also a broker (Revolut) shows its cash under Banks. */
  const brokerOnly = (a: Row) => !a.kinds.includes('bank')
  const stale = rows.filter((a) => balanceFreshness(a.pockets, now).stale)

  const docOf = (id: Id<'accounts'>) => accounts?.find((a) => a._id === id)
  const net = sums ? sums.in.sum - sums.out.sum : null

  return (
    <section
      style={areaVars('money')}
      className="system-frame system-open relative overflow-clip p-4 sm:p-5"
    >
      {/* His photo: the right half's ground, darkened where the rows sit,
          a little frosted (27 Sep: "slightly blur… make it glass"). */}
      <img
        src="/finances/dollar.jpg"
        alt=""
        aria-hidden
        decoding="async"
        style={{
          objectPosition: '55% 42%',
          maskImage: 'linear-gradient(to left, black 55%, transparent 100%)',
          WebkitMaskImage:
            'linear-gradient(to left, black 55%, transparent 100%)',
        }}
        className="motion-fade pointer-events-none absolute inset-y-0 right-0 hidden h-full w-[62%] scale-[1.04] object-cover opacity-70 blur-[2.5px] select-none sm:block"
      />

      <div className="relative flex flex-wrap items-center gap-2 border-b border-lav-400/20 pb-3">
        <span className="system-title flex-1">[ treasury ]</span>
        {!loading && !empty ? (
          <CheckIn
            stale={stale}
            onOpen={() => (stale.length > 0 ? setOpen('checkin') : undefined)}
          />
        ) : null}
        <VeilToggle hideOnLeave />
        {/* No account yet: + brings accounts in — there is nothing to add
            money to. */}
        <AddButton onOpen={empty ? () => setSetup(true) : undefined} />
      </div>

      {loading ? (
        <div className="relative mt-4 flex flex-col gap-3">
          <Skeleton className="h-3 w-48" />
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-8 w-72" />
        </div>
      ) : empty ? (
        <div className="relative mt-4 flex max-w-md flex-col gap-3">
          <span className="label-caps">capital · cash · investments</span>
          <span className="text-[46px] leading-none font-light text-ink-600 sm:text-[56px]">
            €0
          </span>
          <span className="text-[13.5px] text-ink-400">
            No accounts yet. Drop a statement or a screenshot from each bank and
            broker — each one becomes an account with its balance and history.
          </span>
          <AddButton
            cta
            label="bring in your accounts"
            className="self-start"
            onOpen={() => setSetup(true)}
          />
        </div>
      ) : (
        <div className="relative mt-4 grid gap-5 sm:grid-cols-[1.1fr_1fr] sm:gap-7">
          <div className="flex min-w-0 flex-col gap-3">
            <span className="label-caps">capital · cash · investments</span>
            <span
              key={worth.total}
              className="motion-pop text-[46px] leading-none font-light tracking-tight text-foreground sm:text-[56px]"
            >
              <Veiled>{euros(worth.total)}</Veiled>
            </span>
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex h-9 items-center gap-2.5 rounded-[10px] bg-lift/[0.06] px-3 font-mono text-[14.5px] font-medium">
                {net === null ? (
                  <Skeleton className="h-3 w-16" />
                ) : (
                  <span
                    className={
                      net >= 0 ? 'text-state-good' : 'text-state-danger'
                    }
                  >
                    <Veiled>{`${net >= 0 ? '+' : '−'}${euros(Math.abs(net))}`}</Veiled>
                  </span>
                )}
                <span className="text-[12px] font-normal text-ink-500">
                  this month
                </span>
              </span>
              <span className="inline-flex h-9 items-center gap-2.5 rounded-[10px] bg-lift/[0.06] px-3 font-mono text-[14.5px] font-medium">
                {sums === undefined ? (
                  <Skeleton className="h-3 w-24" />
                ) : (
                  <>
                    <span className="text-state-good">
                      <Veiled>{`+${euros(sums.in.sum)}`}</Veiled>
                    </span>
                    <span className="text-state-danger">
                      <Veiled>{`−${euros(sums.out.sum)}`}</Veiled>
                    </span>
                  </>
                )}
                <span className="text-[12px] font-normal text-ink-500">
                  in · out
                </span>
              </span>
            </div>
            <div className="flex max-w-[460px] flex-col gap-1.5">
              <div className="flex h-2.5 gap-[3px] overflow-hidden rounded-full bg-lift/[0.06]">
                {cash + invested > 0 ? (
                  <>
                    <span
                      style={{ flex: cash }}
                      className="rounded-full bg-money-cash transition-[flex] duration-700"
                    />
                    <span
                      style={{ flex: invested }}
                      className="rounded-full bg-lav-400 transition-[flex] duration-700"
                    />
                  </>
                ) : null}
              </div>
              <div className="flex flex-wrap justify-between gap-x-4 font-mono text-[12px]">
                <Link
                  to="/finances"
                  search={{ room: 'flow' }}
                  className="flex items-center gap-1.5 text-ink-200 hover:text-foreground"
                >
                  <span className="size-2 rounded-full bg-money-cash" />
                  free cash <Veiled>{euros(cash)}</Veiled>
                </Link>
                <Link
                  to="/finances"
                  search={{ room: 'portfolio' }}
                  className="flex items-center gap-1.5 text-ink-200 hover:text-foreground"
                >
                  <span className="size-2 rounded-full bg-lav-400" />
                  invested <Veiled>{euros(invested)}</Veiled>
                </Link>
              </div>
            </div>
            <span className="font-mono text-[11px] text-ink-500">
              {freshness(worth.cash.oldestAt, worth.invested.oldestAt, today)}
              {worth.cash.unread > 0
                ? ` · ${worth.cash.unread} not read yet`
                : ''}
            </span>
          </div>

          <div className="flex min-w-0 flex-col justify-center gap-2">
            {brokers.length > 0 ? (
              <GroupRow
                label="investments"
                total={
                  <>
                    <Veiled>
                      {euros(
                        brokers.reduce(
                          (t, a) => t + investedBy(a.accountId),
                          0,
                        ),
                      )}
                    </Veiled>
                    <span className="text-ink-500"> · </span>
                    <span className="text-money-cash">
                      <Veiled>
                        {euros(
                          brokers
                            .filter(brokerOnly)
                            .reduce((t, a) => t + a.cashEur, 0),
                        )}
                      </Veiled>
                    </span>
                  </>
                }
                parts={brokers.map((a) => ({
                  a,
                  v: investedBy(a.accountId) + (brokerOnly(a) ? a.cashEur : 0),
                }))}
                stale={stale}
                onOpen={() => setOpen('investments')}
              />
            ) : null}
            {banks.length > 0 ? (
              <GroupRow
                label="banks"
                total={
                  <Veiled>
                    {euros(banks.reduce((t, a) => t + a.cashEur, 0))}
                  </Veiled>
                }
                parts={banks.map((a) => ({ a, v: a.cashEur }))}
                stale={stale}
                onOpen={() => setOpen('banks')}
              />
            ) : null}
            {wallets.length > 0 ? (
              <GroupRow
                label="cash"
                cash
                total={
                  <Veiled>
                    {euros(wallets.reduce((t, a) => t + a.cashEur, 0))}
                  </Veiled>
                }
                parts={wallets.map((a) => ({ a, v: a.cashEur }))}
                note={[
                  ...new Set(
                    wallets.flatMap((a) => a.pockets.map((p) => p.currency)),
                  ),
                ].join(' · ')}
                stale={stale}
                onOpen={() => setOpen('cash')}
              />
            ) : null}
          </div>
        </div>
      )}

      <Sheet
        open={open !== null}
        title={open === 'checkin' ? 'check-in' : (open ?? '')}
        onClose={() => setOpen(null)}
      >
        {open === null ? null : (
          <AccountList
            rows={
              open === 'checkin'
                ? stale
                : open === 'investments'
                  ? brokers
                  : open === 'banks'
                    ? banks
                    : wallets
            }
            group={open}
            now={now}
            investedBy={investedBy}
            monthOf={monthOf}
            onUpdate={(id) => {
              const doc = docOf(id)
              if (doc) {
                setOpen(null)
                setUpdating(doc)
              }
            }}
          />
        )}
      </Sheet>
      <UpdateSheet account={updating} onClose={() => setUpdating(null)} />
      <SetupSheet open={setup} onClose={() => setSetup(false)} />
    </section>
  )
}

/* Out of date: its logos when one or two, a count from three. Up to date
   is quiet (27 Sep: the lit green pill with every logo "looks a bit weird
   and cheap"): the same pill as hide beside it, with a green light. */
function CheckIn({ stale, onOpen }: { stale: Array<Row>; onOpen: () => void }) {
  if (stale.length === 0) {
    return (
      <span className="motion-arrive inline-flex items-center gap-2 rounded-full px-2.5 py-1 font-mono text-[10.5px] tracking-[0.12em] text-ink-300 uppercase ring-1 ring-lift/15 ring-inset">
        <span className="size-1.5 rounded-full bg-state-good shadow-[0_0_8px_var(--color-state-good)]" />
        up to date
      </span>
    )
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      className="motion-press inline-flex items-center gap-2 rounded-full bg-state-warn/10 py-1 pr-1.5 pl-2.5 font-mono text-[10.5px] tracking-[0.1em] text-state-warn uppercase ring-1 ring-state-warn/45 ring-inset"
    >
      {stale.length <= 2 ? (
        <>
          check-in
          <span className="flex pl-1">
            {stale.map((a) => (
              <span
                key={a.accountId}
                className="-ml-1 rounded-[6px] ring-[1.5px] ring-sink"
              >
                <AccountLogo name={a.name} domain={a.domain} size={18} />
              </span>
            ))}
          </span>
        </>
      ) : (
        <span className="pr-1">check-in · {stale.length} to update</span>
      )}
    </button>
  )
}

const SHADES = ['bg-lav-400', 'bg-lav-300', 'bg-lav-600', 'bg-lav-200']

/* One of the three rows: its total, the accounts' logos stacked (four,
   then +n), and a bar split by what each account holds. One height. */
function GroupRow({
  label,
  total,
  parts,
  stale,
  cash = false,
  note,
  onOpen,
}: {
  label: string
  total: React.ReactNode
  parts: Array<{ a: Row; v: number }>
  stale: Array<Row>
  cash?: boolean
  note?: string
  onOpen: () => void
}) {
  const late = (a: Row) => stale.some((s) => s.accountId === a.accountId)
  return (
    <button
      type="button"
      onClick={onOpen}
      className="motion-press group flex flex-col gap-2 rounded-[13px] bg-sink/35 px-3.5 py-2.5 text-left ring-1 ring-lift/10 backdrop-blur-[3px] transition-[box-shadow,transform] ring-inset hover:-translate-x-0.5 hover:ring-lav-400/45"
    >
      <span className="flex items-center gap-2.5">
        <span className="label-caps flex-1">{label}</span>
        <span className="font-mono text-[13.5px] text-foreground">{total}</span>
        <ChevronRight className="size-4 text-ink-500 group-hover:text-ink-200" />
      </span>
      <span className="flex items-center gap-2.5">
        <span className="flex pl-1">
          {parts.slice(0, 4).map(({ a }) => (
            <span
              key={a.accountId}
              className={`-ml-1 rounded-[6px] ${late(a) ? 'ring-[1.5px] ring-state-warn' : 'ring-[1.5px] ring-sink'}`}
            >
              <AccountLogo name={a.name} domain={a.domain} size={20} />
            </span>
          ))}
          {parts.length > 4 ? (
            <span className="-ml-1 grid size-5 place-items-center rounded-[6px] bg-lift/15 font-mono text-[9px] text-ink-200">
              +{parts.length - 4}
            </span>
          ) : null}
        </span>
        <span className="flex h-1.5 flex-1 gap-0.5">
          {parts.map(({ a, v }, i) => (
            <span
              key={a.accountId}
              style={{ flex: Math.max(v, 0.0001) }}
              className={`min-w-1 rounded-full ${cash ? 'bg-money-cash' : SHADES[i % SHADES.length]}`}
            />
          ))}
        </span>
        <span className="font-mono text-[10.5px] whitespace-nowrap text-ink-500">
          {note ??
            `${parts.length} ${parts.length === 1 ? 'account' : 'accounts'}`}
        </span>
      </span>
    </button>
  )
}

/* A group's accounts, opened from its row (or the check-in): each with
   what it holds, how fresh, this month, and update. */
function AccountList({
  rows,
  group,
  now,
  investedBy,
  monthOf,
  onUpdate,
}: {
  rows: Array<Row>
  group: Group | 'checkin'
  now: number
  investedBy: (id: Id<'accounts'>) => number
  monthOf: (id: Id<'accounts'>) => number | null
  onUpdate: (id: Id<'accounts'>) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      {group === 'checkin' ? (
        <span className="text-[13px] text-ink-400">
          These balances are more than a week old. Update means: drop a newer
          statement or screenshot, or type what the account holds today.
        </span>
      ) : null}
      {rows.map((a, i) => {
        const f = balanceFreshness(a.pockets, now)
        const age = f.label
        const late = f.stale
        const m = monthOf(a.accountId)
        const inv = investedBy(a.accountId)
        const showInvested =
          group === 'investments' && a.kinds.includes('broker')
        const showCash = group !== 'investments' || !a.kinds.includes('bank')
        return (
          <div
            key={a.accountId}
            style={{ animationDelay: `${i * 40}ms` }}
            className="motion-land flex items-center gap-3 rounded-[12px] bg-lift/[0.035] p-3 ring-1 ring-lift/10 ring-inset"
          >
            <AccountLogo name={a.name} domain={a.domain} size={30} />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex items-center gap-2 text-[14px] text-foreground">
                {a.name}
                <span
                  className={`rounded-[5px] px-1.5 font-mono text-[9.5px] ${late ? 'bg-state-warn/12 text-state-warn' : 'text-ink-500'}`}
                >
                  {age}
                </span>
              </span>
              <span className="truncate font-mono text-[11px] text-ink-400">
                <Veiled>
                  {[
                    showInvested ? `invested ${euros(inv)}` : null,
                    showCash
                      ? a.pockets
                          .map((p) =>
                            p.value === null
                              ? `${p.currency} not read`
                              : money(p.value, p.currency),
                          )
                          .join(' · ')
                      : null,
                    m !== null && m !== 0
                      ? `${m > 0 ? '+' : '−'}${euros(Math.abs(m))} this month`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Veiled>
              </span>
              {group === 'checkin' && f.todo ? (
                <span className="text-[12px] text-state-warn">{f.todo}</span>
              ) : null}
            </span>
            <button
              type="button"
              onClick={() => onUpdate(a.accountId)}
              className={`motion-press rounded-full px-3 py-1.5 font-mono text-[10.5px] tracking-[0.12em] uppercase ring-1 ring-inset ${late ? 'bg-state-warn/10 text-state-warn ring-state-warn/45' : 'text-ink-300 ring-lift/15 hover:text-foreground'}`}
            >
              update
            </button>
          </div>
        )
      })}
    </div>
  )
}
