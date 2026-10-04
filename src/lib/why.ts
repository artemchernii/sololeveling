import { categoryLabel } from './money'

/* Why a money row is where it is (4 Oct: "Does the system understand what
   goes where? For now its like a blackbox for me"). The rules the sums
   use, said in one plain line. convex/why.ts gathers the facts; this
   only words them, so it is tested here. */

export type WhyFacts = {
  kind: 'expense' | 'income' | 'move'
  category: string | null
  /** The bill it pays, and how that bill came to be. */
  bill: {
    name: string
    found: boolean
    varies: boolean
    salary: boolean
  } | null
  lent: boolean
  /** Who it is, as shown. */
  name: string
  /** He filed this payee's rows in this group himself. */
  hisRule: boolean
  /** A shop the app knows by name. */
  shop: string | null
}

export function whyLine(f: WhyFacts): string {
  if (f.kind === 'move') {
    return 'Between your own accounts — counted as neither spending nor money in.'
  }
  if (f.lent) {
    return f.kind === 'expense'
      ? 'Lent — you said so. Not spending; the money back is found by itself.'
      : `Paid back — money from ${f.name} after you lent. Not money in.`
  }
  if (f.bill) {
    if (f.bill.salary) return `Salary — ${f.bill.name}, every month.`
    const how = f.bill.found ? 'found in your statements' : 'you made it a bill'
    const match = f.bill.varies
      ? 'same payee, any amount — it varies'
      : 'same payee, about the same amount'
    return `Bill — pays ${f.bill.name} (${how}): ${match}.`
  }
  const kind = f.kind === 'income' ? 'income' : 'expense'
  if (f.category === null) {
    return f.kind === 'income'
      ? 'Money in — no group needed.'
      : 'Not filed — nothing known about it yet. Tap its group to file it.'
  }
  const group = categoryLabel(kind, f.category)
  if (f.hisRule) {
    return `${group} — you filed ${f.name} there; the next ones go there too.`
  }
  if (f.shop) return `${group} — ${f.shop} is a shop the app knows.`
  return `${group} — the statement reader's guess. Tap the group to change it.`
}
