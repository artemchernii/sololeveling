/* Insights' four rate cards (19 Oct, spec I1): US and euro inflation, the
   Fed's and the ECB's rate, each read from the body that publishes it —
   BLS, Eurostat, FRED, the ECB — on open, never stored. Pure parsers, so
   the shapes are pinned and tested without the network. */

export const BLS_SOURCE = 'BLS'
export const EUROSTAT_SOURCE = 'Eurostat'
export const FRED_SOURCE = 'FRED'
export const ECB_SOURCE = 'ECB'

/** A month's inflation and the month before it, in percent. */
export type Inflation = {
  value: number
  month: string
  prev: number | null
  prevMonth: string | null
  /** BLS gives an index, not a rate: the two index values the rate is
      made of, shown in the card's ⓘ beside it. */
  index: { now: number; yearAgo: number } | null
}

const round1 = (n: number) => Math.round(n * 10) / 10

/**
 * BLS's CPI-U (CUUR0000SA0), newest first: the twelve-month change is
 * this month's index over the same month a year before, as BLS itself
 * states it. Null without both.
 */
export function parseBls(json: unknown): Inflation | null {
  const data = (
    json as {
      Results?: { series?: Array<{ data?: Array<Record<string, unknown>> }> }
    } | null
  )?.Results?.series?.[0]?.data
  if (!Array.isArray(data)) return null
  const byMonth = new Map<string, number>()
  for (const d of data) {
    const m = /^M(\d\d)$/.exec(String(d.period))
    const v = Number(d.value)
    if (m && m[1] !== '13' && Number.isFinite(v))
      byMonth.set(`${String(d.year)}-${m[1]}`, v)
  }
  const months = [...byMonth.keys()].sort().reverse()
  const yoy = (month: string) => {
    const [y, m] = month.split('-')
    const before = byMonth.get(`${Number(y) - 1}-${m}`)
    const now = byMonth.get(month)
    return before && now
      ? { rate: round1((now / before - 1) * 100), now, before }
      : null
  }
  const latest = months[0]
  const first = latest ? yoy(latest) : null
  if (!latest || !first) return null
  const prevMonth = months[1] ?? null
  return {
    value: first.rate,
    month: latest,
    prev: prevMonth ? (yoy(prevMonth)?.rate ?? null) : null,
    prevMonth,
    index: { now: first.now, yearAgo: first.before },
  }
}

/** Eurostat's HICP annual rate of change (prc_hicp_minr, ECOICOP 2 since 2026) for the euro area. */
export function parseEurostat(json: unknown): Inflation | null {
  const j = json as {
    value?: Record<string, unknown>
    dimension?: { time?: { category?: { index?: Record<string, number> } } }
  } | null
  const index = j?.dimension?.time?.category?.index
  if (!j?.value || !index) return null
  const rows = Object.entries(index)
    .map(([month, i]) => ({ month, v: j.value?.[String(i)] }))
    .filter((r): r is { month: string; v: number } => typeof r.v === 'number')
    .sort((a, b) => b.month.localeCompare(a.month))
  if (rows.length === 0) return null
  return {
    value: rows[0].v,
    month: rows[0].month,
    prev: rows[1]?.v ?? null,
    prevMonth: rows[1]?.month ?? null,
    index: null,
  }
}

/** A policy rate now and the day it took that value. */
export type Policy = { value: number; since: string }

/** The ECB's deposit facility rate (FM D.U2.EUR.4F.KR.DFR.LEV), daily. */
export function parseEcb(json: unknown): Policy | null {
  const j = json as {
    dataSets?: Array<{
      series?: Record<string, { observations?: Record<string, Array<unknown>> }>
    }>
    structure?: {
      dimensions?: { observation?: Array<{ values?: Array<{ id?: string }> }> }
    }
  } | null
  const series = Object.values(j?.dataSets?.[0]?.series ?? {})[0]
  const days = j?.structure?.dimensions?.observation?.[0]?.values
  if (!series?.observations || !Array.isArray(days)) return null
  const rows = Object.entries(series.observations)
    .map(([i, o]) => ({ day: days[Number(i)]?.id, v: o[0] }))
    .filter(
      (r): r is { day: string; v: number } =>
        typeof r.day === 'string' && typeof r.v === 'number',
    )
    .sort((a, b) => a.day.localeCompare(b.day))
  return sinceOf(rows)
}

/** FRED's observations of one series (DFEDTARU or DFEDTARL). */
export function parseFred(json: unknown): Policy | null {
  const obs = (json as { observations?: Array<Record<string, unknown>> } | null)
    ?.observations
  if (!Array.isArray(obs)) return null
  const rows = obs
    .map((o) => ({ day: o.date, v: Number(o.value) }))
    .filter(
      (r): r is { day: string; v: number } =>
        typeof r.day === 'string' && Number.isFinite(r.v),
    )
    .sort((a, b) => a.day.localeCompare(b.day))
  return sinceOf(rows)
}

/** The latest value, and the first day of the run that ends on it. */
function sinceOf(rows: Array<{ day: string; v: number }>): Policy | null {
  const last = rows[rows.length - 1] as (typeof rows)[number] | undefined
  if (!last) return null
  let i = rows.length - 1
  while (i > 0 && rows[i - 1].v === last.v) i--
  return { value: last.v, since: rows[i].day }
}

/* The days each bank announces its rate, as each publishes its calendar
   (federalreserve.gov FOMC calendar; ecb.europa.eu monetary policy
   meetings), 2026. A day passed is not shown; after the last, no badge. */
export const FED_MEETINGS = [
  '2026-01-28',
  '2026-03-18',
  '2026-04-29',
  '2026-06-17',
  '2026-07-29',
  '2026-09-16',
  '2026-10-28',
  '2026-12-09',
]
export const ECB_MEETINGS = [
  '2026-02-05',
  '2026-03-19',
  '2026-04-30',
  '2026-06-11',
  '2026-07-23',
  '2026-09-10',
  '2026-10-29',
  '2026-12-17',
]

/** The next announcement on or after today (a YYYY-MM-DD), or null. */
export function nextMeeting(days: ReadonlyArray<string>, today: string) {
  return days.find((d) => d >= today) ?? null
}
