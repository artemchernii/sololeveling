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
      title: 'Prices are rising more slowly',
      line: 'Cash in Portugal follows the ECB, which is close to its 2% aim.',
      factKeys: ['me-prices', 'me-ecb', 'us-cpi'],
      plain: '',
      idea: 'XEON.DE',
    },
    {
      kind: 'rates',
      tone: 'calm',
      badge: 'ECB HOLD',
      title: 'The ECB kept its rate',
      line: 'Savings in euros keep the same rate until the next meeting.',
      factKeys: ['ecb', 'ecb-next', 'me-ecb'],
      plain: '',
      idea: '',
    },
    {
      kind: 'market',
      tone: 'warn',
      badge: 'WATCH',
      title: 'Chips rose fastest this month',
      line: 'A fast rise often pauses, so there is no reason to chase it.',
      factKeys: ['sec-tech', 'co-NVDA', 'co-AVGO'],
      plain: '',
      idea: '',
    },
    {
      kind: 'dont',
      tone: 'bad',
      badge: "DON'T",
      title: 'Do not add more chips this month',
      line: 'Broadcom already carries the most weight.',
      factKeys: ['pos-AVGO', 'mine'],
      plain: '',
      idea: '',
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
  weekHead: 'Rates held, chips rose, Brazil votes',
  weekTake:
    'The ECB kept its rate and Broadcom reported more than expected. Brazil votes on Sunday, and nothing is held there.',
  week: [
    {
      kind: 'rates',
      title: 'The ECB kept its rate at 2.00%',
      line: 'No rise and no cut. It meets again at the end of the month.',
      factKeys: ['ecb', 'ecb-next', 'mkt-us10y'],
      move: { ticker: 'XEON.DE' },
      why: 'The ECB rate is what euro cash earns. When it stays, cash keeps earning the same; when it falls, cash earns less and shares often rise.',
    },
    {
      kind: 'earn',
      title: 'Broadcom earned more than expected',
      line: 'Chip makers rose after the results.',
      factKeys: ['res-AVGO', 'co-AVGO', 'sec-tech'],
      move: { ticker: 'AVGO' },
    },
    {
      kind: 'eu',
      title: 'European shares fell a little',
      line: 'Prices in the euro area rose 2.1% in a year.',
      factKeys: ['eu-hicp', 'mkt-stoxx', 'mkt-eurusd'],
      move: null,
    },
    {
      kind: 'gold',
      title: 'Gold rose again this month',
      line: 'It rose as US bond rates fell.',
      factKeys: ['mkt-gold', 'mkt-us10y', 'mkt-eurusd'],
      move: null,
    },
    {
      kind: 'em',
      title: 'Brazil votes for president on Sunday',
      line: 'Brazilian shares fell this month.',
      factKeys: ['reg-brazil', 'reg-emerging', 'reg-china'],
      move: { ticker: 'ZZZZ' },
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
      idea: '',
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

/* A quiet week: two stories, no move on either. */
const quiet: MarketRead = {
  ...mixed,
  weekHead: 'A quiet week',
  weekTake: 'No rate decisions and no big results. Shares moved little.',
  week: [
    {
      kind: 'rates',
      title: 'No rate decisions this week',
      line: 'The ECB meets at the end of the month.',
      factKeys: ['ecb', 'ecb-next', 'us-cpi'],
      move: null,
    },
    {
      kind: 'mkt',
      title: 'Shares moved little this week',
      line: 'No big company reported.',
      factKeys: ['mkt-sp500', 'mkt-stoxx', 'mkt-gold'],
      move: null,
    },
  ],
}

export const CANNED_MARKET_READS = { calm, mixed, broken, quiet }
export type CannedShape = keyof typeof CANNED_MARKET_READS | 'fail'
