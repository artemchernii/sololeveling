import { expect, test } from '@playwright/test'
import { anyApi } from 'convex/server'
import type { Page } from '@playwright/test'

import { start, testClient } from './helpers'

const shot = (name: string) => ({ path: `e2e/screens/${name}.png` })

/* Insights I1 (19 Oct, docs/specs/2026-10-19-insights.md; mockup
   design/treasury-mockup/insights.html): Finances' fourth room and its
   first band, THE MARKET — rates, eight markets, the S&P 500 heatmap and
   the regions, fetched on open and never saved. The test backend answers
   with a canned market (convex/insightsMarket.ts), a moment late; it has
   no FRED_API_KEY, so the Fed card is the one not reached. A mock
   Broadcom is held, so AVGO carries the white dot. */

async function open(page: Page) {
  await start(page)
  await testClient().mutation(anyApi.e2eFundamentals.share, {
    shape: 'add',
    reading: { ageDays: 0.2 },
  })
  await page.goto('/finances?room=insights')
  const room = page.getByTestId('insights-room')
  await expect(room).toBeVisible()
  return room
}

const rate = (page: Page, id: string) =>
  page.locator(`[data-testid=rate-card][data-id="${id}"]`)
const market = (page: Page, id: string) =>
  page.locator(`[data-testid=market-card][data-id="${id}"]`)

test('S1 open: six rates, the trend, sectors as rows, each with its source and time', async ({
  page,
}) => {
  const room = await open(page)
  /* Asked on open: the cards wait for the answer, then fill. */
  await expect(
    room.getByText('READING', { exact: false }).first(),
  ).toBeVisible()
  await expect(page.getByTestId('rate-card')).toHaveCount(6)
  await expect(rate(page, 'us-cpi')).toContainText('2.9%', { timeout: 15_000 })
  await expect(rate(page, 'us-cpi')).toContainText('AUG 3.1%')
  await expect(rate(page, 'us-cpi')).toContainText('BLS · SEP')
  await expect(rate(page, 'eu-hicp')).toContainText('2.1%')
  await expect(rate(page, 'eu-hicp')).toContainText('EUROSTAT · SEP')
  await expect(rate(page, 'ecb')).toContainText('2.00%')
  await expect(rate(page, 'ecb')).toContainText('SINCE 11 SEP')
  for (const id of ['us-cpi', 'eu-hicp', 'ecb'])
    await expect(rate(page, id)).toContainText('NOT SAVED')

  /* The world in four groups, each mark a flag or a drawn icon (31 Oct). */
  await expect(page.getByTestId('market-card')).toHaveCount(13)
  await expect(page.getByTestId('market-group')).toHaveText([
    'STOCKS',
    'BONDS',
    'METALS',
    'MONEY',
  ])
  await expect(market(page, 'stoxx').locator('[data-flag=EU] img')).toHaveCount(
    1,
  )
  await expect(
    market(page, 'eurusd').locator('[data-flag=EU-US] img'),
  ).toHaveCount(2)
  await expect(market(page, 'silver')).toContainText('46.20')
  await expect(market(page, 'bvsp')).toContainText('BOVESPA')
  await expect(market(page, 'sp500')).toContainText('S&P 500')
  await expect(market(page, 'sp500')).toContainText('6,612')
  /* Opens on the day (30 Oct, "it should be day"). */
  await expect(market(page, 'sp500')).toContainText('▲ 0.3%')
  await expect(market(page, 'sp500')).toContainText('→ 6,612')
  await expect(market(page, 'us10y')).toContainText('PTS')
  await expect(page.getByTestId('markets-foot')).toContainText(
    /YAHOO FINANCE · FETCHED \d\d:\d\d · NOT SAVED/,
  )

  await expect(page.getByTestId('stock')).toHaveCount(30)
  await expect(
    page.locator('[data-testid=stock][data-symbol=AVGO]'),
  ).toHaveAttribute('data-held', 'true')
  await expect(
    page.locator('[data-testid=stock][data-symbol=AAPL]'),
  ).toHaveAttribute('data-held', 'false')
  await expect(page.getByTestId('sector')).toHaveCount(8)
  await expect(page.getByTestId('region')).toHaveCount(6)
  /* YOUR COMPANIES: the held company with its results, analysts, insider. */
  const co = page.getByTestId('company-row').first()
  await expect(co).toContainText('$2.31 a share')
  await expect(co).toContainText('$2.10 expected')
  await expect(co).toContainText('Buy 48 · Hold 9')
  await expect(co).toContainText('Sold $4.2M')
  /* BIG FUNDS: the fund that moved most, both quarters' shares under it. */
  await expect(co).toContainText('Berkshire +8% shares')
  await expect(co).toContainText('Q1 17.8M · Q2 19.2M · 13F')
  await expect(page.getByTestId('funds-none')).toHaveCount(0)
  await expect(page.getByTestId('cell-missed')).toHaveCount(0)
  /* ON REDDIT: five rows, today over yesterday, HELD on a held one. */
  await expect(page.getByTestId('crowd-row')).toHaveCount(5)
  await expect(page.getByTestId('crowd-row').first()).toContainText(
    '1,240× today',
  )
  await expect(page.getByTestId('crowd-row').first()).toContainText(
    '410× yesterday',
  )
  await expect(page.getByTestId('crowd-row').nth(2)).toContainText('HELD')
  /* No emoji anywhere on the tab (29 Oct: "Emojies again"). */
  expect(await page.getByTestId('tab-market').innerText()).not.toMatch(
    /\p{Extended_Pictographic}/u,
  )
  await page.waitForTimeout(1200)
  await page.screenshot(shot('insights-market'))
  await page.screenshot({ ...shot('insights-market-full'), fullPage: true })
})

