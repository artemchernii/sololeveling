import { expect, test } from '@playwright/test'
import { anyApi } from 'convex/server'
import type { Page } from '@playwright/test'

import { start, testClient } from './helpers'
import { monthKey, nextMonthWord } from '../src/lib/marketRead'

const shot = (name: string) => ({ path: `e2e/screens/${name}.png` })

/* Insights I4 ASK (21 Oct, docs/specs/2026-10-19-insights.md; mockup
   design/treasury-mockup/ask.html round 2, his "go"). The test backend
   never calls out: the dev server has no Claude Code route under E2E_RUN,
   so a question goes to the API action, which answers with a canned
   answer (src/lib/marketAskCanned.ts) — or NOT REACHED when
   e2eMarketRead.arm says fail. A mock Broadcom is held. Since 21 Oct
   (insights-tabs.html) ASK lives in a drawer opened by the ✦ ASK pill. */

const SPEND = (usd: string) =>
  new RegExp(`^💳 [A-Z]{3} · \\$${usd} OF \\$2\\.00$`)

async function openDrawer(page: Page) {
  await page.getByTestId('ask-open').click()
  await expect(page.getByTestId('ask-drawer')).toHaveAttribute(
    'aria-hidden',
    'false',
  )
  await expect(page.getByTestId('ask-input')).toBeInViewport()
  /* Slid all the way in: its edge on the window's. */
  await expect
    .poll(async () => {
      const b = await page.getByTestId('ask-drawer').boundingBox()
      return b ? Math.round(b.x + b.width) : 0
    })
    .toBe(page.viewportSize()!.width)
}

async function open(page: Page) {
  await start(page)
  await testClient().mutation(anyApi.e2eFundamentals.share, {
    shape: 'add',
    reading: { ageDays: 0.2 },
  })
  await page.goto('/finances?room=insights')
  await expect(page.getByTestId('ask-open')).toBeVisible()
  await openDrawer(page)
  await expect(page.getByTestId('ask-pay')).toHaveText(SPEND('0.00'))
}

test('S1 a question → asking at once → an answer with its kind, facts, model and cost', async ({
  page,
}) => {
  await open(page)
  /* No question yet: four cards, no thread, no fold, no count on the pill. */
  await expect(page.getByTestId('ask-suggest')).toHaveCount(4)
  await expect(page.getByTestId('ask-thread')).toHaveCount(0)
  await expect(page.getByTestId('ask-suggested')).toHaveCount(0)
  await expect(page.getByTestId('ask-fab-count')).toHaveCount(0)
  await page.screenshot(shot('insights-ask-empty'))

  await page.getByTestId('ask-suggest').first().click()
  /* Pressed: the question shows at once, asking, and nothing more can be sent. */
  await expect(page.getByTestId('ask-q')).toContainText('Explain my allocation')
  await expect(page.getByTestId('ask-asking')).toContainText(
    'SEARCHING THE WEB',
  )
  await expect(page.getByTestId('ask-input')).toBeDisabled()

  const answer = page.getByTestId('ask-answer')
  await expect(answer).toBeVisible({ timeout: 15_000 })
  await expect(answer).toHaveAttribute('data-kind', 'allocation')
  await expect(answer).toContainText('ALLOCATION')
  await expect(answer).toContainText('one US chip company')
  await expect(answer.getByTestId('ask-fact')).toHaveCount(2)
  await expect(answer.getByTestId('ask-fact').first()).toContainText('MINE')
  await expect(page.getByTestId('ask-stamp')).toContainText('✦ SONNET 5.5')
  await expect(page.getByTestId('ask-stamp')).toContainText('28K IN · 420 OUT')
  await expect(page.getByTestId('ask-stamp')).toContainText('$0.08')
  await expect(page.getByTestId('ask-pay')).toHaveText(SPEND('0.08'))
  await expect(page.getByTestId('ask-fab-count')).toHaveText('1')
  await expect(page.getByTestId('ask-input')).toBeEnabled()
  /* The four fold into SUGGESTED; a press opens them. */
  const fold = page.getByTestId('ask-suggested')
  await expect(fold).toHaveAttribute('aria-expanded', 'false')
  await fold.click()
  await expect(fold).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByTestId('ask-suggest').last()).toBeInViewport()
  await page.screenshot(shot('insights-ask-answer'))
})

