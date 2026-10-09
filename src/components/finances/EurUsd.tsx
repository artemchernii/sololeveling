import { Veiled } from '@/components/finances/Veil'
import { money } from '@/lib/currency'
import { euros } from '@/lib/money'

/* Investments in euros and dollars together (10 Oct: "please investments
   show dollar and euro together. This is important"). The dollars are the
   euros at the latest stored ECB rate — no dollar figure without one. */
export function EurUsd({
  eur,
  usdRate,
}: {
  eur: number
  /** Euros per dollar (aggregate.positions). */
  usdRate: number | null
}) {
  const cents = Math.round(eur * 100) / 100
  return (
    <>
      <Veiled>{euros(cents)}</Veiled>
      {usdRate ? (
        <span className="text-ink-500">
          {' · '}
          <Veiled>
            {money(Math.round((eur / usdRate) * 100) / 100, 'USD')}
          </Veiled>
        </span>
      ) : null}
    </>
  )
}
