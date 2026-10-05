/* How fresh an account's balance is, in words (27 Sep: "it says check
   26d. WHY? I just added it"). Two different times: when he gave the app
   the balance, and the day the balance is true for. An August statement
   read today is "statement read today · balance of Aug 31" — and it is
   out of date, because Aug 31 is, not because he was slow. */

export const STALE_MS = 7 * 86_400_000

export type PocketTime = {
  /** Named in the words when the account has more than one (5 Oct:
      Revolut stayed in check-in for its USD, and nothing said so). */
  currency?: string
  recordedAt: number | null
  writtenAt: number | null
  source: 'typed' | 'statement' | 'screenshot' | 'sync' | null
}

const WORD = {
  typed: 'typed',
  statement: 'statement read',
  screenshot: 'screenshot read',
  sync: 'synced',
} as const

const DAY = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short' })

function ago(ms: number, now: number): string {
  const day = new Date(ms).setHours(0, 0, 0, 0)
  const today = new Date(now).setHours(0, 0, 0, 0)
  const days = Math.round((today - day) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  return `${days}d ago`
}

export function freshness(
  pockets: ReadonlyArray<PocketTime>,
  now: number,
): { label: string; stale: boolean; asOf: number | null; todo: string | null } {
  const read = pockets.filter(
    (p): p is PocketTime & { recordedAt: number } => p.recordedAt !== null,
  )
  if (read.length === 0)
    return {
      label: 'no balance yet',
      stale: true,
      asOf: null,
      todo: 'Drop a statement or a screenshot, or type what it holds.',
    }
  /* The oldest pocket decides: a card is as fresh as its stalest part. */
  const oldest = read.reduce((a, b) => (b.recordedAt < a.recordedAt ? b : a))
  const written = oldest.writtenAt ?? oldest.recordedAt
  const sameDay =
    new Date(written).toDateString() ===
    new Date(oldest.recordedAt).toDateString()
  const word =
    (read.length > 1 && oldest.currency ? `${oldest.currency} ` : '') +
    (oldest.source ? WORD[oldest.source] : 'read')
  const stale = now - oldest.recordedAt > STALE_MS
  return {
    label: sameDay
      ? `${word} ${ago(written, now)}`
      : `${word} ${ago(written, now)} · balance of ${DAY.format(oldest.recordedAt)}`,
    stale,
    asOf: oldest.recordedAt,
    todo: stale
      ? `Its ${read.length > 1 && oldest.currency ? `${oldest.currency} ` : ''}balance is from ${DAY.format(oldest.recordedAt)}. Drop a newer statement or screenshot, or type what it holds today.`
      : null,
  }
}