test('S2 a typed question searches the web → sources and searches', async ({
  page,
}) => {
  await open(page)
  await expect(page.getByTestId('ask-web')).toHaveCount(0)
  await page.getByTestId('ask-input').fill('What did Powell say this week?')
  await page.getByTestId('ask-input').press('Enter')
  await expect(page.getByTestId('ask-q')).toContainText('What did Powell')
  await expect(page.getByTestId('ask-asking')).toContainText(
    'SEARCHING THE WEB',
  )
  const answer = page.getByTestId('ask-answer')
  await expect(answer).toHaveAttribute('data-kind', 'rates', {
    timeout: 15_000,
  })
  await expect(page.getByTestId('ask-sources')).toContainText(
    'REUTERS · 16 OCT',
  )
  await expect(page.getByTestId('ask-stamp')).toContainText('2 SEARCHES')
  await expect(page.getByTestId('ask-stamp')).toContainText('$0.08')
  await page.screenshot(shot('insights-ask-web'))
})

test('S3 failed → NOT REACHED, nothing paid, ASK AGAIN answers', async ({
  page,
}) => {
  await open(page)
  await testClient().mutation(anyApi.e2eMarketRead.arm, { shape: 'fail' })
  await page.getByTestId('ask-suggest').nth(1).click()
  const failed = page.getByTestId('ask-failed')
  await expect(failed).toBeVisible({ timeout: 15_000 })
  await expect(failed).toContainText('✕ NOT REACHED')
  await expect(failed).toContainText('$0.00 · NOTHING PAID')
  await expect(failed).toContainText('NO RETRY')
  await expect(page.getByTestId('ask-q')).toContainText('✕ NOT ANSWERED')
  await expect(page.getByTestId('ask-pay')).toHaveText(SPEND('0.00'))
  await page.screenshot(shot('insights-ask-failed'))

  await testClient().mutation(anyApi.e2eMarketRead.arm, { shape: 'calm' })
  await page.getByTestId('ask-again').click()
  await expect(page.getByTestId('ask-answer')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('ask-failed')).toHaveCount(0)
  await expect(page.getByTestId('ask-q')).toHaveCount(1)
})

test('S4 cap reached → the box gives way to CAP REACHED', async ({ page }) => {
  await open(page)
  await testClient().mutation(anyApi.e2eMarketRead.spend, { usd: 2 })
  const cap = page.getByTestId('ask-cap')
  await expect(cap).toContainText('CAP REACHED')
  await expect(cap).toContainText('$2.00 OF $2.00')
  await expect(cap).toContainText(`NEXT ${nextMonthWord(monthKey(Date.now()))}`)
  await expect(page.getByTestId('ask-input')).toHaveCount(0)
  await expect(page.getByTestId('ask-suggest').first()).toBeDisabled()
  await page.screenshot(shot('insights-ask-cap'))
})

test('S5 ✕, Esc and a tap outside close it, the thread stays; switching rooms keeps it; reload drops it', async ({
  page,
}) => {
  await open(page)
  await page.getByTestId('ask-suggest').first().click()
  /* Asking: the pill's star spins. */
  await expect(page.getByTestId('ask-open')).toHaveClass(/busy/)
  await expect(page.getByTestId('ask-answer')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('ask-open')).not.toHaveClass(/busy/)
  const drawer = page.getByTestId('ask-drawer')

  await page.getByTestId('ask-close').click()
  await expect(drawer).toHaveAttribute('aria-hidden', 'true')
  await expect(page.getByTestId('ask-answer')).not.toBeInViewport()
  await openDrawer(page)
  await expect(page.getByTestId('ask-answer')).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(drawer).toHaveAttribute('aria-hidden', 'true')
  await openDrawer(page)
  await page.mouse.click(40, 300)
  await expect(drawer).toHaveAttribute('aria-hidden', 'true')
  await expect(page.getByTestId('ask-fab-count')).toHaveText('1')

  await page.getByRole('link', { name: 'Portfolio', exact: true }).click()
  await expect(page.getByTestId('ask-open')).toHaveCount(0)
  await page.getByRole('link', { name: 'Insights', exact: true }).click()
  await openDrawer(page)
  await expect(page.getByTestId('ask-answer')).toBeVisible()
  await page.reload()
  await openDrawer(page)
  await expect(page.getByTestId('ask-thread')).toHaveCount(0)
  await expect(page.getByTestId('ask-suggest')).toHaveCount(4)
  /* The answer's cost was counted; the words were not kept. */
  await expect(page.getByTestId('ask-pay')).toHaveText(SPEND('0.08'))
})

