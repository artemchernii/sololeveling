import { Info } from './parts'
import type { MineAnswer } from './useMine'
import { ALLOC, allocation, splitOf } from '@/lib/insightsMine'
import type { AllocRow } from '@/lib/insightsMine'
import type { Owned } from '@/lib/owned'

/* ALLOCATION (19 Oct, spec I2; mockup "3 MINE"): where the money sits by
   theme and place, funds opened up by what Yahoo gives of them, beside
   the world (MSCI World, IWDA's own weights). Both numbers on every
   line. A fund Yahoo cannot open is named under the line it leaves
   unknown, never guessed. The read's opinion (I3) goes under the lines
   — nothing is drawn there until it exists. */

const BAR: Record<AllocRow['id'], string> = {
  tech: 'var(--state-danger)',
  us: 'var(--color-lav-400)',
  europe: 'var(--color-lav-400)',
  health: 'var(--color-lav-400)',
  gold: 'var(--metal-xau)',
}
const pct = (n: number | null) => (n === null ? '❔' : `${Math.round(n)}%`)

export function Allocation({
  held,
  base,
  failed,
}: {
  held: ReadonlyArray<Owned>
  base: MineAnswer | null
  failed: boolean
}) {
  const opened = new Map(
    base?.opened?.parts.map((p) => [p.symbol, p.opened]) ?? [],
  )
  const rows = base?.opened
    ? allocation(
        held.flatMap((o) =>
          o.valueEur === null
            ? []
            : [
                {
                  symbol: o.symbol.split('.')[0],
                  eur: o.valueEur,
                  split: splitOf(o.kind, opened.get(o.symbol) ?? null),
                },
              ],
        ),
        splitOf('etf', base.opened.world),
      )
    : null
  /* The line furthest above the world leads the head, both numbers. */
  const lead = rows
    ?.filter((r) => r.mine !== null && r.world !== null)
    .sort(
      (a, b) =>
        (b.mine ?? 0) - (b.world ?? 0) - ((a.mine ?? 0) - (a.world ?? 0)),
    )[0]
  const tops = [...opened.entries()].flatMap(([s, o]) =>
    o && o.top.length > 0
      ? [
          `${s.split('.')[0]} · ${o.top
            .slice(0, 3)
            .map((t) => `${t.symbol} ${(t.pct * 100).toFixed(1)}%`)
            .join(' · ')}`,
        ]
      : [],
  )

  return (
    <section
      data-testid="mine-alloc"
      className="ins-tile c5"
      style={{ '--i': 10 } as React.CSSProperties}
    >
      <div className="ins-thead">
        <span className="ins-ico">⚖️</span>
        <span className="ins-tname">ALLOCATION</span>
        <Info
          info={{
            title: 'ALLOCATION',
            what: 'Where the money sits by theme and place, with funds opened up to what is inside them, next to the whole world market (MSCI World). A fund that cannot be opened is named under the line it leaves unknown.',
            why: 'Far above the world on one line means one theme decides more of the result.',
            now: [
              lead
                ? `${lead.id.toUpperCase()} ${pct(lead.mine)} · WORLD ${pct(lead.world)}`
                : 'NO DATA',
              ...tops.slice(0, 3),
            ],
          }}
        />
        <span className="flex-1" />
        {lead ? (
          <span className="ins-badge dim" data-testid="alloc-lead">
            {ALLOC.find((a) => a.id === lead.id)?.name} {pct(lead.mine)} · WORLD{' '}
            {pct(lead.world)}
          </span>
        ) : null}
      </div>
      <div className="ins-legend">
        <span>
          <i />
          MINE
        </span>
        <span>
          <i className="d" />
          WORLD · MSCI
        </span>
      </div>
      <div className={`ins-alloc ${rows ? '' : 'ins-reading'}`}>
        {ALLOC.map((a) => {
          const r = rows?.find((x) => x.id === a.id) ?? null
          return (
            <div
              key={a.id}
              data-testid="alloc-row"
              data-id={a.id}
              className="ins-al"
              style={{ '--k': BAR[a.id] } as React.CSSProperties}
            >
              <span className="em">{a.emoji}</span>
              <div className="min-w-0">
                <div className="nm">
                  {a.name}
                  {r && r.notOpened.length > 0 ? (
                    <span className="ins-badge dim" data-testid="not-opened">
                      ❔ NOT OPENED · {r.notOpened.slice(0, 3).join(' ')}
                      {r.notOpened.length > 3
                        ? ` · ${r.notOpened.length - 3} MORE`
                        : ''}
                    </span>
                  ) : null}
                </div>
                <div className="bars2">
                  <div className="bar">
                    <b style={{ width: `${r?.mine ?? 0}%` }} />
                  </div>
                  <div className="bar ref">
                    <b style={{ width: `${r?.world ?? 0}%` }} />
                  </div>
                </div>
              </div>
              <div className="vals">
                <strong>{r ? pct(r.mine) : failed ? '❔' : '…'}</strong>
                <span className="ins-was">WORLD {r ? pct(r.world) : '…'}</span>
              </div>
            </div>
          )
        })}
      </div>
      <div className="ins-foot">
        <span className="ins-was">FUNDS OPENED UP · YAHOO</span>
        <span className="ins-was">WORLD · IWDA · NOT SAVED</span>
      </div>
    </section>
  )
}
