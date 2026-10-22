import { expect, test } from '@playwright/test'
import { anyApi } from 'convex/server'
import type { Page } from '@playwright/test'

import { start, testClient } from './helpers'
import { monthKey, nextMonthWord } from '../src/lib/marketRead'

const shot = (name: string) => ({ path: `e2e/screens/${name}.png` })

/* R7 Ask AI (docs/specs/2026-10-22-r7-ask-ai.md, mockup
   design/ask-mockup/index.html round 2, his "go"). The test backend never
   calls out: there is no Claude Code route under E2E_RUN, so a question
   goes to the API action, which counts the seeded rows and answers with
   the canned answer (src/lib/rowsAskPrompt.ts cannedRows) — or NOT
   REACHED when e2eMarketRead.arm says fail. */

const AUGUST = 'What did I actually do in August?'

/** The latest August not after this month, local midnight on the 1st. */
function august(): number {
  const now = new Date()
  const y = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1
  return new Date(y, 7, 1).getTime()
}

async function open(page: Page) {
  await start(page)
  await testClient().mutation(anyApi.e2eRowsAsk.month, { from: august() })
  await page.goto('/dashboard')
  await expect(page.getByTestId('rows-open')).toBeVisible()
  await page.keyboard.press('ControlOrMeta+j')
  const drawer = page.getByTestId('rows-drawer')
  await expect(drawer).toHaveAttribute('aria-hidden', 'false')
  /* Slid all the way in: its edge on the window's. */
  await expect
    .poll(async () => {
      const b = await drawer.boundingBox()
      return b ? Math.round(b.x + b.width) : 0
    })
    .toBe(page.viewportSize()!.width)
  return drawer
}

test('S1–S3 ⌘J → a month asked → counts from the rows, the rows behind a number', async ({
  page,
}) => {
  const drawer = await open(page)
  await expect(drawer.getByText('[ MY ROWS ]')).toBeVisible()
  await expect(drawer.getByTestId('rows-suggest')).toHaveCount(6)
  await expect(drawer.getByTestId('rows-thread')).toHaveCount(0)
  await expect(drawer.getByTestId('rows-pay')).toHaveText(
    /^💳 [A-Z]{3} · \$0\.00 OF \$2\.00$/,
  )
  await page.screenshot(shot('ask-rows-empty'))

  await drawer.getByTestId('rows-suggest').first().click()
  /* Pressed: the question at once, the period and its rows while it reads. */
  await expect(drawer.getByTestId('rows-q')).toContainText(AUGUST)
  const asking = drawer.getByTestId('rows-asking')
  await expect(asking).toContainText(/AUG \d{4}/)
  await expect(asking).toContainText('AUG 1 – 31')
  await expect(asking).toContainText('READING 11 ROWS')
  await expect(drawer.getByTestId('rows-input')).toBeDisabled()

  const answer = drawer.getByTestId('rows-answer')
  await expect(answer).toBeVisible({ timeout: 15_000 })
  await expect(answer.getByTestId('rows-count')).toHaveText('11 ROWS')
  await expect(answer.getByTestId('rows-headline')).toContainText(
    'A building month',
  )
  /* The four counts the answer named, in its order, printed by the app. */
  const tiles = answer.getByTestId('rows-tile')
  await expect(tiles).toHaveCount(4)
  await expect(tiles.nth(0)).toHaveAttribute('data-key', 'commits')
  await expect(tiles.nth(0)).toContainText('COMMITS')
  await expect(tiles.nth(0)).toContainText('3')
  await expect(tiles.nth(0)).toContainText('2 DAYS')
  await expect(tiles.nth(1)).toContainText('WORKOUT')
  await expect(tiles.nth(1)).toContainText('180 MIN')
  await expect(tiles.nth(3)).toContainText('€698.20')
  /* The strip: the 2nd has a workout and commits. */
  const days = answer.getByTestId('rows-strip').locator('.r7-day')
  await expect(days).toHaveCount(31)
  await expect(days.nth(1)).toHaveAttribute('data-areas', 'body projects')
  await expect(answer.getByTestId('rows-legend')).toHaveText(
    /BODY.*MONEY.*PORTUGUESE.*PROJECTS.*TASKS/,
  )
  /* Lines with the counts they rest on; a number in no count is marked. */
  const lines = answer.getByTestId('rows-line')
  await expect(lines).toHaveCount(5)
  await expect(lines.nth(0).getByTestId('rows-fact')).toHaveText(['OREUM 3'])
  await expect(lines.nth(3).getByTestId('rows-stray')).toHaveText(
    '❔ NUMBER NOT IN ROWS',
  )
  await expect(answer.getByTestId('rows-stray')).toHaveCount(1)
  const stamp = answer.getByTestId('rows-stamp')
  await expect(stamp).toContainText('✦ HAIKU 5.5')
  await expect(stamp).toContainText('11 ROWS')
  await expect(stamp).toContainText('14K IN · 410 OUT')
  await expect(stamp).toContainText('💳 $0.03')
  await expect(drawer.getByTestId('rows-pay')).toHaveText(
    /^💳 [A-Z]{3} · \$0\.03 OF \$2\.00$/,
  )
  await expect(drawer.getByTestId('rows-input')).toBeEnabled()
  await page.screenshot(shot('ask-rows-answer'))

  /* A number opens its rows; again closes them. */
  await tiles.nth(0).click()
  await expect(tiles.nth(0)).toHaveAttribute('aria-expanded', 'true')
  const list = answer.getByTestId('rows-list')
  await expect(list).toContainText('COMMITS')
  await expect(list.getByTestId('rows-row')).toHaveCount(3)
  await expect(list.getByTestId('rows-row').first()).toContainText(
    'feat: first run',
  )
  await page.screenshot(shot('ask-rows-open'))
  await lines.nth(3).getByTestId('rows-fact').first().click()
  await expect(list.getByTestId('rows-row')).toHaveCount(2)
  await expect(list).toContainText('Renda')
  await lines.nth(3).getByTestId('rows-fact').first().click()
  await expect(answer.getByTestId('rows-list')).toHaveCount(0)
})

