/* ADD BUYS on one position's page (14 Oct, mockup add-buys.html): the
   buys a dropped file holds for this one thing, which of them are saved
   already, and the units they reach beside the units held. Sums of
   trade rows and nothing else; the two unit numbers are always shown
   side by side, never the difference alone. */

export type ReadBuy = {
  occurredAt: number
  side: 'buy' | 'sell' | 'reward'
  shares: number
  price: number
  /** In `currency`, beside the trade: a buy cost units × price and this. */
  fee?: number | null
  currency: string
  symbol: string | null
  /** The file it was read from, the thing as printed, the file's bank. */
  intakeId?: string
  name?: string
  institution?: string | null
}
export type SavedTrade = {
  occurredAt: number
  side: 'buy' | 'sell'
  shares: number
}

const DAY = 86_400_000
const day = (t: number) => Math.floor(t / DAY)
const same = (a: ReadBuy, b: SavedTrade) =>
  a.side === b.side &&
  day(a.occurredAt) === day(b.occurredAt) &&
  Math.abs(a.shares - b.shares) < 1e-6
const net = (rows: ReadonlyArray<{ side: string; shares: number }>) =>
  rows.reduce((t, r) => t + (r.side === 'sell' ? -r.shares : r.shares), 0)

export function buysCheck(
  read: ReadonlyArray<ReadBuy>,
  saved: ReadonlyArray<SavedTrade>,
  /** Every listing the thing is owned under. */
  symbols: ReadonlyArray<string>,
  held: number,
) {
  const mine = once(
    read.filter((r) => r.symbol !== null && symbols.includes(r.symbol)),
  )
  /* A saved row answers for one read row, not for two alike. */
  const left = [...saved]
  const rows = [...mine]
    .sort((a, b) => b.occurredAt - a.occurredAt)
    .map((r) => {
      const i = left.findIndex((s) => same(r, s))
      if (i >= 0) left.splice(i, 1)
      return {
        ...r,
        had: i >= 0,
        /* What it was for, where it is printed in euros: what was paid,
           fee and all (14 Oct: "it should show what I paid (€1,100)"). */
        eur:
          r.currency === 'EUR'
            ? Math.round(
                (r.shares * r.price +
                  (r.side === 'sell' ? -1 : 1) * (r.fee ?? 0)) *
                  100,
              ) / 100
            : null,
      }
    })
  const buys = rows.filter((r) => r.side === 'buy')
  const fresh = rows.filter((r) => !r.had)
  const units = Number((net(saved) + net(fresh)).toFixed(8))
  const missing = Number((held - units).toFixed(8))
  /* Brokers round what they print: a fifth of a percent is the same. */
  const near = Math.max(1e-6, held * 0.002)
  return {
    rows,
    /* Rows of the file that are for something else: not saved here. */
    others: read.filter((r) => r.symbol === null || !symbols.includes(r.symbol))
      .length,
    elsewhere: elsewhere(
      read.filter((r) => r.symbol === null || !symbols.includes(r.symbol)),
    ),
    fresh: fresh.length,
    totalEur: buys.some((r) => r.eur === null)
      ? null
      : Math.round(buys.reduce((t, r) => t + (r.eur ?? 0), 0) * 100) / 100,
    readUnits: Number(net(rows).toFixed(8)),
    units,
    held,
    missing,
    state:
      missing > near
        ? ('missing' as const)
        : missing < -near
          ? ('over' as const)
          : ('reaches' as const),
  }
}

/** A drop's screenshots overlap: a buy read in two of them is one buy,
    as the save counts it (`writeTrades` in convex/intake.ts: a row of
    another file, same side and units, about the same price, within two
    days, answers for one row). Two alike in one file are two (14 Oct:
    IMG_9290 had three rows also in IMG_9291, and the check said "too
    much"). */
function once<T extends ReadBuy>(rows: ReadonlyArray<T>): Array<T> {
  const kept: Array<T> = []
  const claimed = new Set<T>()
  for (const r of rows) {
    const twin = kept.find(
      (k) =>
        !claimed.has(k) &&
        k.intakeId !== r.intakeId &&
        k.side === r.side &&
        Math.abs(k.shares - r.shares) < 1e-6 &&
        Math.abs(k.price - r.price) <= r.price * 0.05 + 0.01 &&
        Math.abs(k.occurredAt - r.occurredAt) <= 2 * DAY + 3_600_000,
    )
    if (twin) claimed.add(twin)
    else kept.push(r)
  }
  return kept
}

/** The files holding rows for something else, each with what they are
    for: ADD BUYS saves none of it (14 Oct: "it should say what they are
    and where they belong"). */
function elsewhere(rows: ReadonlyArray<ReadBuy>) {
  const files = new Map<
    string,
    {
      intakeId: string
      names: Array<string>
      rows: number
      institution: string | null
    }
  >()
  for (const r of rows) {
    const key = r.intakeId ?? ''
    const f = files.get(key) ?? {
      intakeId: key,
      names: [],
      rows: 0,
      institution: r.institution ?? null,
    }
    f.rows += 1
    const name = r.name ?? r.symbol ?? 'something unnamed'
    if (!f.names.includes(name)) f.names.push(name)
    files.set(key, f)
  }
  return [...files.values()]
}
