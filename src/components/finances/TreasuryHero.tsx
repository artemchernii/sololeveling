import { useState } from 'react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { TriangleAlert } from 'lucide-react'
import { Link } from '@tanstack/react-router'

import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { AddButton } from '@/components/finances/Add'
import { UpdateSheet } from '@/components/finances/UpdateSheet'
import { SetupSheet } from '@/components/finances/Setup'
import {
  AccountList,
  CheckIn,
  GroupRow,
  Steady,
} from '@/components/finances/TreasuryHeroParts'
import type { Group, Row } from '@/components/finances/TreasuryHeroParts'
import { Sheet } from '@/components/finances/Sheet'
import { Veiled, VeilToggle } from '@/components/finances/Veil'
import { Skeleton } from '@/components/Skeleton'
import { freshness as balanceFreshness } from '@/lib/freshness'
import { useDayStarts } from '@/components/track/useDayStarts'
import { areaVars } from '@/lib/areas'
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

/* A pay month starts at noon UTC of its salary day. */
const utcDay = (t: number) =>
  `${new Date(t).getUTCDate()} ${new Date(t).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })}`

/* "at 14:33" today, else its day too. */
function fetched(t: number, today: number): string {
  const d = new Date(t)
  const time = d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })
  return t >= today
    ? `at ${time}`
    : `on ${d.getDate()} ${d.toLocaleString('en-US', { month: 'short' })} at ${time}`
}

