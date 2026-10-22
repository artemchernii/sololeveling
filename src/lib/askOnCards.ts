import type { AllocId } from './insightsMine'
import type { Call } from './indicators'

/* ✦ ASK on cards (22 Oct, spec docs/specs/2026-10-21-ask-on-cards.md;
   mockup design/treasury-mockup/ask-on-cards.html, his "go"). A ✦ on a
   card puts a question in ASK's box, built here from the card's own words
   and numbers — no model call, and never sent by itself. */

const CALL_WORD: Record<Call, string> = {
  add: 'ADD',
  hold: 'HOLD',
  wait: 'WAIT',
}

/** A read line: its title, asked why. */
export const askLine = (title: string) =>
  `${title.trim().replace(/[.!?]+$/, '')} — why?`

/** A position's box: its call; else its move over the period. */
export function askBox(p: {
  name: string
  call: Call | null
  frozen: boolean
  /** The move as the box prints it, `+7.4%`. */
  move: string | null
  period: string
}) {
  if (p.frozen) return `Why is ${p.name} FROZEN?`
  if (p.call) return `Why is ${p.name} ${CALL_WORD[p.call]}?`
  if (p.move) return `What moved ${p.name} ${p.move} in ${p.period}?`
  return `What about ${p.name}?`
}

const ALLOC_WORD: Record<AllocId, string> = {
  tech: 'tech',
  us: 'US',
  europe: 'Europe',
  world: 'world funds',
  health: 'health',
  gold: 'gold',
}
const pct = (n: number) => `${Math.round(n)}%`

/** An allocation line: mine, and the world's beside it where it has one. */
export function askAlloc(
  id: AllocId,
  mine: number | null,
  world: number | null,
) {
  const w = ALLOC_WORD[id]
  if (mine === null) return `Why is ${w} MISSING?`
  return world === null
    ? `Why is ${w} ${pct(mine)}?`
    : `Why is ${w} ${pct(mine)}, world ${pct(world)}?`
}

/** An idea not owned: its bear case, asked out loud. */
export const askIdea = (ticker: string) => `What could go wrong with ${ticker}?`
