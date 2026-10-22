import { expect, test } from '@playwright/test'
import { anyApi } from 'convex/server'
import type { Page } from '@playwright/test'

import { start, testClient } from './helpers'

const shot = (name: string) => ({ path: `e2e/screens/${name}.png` })

/* N4 (docs/specs/2026-10-22-n4-ask-replies.md, mockup
   design/notifications-mockup/n4.html, his "go — build N4 as the
   mockup"). An Ask answer that lands while the page is hidden (the phone
   locked) rings — on the test backend after 1 s, with no real push — and
   the bell row opens the drawer on it. One that lands on screen does not
   ring. */

const AUGUST = 'What did I actually do in August?'

function august(): number {
  const now = new Date()
  const y = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1
  return new Date(y, 7, 1).getTime()
}

/** The page as a locked phone sees it: not on screen. */
const hide = (page: Page) =>
  page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    })
  })

async function ask(page: Page, hidden: boolean, fail = false) {
  await start(page)
  if (fail)
    await testClient().mutation(anyApi.e2eMarketRead.arm, { shape: 'fail' })
  await testClient().mutation(anyApi.e2eRowsAsk.month, { from: august() })
  await page.goto('/dashboard')
  await expect(page.getByTestId('rows-open')).toBeVisible()
  await page.keyboard.press('ControlOrMeta+j')
  const drawer = page.getByTestId('rows-drawer')
  await expect(drawer).toHaveAttribute('aria-hidden', 'false')
  if (hidden) await hide(page)
  await drawer.getByTestId('rows-suggest').first().click()
  await expect(drawer.getByTestId('rows-q')).toContainText(AUGUST)
  return drawer
}

/** The phone opened from the push: a fresh page, the bell row tapped. */
async function openFromBell(page: Page, title: RegExp) {
  await page.reload()
  await expect(page.getByTestId('bell-count')).toHaveText('1')
  await page.getByRole('button', { name: 'Notifications' }).click()
  const row = page
    .getByTestId('bell-panel')
    .getByTestId('bell-row')
    .filter({ hasText: title })
  await expect(row).toBeVisible()
  await page.waitForTimeout(700)
  await row.click()
  const drawer = page.getByTestId('rows-drawer')
  await expect(drawer).toHaveAttribute('aria-hidden', 'false')
  await expect(page).not.toHaveURL(/ask=/)
  return { drawer, row }
}

test('S1 answered while hidden → it rings → the bell row opens the answer', async ({
  page,
}) => {
  const drawer = await ask(page, true)
  await expect(drawer.getByTestId('rows-answer')).toBeVisible({
    timeout: 15_000,
  })
  await expect(page.getByTestId('bell-count')).toHaveText('1', {
    timeout: 10_000,
  })
  const { drawer: again } = await openFromBell(page, /^✦ Ask · AUG 1 – 31/)
  await expect(again.getByTestId('rows-q')).toContainText(AUGUST)
  await expect(again.getByTestId('rows-rang')).toHaveText(
    / · 📲 ANSWERED \d\d:\d\d$/,
  )
  const answer = again.getByTestId('rows-answer')
  await expect(answer.getByTestId('rows-headline')).toContainText(
    'A building month',
  )
  /* The rows read again and counted, as when it was asked. */
  await expect(answer.getByTestId('rows-count')).toHaveText('11 ROWS')
  await expect(answer.getByTestId('rows-tile')).toHaveCount(4)
  await page.waitForTimeout(1200)
  await page.screenshot(shot('ask-reply-opened'))
})

test('S2 answered on screen → nothing rings', async ({ page }) => {
  const drawer = await ask(page, false)
  await expect(drawer.getByTestId('rows-answer')).toBeVisible({
    timeout: 15_000,
  })
  await page.waitForTimeout(3000)
  await expect(page.getByTestId('bell-count')).toHaveCount(0)
})

test('S3 failed while hidden → ✕ NOT REACHED rings → ASK AGAIN', async ({
  page,
}) => {
  const drawer = await ask(page, true, true)
  await expect(drawer.getByTestId('rows-q')).toContainText('✕ NOT ANSWERED', {
    timeout: 15_000,
  })
  await expect(page.getByTestId('bell-count')).toHaveText('1', {
    timeout: 10_000,
  })
  const { drawer: again } = await openFromBell(page, /^✕ Ask · NOT REACHED/)
  await expect(again.getByTestId('rows-rang')).toHaveText(
    / · 📲 RANG \d\d:\d\d$/,
  )
  await expect(again.getByText('↻ ASK AGAIN')).toBeVisible()
  await page.screenshot(shot('ask-reply-failed'))
})

test('S5 a link to an answer that is gone → the drawer opens empty', async ({
  page,
}) => {
  await start(page)
  await page.goto('/dashboard?ask=nope')
  const drawer = page.getByTestId('rows-drawer')
  await expect(drawer).toHaveAttribute('aria-hidden', 'false')
  await expect(drawer.getByText('[ MY ROWS ]')).toBeVisible()
  await expect(page).not.toHaveURL(/ask=/)
})
