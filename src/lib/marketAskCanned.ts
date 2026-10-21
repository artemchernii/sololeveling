import type { AskAnswer } from './marketAsk'

/* What the test backend (E2E=1) answers a question with, so no test pays:
   one answer without the web, one with it. Keys from the canned market
   (convex/insightsMarket.ts) and the mock Broadcom position. */

export const CANNED_ASK: Record<'plain' | 'web', AskAnswer> = {
  plain: {
    kind: 'allocation',
    answer:
      'Almost all of the money sits in **one US chip company**, so one bad month for chips moves most of it. The tech sector itself rose **faster than the market** this month.',
    factKeys: ['mine', 'sec-tech'],
    sources: [],
  },
  web: {
    kind: 'rates',
    answer:
      'This week the Fed said inflation is **moving the right way** and did not rule out a cut. Markets read it as **a likely cut** this month.',
    factKeys: ['us-cpi'],
    sources: [
      {
        site: 'reuters.com',
        title: 'Fed keeps cut on the table',
        url: 'https://www.reuters.com/markets/fed',
        day: '2026-10-16',
      },
      {
        site: 'federalreserve.gov',
        title: 'Speech',
        url: 'https://www.federalreserve.gov/newsevents/speech.htm',
        day: '2026-10-16',
      },
    ],
  },
}
