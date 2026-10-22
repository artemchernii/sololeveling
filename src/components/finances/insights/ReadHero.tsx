import { ModelPick } from '@/components/ask/ModelPick'
import { AccountLogo } from '@/components/finances/Logo'
import { MARKET_READ_MODEL, factsFor, nextMonthWord } from '@/lib/marketRead'
import { clock, dayWord } from './parts'
import { Kpi, Words, modelWord, tokens, usd } from './readParts'
import type { useMarketRead } from './useMarketRead'

/* The hero (mockup states: not read, reading, read · calm, read · mixed,
   failed, cap reached). Left: the month, the model's headline with its
   mood word coloured, two sentences, four of the room's numbers. Right:
   who read it, when, how much, who paid, and the one button. The 4px edge
   on the left is the mood: good, warn for mixed, danger for rough or
   failed. */

const MONTH = 'JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC'.split(' ')
const MOOD: Record<string, string> = {
  calm: 'var(--state-good)',
  mixed: 'var(--state-warn)',
  rough: 'var(--state-danger)',
}

type Read = ReturnType<typeof useMarketRead>

export function ReadHero({
  r,
  positions,
}: {
  r: Read
  positions: number | null
}) {
  const { hero, row, shown } = r
  const month = MONTH[Number(r.month.slice(5, 7)) - 1]
  const done = hero === 'done' && row?.read ? row : null
  const body = done?.read
  const edge =
    hero === 'done' && body
      ? MOOD[body.mood]
      : hero === 'failed'
        ? 'var(--state-danger)'
        : hero === 'cap'
          ? 'var(--state-warn)'
          : 'var(--color-lav-400)'
  const stamp = (hero === 'done' ? row?.stamp : shown?.stamp) ?? null
  const pro = (stamp?.paidBy ?? r.path) === 'pro'

  return (
    <section
      data-testid="read-hero"
      data-state={hero}
      className="ins-tile ins-hero system-frame"
      style={{ '--i': 0, '--mood': edge } as React.CSSProperties}
    >
      <div className="flex min-w-0 flex-col gap-3">
        <span className="system-title">[ MARKET READ · {month} ]</span>
        {hero === 'idle' ? (
          <>
            <span className="headline">Not read yet</span>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['🌡️', 'INFLATION'],
                  ['🏛️', 'FED · ECB'],
                  ['📊', 'MARKETS · SECTORS'],
                  ['🌐', 'NEWS'],
                  ...(positions !== null
                    ? [
                        [
                          '💼',
                          `${positions} ${positions === 1 ? 'POSITION' : 'POSITIONS'}`,
                        ],
                      ]
                    : []),
                ] as Array<[string, string]>
              ).map(([e, k]) => (
                <span key={k} className="ins-kpi">
                  <span className="e">{e}</span>
                  {k}
                </span>
              ))}
            </div>
          </>
        ) : hero === 'reading' ? (
          <>
            <span className="headline text-lav-300">Reading the market…</span>
            <div className="ins-scan" />
            <span className="label-caps">
              FED · ECB · CPI · 8 MARKETS · 30 COMPANIES · NEWS
            </span>
          </>
        ) : hero === 'failed' ? (
          <>
            <span className="headline text-state-danger">
              Reader not reached
            </span>
            <span data-testid="read-failed" className="label-caps">
              {row?.failCost ? `PAID ${usd(row.failCost)}` : 'NOTHING PAID'}
              {row?.error && row.error !== 'NOT REACHED'
                ? ` · ${row.error}`
                : ''}
              {shown?.readAt
                ? ` · THE LAST READ STAYS · ${dayWord(shown.readAt)}`
                : ''}
            </span>
          </>
        ) : hero === 'cap' ? (
          <>
            <span className="headline text-state-warn">Month cap reached</span>
            <span data-testid="read-cap" className="label-caps">
              CAP {usd(r.cap)} · USED {usd(r.spent)} · NEXT{' '}
              {nextMonthWord(r.month)}
            </span>
          </>
        ) : body ? (
          <>
            <span data-testid="read-headline" className="headline motion-pop">
              <em>{body.lead}</em> · {body.rest}
            </span>
            <p className="ins-summary">
              <Words text={body.summary} />
            </p>
            <div className="flex flex-wrap gap-2">
              {factsFor(body.kpis, row?.facts ?? []).map((f) => (
                <Kpi key={f.key} fact={f} />
              ))}
            </div>
          </>
        ) : null}
      </div>

      <div className="stamp">
        <div className="flex flex-col items-[inherit] gap-2">
          <span className="ins-model">
            <AccountLogo name="Claude" domain="claude.ai" size={18} />
            {modelWord(stamp?.model ?? MARKET_READ_MODEL)}
            {stamp ? ` · 🌐 ${stamp.searches}` : ''}
          </span>
          {stamp && shown?.readAt ? (
            <span data-testid="read-stamp" className="ins-was">
              {dayWord(shown.readAt)} {clock(shown.readAt)} ·{' '}
              {tokens(stamp.inputTokens)} IN · {tokens(stamp.outputTokens)} OUT
            </span>
          ) : null}
          {r.path === 'pro' ? (
            <ModelPick label="PRO PLAN" />
          ) : r.path !== null || stamp ? (
            <span
              data-testid="read-pay"
              className={`ins-badge ${pro ? 'good' : 'warn'}`}
            >
              {pro ? '⚡ PRO PLAN · NO CREDITS' : '💳 API CREDITS'}
            </span>
          ) : null}
          {!pro && r.path !== null ? (
            <span data-testid="read-cost" className="ins-was">
              {stamp && stamp.paidBy === 'api' ? `${usd(stamp.cost)} · ` : ''}
              CAP {usd(r.cap)} · USED {usd(r.spent)}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          data-testid="read-market"
          className={`ins-btn ${hero === 'done' ? 'ghost' : ''}`}
          disabled={!r.canPress || hero === 'cap'}
          onClick={() => void r.press()}
        >
          {hero === 'reading'
            ? '✦ READING…'
            : hero === 'failed'
              ? '↻ TRY AGAIN'
              : hero === 'done'
                ? '↻ READ AGAIN'
                : '✦ READ MARKET'}
        </button>
      </div>
    </section>
  )
}
