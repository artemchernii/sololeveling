import type { MarketRead } from './marketRead'

/* What the test backend (E2E=1) answers instead of the model, so no test
   pays. Keys from the canned market in convex/insightsMarket.ts (the Fed
   is not reached there) and the mock Broadcom position. `broken` names a
   key that was never given: that line is refused and the read stands on
   the other three. ZZZZ is a ticker no market answers — its card is
   dropped. */

const calm: MarketRead = {
  mood: 'calm',
  lead: 'Rates falling',
  rest: 'shares up',
  summary:
    'Inflation cooled in the US and Europe, so a **Fed cut** is expected this month. Shares rose, led by **chips**.',
  kpis: ['mkt-sp500', 'us-cpi', 'sec-tech', 'mine'],
  lines: [
    {
      kind: 'inflation',
      tone: 'good',
      badge: '▼ CPI',
      title: 'Inflation is cooling',
      line: 'Both sides of the Atlantic; the ECB is close to its 2% aim.',
      factKeys: ['us-cpi', 'us-cpi-was', 'eu-hicp'],
      plain:
        'Prices in shops are rising **more slowly**. That lets central banks **lower interest rates**, which usually helps shares.',
    },
    {
      kind: 'rates',
      tone: 'calm',
      badge: 'ECB HOLD',
      title: 'ECB stays where it is',
      line: 'No change since September; the next meeting is this month.',
      factKeys: ['ecb', 'ecb-next'],
      plain:
        'Savings in euros keep **the same rate** for now. A cut would mean **less interest on cash**.',
    },
    {
      kind: 'market',
      tone: 'warn',
      badge: 'WATCH',
      title: 'Chips ran hot this month',
      line: 'Tech led every sector; Nvidia and Broadcom led tech.',
      factKeys: ['sec-tech', 'co-NVDA', 'co-AVGO'],
      plain:
        'A fast rise often **pauses or dips** afterwards. Not a sell signal — a reason **not to chase it**.',
    },
    {
      kind: 'dont',
      tone: 'bad',
      badge: "DON'T",
      title: 'No more chips this month',
      line: 'Broadcom already carries the most weight.',
      factKeys: ['pos-AVGO', 'mine'],
      plain:
        'Adding more would make the portfolio **depend even more on one theme**. Nothing needs selling.',
    },
  ],
  opinion:
    '**One company** carries the portfolio. The next euros in **health** or **Europe** would spread it.',
  ideas: [
    {
      ticker: 'NOVO-B.CO',
      name: 'Novo Nordisk',
      why: 'Obesity drugs after a long fall',
      bull: 'Huge demand for weight-loss drugs.',
      bear: 'Lilly is winning share.',
      wrong: 'Sales fall two quarters in a row.',
    },
    {
      ticker: 'WSML.L',
      name: 'iShares World Small Cap',
      why: 'Small companies when rates fall',
      bull: 'Small companies gain most from cuts.',
      bear: 'Swings more than big-company funds.',
      wrong: 'Rates go back up.',
    },
    {
      ticker: 'ZZZZ',
      name: 'Nothing',
      why: 'A ticker no market knows',
      bull: '-',
      bear: '-',
      wrong: '-',
    },
  ],
  sources: [
    {
      site: 'reuters.com',
      title: 'Fed seen cutting',
      url: 'https://www.reuters.com/markets/',
      day: '2026-10-16',
    },
    {
      site: 'bls.gov',
      title: 'CPI September',
      url: 'https://www.bls.gov/cpi/',
      day: '2026-10-15',
    },
  ],
}

const mixed: MarketRead = {
  mood: 'mixed',
  lead: 'Mixed',
  rest: 'no clear trend',
  summary:
    'US inflation came in **higher than hoped** while Europe cooled. Markets **swung both ways**.',
  kpis: ['mkt-sp500', 'mkt-btc', 'mine'],
  lines: [
    {
      kind: 'inflation',
      tone: 'bad',
      badge: '▲ CPI',
      title: 'US inflation still sticky',
      line: 'Down a little, still above the Fed aim.',
      factKeys: ['us-cpi', 'us-cpi-was'],
      plain: 'Prices in the US still rise **faster than 2%**.',
    },
    {
      kind: 'nodata',
      tone: 'calm',
      badge: 'NO DATA',
      title: 'No Fed numbers',
      line: 'The Fed rate was not reached this month.',
      factKeys: [],
      plain: 'Nothing to say about US rates — **rather than guess**.',
    },
    {
      kind: 'market',
      tone: 'warn',
      badge: 'WATCH',
      title: 'Bitcoin fell',
      line: 'Coins down while shares rose.',
      factKeys: ['mkt-btc', 'mkt-sp500'],
      plain: 'Coins and shares **do not move together**.',
    },
  ],
  opinion: '',
  ideas: [],
  sources: [],
}

const broken: MarketRead = {
  ...calm,
  lines: [
    ...calm.lines.slice(0, 3),
    {
      kind: 'market',
      tone: 'good',
      badge: 'MADE UP',
      title: 'A number from nowhere',
      line: 'Names a key never given.',
      factKeys: ['mkt-moon'],
      plain: '-',
    },
  ],
}

export const CANNED_MARKET_READS = { calm, mixed, broken }
export type CannedShape = keyof typeof CANNED_MARKET_READS | 'fail'
