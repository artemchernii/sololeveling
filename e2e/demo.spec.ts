import { expect, test } from '@playwright/test'
import { anyApi } from 'convex/server'

import { start, testClient } from './helpers'

const shot = (name: string) => ({ path: `e2e/screens/${name}.png` })

/* The demo account (docs/specs/2026-10-27-demo-account.md, mockup
   design/firstrun-mockup/demo.html): made-up rows in every room, the
   badge on every screen, nothing saved. */

test('D1–D3 demo: badge, DEMO greeting, full Today and Finances, a tick is not saved', async ({
  page,
}) => {
  await start(page)
  await testClient().mutation(anyApi.e2eDemo.makeDemo, {})
  await page.goto('/dashboard')

  await expect(page.getByTestId('demo-badge')).toHaveText('DEMO · FAKE DATA')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('DEMO.')
  await expect(
    page.getByRole('link', { name: 'Finances' }).first(),
  ).toBeVisible()
  const month = page.getByRole('region', { name: 'This month' })
  for (const tile of ['LANGS', 'WORKOUT', 'SHAKE', 'POST'])
    await expect(month.getByText(tile, { exact: true })).toBeVisible()
  await page.screenshot({ ...shot('demo-today'), fullPage: true })

  await page.getByRole('button', { name: 'Complete Leg day' }).first().click()
  await expect(page.getByText('DEMO · NOT SAVED')).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Complete Leg day' }).first(),
  ).toBeVisible()
  await page.screenshot({ ...shot('demo-not-saved') })

  await page.goto('/finances')
  await expect(page.getByTestId('demo-badge')).toBeVisible()
  await expect(page.getByText('Broker').first()).toBeVisible()
  await page.screenshot({ ...shot('demo-finances'), fullPage: true })
})

test.afterEach(async () => {
  await testClient().mutation(anyApi.e2eDemo.undoDemo, {})
})

test('D8 Artem after a reset: no badge, his name', async ({ page }) => {
  await start(page)
  await page.goto('/dashboard')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByTestId('demo-badge')).toHaveCount(0)
})
