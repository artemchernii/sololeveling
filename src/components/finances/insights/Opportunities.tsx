import { useEffect, useState } from 'react'
import { useAction } from 'convex/react'
import { Telescope } from 'lucide-react'

import { AskOn } from './AskOn'
import { DrawnMark, Flag } from './Flag'
import { Info, changeWord, clock, dayWord, monthWord } from './parts'
import { api } from '../../../../convex/_generated/api'
import type { Rate } from '../../../../convex/insightsMarket'
import type {
  LevelId,
  LevelsAnswer,
  OppRow,
  StocksAnswer,
} from '../../../../convex/marketSources/opportunities'
import { AccountLogo } from '@/components/finances/Logo'
import { tickerBase } from '@/lib/market'
import { MOVER_REGIONS, REGION_FLAG, closeWord } from '@/lib/movers'
import type { MoverRegion } from '@/lib/movers'
import { countryOf } from '@/lib/opportunities'
import type { Owned } from '@/lib/owned'

/* OPPORTUNITIES on MARKET (31 Oct, market-world.html; the rule in
   CLAUDE.md, Insights, and src/lib/opportunities.ts): two lists of
   companies picked by a written rule, then bonds and metals with nothing
   picked. Every number on a row beside its place. Asked once on open
   (four regions and the levels), kept ten minutes in page memory, never
   stored. */

const KEEP_MS = 10 * 60_000
const ALL_ROWS = 10
const KINDS = [
  'DOWN FROM HIGH',
  'CHEAP · TARGET ABOVE',
  'BONDS',
  'GOLD · SILVER',
] as const
type Kind = (typeof KINDS)[number]
type Region = 'ALL' | MoverRegion
type Shown = StocksAnswer | 'failed'

const keptStocks = new Map<MoverRegion, { at: number; answer: StocksAnswer }>()
let keptLevels: { at: number; answer: LevelsAnswer } | null = null

function useOpportunities() {
  const askStocks = useAction(api.marketSources.opportunities.stocks)
  const askLevels = useAction(api.marketSources.opportunities.levels)
  const fresh = (at: number) => Date.now() - at < KEEP_MS
  const [stocks, setStocks] = useState(() => {
    const m = new Map<MoverRegion, Shown>()
    for (const r of MOVER_REGIONS) {
      const k = keptStocks.get(r)
      if (k && fresh(k.at)) m.set(r, k.answer)
    }
    return m
  })
  const [levels, setLevels] = useState<LevelsAnswer | 'failed' | null>(() =>
    keptLevels && fresh(keptLevels.at) ? keptLevels.answer : null,
  )
  useEffect(() => {
    let live = true
    for (const region of MOVER_REGIONS) {
      if (stocks.has(region)) continue
      askStocks({ region })
        .then((a) => {
          keptStocks.set(region, { at: Date.now(), answer: a })
          if (live) setStocks((m) => new Map(m).set(region, a))
        })
        .catch(() => {
          if (live) setStocks((m) => new Map(m).set(region, 'failed'))
        })
    }
    if (levels === null)
      askLevels({})
        .then((a) => {
          keptLevels = { at: Date.now(), answer: a }
          if (live) setLevels(a)
        })
        .catch(() => {
          if (live) setLevels('failed')
        })
    return () => {
      live = false
    }
    /* asked once on open: what is kept is not asked again */
  }, [askStocks, askLevels])
  return { stocks, levels }
}

