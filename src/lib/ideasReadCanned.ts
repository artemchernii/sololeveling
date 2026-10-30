import { heldOf } from './ideasRead'
import type { Fact } from './marketRead'

/* The test backend's board read (E2E=1): built from the facts it is given
   so its parts add up to the mock account's idle cash and ADD TO MINE
   names the mock holdings. NEW carries ZZZZ, which the canned market does
   not know, so its line is dropped on screen. */

export function cannedIdeas(facts: Array<Fact>, idle: number) {
  const total = Math.round(idle)
  const held = [...heldOf(facts)]
  const a = held.includes('AVGO') ? 'AVGO' : (held[0] ?? 'AVGO')
  const b = held.find((t) => t !== a) ?? a
  const keep = Math.round(total * 0.25)
  const protect = Math.round(total * 0.35)
  const add = Math.round(total * 0.2)
  const fresh = total - keep - protect - add
  const half = Math.round(add / 2)
  const xeon = Math.round(protect * 0.6)
  const jnj = Math.round(fresh * 0.6)
  return {
    take: '**Too much cash for the long run.** Keep six months of spending, protect part, add to what you hold after the drops and open two places MINE misses.',
    parts: { keep, protect, add, new: fresh },
    lines: [
      {
        part: 'add',
        ticker: a,
        name: 'Broadcom',
        call: 'add',
        eur: half,
        why: 'Fell on its results because it will spend more, not because it sells less.',
        eurWhy: 'Two parts: half now, half in a month.',
        numbers: [
          { key: `tk-${a}`, text: '', url: '' },
          {
            key: '',
            text: 'AI sales ▲ 60% on a year',
            url: 'https://example.com/avgo',
          },
        ],
      },
      {
        part: 'add',
        ticker: b,
        name: b,
        call: 'wait',
        eur: add - half,
        why: 'Ran fast this month; a better price usually comes back within weeks.',
        eurWhy: 'Asked again after a pullback under RSI 60.',
        numbers: [{ key: `tk-${b}`, text: '', url: '' }],
      },
      {
        part: 'protect',
        ticker: 'XEON.DE',
        name: 'Euro overnight rate',
        call: 'add',
        eur: xeon,
        why: 'Broker cash earns close to nothing; XEON pays the ECB rate every day.',
        eurWhy: 'About half of PROTECT: money you may want within a year.',
        numbers: [],
      },
      {
        part: 'protect',
        ticker: 'IB01.L',
        name: 'US T-bills 0–1Y',
        call: 'add',
        eur: protect - xeon,
        why: 'Pays more than the euro rate, but in dollars.',
        eurWhy: 'Small, because of the dollar.',
        numbers: [],
      },
      {
        part: 'new',
        ticker: 'JNJ',
        name: 'Johnson & Johnson',
        area: 'health',
        call: 'add',
        eur: jnj,
        why: 'Health is thin in MINE against the world.',
        eurWhy: 'Brings health closer to the world.',
        numbers: [],
      },
      {
        part: 'new',
        ticker: 'ZZZZ',
        name: 'Unknown',
        call: 'add',
        eur: fresh - jnj,
        why: 'A ticker the market does not know.',
        eurWhy: 'Dropped on screen.',
        numbers: [],
      },
    ],
    sources: [
      {
        site: 'reuters.com',
        title: 'Broadcom results',
        url: 'https://www.reuters.com/x',
        day: '2026-10-28',
      },
    ],
  }
}
