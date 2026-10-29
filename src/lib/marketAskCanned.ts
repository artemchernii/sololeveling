import type { AskAnswer } from './marketAsk'

/* What the test backend (E2E=1) answers a question with, so no test pays:
   one answer without the web, one with it, and one naming ideas — JNJ
   and EXV1.DE answered by the canned quotes, NOVO-B.CO which the canned
   read's NEXT already shows, ZZZZ which no market knows. Keys from the canned market
   (convex/insightsMarket.ts) and the mock Broadcom position. */

export const CANNED_ASK: Record<'plain' | 'web' | 'ideas' | 'line', AskAnswer> =
  {
    plain: {
      kind: 'allocation',
      answer:
        'Almost all of the money sits in **one US chip company**, so one bad month for chips moves most of it. The tech sector itself rose **faster than the market** this month.',
      factKeys: ['mine', 'sec-tech'],
      sources: [],
      ideas: [],
      charts: [],
      tables: [],
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
      ideas: [],
      charts: [],
      tables: [],
    },
    ideas: {
      kind: 'ideas',
      answer:
        "Two more **outside tech**, so the next euros would not add to the chip weight: **health** and **Europe's banks**.",
      factKeys: ['sec-tech'],
      sources: [],
      ideas: [
        {
          ticker: 'JNJ',
          name: 'Johnson & Johnson',
          why: 'Medicines and devices, steady dividend',
          bull: 'Health spending grows in good and bad years',
          bear: 'Lawsuits over old products',
          wrong: 'Two drug launches miss',
        },
        {
          ticker: 'EXV1.DE',
          name: 'iShares STOXX Europe 600 Banks',
          why: "Europe's banks, outside tech",
          bull: 'Banks earn more while rates stay up',
          bear: 'A cut by the ECB squeezes them',
          wrong: 'Euro rates fall fast',
        },
        {
          ticker: 'ZZZZ',
          name: 'Nowhere Inc',
          why: 'A ticker no market knows',
          bull: 'x',
          bear: 'x',
          wrong: 'x',
        },
        {
          ticker: 'NOVO-B.CO',
          name: 'Novo Nordisk',
          why: 'Already in NEXT',
          bull: 'x',
          bear: 'x',
          wrong: 'x',
        },
      ],
      charts: [],
      tables: [],
    },
    /* IDEAS (29 Oct): a question from a line's ✦ — words, a chart the app
     draws from canned closes and a small table. */
    line: {
      kind: 'ideas',
      answer:
        '**The drop is about spending, not demand.** Sales still grew; the market punished the plan to spend more next year. Add in two parts, a month apart.',
      factKeys: [],
      sources: [
        {
          site: 'reuters.com',
          title: 'Results',
          url: 'https://www.reuters.com/markets/results',
          day: '2026-10-28',
        },
      ],
      ideas: [],
      charts: [{ tickers: ['AVGO', 'NVDA'], range: '6mo' }],
      tables: [
        {
          head: ['', 'AVGO', 'NVDA'],
          rows: [
            ['P/E NEXT', '21', '29'],
            ['OF MINE', '24%', '9%'],
          ],
        },
      ],
    },
  }