export function Opportunities({
  held,
  owned,
  rates,
}: {
  held: ReadonlySet<string>
  owned: ReadonlyArray<Owned> | null
  rates: ReadonlyArray<Rate> | null
}) {
  const { stocks, levels } = useOpportunities()
  const [kind, setKind] = useState<Kind>('DOWN FROM HIGH')
  const [region, setRegion] = useState<Region>('ALL')
  const isStocks = kind === 'DOWN FROM HIGH' || kind === 'CHEAP · TARGET ABOVE'
  return (
    <section
      data-tile="opportunities"
      className="ins-tile"
      style={{ '--i': 3, '--a': 'var(--color-lav-400)' } as React.CSSProperties}
    >
      <div className="ins-thead">
        <span className="ins-ico">
          <Telescope size={15} aria-hidden />
        </span>
        <span className="ins-tname">OPPORTUNITIES</span>
        <span className="ins-was">NOT SAVED</span>
        <Info
          info={{
            title: 'OPPORTUNITIES',
            what: 'Big companies from the US, Europe, Asia and South America, picked by two fixed rules. DOWN FROM HIGH: at least 20% below the highest price of the last year, most analysts say buy, and their average target is above the price. CHEAP · TARGET ABOVE: the price is low against the profit analysts expect (P/E under its sector) and the target is at least 15% above the price.',
            why: 'A good company far below its high, or cheap against its sector with analysts expecting more, is where a bargain may be. The rule only finds candidates: the target is the analysts’ guess, and a fall can have a reason.',
            now: [
              `RULES · ▼ 20% FROM HIGH · BUY OR BETTER · ▲ 15% TO TARGET · 5+ ANALYSTS`,
              'SECTOR P/E · DAMODARAN, NYU STERN · US INDUSTRIES',
            ],
          }}
        />
      </div>
      <div className="ins-chips" role="tablist">
        {KINDS.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={k === kind}
            data-testid="opp-kind"
            className={`ins-chipbtn plain ${k === kind ? 'on' : ''}`}
            onClick={() => setKind(k)}
          >
            {k}
          </button>
        ))}
      </div>
      {isStocks ? (
        <div className="ins-chips opp-reg" role="tablist">
          {(['ALL', ...MOVER_REGIONS] as const).map((r) => (
            <button
              key={r}
              type="button"
              role="tab"
              aria-selected={r === region}
              data-testid="opp-region"
              className={`ins-chipbtn ${r === 'ALL' ? 'plain' : ''} ${r === region ? 'on' : ''}`}
              onClick={() => setRegion(r)}
            >
              {r === 'ALL' ? null : <Flag code={REGION_FLAG[r]} size={16} />}
              {r}
            </button>
          ))}
        </div>
      ) : null}
      {isStocks ? (
        <StockRows kind={kind} region={region} stocks={stocks} held={held} />
      ) : (
        <LevelRows kind={kind} levels={levels} owned={owned} rates={rates} />
      )}
    </section>
  )
}

