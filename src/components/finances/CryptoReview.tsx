import { useState } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { Check } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { Busy, PILL_LOUD, PILL_QUIET } from '@/components/finances/bits'
import { ReviewLanded } from '@/components/finances/IntakeLanded'
import type { LandedAccount } from '@/components/finances/Landed'
import { AccountLogo, TickerLogo } from '@/components/finances/Logo'
import { failureMessage } from '@/lib/convex-errors'
import { euros } from '@/lib/money'
import { checkCryptoStatement } from '@/lib/crypto'

/* A crypto statement (4 Oct; mock design/treasury-mockup/crypto.html,
   "adding the statement"): the file with its bank's mark, the coins it
   holds arriving, what was found as badges, each check landing in turn,
   the numbers checked against the statement's own — and one button.
   Nothing is saved before it. */
export function CryptoReview({
  intake,
  onDiscard,
  onDone,
}: {
  intake: Doc<'intakes'>
  onDiscard: () => void
  onDone: () => void
}) {
  const accounts = useQuery(api.accounts.list, {}) ?? []
  const whose = useQuery(api.intake.whose, { intakeId: intake._id })
  const confirm = useMutation(api.intake.confirmTrades)
  const trades = intake.trades ?? []
  const closing = intake.positions ?? []
  const brokers = accounts.filter((a) => a.kinds.includes('broker'))
  const [accountId, setAccountId] = useState<Id<'accounts'> | null>(
    intake.accountId ?? null,
  )
  /* His one Revolut, when the file is Revolut's. */
  const byName = brokers.find((a) =>
    (intake.institution ?? '').toLowerCase().includes(a.name.toLowerCase()),
  )
  const target = accountId ?? whose?.guessedAccountId ?? byName?._id ?? null
  const account = accounts.find((a) => a._id === target)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [landed, setLanded] = useState<LandedAccount | null>(null)
  const c = checkCryptoStatement(trades, closing)
  const year = (t: number) => new Date(t).getFullYear()
  const checks: Array<[string, string, boolean]> = [
    [
      `${c.held.length} coin${c.held.length === 1 ? '' : 's'} you hold`,
      c.held.map((h) => h.coin).join(', '),
      false,
    ],
    [
      `${c.deals} buys and sells`,
      `${c.from ? year(c.from) : ''}${c.to && c.from && year(c.to) !== year(c.from) ? ` → ${year(c.to)}` : ''}${c.currencies.length ? `, in ${c.currencies.join(' and ')}` : ''}${c.currencies.some((x) => x !== 'EUR') ? ' — dollars turned into € at that day’s rate' : ''}`,
      false,
    ],
    ...(c.rewards
      ? ([
          [
            `${c.rewards} staking payments`,
            c.staked
              .map(
                (x) =>
                  `${x.shares < 10 ? x.shares.toFixed(2) : x.shares.toFixed(1)} ${x.coin} you got for free`,
              )
              .join(', '),
            true,
          ],
        ] as Array<[string, string, boolean]>)
      : []),
    ...(c.soldOut.length
      ? ([
          [
            `${c.soldOut.length} coin${c.soldOut.length === 1 ? '' : 's'} you sold completely`,
            c.soldOut.join(', '),
            false,
          ],
        ] as Array<[string, string, boolean]>)
      : []),
    c.differs.length === 0
      ? [
          'The numbers match',
          `every buy, sell and staking payment adds up to what the statement says you hold — ${euros(c.worthEur)}`,
          true,
        ]
      : [
          'Revolut’s amounts are used',
          c.differs
            .map(
              (d) =>
                `${d.coin}: the statement shows ${Math.abs(d.diff).toPrecision(2)} ${d.diff > 0 ? 'more' : 'less'} than its trades add up to`,
            )
            .join(' · '),
          false,
        ],
  ]

  async function save() {
    if (!target) return
    setSaving(true)
    setError(null)
    try {
      const done = await confirm({
        intakeId: intake._id,
        accountId: target,
        rows: trades.map((t, index) => ({
          index,
          candidate: t.candidates[t.preferred ?? 0],
        })),
      })
      setLanded({ accountId: target, added: done.written })
    } catch (e) {
      setError(failureMessage(e) ?? 'Not saved')
      setSaving(false)
    }
  }

  if (landed) return <ReviewLanded landed={landed} onDone={onDone} />

  return (
    <>
      <div className="flex items-center gap-3.5 rounded-[16px] border border-dashed border-lav-400/35 bg-lift/[0.03] p-3.5">
        <AccountLogo
          name={intake.institution ?? 'Revolut'}
          domain={account?.domain ?? 'revolut.com'}
          size={44}
        />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-[15px] text-foreground">
            {intake.institution ?? intake.title}
          </span>
          <span className="truncate font-mono text-[10.5px] text-ink-500">
            {intake.title}
          </span>
          <span className="flex">
            {c.held.map((h, i) => (
              <span
                key={h.coin}
                style={{ animationDelay: `${300 + i * 110}ms` }}
                className="motion-pop -ml-1.5 rounded-full ring-2 ring-popover first:ml-0"
              >
                <TickerLogo
                  symbol={`${h.coin}-EUR`}
                  type="CRYPTOCURRENCY"
                  size={24}
                />
              </span>
            ))}
          </span>
        </span>
        {c.differs.length === 0 ? (
          <span
            style={{ animationDelay: '1.6s' }}
            className="motion-pop rounded-full bg-state-good/14 px-2.5 py-1 font-mono text-[10px] tracking-[0.1em] text-state-good uppercase ring-1 ring-state-good/30 ring-inset"
          >
            ✓ matches
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {[
          [`worth ${euros(c.worthEur)}`, false],
          [`${c.held.length} coins`, false],
          [`${c.deals} trades`, false],
          ...(c.rewards
            ? [
                [
                  `+${c.staked.map((x) => `${x.shares.toFixed(2)} ${x.coin}`).join(' · ')} free`,
                  true,
                ],
              ]
            : []),
        ].map(([label, good], i) => (
          <span
            key={String(label)}
            style={{ animationDelay: `${700 + i * 120}ms` }}
            className={`motion-pop rounded-full px-2.5 py-1 font-mono text-[10.5px] tracking-[0.08em] uppercase ring-1 ring-inset ${
              good
                ? 'bg-state-good/12 text-state-good ring-state-good/30'
                : 'bg-lav-400/12 text-lav-200 ring-lav-400/30'
            }`}
          >
            {label}
          </span>
        ))}
      </div>
      <div className="flex flex-col">
        {checks.map(([what, said, good], i) => (
          <div
            key={what}
            style={{ animationDelay: `${600 + i * 220}ms` }}
            className="motion-arrive grid grid-cols-[24px_minmax(0,1fr)] items-start gap-2.5 border-b border-lift/[0.05] py-2.5"
          >
            <span
              style={{ animationDelay: `${750 + i * 220}ms` }}
              className={`motion-pop mt-0.5 grid size-5 place-items-center rounded-full ${good ? 'bg-state-good/18 text-state-good' : 'bg-lav-400/14 text-lav-300'}`}
            >
              <Check className="size-3" strokeWidth={3} />
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[14px] text-foreground">{what}</span>
              <span className="text-[12.5px] leading-relaxed text-ink-400">
                {said}
              </span>
            </span>
          </div>
        ))}
      </div>
      {brokers.length > 1 || !target ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="label-caps">into</span>
          {brokers.map((a) => (
            <button
              key={a._id}
              type="button"
              aria-pressed={target === a._id}
              onClick={() => setAccountId(a._id)}
              className={target === a._id ? PILL_LOUD : PILL_QUIET}
            >
              {a.name}
            </button>
          ))}
        </div>
      ) : null}
      {error ? (
        <span className="font-mono text-[11.5px] text-state-warn">{error}</span>
      ) : null}
      <div className="sticky -bottom-4 z-10 -mx-4 -mb-4 flex items-center gap-2 border-t border-lift/[0.06] bg-popover px-4 pt-3 pb-4 sm:-mx-5 sm:px-5">
        <button
          type="button"
          onClick={onDiscard}
          className={`${PILL_QUIET} flex-1 justify-center py-3`}
        >
          discard
        </button>
        <button
          type="button"
          disabled={!target || saving}
          onClick={() => void save()}
          className={`${PILL_LOUD} flex-[2] justify-center py-3 disabled:opacity-40`}
        >
          <Busy on={saving} doing="adding">
            add to {account?.name ?? '…'}
          </Busy>
        </button>
      </div>
      <span className="label-caps text-center">
        nothing is saved until you press it
      </span>
    </>
  )
}