test('S4 no rows in the period → NO DATA, nothing guessed', async ({
  page,
}) => {
  const drawer = await open(page)
  await drawer.getByTestId('rows-input').fill('How did I sleep in June?')
  await drawer.getByTestId('rows-send').click()
  const answer = drawer.getByTestId('rows-answer')
  await expect(answer).toBeVisible({ timeout: 15_000 })
  await expect(answer.getByTestId('rows-count')).toHaveText('0 ROWS')
  await expect(answer).toContainText(/JUN \d{4}/)
  await expect(answer.getByTestId('rows-tile')).toHaveCount(0)
  await expect(answer.getByTestId('rows-line')).toHaveAttribute(
    'data-area',
    'nodata',
  )
})

test('S5 the reader fails → NOT REACHED, nothing paid, ASK AGAIN answers', async ({
  page,
}) => {
  const drawer = await open(page)
  await testClient().mutation(anyApi.e2eMarketRead.arm, { shape: 'fail' })
  await drawer.getByTestId('rows-suggest').first().click()
  const failed = drawer.getByTestId('rows-failed')
  await expect(failed).toBeVisible({ timeout: 15_000 })
  await expect(failed).toContainText('✕ NOT REACHED')
  await expect(failed).toContainText('$0.00 · NOTHING PAID')
  await expect(drawer.getByTestId('rows-q')).toContainText('✕ NOT ANSWERED')
  await page.screenshot(shot('ask-rows-failed'))

  await testClient().mutation(anyApi.e2eMarketRead.arm, { shape: 'calm' })
  await drawer.getByTestId('rows-again').click()
  await expect(drawer.getByTestId('rows-answer')).toBeVisible({
    timeout: 15_000,
  })
  await expect(drawer.getByTestId('rows-failed')).toHaveCount(0)
})