function StockRows({
  kind,
  region,
  stocks,
  held,
}: {
  kind: 'DOWN FROM HIGH' | 'CHEAP · TARGET ABOVE'
  region: Region
  stocks: ReadonlyMap<MoverRegion, Shown>
  held: ReadonlySet<string>
}) {
  const regions = region === 'ALL' ? MOVER_REGIONS : [region]
  const got = regions.flatMap((r) => {
    const a = stocks.get(r)
    return a && a !== 'failed' && a.reached ? [a] : []
  })
  const missing = regions.filter((r) => {
    const a = stocks.get(r)
    return a === 'failed' || (a !== undefined && !a.reached)
  })
  const reading = regions.some((r) => !stocks.has(r))
  const down = kind === 'DOWN FROM HIGH'
  const rows = got
    .flatMap((a) => (down ? a.down : a.cheap))
    .sort((a, b) =>
      down ? a.fromHigh - b.fromHigh : (b.toTarget ?? 0) - (a.toTarget ?? 0),
    )
    .slice(0, region === 'ALL' ? ALL_ROWS : undefined)
  const fetchedAt = Math.max(0, ...got.map((a) => a.fetchedAt))
  const year = got.find((a) => a.sectorYear !== null)?.sectorYear ?? null
  const heads = down
    ? ['FROM HIGH', 'ANALYSTS', 'TARGET', 'FWD P/E · SECTOR']
    : ['FWD P/E · SECTOR', 'ANALYSTS', 'TARGET', 'DIVIDEND']
  return (
    <>
      {rows.length > 0 ? (
        <div className="opp" data-testid="opps">
          <Heads heads={heads} />
          {rows.map((o) => {
            const cells = [
              fromHighCell(o),
              analystsCell(o),
              targetCell(o),
              peCell(o),
              dividendCell(o),
            ]
            return (
              <div
                key={o.symbol}
                className="opp-row"
                data-testid="opp"
                data-symbol={o.symbol}
              >
                <div className="c1">
                  <AccountLogo name={o.name} domain={o.domain} size={28} />
                  <span className="min-w-0">
                    <b>
                      {o.name}
                      {held.has(tickerBase(o.symbol)) ? (
                        <i className="held">HELD</i>
                      ) : null}
                    </b>
                    <span className="s">
                      <Flag code={countryOf(o.symbol)} size={12} />
                      {closeWord(o.price, o.currency)}
                    </span>
                  </span>
                </div>
                {(down
                  ? [cells[0], cells[1], cells[2], cells[3]]
                  : [cells[3], cells[1], cells[2], cells[4]]
                ).map((c, i) => (
                  <Cell key={heads[i]} h={heads[i]} {...c} />
                ))}
                <div className="ask">
                  <AskOn q={askOpp(kind, o)} />
                </div>
              </div>
            )
          })}
        </div>
      ) : null}
      <div className="opp-state">
        {reading ? (
          <span
            className="ins-badge dim ins-reading"
            data-testid="opps-reading"
          >
            READING
          </span>
        ) : rows.length === 0 && missing.length < regions.length ? (
          <span className="ins-badge dim" data-testid="opps-none">
            NONE
          </span>
        ) : null}
        {missing.map((r) => (
          <span key={r} className="ins-badge bad" data-testid="opps-missing">
            ✕ {r} NOT REACHED
          </span>
        ))}
      </div>
      <div className="ins-foot">
        <span className="ins-was" data-testid="opps-foot">
          {`YAHOO FINANCE · DAMODARAN${year ? ` ${year}` : ''}${fetchedAt ? ` · FETCHED ${clock(fetchedAt)}` : ''} · NOT SAVED`}
        </span>
      </div>
    </>
  )
}

type CellText = { k: string; w: string; tone?: 'good' | 'bad' }

const toneOf = (n: number): CellText['tone'] =>
  n > 0 ? 'good' : n < 0 ? 'bad' : undefined

const fromHighCell = (o: OppRow): CellText => ({
  k: changeWord(o.fromHigh),
  w: `HIGH ${closeWord(o.high, o.currency)}`,
  tone: toneOf(o.fromHigh),
})
function analystsCell(o: OppRow): CellText {
  const r = o.rating
  if (r === null) return { k: '—', w: 'NO RATING' }
  return r.sell > 0
    ? { k: `${r.buy} · ${r.hold} · ${r.sell}`, w: 'BUY · HOLD · SELL' }
    : { k: `${r.buy} · ${r.hold}`, w: 'BUY · HOLD' }
}
const targetCell = (o: OppRow): CellText =>
  o.target && o.toTarget !== null
    ? {
        k: changeWord(o.toTarget),
        w: closeWord(o.target.mean, o.currency),
        tone: toneOf(o.toTarget),
      }
    : { k: '—', w: 'NO TARGET' }
const peCell = (o: OppRow): CellText => ({
  k: `${o.pe !== null ? o.pe.toFixed(0) : '—'} · ${o.sector ? o.sector.pe.toFixed(0) : '—'}`,
  w: o.sector ? o.sector.industry.toUpperCase() : 'NO SECTOR',
})
const dividendCell = (o: OppRow): CellText =>
  o.dividend !== null
    ? { k: `${(o.dividend * 100).toFixed(1)}%`, w: 'YEAR' }
    : { k: '—', w: 'NONE' }