export function TreasuryHero() {
  const today = useDayStarts(1).at(-1) as number
  const now = Date.now()
  const { monthStart, nextStart } = monthRange(today)
  const worth = useQuery(api.aggregate.worth, {})
  const balances = useQuery(api.aggregate.balances, {})
  const accounts = useQuery(api.accounts.list, {})
  /* In and out run from salary to salary, as Flow's pay month does (13
     Oct: "I get salary in the end of the month", so a calendar month is
     "in €0" until its last days). The calendar month only while no salary
     is found yet. */
  const pay = useQuery(api.aggregate.payMonth, { today })
  const sums = useQuery(
    api.aggregate.moneySums,
    pay === null ? { start: monthStart, end: nextStart } : 'skip',
  )
  const period =
    pay === undefined
      ? undefined
      : pay !== null
        ? {
            in: pay.current.salary + pay.current.other,
            out: pay.current.bills + pay.current.dayToDay,
            label: `since salary on ${utcDay(pay.current.start)}`,
          }
        : sums === undefined
          ? undefined
          : { in: sums.in.sum, out: sums.out.sum, label: 'this month' }
  const month = useQuery(api.aggregate.accountMonth, {
    start: monthStart,
    end: nextStart,
  })
  const [open, setOpen] = useState<Group | 'checkin' | null>(null)
  const [updating, setUpdating] = useState<Doc<'accounts'> | null>(null)
  /* UPDATE was pressed on a line of the check-in. */
  const [fromCheckIn, setFromCheckIn] = useState(false)
  const [setup, setSetup] = useState(false)

  const loading = worth === undefined || balances === undefined
  const empty = !loading && balances.accounts.length === 0
  const rows = balances?.accounts ?? []
  /* Free cash is banks and cash — his pick, 4 Oct, the same number as
     Flow's AHEAD. A broker's cash waits to be invested, so it sits with
     the investments as "at brokers"; the two still add up to capital. */
  const cash = rows
    .filter((a) => a.kinds.includes('bank') || a.kinds.includes('cash'))
    .reduce((t, a) => t + a.cashEur, 0)
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
  /* What a broker holds in cash: all of a broker-only account's, and the
     broker cash line of a bank that is also one (10 Oct). */
  const cashAtBroker = (a: Row) =>
    brokerOnly(a) ? a.cashEur : (a.brokerCash?.eur ?? 0)
  const brokerCash = brokers.reduce((t, a) => t + cashAtBroker(a), 0)
  const atBrokers = (worth?.invested.total ?? 0) + brokerCash

  const docOf = (id: Id<'accounts'>) => accounts?.find((a) => a._id === id)
  const net = period
    ? (Math.round(period.in * 100) - Math.round(period.out * 100)) / 100
    : null
  /* What the total wants done, one line each, by name (13 Oct, his
     words): a balance that is old, a cash line never entered. Each opens
     UPDATE for its account. Nothing when all is recent. */
  const todo = [
    ...rows.flatMap((a) => [
      ...a.pockets
        .filter((p) => p.eur === null)
        .map((p) => ({
          id: a.accountId,
          text: `${a.name} ${p.currency} is missing`,
        })),
      ...(a.brokerCash && a.brokerCash.eur === null
        ? [{ id: a.accountId, text: `${a.name} broker cash is missing` }]
        : []),
    ]),
    ...stale
      .filter((a) => a.pockets.some((p) => p.recordedAt !== null))
      .map((a) => ({ id: a.accountId, text: `${a.name} balance outdated` })),
  ]

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
        {/* UPDATE ALL (3 Oct): many statements at once, beside ADD. */}
        <AddButton onOpen={empty ? () => setSetup(true) : undefined} />
      </div>

      {loading ? (
        /* The hero's own frame at once (9 Oct, loading.html): its words and
           rows where they will be, only the numbers waiting. */
        <div
          role="status"
          aria-label="Loading"
          className="relative mt-4 grid gap-5 sm:grid-cols-[1.1fr_1fr] sm:gap-7"
        >
          <div className="flex min-w-0 flex-col gap-3">
            <span className="label-caps">capital · cash · investments</span>
            <span className="flex h-[46px] items-center sm:h-[56px]">
              <Skeleton className="h-9 w-56 sm:h-11" />
            </span>
            <span className="inline-flex min-h-9 items-center self-start rounded-[10px] bg-lift/[0.06] px-3 py-1.5">
              <Skeleton className="h-3 w-40" />
            </span>
            <span className="h-2.5 max-w-[460px] rounded-full bg-lift/[0.06]" />
          </div>
          <div className="flex min-w-0 flex-col justify-center gap-2">
            {['investments', 'banks', 'cash'].map((label) => (
              <span
                key={label}
                className="flex items-center gap-2.5 rounded-[13px] bg-sink/35 px-3.5 py-2.5 ring-1 ring-lift/10 ring-inset"
              >
                <span className="label-caps flex-1">{label}</span>
                <Skeleton className="h-3 w-16" />
              </span>
            ))}
          </div>
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
            label="add accounts"
            className="self-start"
            onOpen={() => setSetup(true)}
          />
        </div>
      ) : (
        <div className="relative mt-4 grid gap-5 sm:grid-cols-[1.1fr_1fr] sm:gap-7">
          <div className="flex min-w-0 flex-col gap-3">
            <span className="label-caps">capital · cash · investments</span>
            <span
              data-testid="hero-total"
              className="motion-fade text-[46px] leading-none font-light tracking-tight text-foreground sm:text-[56px]"
            >
              <Veiled>
                <Steady text={euros(worth.total)} />
              </Veiled>
            </span>
            {/* One "this month" (1 Oct: two pills said the same thing):
                in − out, his own money moving left out of both. */}
            <span className="inline-flex min-h-9 flex-wrap items-center gap-x-2.5 gap-y-1 self-start rounded-[10px] bg-lift/[0.06] px-3 py-1.5 font-mono text-[14.5px] font-medium">
              {period === undefined || net === null ? (
                <Skeleton className="h-3 w-40" />
              ) : period.in === 0 && period.out === 0 ? (
                <span className="text-[12px] font-normal text-ink-400">
                  nothing in or out {period.label}
                </span>
              ) : (
                <>
                  <span
                    className={
                      net >= 0 ? 'text-state-good' : 'text-state-danger'
                    }
                  >
                    <Veiled>{`${net >= 0 ? '+' : '−'}${euros(Math.abs(net))}`}</Veiled>
                  </span>
                  {/* In green, out red (4 Oct: "in and out are a bit
                      bland"). */}
                  <span className="text-[12px] font-normal text-ink-500">
                    {period.label} ·{' '}
                    <span className="text-state-good">
                      <Veiled>{`in ${euros(period.in)}`}</Veiled>
                    </span>{' '}
                    ·{' '}
                    <span className="text-state-danger">
                      <Veiled>{`out ${euros(period.out)}`}</Veiled>
                    </span>
                  </span>
                </>
              )}
            </span>
            <div className="flex max-w-[460px] flex-col gap-1.5">
              <div className="flex h-2.5 gap-[3px] overflow-hidden rounded-full bg-lift/[0.06]">
                {cash + atBrokers > 0 ? (
                  <>
                    <span
                      style={{ flex: cash }}
                      className="rounded-full bg-money-cash transition-[flex] duration-700"
                    />
                    <span
                      style={{ flex: atBrokers }}
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
                  at brokers <Veiled>{euros(atBrokers)}</Veiled>
                </Link>
              </div>
            </div>
            {todo.length > 0 ? (
              <span
                data-testid="hero-todo"
                className="flex flex-wrap gap-x-4 gap-y-1"
              >
                {todo.map((t) => (
                  <button
                    key={t.text}
                    type="button"
                    onClick={() => {
                      const doc = docOf(t.id)
                      if (doc) setUpdating(doc)
                    }}
                    className="motion-press flex items-center gap-1.5 font-mono text-[11px] text-state-warn hover:underline"
                  >
                    <TriangleAlert className="size-3.5 shrink-0" />
                    {t.text}
                  </button>
                ))}
              </span>
            ) : null}
            {
              /* A number only: an older backend answers without it. */
              typeof worth.invested.fetchedAt === 'number' ? (
                <span className="font-mono text-[11px] text-ink-500">
                  Asset prices fetched{' '}
                  {fetched(worth.invested.fetchedAt, today)}
                </span>
              ) : null
            }
          </div>

          <div className="flex min-w-0 flex-col justify-center gap-2">
            {brokers.length > 0 ? (
              <GroupRow
                label="investments"
                total={
                  <Veiled>
                    {euros(
                      brokers.reduce((t, a) => t + investedBy(a.accountId), 0),
                    )}
                  </Veiled>
                }
                /* A broker's own cash, said as cash (27 Sep: an unlabeled gold
                   second number beside the total read like a profit). */
                note={
                  brokerCash > 0 ? (
                    <>
                      cash <Veiled>{euros(brokerCash)}</Veiled>
                    </>
                  ) : undefined
                }
                parts={brokers.map((a) => ({
                  a,
                  v: investedBy(a.accountId) + cashAtBroker(a),
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
        title={open === 'checkin' ? 'outdated balances' : (open ?? '')}
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
                setFromCheckIn(open === 'checkin')
                setOpen(null)
                setUpdating(doc)
              }
            }}
          />
        )}
      </Sheet>
      <UpdateSheet
        account={updating}
        onClose={() => {
          setUpdating(null)
          /* The check-in is a list worked down: it comes back with what
             is still old (11 Oct), not the page. */
          if (fromCheckIn && stale.length > 0) setOpen('checkin')
          setFromCheckIn(false)
        }}
      />
      <SetupSheet open={setup} onClose={() => setSetup(false)} />
    </section>
  )
}