test('S6 at the cap → CAP REACHED, no box', async ({ page }) => {
  const drawer = await open(page)
  await testClient().mutation(anyApi.e2eMarketRead.spend, { usd: 2 })
  const cap = drawer.getByTestId('rows-cap')
  await expect(cap).toContainText('CAP REACHED')
  await expect(cap).toContainText('$2.00 OF $2.00')
  await expect(cap).toContainText(`NEXT ${nextMonthWord(monthKey(Date.now()))}`)
  await expect(drawer.getByTestId('rows-input')).toHaveCount(0)
  await expect(drawer.getByTestId('rows-suggest').first()).toBeDisabled()
})

test('S7 Esc closes and ✦ Ask reopens with the thread; a reload forgets it', async ({
  page,
}) => {
  const drawer = await open(page)
  await drawer.getByTestId('rows-suggest').first().click()
  await expect(drawer.getByTestId('rows-answer')).toBeVisible({
    timeout: 15_000,
  })
  await page.keyboard.press('Escape')
  await expect(drawer).toHaveAttribute('aria-hidden', 'true')
  await page.getByTestId('rows-open').click()
  await expect(drawer).toHaveAttribute('aria-hidden', 'false')
  await expect(drawer.getByTestId('rows-answer')).toHaveCount(1)
  await drawer.getByTestId('rows-close').click()
  await expect(drawer).toHaveAttribute('aria-hidden', 'true')

  await page.reload()
  /* The shortcut listens once the shell is up. */
  await expect(page.getByTestId('rows-open')).toBeVisible()
  await page.waitForLoadState('networkidle')
  await page.keyboard.press('ControlOrMeta+j')
  await expect(drawer).toHaveAttribute('aria-hidden', 'false')
  await expect(drawer.getByTestId('rows-thread')).toHaveCount(0)
  await expect(drawer.getByTestId('rows-suggest')).toHaveCount(6)
})

test('phone: a bottom sheet, nothing wider than the screen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await start(page)
  await testClient().mutation(anyApi.e2eRowsAsk.month, { from: august() })
  await page.goto('/dashboard')
  await page.getByTestId('rows-open').click()
  const drawer = page.getByTestId('rows-drawer')
  await expect(drawer).toHaveAttribute('aria-hidden', 'false')
  await drawer.getByTestId('rows-suggest').first().click()
  await expect(drawer.getByTestId('rows-answer')).toBeVisible({
    timeout: 15_000,
  })
  const box = await drawer.boundingBox()
  expect(Math.round(box!.width)).toBe(375)
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(375)
  await page.screenshot(shot('ask-rows-phone'))

  /* The handle drags the sheet: a short pull springs back, a long one
     closes it (23 Oct, his "I cant drag it down with that dash"). */
  /* slid all the way in first */
  await expect
    .poll(async () => Math.round((await drawer.boundingBox())!.y), {
      intervals: [200],
    })
    .toBeLessThan(200)
  const top = (await drawer.boundingBox())!.y
  await page.mouse.move(187, top + 6)
  await page.mouse.down()
  await page.mouse.move(187, top + 50, { steps: 5 })
  await page.mouse.up()
  await expect(drawer).toHaveAttribute('aria-hidden', 'false')
  /* sprung all the way back before the next pull */
  await expect
    .poll(async () => Math.round((await drawer.boundingBox())!.y))
    .toBe(Math.round(top))
  await page.mouse.move(187, top + 6)
  await page.mouse.down()
  await page.mouse.move(187, top + 260, { steps: 8 })
  await page.mouse.up()
  await expect(drawer).toHaveAttribute('aria-hidden', 'true')
})

test('S8 a week: every day named, a count per area', async ({ page }) => {
  const drawer = await open(page)
  await drawer.getByTestId('rows-input').fill('Tasks done this week')
  await drawer.getByTestId('rows-send').click()
  const answer = drawer.getByTestId('rows-answer')
  await expect(answer).toBeVisible({ timeout: 15_000 })
  const strip = answer.getByTestId('rows-strip')
  await expect(strip).toHaveClass(/wide/)
  const days = strip.locator('.r7-day')
  await expect(days).toHaveCount(((new Date().getDay() + 6) % 7) + 1)
  await expect(days.first()).toContainText('MON')
  await page.screenshot(shot('ask-rows-week'))
})
