/* A balance the rows do not reach, and the same money in another account
   (11 Oct, docs/specs/2026-10-11-account-sheet-check.md): his Trade
   Republic read €500.63 more than its rows made, and ActivoBank had sent
   it €505.20 three days after that balance — the difference a fee. The
   rule is mechanical; the account sheet only asks whether it is so. */

const DAY_MS = 86_400_000

/** A fee is small: 2% of what was sent, and never over €10. */
export const FEE_SHARE = 0.02
export const FEE_MAX_CENTS = 1000
/** The other bank books it around the two balances, later more often. */
export const BEFORE_MS = 3 * DAY_MS
export const AFTER_MS = 5 * DAY_MS

/** A transfer row in one of his accounts, as its own account sees it. */
export type Side = {
  accountId: string
  at: number
  /** Signed: negative when it left that account. */
  cents: number
  /** The account its file says it went to or came from, when it says. */
  otherAccountId: string | null
  /** It already has its other side. */
  paired: boolean
}

export type OpenGap = {
  accountId: string
  /** read − expected: positive when money came in that no row shows. */
  cents: number
  from: number
  to: number
}

/** The transfer in another account that is this gap, and the fee between
    them; null when none fits. */
export function transferFor<TSide extends Side>(
  gap: OpenGap,
  rows: ReadonlyArray<TSide>,
): { row: TSide; feeCents: number } | null {
  if (gap.cents === 0) return null
  let best: { row: TSide; feeCents: number } | null = null
  for (const row of rows) {
    if (row.accountId === gap.accountId || row.paired) continue
    if (row.otherAccountId !== null && row.otherAccountId !== gap.accountId)
      continue
    if (row.at < gap.from - BEFORE_MS || row.at > gap.to + AFTER_MS) continue
    /* What this account's side of it would be. */
    const here = -row.cents
    if (Math.sign(here) !== Math.sign(gap.cents)) continue
    const feeCents = here - gap.cents
    const most = Math.min(
      FEE_MAX_CENTS,
      Math.round(Math.abs(row.cents) * FEE_SHARE),
    )
    if (feeCents < 0 || feeCents > most) continue
    if (
      best === null ||
      feeCents < best.feeCents ||
      (feeCents === best.feeCents &&
        Math.abs(row.at - gap.to) < Math.abs(best.row.at - gap.to))
    )
      best = { row, feeCents }
  }
  return best
}
