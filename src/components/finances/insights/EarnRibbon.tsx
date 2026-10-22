import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { clock } from './parts'
import { TickerLogo } from '@/components/finances/Logo'
import { dayWord, moveWord, priceWord } from '@/lib/insightsEarnings'
import type { Earning, Ribbon } from '@/lib/insightsEarnings'

/* Earnings on MINE (22 Oct, mockup design/treasury-mockup/earnings.html):
   the ribbon across the top of a company's box — EARNINGS 28 OCT ahead,
   REPORTED 20 OCT ▼ 7.8% behind — in the longest words its box has room
   for (styles: insights-mine.css), and the card a press opens, with
   both prices of a report. */

export function EarnRibbon({
  r,
  e,
  fetchedAt,
}: {
  r: Ribbon
  e: Earning
  fetchedAt: number
}) {
  const [open, setOpen] = useState(false)
  const [at, setAt] = useState<{ left: number; top: number } | null>(null)
  const button = useRef<HTMLButtonElement>(null)
  const card = useRef<HTMLDivElement>(null)
  const name = e.symbol.split('.')[0]

  useLayoutEffect(() => {
    if (!open || !button.current) return
    const b = button.current.getBoundingClientRect()
    const width = Math.min(290, window.innerWidth - 16)
    setAt({
      left:
        window.scrollX +
        Math.max(8, Math.min(b.left, window.innerWidth - width - 8)),
      top: window.scrollY + b.bottom + 6,
    })
  }, [open])

  useEffect(() => {
    if (!open) return
    const away = (ev: PointerEvent) => {
      const t = ev.target as Node
      if (!card.current?.contains(t) && !button.current?.contains(t))
        setOpen(false)
    }
    const key = (ev: KeyboardEvent) => ev.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', key)
    }
  }, [open])

  const tone =
    r.kind === 'soon'
      ? 'soon'
      : r.change < 0
        ? 'down'
        : r.change > 0
          ? 'up'
          : ''
  const [long, short, tiny] =
    r.kind === 'soon'
      ? [
          `EARNINGS ${dayWord(r.at)} · IN ${r.days} ${r.days === 1 ? 'DAY' : 'DAYS'}`,
          `EARNINGS ${dayWord(r.at)}`,
          dayWord(r.at),
        ]
      : [
          `REPORTED ${dayWord(r.at)} ${moveWord(r.change)}`,
          `${dayWord(r.at)} ${moveWord(r.change)}`,
          moveWord(r.change),
        ]

  return (
    <>
      <button
        ref={button}
        type="button"
        data-testid="earn-ribbon"
        data-kind={r.kind}
        className={`ins-ea ${tone}`}
        aria-label={long}
        aria-expanded={open}
        onClick={(ev) => {
          ev.stopPropagation()
          setOpen((o) => !o)
        }}
      >
        <span className="l">{long}</span>
        <span className="s">{short}</span>
        <span className="t">{tiny}</span>
      </button>
      {open && at
        ? createPortal(
            <div
              ref={card}
              role="dialog"
              aria-label={`${name} earnings`}
              data-testid="earn-card"
              className="ins-card ins-ecard motion-pop"
              style={at}
            >
              <div className="eh">
                <TickerLogo symbol={e.symbol} type="EQUITY" size={18} />
                <b>{name}</b>
                <span className="flex-1" />
                {r.kind === 'soon' ? (
                  <span className="ins-badge warn">EARNINGS</span>
                ) : (
                  <span
                    className={`ins-badge ${r.change < 0 ? 'bad' : 'good'}`}
                  >
                    REPORTED
                  </span>
                )}
              </div>
              <dl>
                {r.kind === 'soon' ? (
                  <>
                    <dt>NEXT</dt>
                    <dd>{dayWord(r.at)}</dd>
                    <dt>IN</dt>
                    <dd>
                      {r.days} {r.days === 1 ? 'DAY' : 'DAYS'}
                    </dd>
                    <dt>DATE</dt>
                    <dd>{r.estimate ? 'ESTIMATE' : 'CONFIRMED'}</dd>
                    {e.last !== null ? (
                      <>
                        <dt>LAST</dt>
                        <dd>{dayWord(e.last)}</dd>
                      </>
                    ) : null}
                  </>
                ) : (
                  <>
                    <dt>DAY</dt>
                    <dd>{dayWord(r.at)}</dd>
                    <dt>CLOSE {dayWord(r.base.at)}</dt>
                    <dd>{priceWord(r.base.price, r.currency)}</dd>
                    <dt>NOW · {dayWord(r.now.at)}</dt>
                    <dd>{priceWord(r.now.price, r.currency)}</dd>
                    <dt>SINCE</dt>
                    <dd className={r.change < 0 ? 'bad' : 'good'}>
                      {moveWord(r.change)}
                    </dd>
                  </>
                )}
              </dl>
              <div className="ef">
                YAHOO · FETCHED {clock(fetchedAt)} · NOT SAVED
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