function askOpp(kind: string, o: OppRow) {
  const why =
    kind === 'DOWN FROM HIGH'
      ? `${changeWord(o.fromHigh)} from its high of ${closeWord(o.high, o.currency)}`
      : `P/E ${o.pe?.toFixed(0) ?? '—'} against ${o.sector?.pe.toFixed(0) ?? '—'} for its sector`
  return `${o.name} (${o.symbol}) is ${why}, analysts' target ${o.target ? closeWord(o.target.mean, o.currency) : '—'}. Is it a good buy now?`
}

function Heads({ heads }: { heads: Array<string> }) {
  return (
    <div className="opp-row hd" aria-hidden>
      <div />
      {heads.map((h) => (
        <div key={h}>{h}</div>
      ))}
      <div />
    </div>
  )
}

function Cell({ h, k, w, tone }: CellText & { h: string }) {
  return (
    <div className="cell" data-h={h}>
      <span className={`k ${tone ?? ''}`}>{k}</span>
      <span className="w">{w}</span>
    </div>
  )
}

const BONDS: Array<{
  id: LevelId
  name: string
  flag: 'US' | 'DE'
  tag: string
  what: string
  /** The OECD's monthly yield: its month, not a day. */
  monthly?: true
}> = [
  { id: 'us10y', name: 'US 10Y', flag: 'US', tag: '10Y', what: 'TREASURY' },
  { id: 'us2y', name: 'US 2Y', flag: 'US', tag: '2Y', what: 'TREASURY' },
  {
    id: 'de10y',
    name: 'GERMANY 10Y',
    flag: 'DE',
    tag: '10Y',
    what: 'BUND',
    monthly: true,
  },
]

