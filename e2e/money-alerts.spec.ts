import { expect, test } from '@playwright/test'
import { anyApi } from 'convex/server'

import { start, testClient } from './helpers'

const shot = (name: string) => ({ path: `e2e/screens/${name}.png` })

/* N2 (17 Oct, docs/specs/2026-10-17-n2-finances-alerts.md) S8: a bill two
   days out that the account cannot pay → the morning's alert in the bell
   → a tap opens Flow. Nothing is pushed: the test backend has no private
   key. */

test('S8 missing for a bill → the bell row → Flow', async ({ page }) => {
  await start(page)
  const due = new Date()
  due.setDate(due.getDate() + 2)
  await testClient().action(anyApi.e2eMoney.ringMorning, {
    day: due.getDate(),
  })
  await page.goto('/dashboard')
  await expect(page.getByTestId('bell-count')).toHaveText('1')
  await page.getByRole('button', { name: 'Notifications' }).click()
  const panel = page.getByTestId('bell-panel')
  const row = panel.getByText(/^Preply · €5,000 · /)
  await expect(row).toBeVisible()
  await expect(panel.getByText(/missing$/i)).toBeVisible()
  await page.waitForTimeout(700) // the window has opened
  await page.screenshot(shot('n2-bell'))
  await row.click()
  await expect(page).toHaveURL(/\/finances\?room=flow/)
})
