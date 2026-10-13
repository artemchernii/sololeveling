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

/* Reworded 13 Oct ("again here stupid LLM language"): facts in bank-app
   words — no "you", nothing "goes" anywhere, no advice. */
export function whyLine(f: WhyFacts): string {
  if (f.kind === 'move') {
    return 'Transfer between own accounts. Not spending, not income.'
  }
  if (f.lent) {
    return f.kind === 'expense'
      ? 'Lent. Not counted as spending.'
      : `Paid back by ${f.name}. Not counted as income.`
  }
  if (f.bill) {
    if (f.bill.salary) return `Salary from ${f.bill.name}, every month.`
    return [
      `Bill: ${f.bill.name}.`,
      f.bill.found ? 'Found in the statements.' : 'Added by hand.',
      ...(f.bill.varies ? ['The amount changes.'] : []),
    ].join(' ')
  }
  const kind = f.kind === 'income' ? 'income' : 'expense'
  if (f.category === null) {
    return f.kind === 'income' ? 'Income. No group needed.' : 'No group yet.'
  }
  const group = categoryLabel(kind, f.category)
  if (f.hisRule) return `${group}: set by hand for every ${f.name} payment.`
  if (f.shop) return `${group}: ${f.shop} is a known shop.`
  return `${group}: read from the statement.`
}
