import { payeeSite } from './payeeSites'
import { payeeWords } from './payee'

/* The group a new row gets from one he filed before, when the names are
   not letter for letter the same (12 Oct). A bank's own rows say "COMPRA
   2789 PINGO DOCE LISBOA" where the statement he filed said "Pingo Doce":
   the exact key (intake.ts merchantKey) never met, and rows from a
   connected bank arrived with no group. No reader is asked. What matches
   nothing stays with no group, to be filed once. */

export type Rule = { key: string; category: string; updatedAt: number }

/** `part` as whole words in a row, inside `all`, in order. */
function runIn(part: ReadonlyArray<string>, all: ReadonlyArray<string>) {
  for (let i = 0; i + part.length <= all.length; i++)
    if (part.every((w, k) => all[i + k] === w)) return i
  return -1
}

/**
 * The group of the rule that names the same payee, or null.
 *
 * - The same shop of the built-in list (src/lib/payeeSites.ts), when every
 *   rule of that shop says one group. Two shops are never one payee.
 * - Else a rule whose name is in the row's name as whole words: two words
 *   or more anywhere, one word (four letters or more) only at the start;
 *   or the row's two words or more are in the rule's name.
 *   The longest wins, then the newest.
 * A transfer to a person is not a shop and gets nothing.
 */
export function groupFor(
  merchant: string,
  rules: ReadonlyArray<Rule>,
): string | null {
  const words = payeeWords(merchant, 12)
  if (words.length === 0) return null
  if (/^\s*(transfer|transferencia|trf|to|from|sent)\b/i.test(merchant))
    return null
  const site = payeeSite(merchant)
  if (site !== null) {
    const groups = new Set(
      rules.filter((r) => payeeSite(r.key) === site).map((r) => r.category),
    )
    if (groups.size === 1) return [...groups][0]
    if (groups.size > 1) return null
  }
  let best: { rule: Rule; words: number } | null = null
  for (const rule of rules) {
    const theirs = payeeSite(rule.key)
    if (site !== null && theirs !== null && theirs !== site) continue
    const name = payeeWords(rule.key, 12)
    if (name.length === 0 || name.join('').length < 4) continue
    const at = runIn(name, words)
    /* The row may be the shorter of the two: the bank cut "EST SERVICO
       VEIGA" off a name he filed whole. */
    const inside = words.length >= 2 && runIn(words, name) >= 0
    if (!inside && (at < 0 || (name.length === 1 && at !== 0))) continue
    if (
      best === null ||
      name.length > best.words ||
      (name.length === best.words && rule.updatedAt > best.rule.updatedAt)
    )
      best = { rule, words: name.length }
  }
  return best?.rule.category ?? null
}
