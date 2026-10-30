import { expect, test } from '@playwright/test'
import { anyApi } from 'convex/server'
import type { Page } from '@playwright/test'

import { start, testClient } from './helpers'

const shot = (name: string) => ({ path: `e2e/screens/${name}.png` })

/* IDEAS, the board (29 Oct; docs/specs/2026-10-29-ideas-board.md, mockup
   design/treasury-mockup/ideas-board.html). The test backend never calls
   out: the board's fetch is canned (src/lib/ideasBoardCanned.ts — LOSERS
   unanswered, ZZZZ unknown), the read answers with a board made from the
   facts it is given (src/lib/ideasReadCanned.ts), and ASK from a line
   with a chart and a table. Mock holdings: e2eMine.positions. */

async function open(page: Page) {
  await start(page)
  await testClient().mutation(anyApi.e2eMine.positions, {})
  await page.goto('/finances?room=insights')
  await page.locator('[data-tab="ideas"]').click()
  await expect(page.getByTestId('idb-board')).toBeVisible()
}

async function read(page: Page) {
  const button = page.getByTestId('idb-read')
  await expect(button).toBeEnabled({ timeout: 15_000 })
  await button.click()
  /* Pressed: it answers at once, and cannot pay twice. */
  await expect(button).toHaveAttribute('data-state', 'reading')
  await expect(button).toBeDisabled()
  await expect(button).toHaveAttribute('data-state', 'done', {
    timeout: 20_000,
  })
}

test('S1 before a read: cash, strip and movers; READ → reading → the plan in four parts', async ({
  page,
}) => {
  await open(page)
  await expect(page.getByTestId('idb-cash')).toContainText('€')
  await expect(page.getByTestId('idb-none')).toContainText('NOT READ YET')
  const strip = page.getByTestId('idb-strip')
  await expect(strip).toContainText('S&P 500')
  await expect(strip).toContainText('BTC')
  await expect(strip.locator('.d')).toHaveCount(8)
  /* Movers: TRENDING answered, MINE marked; LOSERS not answered. */
  await expect(page.getByTestId('idb-mover').first()).toBeVisible()
  await expect(
    page.locator('[data-testid=idb-mover]', { hasText: 'AVGO' }),
  ).toContainText('MINE')
  await page.getByTestId('idb-list').nth(2).click()
  await expect(page.getByTestId('idb-nodata')).toHaveText('❔ NO DATA')
  await page.getByTestId('idb-list').first().click()
  await page.screenshot({ ...shot('ideas-before'), fullPage: true })

  await read(page)
  await expect(page.getByTestId('idb-take')).toContainText(
    'Too much cash for the long run.',
  )
  await expect(page.getByTestId('idb-bar').locator('i')).toHaveCount(4)
  await expect(page.getByTestId('idb-stamp')).toContainText('SONNET 5.5')
  await expect(page.getByTestId('idb-part')).toHaveCount(3)
  const add = page.locator('[data-testid=idb-part][data-part=add]')
  await expect(add).toContainText('ADD TO MINE')
  const avgo = add.locator('[data-ticker="AVGO"]')
  await expect(avgo.getByTestId('idb-call')).toHaveText('ADD')
  await expect(avgo).toContainText(/MINE \d+%/)
  await expect(avgo).toContainText('WHY')
  await avgo.getByTestId('idb-numbers').locator('summary').click()
  await expect(avgo.getByTestId('idb-numbers')).toContainText('RSI 14')
  /* Beside the numbers, the ticker's chart and its Yahoo page. */
  await expect(
    avgo
      .getByTestId('idb-numbers')
      .getByTestId('idb-chart')
      .locator('polyline'),
  ).toHaveCount(1)
  await expect(avgo.getByTestId('idb-yahoo')).toHaveAttribute(
    'href',
    'https://finance.yahoo.com/quote/AVGO',
  )
  /* ZZZZ is not a ticker the market knows: its line is dropped. */
  await expect(page.locator('[data-ticker="ZZZZ"]')).toHaveCount(0)
  await expect(
    page.locator('[data-tab="ideas"] [data-testid=tab-badge]'),
  ).toContainText('€')
  await expect(page.locator('body')).not.toContainText('NOT ADVICE')
  /* ASK beside it offers questions from the plan. */
  await expect(
    page.getByTestId('idb-chat').getByTestId('ask-suggest').first(),
  ).toContainText('ADD ·')
  /* A part's tile opens what the part is and what is in it. */
  await page.locator('[data-testid=idb-pt][data-part=protect]').hover()
  const tip = page.getByTestId('idb-tip')
  await expect(tip).toContainText('should not fall much')
  await expect(tip).toContainText('XEON.DE')
  await page.screenshot(shot('ideas-part-card'))
  /* A market opens its chart: the day, then 1M fetched on the press. */
  await page.locator('[data-testid=idb-mk][data-id=sp500]').hover()
  const card = page.getByTestId('idb-mk-card')
  await expect(card).toContainText('CLOSE BEFORE')
  /* The mouse crosses to the card and presses a range: it stays. */
  await card.hover()
  await card.getByTestId('idb-mk-range').nth(2).click()
  await expect(card.locator('polyline')).toHaveCount(1)
  await expect(card).toContainText('HIGH')
  await card.getByTestId('idb-mk-range').nth(1).click()
  await expect(card.getByTestId('idb-mk-range').nth(1)).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(card).toContainText('^GSPC')
  await page.screenshot(shot('ideas-market-card'))
  /* Left alone it closes; a click pins it until Esc. */
  await page.mouse.move(0, 0)
  await expect(card).toHaveCount(0)
  await page.locator('[data-testid=idb-mk][data-id=gold]').click()
  await page.mouse.move(0, 0)
  await expect(card).toHaveClass(/pinned/)
  await page.keyboard.press('Escape')
  await expect(card).toHaveCount(0)
  await expect(page.getByTestId('idb-line').last()).toHaveCSS('opacity', '1')
  await page.screenshot({ ...shot('ideas-board'), fullPage: true })
})

