import { useState } from 'react'

import { AccountLogo } from '@/components/finances/Logo'
import { MAX_SEARCHES, factsFor } from '@/lib/marketRead'
import type { Doc } from '../../../../convex/_generated/dataModel'
import type { Kind, ReadLine } from '@/lib/marketRead'
import { askLine } from '@/lib/askOnCards'
import { AskOn } from './AskOn'
import { TABS, TILE_OF } from './InsightsTabs'
import { dayWord } from './parts'
import {
  FactChip,
  KINDS_SHOWN,
  KIND_LOOK,
  TONE_BADGE,
  TONE_COLOUR,
  Words,
} from './readParts'

/* Band 2, WHAT IT MEANS (mockup): THE READ — 3 to 5 lines, each with its
   kind's icon, the model's badge, title and sentence, the facts it named
   printed by the app, and WHAT IT MEANS behind a tap — then the sources;
   beside it HOW IT IS MADE, the fixed shape every read keeps. */

type Row = Doc<'marketReads'>

export function ReadLines({
  shown,
  positions,
  onGo,
}: {
  shown: Row | null
  positions: number | null
  /** Opens the tab a line is about and lights its tile. */
  onGo: (kind: Kind) => void
}) {
  const read = shown?.read
  return (
    <div className="ins-grid">
      <section
        data-testid="read-lines"
        className="ins-tile c8"
        style={{ '--i': 7 } as React.CSSProperties}
      >
        <div className="ins-thead">
          <span className="ins-ico">✦</span>
          <span className="ins-tname">THE READ</span>
          <span className="flex-1" />
          <span className="ins-badge dim">RESEARCH · NOT ADVICE</span>
        </div>
        {read ? (
          <>
            <div className="flex flex-col gap-2">
              {read.lines.map((l, i) => (
                <Line key={i} line={l} facts={shown.facts} i={i} onGo={onGo} />
              ))}
            </div>
            {read.sources.length > 0 ? (
              <div data-testid="read-sources" className="ins-srcs">
                <span className="label-caps">SOURCES</span>
                {read.sources.map((s) => (
                  <a
                    key={s.url}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ins-src"
                  >
                    <AccountLogo name={s.site} domain={s.site} size={14} />
                    {s.site
                      .replace(/^www\./, '')
                      .split('.')[0]
                      .toUpperCase()}
                    {s.day ? ` · ${dayWord(s.day)}` : ''} ↗
                  </a>
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <div className="ins-after">
            <span className="text-[22px]">✦</span>
            <span className="label-caps">AFTER THE READ</span>
          </div>
        )}
      </section>
      <HowItIsMade shown={shown} positions={positions} />
    </div>
  )
}

function Line({
  line,
  facts,
  i,
  onGo,
}: {
  line: ReadLine
  facts: Row['facts']
  i: number
  onGo: (kind: Kind) => void
}) {
  const to = TILE_OF[line.kind]
  const [open, setOpen] = useState(false)
  const look = KIND_LOOK[line.kind]
  const named = factsFor(line.factKeys, facts)
  return (
    <div
      data-testid="read-line"
      data-kind={line.kind}
      className="ins-ln"
      style={
        {
          '--t': TONE_COLOUR[line.tone],
          animationDelay: `${i * 90}ms`,
        } as React.CSSProperties
      }
    >
      <span className="em" aria-hidden>
        {look.icon}
      </span>
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-2">
          <h3>{line.title}</h3>
          <span className={`ins-badge ${TONE_BADGE[line.tone]}`}>
            {line.badge}
          </span>
        </div>
        <p>
          <Words text={line.line} />
        </p>
        {named.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {named.map((f) => (
              <FactChip key={f.key} fact={f} />
            ))}
          </div>
        ) : null}
        <div className="ins-acts">
          <button
            type="button"
            className="ins-means"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            WHAT IT MEANS {open ? '▴' : '▾'}
          </button>
          {to ? (
            <button
              type="button"
              data-testid="read-goto"
              className="ins-goto"
              onClick={() => onGo(line.kind)}
            >
              → {TABS.find((t) => t.id === to.tab)?.name}
            </button>
          ) : null}
          <AskOn q={askLine(line.title)} wide />
        </div>
        {open ? (
          <div data-testid="read-plain" className="ins-plain motion-fade-up">
            <Words text={line.plain} />
          </div>
        ) : null}
      </div>
    </div>
  )
}

function HowItIsMade({
  shown,
  positions,
}: {
  shown: Row | null
  positions: number | null
}) {
  const count = (p: (k: string) => boolean) =>
    shown ? shown.facts.filter((f) => p(f.key)).length : null
  const rates = count((k) => ['us-cpi', 'eu-hicp', 'fed', 'ecb'].includes(k))
  const stamp = shown?.stamp
  const feed: Array<[string, string]> = [
    ['Inflation, Fed, ECB', `${rates ?? 4} NUMBERS`],
    ['Markets and sectors', '8 · 30'],
    ['Positions', String(positions ?? '—')],
    ['News searched', stamp ? `🌐 ${stamp.searches}` : `🌐 ≤ ${MAX_SEARCHES}`],
  ]
  const rules: Array<[string, string, boolean?]> = [
    ['Lines', '3 TO 5'],
    ['Headline', '≤ 40 LETTERS'],
    ['Numbers under a line', 'FROM THE APP'],
    ['Nothing to say', '❔ NO DATA'],
    ['A number written by the model', 'NEVER', true],
  ]
  return (
    <section
      data-testid="read-how"
      className="ins-tile c4"
      style={{ '--i': 8 } as React.CSSProperties}
    >
      <div className="ins-thead">
        <span className="ins-ico">⚙️</span>
        <span className="ins-tname">HOW IT IS MADE</span>
      </div>
      <div className="ins-feed">
        {feed.map(([k, v]) => (
          <Pair key={k} k={k} v={v} />
        ))}
      </div>
      <span className="label-caps">
        THE MODEL PICKS A KIND · THE APP PICKS THE ICON
      </span>
      <div className="ins-kinds">
        {KINDS_SHOWN.map((k) => (
          <div
            key={k}
            className="kind"
            style={{ '--t': KIND_LOOK[k].t } as React.CSSProperties}
          >
            <span>{KIND_LOOK[k].icon}</span>
            {KIND_LOOK[k].name}
          </div>
        ))}
      </div>
      <span className="label-caps">EVERY READ, ANY MONTH</span>
      <div className="ins-feed">
        {rules.map(([k, v, bad]) => (
          <Pair key={k} k={k} v={v} bad={bad} />
        ))}
      </div>
      <div className="ins-foot">
        <span className="ins-was">SAME SHAPE · ONLY THE WORDS CHANGE</span>
      </div>
    </section>
  )
}

function Pair({ k, v, bad }: { k: string; v: string; bad?: boolean }) {
  return (
    <>
      <span>{k}</span>
      <b className={bad ? 'text-state-danger' : undefined}>{v}</b>
    </>
  )
}