test('S2 each period changes the numbers and the vs line', async ({ page }) => {
  await open(page)
  const sp = market(page, 'sp500')
  await expect(sp).toContainText('▲ 0.3%', { timeout: 15_000 })
  const since = page.getByTestId('markets-since')
  await expect(since).toContainText('VS PREVIOUS CLOSE')
  const seen: Array<string> = [(await since.textContent()) ?? '']

  for (const [p, change] of [
    ['1W', '▲ 1.0%'],
    ['3M', '▲ 6.0%'],
    ['1M', '▲ 2.4%'],
    ['1Y', '▲ 9.6%'],
  ] as const) {
    await page.getByRole('button', { name: p, exact: true }).first().click()
    await expect(
      page.getByRole('button', { name: p, exact: true }).first(),
    ).toHaveAttribute('aria-pressed', 'true')
    await expect(sp).toContainText(change, { timeout: 15_000 })
    await expect(page.getByTestId('heat-period')).toHaveText(p)
    const line = (await since.textContent()) ?? ''
    expect(seen).not.toContain(line)
    seen.push(line)
  }
  await expect(since).toContainText(/2025 CLOSE/)
  /* A period seen once is kept: back to 1D is at once, no reading. */
  await page.getByRole('button', { name: '1D', exact: true }).first().click()
  await expect(sp).toContainText('▲ 0.3%')
  await expect(page.getByTestId('insights-room')).not.toContainText('READING')
  await page.screenshot(shot('insights-periods'))
})

test('S3 a source not reached: that card says so, the rest stand', async ({
  page,
}) => {
  await open(page)
  const fed = rate(page, 'fed')
  await expect(fed).toHaveAttribute('data-reached', 'false', {
    timeout: 15_000,
  })
  await expect(fed).toContainText('NOT REACHED')
  await expect(fed).toContainText('FRED')
  await expect(rate(page, 'ecb')).toHaveAttribute('data-reached', 'true')
  await expect(rate(page, 'ecb')).not.toContainText('NOT REACHED')
  await expect(page.getByTestId('market-card')).toHaveCount(13)
  await fed.screenshot(shot('insights-not-reached'))
})