test('S6 phone width: a bottom sheet, no sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await open(page)
  await page.getByTestId('ask-suggest').first().click()
  await expect(page.getByTestId('ask-answer')).toBeVisible({ timeout: 15_000 })
  const box = await page.getByTestId('ask-drawer').boundingBox()
  expect(box?.width).toBe(375)
  expect(box!.y + box!.height).toBeCloseTo(812, 0)
  expect(box!.y).toBeGreaterThan(80)
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      ),
    )
    .toBeLessThanOrEqual(0)
  await page.screenshot(shot('insights-ask-phone'))
})

test('S7 asked for ideas → cards with fetched prices; owned and unknown tickers left out', async ({
  page,
}) => {
  await open(page)
  await page.getByTestId('ask-input').fill('Give me more ideas')
  await page.getByTestId('ask-send').click()
  const answer = page.getByTestId('ask-answer')
  await expect(answer).toHaveAttribute('data-kind', 'ideas', {
    timeout: 15_000,
  })
  await expect(answer).toContainText('IDEAS')
  const cards = answer.getByTestId('ask-idea')
  /* Three at most: JNJ, EXV1.DE and ZZZZ, which no market knows. */
  await expect(cards).toHaveCount(2, { timeout: 15_000 })
  await expect(answer.locator('[data-ticker="JNJ"]')).toContainText('$187')
  await expect(answer).not.toContainText('NOT ADVICE')
  await expect(answer.locator('[data-ticker="EXV1.DE"]')).toContainText(
    'WRONG IF',
  )
  await expect(answer.locator('[data-ticker="ZZZZ"]')).toHaveCount(0)
  /* They arrive one after another, then stand. */
  await expect(cards.last()).toHaveCSS('opacity', '1')
  await answer.scrollIntoViewIfNeeded()
  await page.screenshot(shot('insights-ask-ideas'))
})

/* ✦ ASK on cards (22 Oct, docs/specs/2026-10-21-ask-on-cards.md; mockup
   design/treasury-mockup/ask-on-cards.html, his "go"): a ✦ on a read
   line, a box, an allocation line or an idea card opens the drawer with
   the card's question in the box — never sent, never paid. */

async function opened(page: Page, question: string | RegExp, paid: string) {
  await expect(page.getByTestId('ask-drawer')).toHaveAttribute(
    'aria-hidden',
    'false',
  )
  await expect(page.getByTestId('ask-input')).toHaveValue(question)
  await expect
    .poll(async () => {
      const b = await page.getByTestId('ask-drawer').boundingBox()
      return b ? Math.round(b.x + b.width) : 0
    })
    .toBe(page.viewportSize()!.width)
  /* Nothing sent: no thread, no count, nothing paid. */
  await expect(page.getByTestId('ask-thread')).toHaveCount(0)
  await expect(page.getByTestId('ask-fab-count')).toHaveCount(0)
  await expect(page.getByTestId('ask-pay')).toHaveText(paid)
}

/** The month's spend after the read, which ASK shares. */
async function withRead(page: Page) {
  await open(page)
  await page.keyboard.press('Escape')
  await page.getByTestId('read-market').click()
  await expect(page.getByTestId('read-hero')).toHaveAttribute(
    'data-state',
    'done',
    { timeout: 15_000 },
  )
  await expect(page.getByTestId('ask-pay')).not.toHaveText(SPEND('0.00'))
  return (await page.getByTestId('ask-pay').textContent())!
}

