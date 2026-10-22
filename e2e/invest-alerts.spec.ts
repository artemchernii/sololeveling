import { expect, test } from '@playwright/test'
import { anyApi } from 'convex/server'

import { start, testClient } from './helpers'

const shot = (name: string) => ({ path: `e2e/screens/${name}.png` })

/* N3 (22 Oct, docs/specs/2026-10-22-n3-investment-alerts.md) S8: a held
   share closes 6% above the day before → the morning's alert in the bell,
   drawn with the company's mark → a tap opens the share on Portfolio.
   Nothing is pushed: the test backend has no private key. */

test('S8 a big day → the bell row with its logo → the share', async ({
  page,
}) => {
  await start(page)
  const client = testClient()
  const id = await client.mutation(anyApi.e2eSignals.heldShare, {})
  await client.action(anyApi.e2eInvest.ringShares, {})
  await page.goto('/dashboard')
  await expect(page.getByTestId('bell-count')).toHaveText('1')
  await page.getByRole('button', { name: 'Notifications' }).click()
  const panel = page.getByTestId('bell-panel')
  const row = panel
    .getByTestId('bell-row')
    .filter({ hasText: 'Microsoft ▲ 6%' })
  await expect(row).toBeVisible()
  await expect(row.getByText(/^\$449\.50 · .* → \$476\.47 · /)).toBeVisible()
  await expect(row.getByTestId('bell-logo')).toBeVisible()
  await page.waitForTimeout(700) // the window has opened
  await page.screenshot(shot('n3-bell'))
  await row.click()
  await expect(page).toHaveURL(
    new RegExp(`/finances\\?room=portfolio&position=${id}`),
  )
})