test('S4 ⓘ opens its card in plain words, and closes', async ({ page }) => {
  await open(page)
  await expect(rate(page, 'us-cpi')).toContainText('2.9%', { timeout: 15_000 })
  await page.getByRole('button', { name: 'About US INFLATION' }).click()
  const card = page.getByRole('dialog', { name: 'US INFLATION' })
  await expect(card).toBeVisible()
  await expect(card).toContainText('WHAT IT IS')
  await expect(card).toContainText('WHY IT MOVES THE MONEY')
  await expect(card).toContainText('SEP 2.9% · AUG 3.1%')
  /* It pops in: the picture once it has landed. */
  await expect(card).toHaveCSS('opacity', '1')
  await page.screenshot(shot('insights-info'))
  await page.keyboard.press('Escape')
  await expect(card).toBeHidden()

  await page.getByRole('button', { name: 'About SECTORS' }).click()
  await expect(page.getByRole('dialog', { name: 'SECTORS' })).toContainText(
    'framed',
  )
  await page.mouse.click(5, 5)
  await expect(page.getByRole('dialog')).toBeHidden()
})

test('S5 phone width: no sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await open(page)
  await expect(market(page, 'sp500')).toContainText('▲ 0.3%', {
    timeout: 15_000,
  })
  const over = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  )
  expect(over).toBeLessThanOrEqual(0)
  await page.screenshot({ ...shot('insights-phone'), fullPage: true })
})

test('S6 tabs: MARKET with no read, one band at a time, the last tab kept on reload', async ({
  page,
}) => {
  await open(page)
  const tab = (id: string) => page.locator(`[data-tab="${id}"]`)
  await expect(page.getByTestId('insights-tab')).toHaveCount(5)
  await expect(tab('market')).toHaveAttribute('aria-pressed', 'true')
  /* The S&P 500's change over the period, as its card says it. */
  await expect(tab('market').getByTestId('tab-badge')).toHaveText(
    'S&P TODAY ▲ 0.3%',
    { timeout: 15_000 },
  )
  await expect(page.getByTestId('tab-market')).toBeVisible()
  await expect(page.getByTestId('tab-mine')).toHaveCount(0)

  await tab('mine').click()
  await expect(tab('mine')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('tab-mine')).toBeVisible()
  await expect(page.getByTestId('tab-market')).toHaveCount(0)
  await expect(page.getByTestId('rate-card')).toHaveCount(0)

  await page.reload()
  await expect(tab('mine')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('tab-mine')).toBeVisible()

  /* The bar stays on top while the band scrolls. */
  await page.mouse.wheel(0, 2000)
  await expect
    .poll(
      async () => (await page.getByTestId('insights-tabs').boundingBox())?.y,
    )
    .toBeLessThan(80)
  await expect(page.getByTestId('insights-tabs')).toBeInViewport()
  await page.screenshot(shot('insights-tabs'))
})

/* THE WEEK on MARKET (30 Oct, docs/specs/2026-10-30-market.md; mockup
   market-story.html). Four mock positions (e2eMine): Broadcom and NVIDIA
   reported in YOUR COMPANIES' canned answer, nothing in Brazil. The read
   is canned: calm is a busy week of five stories, quiet a week of two. */

async function openHeld(page: Page) {
  await start(page)
  await testClient().mutation(anyApi.e2eMine.positions, {})
  await page.goto('/finances?room=insights')
  await expect(page.getByTestId('read-hero')).toHaveAttribute(
    'data-state',
    'idle',
  )
}
async function readWeek(page: Page) {
  const button = page.getByTestId('read-market')
  await expect(button).toBeEnabled({ timeout: 15_000 })
  await button.click()
  await expect(page.getByTestId('read-hero')).toHaveAttribute(
    'data-state',
    'done',
    { timeout: 15_000 },
  )
  await page.locator('[data-tab="market"]').click()
}
const story = (page: Page, kind: string) =>
  page.locator(`[data-testid=week-story][data-kind="${kind}"]`)