test('S2 ✦ on a line → the docked ASK opens on it; ASK → words, a chart the app draws, a table', async ({
  page,
}) => {
  await open(page)
  await read(page)
  const avgo = page.locator('[data-testid=idb-line][data-ticker="AVGO"]')
  await avgo.getByTestId('idb-ask').click()
  await expect(avgo).toHaveClass(/on/)
  const chat = page.getByTestId('idb-chat')
  await expect(chat.getByTestId('ask-ctx')).toContainText(
    '✦ AVGO · ADD TO MINE · ADD',
  )
  await expect(chat.getByTestId('ask-input')).toHaveValue('Why ADD AVGO?')
  /* Docked: the drawer stays shut. */
  await expect(page.getByTestId('ask-drawer')).toHaveAttribute(
    'aria-hidden',
    'true',
  )
  await chat.getByTestId('ask-send').click()
  await expect(chat.getByTestId('ask-q-line')).toHaveText('✦ AVGO')
  await expect(chat.getByTestId('ask-asking')).toContainText(
    'SEARCHING THE WEB',
  )
  /* It carries his money: holdings, cash and the plan. */
  await expect(chat.getByTestId('ask-asking')).toContainText('HOLDINGS')
  await expect(chat.getByTestId('ask-asking')).toContainText('IDEAS PLAN')
  await expect(chat.getByTestId('ask-asking')).not.toContainText('🌐')
  await expect(chat.getByTestId('ask-ctx')).toHaveCount(0)
  const answer = chat.getByTestId('ask-answer')
  await expect(answer).toContainText('spending, not demand', {
    timeout: 15_000,
  })
  await expect(answer.getByTestId('ask-chart').locator('polyline')).toHaveCount(
    2,
    { timeout: 15_000 },
  )
  await expect(answer.getByTestId('ask-chart')).toContainText('NOT SAVED')
  await expect(answer.getByTestId('ask-table')).toContainText('P/E NEXT')
  await page.screenshot({ ...shot('ideas-ask-line'), fullPage: true })
})

test('S3 a screenshot dropped in goes with the question and is not saved', async ({
  page,
}) => {
  await open(page)
  const chat = page.getByTestId('idb-chat')
  /* A 1×1 PNG. */
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  )
  await chat
    .getByTestId('ask-file')
    .setInputFiles({ name: 'my-212.png', mimeType: 'image/png', buffer: png })
  await expect(chat.getByTestId('ask-shot')).toContainText('my-212.png')
  await chat.getByTestId('ask-input').fill('Is this a good time to add?')
  await chat.getByTestId('ask-send').click()
  const q = chat.getByTestId('ask-q')
  await expect(q.getByTestId('ask-shot')).toContainText('NOT SAVED')
  await expect(chat.getByTestId('ask-asking')).toContainText('SCREENSHOT')
  await expect(chat.getByTestId('ask-answer')).toBeVisible({ timeout: 15_000 })
})

test('S4 the read fails → ✕ NOT REACHED, nothing paid twice, READ again', async ({
  page,
}) => {
  await open(page)
  await testClient().mutation(anyApi.e2eMarketRead.arm, { shape: 'fail' })
  const button = page.getByTestId('idb-read')
  await expect(button).toBeEnabled({ timeout: 15_000 })
  await button.click()
  await expect(page.getByTestId('idb-failed')).toHaveText('✕ NOT REACHED', {
    timeout: 20_000,
  })
  await expect(page.getByTestId('idb-part')).toHaveCount(0)
  await expect(button).toBeEnabled()
  await page.screenshot(shot('ideas-failed'))
})

test('S5 phone: one column, ✦ ASK floats; ✦ on a line opens the sheet on it; no sideways scroll', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await open(page)
  await read(page)
  await expect(page.getByTestId('idb-chat')).toBeHidden()
  await expect(page.getByTestId('ask-open')).toBeVisible()
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      ),
    )
    .toBeLessThanOrEqual(0)
  await page.screenshot({ ...shot('ideas-phone'), fullPage: true })
  await page
    .locator('[data-testid=idb-line][data-ticker="AVGO"]')
    .getByTestId('idb-ask')
    .click()
  const drawer = page.getByTestId('ask-drawer')
  await expect(drawer).toHaveAttribute('aria-hidden', 'false')
  await expect(drawer.getByTestId('ask-ctx')).toContainText('AVGO')
  await page.screenshot(shot('ideas-phone-sheet'))
})