function LevelRows({
  kind,
  levels,
  owned,
  rates,
}: {
  kind: 'BONDS' | 'GOLD · SILVER'
  levels: LevelsAnswer | 'failed' | null
  owned: ReadonlyArray<Owned> | null
  rates: ReadonlyArray<Rate> | null
}) {
  const answer = levels === 'failed' ? null : levels
  const get = (id: LevelId) => answer?.rows.find((r) => r.id === id)
  const pct = (n: number) => `${n.toFixed(2)}%`
  const fed = rates?.find((r) => r.id === 'fed')
  const ecb = rates?.find((r) => r.id === 'ecb')
  const fedWord =
    fed?.value != null
      ? `${fed.value.toFixed(2)}${fed.upper != null ? `–${fed.upper.toFixed(2)}` : ''}%`
      : '—'
  const ecbWord = ecb?.value != null ? pct(ecb.value) : '—'
  const heads =
    kind === 'BONDS'
      ? ['YIELD', '1 YEAR AGO', '1Y HIGH', 'FED / ECB']
      : ['FROM HIGH', '1 YEAR', '1Y HIGH', 'IN MINE']
  const sources = [
    ...new Set(
      (kind === 'BONDS' ? ['us10y', 'us2y', 'de10y'] : ['gold', 'silver'])
        .map((id) => get(id as LevelId)?.source)
        .filter((s): s is string => s !== undefined),
    ),
  ]
  const mineOf = (silver: boolean) => {
    const rows = (owned ?? []).filter((o) =>
      silver ? /silver/i.test(o.name) : o.kind === 'gold',
    )
    const eur = rows.reduce((t, o) => t + (o.valueEur ?? 0), 0)
    return rows.length > 0
      ? {
          k: `€${Math.round(eur).toLocaleString('en-US')}`,
          w: 'HELD',
        }
      : { k: '—', w: 'NOT HELD' }
  }
  const usd = (n: number) => closeWord(n, 'USD')
  const notReached = (
    <span className="ins-badge bad" data-testid="level-missing">
      ✕ NOT REACHED
    </span>
  )
  return (
    <>
      {answer === null && levels !== 'failed' ? (
        <span className="ins-badge dim ins-reading" data-testid="opps-reading">
          READING
        </span>
      ) : (
        <div className="opp" data-testid="opps">
          <Heads heads={heads} />
          {kind === 'BONDS'
            ? BONDS.map((b) => {
                const l = get(b.id)?.level ?? null
                const when = (t: number) => {
                  if (!b.monthly) return dayWord(t)
                  const d = new Date(t).toISOString()
                  const year = d.slice(0, 4)
                  return `${monthWord(d.slice(0, 7))}${year === new Date().toISOString().slice(0, 4) ? '' : ` ${year}`}`
                }
                const policy =
                  b.flag === 'US'
                    ? { k: fedWord, w: 'FED' }
                    : { k: ecbWord, w: 'ECB' }
                return (
                  <div
                    key={b.id}
                    className="opp-row"
                    data-testid="opp"
                    data-symbol={b.id}
                  >
                    <div className="c1">
                      <Flag code={b.flag} tag={b.tag} size={28} />
                      <span className="min-w-0">
                        <b>{b.name}</b>
                        <span className="s">{b.what}</span>
                      </span>
                    </div>
                    {l ? (
                      <>
                        <Cell h={heads[0]} k={pct(l.now.v)} w={when(l.now.t)} />
                        <Cell
                          h={heads[1]}
                          k={pct(l.yearAgo.v)}
                          w={when(l.yearAgo.t)}
                        />
                        <Cell
                          h={heads[2]}
                          k={pct(l.high.v)}
                          w={when(l.high.t)}
                        />
                      </>
                    ) : (
                      <div className="cell span3">{notReached}</div>
                    )}
                    <Cell h={heads[3]} {...policy} />
                    <div className="ask">
                      <AskOn
                        q={`${b.name} yields ${l ? pct(l.now.v) : '—'}, ${l ? pct(l.yearAgo.v) : '—'} a year ago. Is it a good time to buy bonds?`}
                      />
                    </div>
                  </div>
                )
              })
            : (['gold', 'silver'] as const).map((id) => {
                const l = get(id)?.level ?? null
                const mine = mineOf(id === 'silver')
                const name = id === 'gold' ? 'Gold' : 'Silver'
                return (
                  <div
                    key={id}
                    className="opp-row"
                    data-testid="opp"
                    data-symbol={id}
                  >
                    <div className="c1">
                      <DrawnMark icon={id} size={28} />
                      <span className="min-w-0">
                        <b>
                          {name}
                          {mine.w === 'HELD' ? (
                            <i className="held">HELD</i>
                          ) : null}
                        </b>
                        <span className="s">{l ? usd(l.now.v) : '—'}</span>
                      </span>
                    </div>
                    {l ? (
                      <>
                        <Cell
                          h={heads[0]}
                          k={changeWord(l.fromHigh)}
                          w={`HIGH ${usd(l.high.v)}`}
                          tone={toneOf(l.fromHigh)}
                        />
                        <Cell
                          h={heads[1]}
                          k={changeWord(l.year)}
                          w={usd(l.yearAgo.v)}
                          tone={toneOf(l.year)}
                        />
                        <Cell
                          h={heads[2]}
                          k={usd(l.high.v)}
                          w={dayWord(l.high.t)}
                        />
                      </>
                    ) : (
                      <div className="cell span3">{notReached}</div>
                    )}
                    <Cell h={heads[3]} {...mine} />
                    <div className="ask">
                      <AskOn
                        q={`${name} is ${l ? `${changeWord(l.fromHigh)} from its 1-year high of ${usd(l.high.v)}` : '—'}. Is it a good time to buy ${name.toLowerCase()}?`}
                      />
                    </div>
                  </div>
                )
              })}
        </div>
      )}
      <div className="ins-foot">
        <span className="ins-was" data-testid="opps-foot">
          {`${sources.join(' · ') || 'YAHOO FINANCE · FRED'}${kind === 'BONDS' ? ' · FED · ECB' : ''}${answer ? ` · FETCHED ${clock(answer.fetchedAt)}` : ''} · NOT SAVED`.toUpperCase()}
        </span>
      </div>
    </>
  )
}