test('WEEK S4 not read yet: facts only, no move, ✦ READ MARKET', async ({
  page,
}) => {
  await openHeld(page)
  await expect(page.getByTestId('week-headline')).toHaveText('Not read yet')
  await expect(page.getByTestId('week-count')).toContainText('FACTS ONLY')
  await expect(story(page, 'rates')).toContainText('ECB 2.00%', {
    timeout: 15_000,
  })
  await expect(story(page, 'earn')).toContainText('2 companies held reported')
  /* The week's falls of 8% or more anywhere (MOVERS), one story of rows,
     the held one badged (31 Oct: "why not in one crash different stocks?"). */
  const crash = story(page, 'crash')
  await expect(crash).toContainText('4 big names fell 8% or more', {
    timeout: 15_000,
  })
  await expect(crash.getByTestId('week-row')).toHaveCount(4)
  await expect(crash.getByTestId('week-row').first()).toHaveAttribute(
    'data-symbol',
    'RDDT',
  )
  await expect(crash.getByTestId('week-row').first()).toContainText('▼ 24.1%')
  await expect(crash.getByTestId('week-row').first()).toContainText(
    '$100.00 → $75.90',
  )
  await expect(crash.getByTestId('week-box')).toHaveCount(0)
  await crash.screenshot(shot('week-crash'))
  /* The month's biggest mover among gold, Stoxx 600, Bitcoin, EUR/USD. */
  await expect(page.getByTestId('week-story').nth(3)).toContainText(
    'BITCOIN ▼ 4.1% in a month',
  )
  await expect(page.getByTestId('week-move')).toHaveCount(0)
  await expect(page.getByTestId('week-none')).toHaveCount(0)
  await expect(page.getByTestId('read-market')).toContainText('READ MARKET')
  await page.screenshot({ ...shot('week-facts'), fullPage: true })
})

test('WEEK S1 busy week: the headline, five stories with boxes, YOUR MONEY, a move or No action', async ({
  page,
}) => {
  await openHeld(page)
  await readWeek(page)
  await expect(page.getByTestId('week-headline')).toHaveText(
    'Rates held, chips rose, Brazil votes',
  )
  await expect(page.getByTestId('week-count')).toContainText('5 STORIES')
  await expect(
    page.locator('[data-tab="market"] [data-testid=tab-badge]'),
  ).toHaveText('5 STORIES')
  const all = page.getByTestId('week-story')
  await expect(all).toHaveCount(5)
  for (let i = 0; i < 5; i++) {
    const s = all.nth(i)
    await expect(s.locator('.rm-kind')).not.toBeEmpty()
    await expect(s.getByTestId('week-box')).toHaveCount(3)
    await expect(s.getByTestId('week-money')).toBeVisible()
    await expect(
      s.locator('[data-testid=week-move], [data-testid=week-none]'),
    ).toHaveCount(1)
  }
  /* Why it matters: behind the story's ⓘ, in sentences (31 Oct). */
  await story(page, 'rates')
    .getByRole('button', { name: 'About The ECB kept its rate at 2.00%' })
    .click()
  await expect(
    page.getByRole('dialog', { name: 'The ECB kept its rate at 2.00%' }),
  ).toContainText('what euro cash earns')
  await page.keyboard.press('Escape')
  /* Kinds in words with line icons; no emoji on the tab. */
  await expect(story(page, 'earn')).toContainText('EARNINGS')
  await expect(story(page, 'em')).toContainText('EMERGING MARKETS')
  expect(await page.getByTestId('tab-market').innerText()).not.toMatch(
    /\p{Extended_Pictographic}/u,
  )
  await page.waitForTimeout(800)
  await page.screenshot({ ...shot('week-busy'), fullPage: true })
})