test('S8 ✦ on a read line, a box and an allocation line → the question in the box, nothing sent', async ({
  page,
}) => {
  const paid = await withRead(page)
  await page.locator('[data-tab="read"]').click()
  const line = page.getByTestId('read-line').first()
  await line.getByTestId('ask-on').click()
  await opened(page, 'Inflation is cooling — why?', paid)
  await expect(page.getByTestId('ask-input')).toBeFocused()
  await page.screenshot(shot('insights-ask-on-line'))

  await page.keyboard.press('Escape')
  await page.locator('[data-tab="mine"]').click()
  const avgo = page.locator('[data-testid=mine-box][data-symbol="AVGO"]')
  await expect(avgo).toHaveAttribute('data-call', /add|hold|wait/, {
    timeout: 15_000,
  })
  const call = (await avgo.getAttribute('data-call'))!.toUpperCase()
  await avgo.getByTestId('ask-on').click()
  await opened(page, `Why is AVGO ${call}?`, paid)

  /* A second ✦ puts its own question in place of the first. */
  await page.keyboard.press('Escape')
  const tech = page.locator('[data-testid=alloc-row][data-id="tech"]')
  await expect(tech).toContainText('WORLD 26%', { timeout: 15_000 })
  await tech.getByTestId('ask-on').click()
  await opened(page, /^Why is tech \d+%, world 26%\?$/, paid)
})

test('S10 phone width: the ✦ on a box shows without hover, the box keeps its keyboard down', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await withRead(page)
  await page.locator('[data-tab="mine"]').click()
  const ask = page
    .locator('[data-testid=mine-box][data-symbol="AVGO"]')
    .getByTestId('ask-on')
  await expect(ask).toBeVisible()
  await expect(ask).toHaveCSS('opacity', '1')
  await ask.click()
  await expect(page.getByTestId('ask-input')).toHaveValue(/AVGO/)
  await expect(page.getByTestId('ask-input')).not.toBeFocused()
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      ),
    )
    .toBeLessThanOrEqual(0)
})

/* COPY (22 Oct, docs/specs/2026-10-21-copy-answer.md; mockup
   design/treasury-mockup/copy-answer.html, his "go"). Nothing is saved:
   the press puts the answer on the clipboard as markdown. */

test('S11 ⧉ COPY → ✓ COPIED at once, the clipboard holds the answer, back to ⧉ COPY', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await open(page)
  await page.getByTestId('ask-input').fill('What did Powell say this week?')
  await page.getByTestId('ask-input').press('Enter')
  await expect(page.getByTestId('ask-answer')).toHaveAttribute(
    'data-kind',
    'rates',
    { timeout: 15_000 },
  )
  const copy = page.getByTestId('ask-copy')
  await expect(copy).toHaveText('⧉ COPY')
  await copy.click()
  await expect(copy).toHaveText('✓ COPIED')
  await expect(copy).toHaveAttribute('data-state', 'ok')
  await expect(page.getByTestId('ask-answer')).toHaveClass(/copied/)
  await page.screenshot(shot('insights-ask-copied'))

  const text = await page.evaluate(() => navigator.clipboard.readText())
  expect(text).toMatch(/^## What did Powell say this week\?\n\n🏛️ RATES\n\n/)
  expect(text).toContain(
    'did not rule out a cut. Markets read it as **a likely cut**',
  )
  expect(text).toMatch(/\n\nFACTS\n- 🇺🇸 /)
  expect(text).toContain(
    'SOURCES\n- REUTERS · 16 OCT · https://www.reuters.com/markets/fed\n- FEDERALRESERVE · 16 OCT · ',
  )
  expect(text).toMatch(
    /\n\n✦ SONNET 5\.5 · 2 SEARCHES · \d{1,2} [A-Z]{3} \d\d:\d\d$/,
  )
  await expect(copy).toHaveText('⧉ COPY', { timeout: 4000 })
})

test('S12 the clipboard refuses → ✕ NOT COPIED in red, then back', async ({
  page,
}) => {
  await open(page)
  await page.evaluate(() => {
    navigator.clipboard.writeText = () => Promise.reject(new Error('refused'))
  })
  await page.getByTestId('ask-suggest').first().click()
  await expect(page.getByTestId('ask-answer')).toBeVisible({ timeout: 15_000 })
  const copy = page.getByTestId('ask-copy')
  await copy.click()
  await expect(copy).toHaveText('✕ NOT COPIED')
  await expect(copy).toHaveAttribute('data-state', 'no')
  await expect(page.getByTestId('ask-answer')).not.toHaveClass(/copied/)
  await expect(copy).toHaveText('⧉ COPY', { timeout: 4000 })
})
