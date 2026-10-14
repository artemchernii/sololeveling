import { useEffect, useRef } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import {
  Building2,
  Cpu,
  Factory,
  Globe,
  HeartPulse,
  Landmark,
  Pickaxe,
  Plug,
  Radio,
  Shield,
  ShoppingBag,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { Bars } from '@/components/finances/Logo'
import type { Kind } from '@/lib/logo'
import type { Sector } from '@/lib/sector'

/* A position's head line (14 Oct, mockup position-rounds.html "4 · head
   line"): what it is, what it is in, its code, its currency as a chip.
   Badges only; where the sector came from is on hover, never as text. */

/* Yahoo's words for what a thing is (14 Oct: "fund is etf?"). */
const KIND = { stock: 'share', etf: 'ETF', crypto: 'coin', gold: 'gold' }

const ICON: Record<Exclude<Sector, 'gold'>, LucideIcon> = {
  tech: Cpu,
  'cyber security': Shield,
  health: HeartPulse,
  energy: Zap,
  finance: Landmark,
  consumer: ShoppingBag,
  industry: Factory,
  communication: Radio,
  'real estate': Building2,
  utilities: Plug,
  materials: Pickaxe,
  'asia pacific': Globe,
  japan: Globe,
  europe: Globe,
  emerging: Globe,
  us: Globe,
  world: Globe,
}

const DAY = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
})
const BADGE =
  'inline-flex items-center gap-[5px] rounded-full px-2.5 py-0.5 text-[10px] tracking-[0.12em] uppercase'

/** "$" for USD, "€" for EUR; nothing where the browser has no symbol. */
function symbolOf(currency: string) {
  try {
    const sym = new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
    })
      .formatToParts(0)
      .find((p) => p.type === 'currency')?.value
    return sym && sym !== currency ? sym : null
  } catch {
    return null
  }
}

function Gold({ title }: { title?: string }) {
  return (
    <span
      data-testid="head-sector"
      title={title}
      className={BADGE}
      style={{
        color: 'var(--metal-xau-ink)',
        background: 'color-mix(in oklch, var(--metal-xau) 18%, transparent)',
      }}
    >
      <Bars size={12} fill="currentColor" />
      gold
    </span>
  )
}

export function HeadLine({
  instrumentId,
  kind,
  code,
  currency,
}: {
  instrumentId: Id<'instruments'>
  kind: Kind
  code: string
  currency: string
}) {
  const read = useQuery(api.sector.of, { instrumentId })
  /* Read once, on the first open of this thing's page (sector.ts). */
  const ask = useMutation(api.sector.ask)
  const asked = useRef<Id<'instruments'> | null>(null)
  useEffect(() => {
    if (read === undefined || read === null || read.readAt !== undefined) return
    if (asked.current === instrumentId) return
    asked.current = instrumentId
    void ask({ instrumentId }).catch(() => undefined)
  }, [read, instrumentId, ask])

  const sector = read?.sector
  const title =
    read?.from === undefined || read.readAt === undefined
      ? undefined
      : `${read.from === 'yahoo' ? 'Yahoo sector' : 'the fund’s name'} · ${DAY.format(new Date(read.readAt))}`
  const sym = symbolOf(currency)
  const Icon = sector && sector !== 'gold' ? ICON[sector] : null

  return (
    <p className="mt-1.5 flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-ink-500">
      {/* Gold is what it is and what it is in: one badge, never two. */}
      {kind === 'gold' ? (
        <Gold title={sector === 'gold' ? title : undefined} />
      ) : (
        <>
          <span className={`${BADGE} bg-lav-400/16 text-lav-300`}>
            {KIND[kind]}
          </span>
          {sector === 'gold' ? (
            <Gold title={title} />
          ) : Icon ? (
            <span
              data-testid="head-sector"
              title={title}
              className={`${BADGE} motion-arrive bg-lift/[0.07] text-ink-100 ring-1 ring-lift/[0.12] ring-inset`}
            >
              <Icon className="size-3" />
              {sector}
            </span>
          ) : null}
        </>
      )}
      <span className="text-ink-300">{code}</span>
      <span
        data-testid="head-currency"
        className={`${BADGE} text-ink-100 ring-1 ring-lift/[0.22] ring-inset`}
      >
        {sym ? <b className="font-medium text-lav-300">{sym}</b> : null}
        {currency}
      </span>
    </p>
  )
}