test('WEEK S2 earnings: the held companies that reported, and the move opens IDEAS lit', async ({
  page,
}) => {
  await openHeld(page)
  /* The plan first: a story's move must be a line on the board. */
  await page.locator('[data-tab="ideas"]').click()
  const again = page.getByTestId('idb-read')
  await expect(again).toBeEnabled({ timeout: 15_000 })
  await again.click()
  await expect(again).toHaveAttribute('data-state', 'done', {
    timeout: 20_000,
  })
  await readWeek(page)

  const earn = story(page, 'earn')
  const money = earn.getByTestId('week-money')
  await expect(money.getByTestId('week-chip')).toHaveCount(2)
  await expect(money.getByTestId('week-chip').first()).toContainText('Broadcom')
  await expect(money).toContainText(/€[\d,]+ in companies that reported/)
  await expect(earn.getByTestId('week-box').first()).toContainText('$2.31')
  await expect(earn.getByTestId('week-box').first()).toContainText(
    'A SHARE · $2.10 EXPECTED',
  )
  const move = earn.getByTestId('week-move')
  await expect(move).toHaveText('→Open Broadcom in Ideas')
  await earn.screenshot(shot('week-earn'))

  await move.click()
  await expect(page.locator('[data-tab="ideas"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  const line = page.locator('[data-testid=idb-line][data-ticker="AVGO"]')
  await expect(line).toHaveClass(/\bon\b/)
  await expect(line).toBeInViewport()
})

test('WEEK S3 nothing held: the Brazil story is a grey row and No action', async ({
  page,
}) => {
  await openHeld(page)
  await readWeek(page)
  const br = story(page, 'em')
  const money = br.getByTestId('week-money')
  await expect(money).toHaveAttribute('data-zero', 'true')
  await expect(money).toContainText(
    'nothing in Brazil · 0% in emerging markets',
  )
  await expect(money.getByTestId('week-chip')).toHaveCount(0)
  /* Its move names ZZZZ, not on the board. */
  await expect(br.getByTestId('week-none')).toHaveText('No action')
  await expect(br.getByTestId('week-move')).toHaveCount(0)
})

test('WEEK S5 quiet week: two stories, each No action, badge 2 STORIES', async ({
  page,
}) => {
  await openHeld(page)
  await testClient().mutation(anyApi.e2eMarketRead.arm, { shape: 'quiet' })
  await readWeek(page)
  await expect(page.getByTestId('week-headline')).toHaveText('A quiet week')
  await expect(page.getByTestId('week-story')).toHaveCount(2)
  await expect(page.getByTestId('week-none')).toHaveCount(2)
  await expect(page.getByTestId('week-move')).toHaveCount(0)
  await expect(
    page.locator('[data-tab="market"] [data-testid=tab-badge]'),
  ).toHaveText('2 STORIES')
  await page.screenshot({ ...shot('week-quiet'), fullPage: true })
})

test('S7 MOVERS: the week up and down with both closes and a headline; a region not reached says so', async ({
  page,
}) => {
  await open(page)
  const tile = page.locator('[data-tile=movers]')
  await expect(tile.getByTestId('movers-none')).toHaveText('READING')
  const mover = (s: string) =>
    tile.locator(`[data-testid=mover][data-symbol="${s}"]`)
  await expect(tile.locator('[data-side=up]')).toHaveCount(5, {
    timeout: 15_000,
  })
  await expect(tile.locator('[data-side=down]')).toHaveCount(5)
  await expect(tile.locator('[data-side=down]').first()).toHaveAttribute(
    'data-symbol',
    'RDDT',
  )
  await expect(mover('RDDT')).toContainText('▼ 24.1%')
  await expect(mover('RDDT')).toContainText('$100.00 → $75.90')
  await expect(mover('RDDT')).toContainText('Reddit daily users miss estimates')
  await expect(mover('RDDT')).toContainText('REUTERS')
  /* A mover with no headline is the row without its line. */
  await expect(mover('AAPL').locator('.why')).toHaveCount(0)
  await expect(tile.getByTestId('movers-foot')).toContainText(
    /YAHOO FINANCE · FETCHED \d\d:\d\d · NOT SAVED/,
  )
  await tile.screenshot(shot('insights-movers'))

  await tile.getByRole('tab', { name: 'ASIA' }).click()
  await expect(tile.getByTestId('movers-none')).toHaveText('✕ NOT REACHED', {
    timeout: 15_000,
  })
  /* Back to US: kept in page memory, no READING. */
  await tile.getByRole('tab', { name: 'US' }).click()
  await expect(tile.locator('[data-side=up]')).toHaveCount(5)
})

test('S8 OPPORTUNITIES: the two lists by region, bonds and metals, each number beside its place', async ({
  page,
}) => {
  await open(page)
  const tile = page.locator('[data-tile=opportunities]')
  const opp = (s: string) =>
    tile.locator(`[data-testid=opp][data-symbol="${s}"]`)
  await expect(tile.getByTestId('opps-reading')).toBeVisible()
  /* ALL: US and EUROPE together, furthest down first; ASIA not reached. */
  await expect(tile.getByTestId('opp')).toHaveCount(3, { timeout: 15_000 })
  await expect(tile.getByTestId('opp').first()).toHaveAttribute(
    'data-symbol',
    'NOVO-B.CO',
  )
  await expect(opp('NOVO-B.CO')).toContainText('▼ 52.0%')
  await expect(opp('NOVO-B.CO')).toContainText('HIGH 712.00 DKK')
  await expect(opp('NOVO-B.CO')).toContainText('20 · 12')
  await expect(opp('NOVO-B.CO')).toContainText('BUY · HOLD')
  await expect(opp('AVGO')).toContainText('HELD')
  await expect(opp('ADBE')).not.toContainText('HELD')
  await expect(tile.getByTestId('opps-missing')).toHaveText(
    '✕ ASIA NOT REACHED',
  )
  await expect(tile.getByTestId('opps-foot')).toContainText(
    /YAHOO FINANCE · DAMODARAN 2026 · FETCHED \d\d:\d\d · NOT SAVED/,
  )
  await tile.screenshot(shot('insights-opps'))

  await tile.getByRole('tab', { name: 'US', exact: true }).click()
  await expect(tile.getByTestId('opp')).toHaveCount(2)
  await tile.getByRole('tab', { name: 'SOUTH AMERICA' }).click()
  await expect(tile.getByTestId('opps-none')).toHaveText('NONE')

  await tile.getByRole('tab', { name: 'CHEAP · TARGET ABOVE' }).click()
  await tile.getByRole('tab', { name: 'ALL' }).click()
  await expect(tile.getByTestId('opp')).toHaveCount(1)
  await expect(opp('PYPL')).toContainText('11 · 19')
  await expect(opp('PYPL')).toContainText('▲ 26.1%')

  await tile.getByRole('tab', { name: 'BONDS' }).click()
  await expect(tile.getByTestId('opp-region')).toHaveCount(0)
  await expect(opp('us10y')).toContainText('4.93%')
  await expect(opp('us10y')).toContainText('4.21%')
  await expect(opp('us10y')).toContainText('5.10%')
  await expect(opp('us2y').getByTestId('level-missing')).toBeVisible()
  await expect(opp('de10y')).toContainText('ECB')

  await tile.getByRole('tab', { name: 'GOLD · SILVER' }).click()
  await expect(opp('gold')).toContainText('▼ 6.0%')
  await expect(opp('gold')).toContainText('HIGH $4,148')
  await expect(opp('silver')).toContainText('NOT HELD')

  /* ✦ opens ASK with the row's question in the box, not sent. */
  await opp('gold').getByTestId('ask-on').click()
  await expect(page.getByRole('textbox').last()).toHaveValue(/Gold/)
})
