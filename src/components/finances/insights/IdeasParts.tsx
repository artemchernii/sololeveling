import { useState } from 'react'

import type { Board, Part } from '@/lib/ideasRead'
import type { Fact } from '@/lib/marketRead'
import { TickerLogo } from '@/components/finances/Logo'

/* The plan's four parts (29 Oct, his "keep, protect and so on not very
   clear … maybe when hover give better explanation"): the bar, and under
   it a tile per part — its €, its share of the cash and one badge (KEEP:
   months of spending; the others: their lines). Hovered, focused or
   tapped, a tile opens a card: what the part is, in a plain sentence
   (an ⓘ card may be sentences), and what is in it. */

export const PARTS: Record<
  Part,
  { name: string; sub: string; c: string; what: string }
> = {
  keep: {
    name: 'KEEP',
    sub: 'CASH FOR SPENDING',
    c: 'var(--idb-keep)',
    what: 'Stays as cash in the bank, for bills and day-to-day spending and anything that comes up. It earns little, but it never drops.',
  },
  protect: {
    name: 'PROTECT',
    sub: 'GOLD · BONDS · CASH THAT PAYS',
    c: 'var(--idb-protect)',
    what: 'Money that should not fall much when shares do: funds paying the ECB rate, short government bonds, gold. Small gains, small swings, sold any day.',
  },
  add: {
    name: 'ADD TO MINE',
    sub: 'MINE · AFTER TODAY',
    c: 'var(--idb-add)',
    what: 'More of what is already in MINE — bought after a drop, or in parts weeks apart, so one price does not decide it.',
  },
  new: {
    name: 'NEW',
    sub: 'NOT IN MINE · % MINE · % WORLD',
    c: 'var(--idb-new)',
    what: 'Tickers not in MINE, for regions or sectors where MINE holds less than the world does. Few and small.',
  },
}

export function PartIcon({ part }: { part: Part }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="idb-ico">
      {part === 'keep' ? (
        <>
          <rect x="3" y="6" width="18" height="13" rx="2" />
          <path d="M3 10h18M7 15h3" />
        </>
      ) : part === 'protect' ? (
        <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
      ) : part === 'add' ? (
        <path d="M12 5v14M5 12h14" />
      ) : (
        <>
          <circle cx="12" cy="12" r="8" />
          <path d="M15 9l-2 4-4 2 2-4z" />
        </>
      )}
    </svg>
  )
}

const eur = (n: number) => `€${Math.round(n).toLocaleString('en-GB')}`
const ORDER: Array<Part> = ['keep', 'protect', 'add', 'new']

/** A month of spending, in euros, from the read's own fact. */
export function spendMonth(facts: Array<Fact>): number | null {
  const v = facts.find((f) => f.key === 'spend-month')?.value
  const m = v ? /€([\d,]+)/.exec(v) : null
  const n = m ? Number(m[1].replace(/,/g, '')) : NaN
  return n > 0 ? n : null
}

export function PlanBar({ b, facts }: { b: Board; facts: Array<Fact> }) {
  const [on, setOn] = useState<Part | null>(null)
  const total = ORDER.reduce((t, k) => t + b.parts[k], 0)
  const spend = spendMonth(facts)
  const shown = ORDER.filter((k) => b.parts[k] > 0)
  return (
    <div className="idb-plan" onMouseLeave={() => setOn(null)}>
      <div className="idb-bar" data-testid="idb-bar">
        {shown.map((k) => (
          <i
            key={k}
            className={on && on !== k ? 'dim' : ''}
            onMouseEnter={() => setOn(k)}
            style={
              {
                '--c': PARTS[k].c,
                flex: b.parts[k],
              } as React.CSSProperties
            }
          />
        ))}
      </div>
      <div className="idb-pts">
        {shown.map((k, i) => {
          const lines = b.lines.filter((l) => l.part === k)
          const share = total > 0 ? Math.round((b.parts[k] / total) * 100) : 0
          const badge =
            k === 'keep'
              ? spend
                ? `${(b.parts.keep / spend).toFixed(1)} MO OF SPENDING`
                : 'CASH'
              : `${lines.length} ${lines.length === 1 ? 'LINE' : 'LINES'}`
          return (
            <button
              key={k}
              type="button"
              data-testid="idb-pt"
              data-part={k}
              aria-expanded={on === k}
              className={`idb-pt ${on && on !== k ? 'dim' : ''} ${i >= shown.length - 2 ? 'end' : ''}`}
              style={{ '--c': PARTS[k].c, '--i': i } as React.CSSProperties}
              onMouseEnter={() => setOn(k)}
              onFocus={() => setOn(k)}
              onBlur={() => setOn(null)}
              onClick={() => setOn(on === k ? null : k)}
            >
              <span className="h">
                <span className="ic">
                  <PartIcon part={k} />
                </span>
                {k === 'add' ? 'ADD' : PARTS[k].name}
              </span>
              <b>{eur(b.parts[k])}</b>
              <span className="s">
                {share}% OF CASH · {badge}
              </span>
              {on === k ? (
                <span className="idb-tip" data-testid="idb-tip" role="tooltip">
                  <span className="t">
                    <span className="ic">
                      <PartIcon part={k} />
                    </span>
                    {PARTS[k].name}
                    <span className="grow" />
                    {eur(b.parts[k])} · {share}%
                  </span>
                  <span className="w">{PARTS[k].what}</span>
                  {k === 'keep' && spend ? (
                    <span className="rows">
                      <span>
                        SPENDING A MONTH <b>{eur(spend)}</b>
                      </span>
                      <span>
                        {eur(b.parts.keep)} ÷ {eur(spend)}{' '}
                        <b>{(b.parts.keep / spend).toFixed(1)} MONTHS</b>
                      </span>
                    </span>
                  ) : null}
                  {lines.length > 0 ? (
                    <span className="rows">
                      {lines.map((l) => (
                        <span key={l.ticker} className="ln">
                          <TickerLogo
                            symbol={l.ticker}
                            name={l.name}
                            size={18}
                          />
                          {l.ticker}
                          <span className={`idb-call ${l.call}`}>
                            {l.call.toUpperCase()}
                          </span>
                          <span className="grow" />
                          <b>{l.eur === 0 ? '€0' : `+${eur(l.eur)}`}</b>
                        </span>
                      ))}
                    </span>
                  ) : null}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
