import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { anyApi } from 'convex/server'

import { start, testClient } from './helpers'

const shot = (name: string) => ({ path: `e2e/screens/${name}.png` })

/* Remove a typed balance (11 Oct, docs/specs/2026-10-11-typed-balance.md):
   his ActivoBank as it stood — €153.21 read on 3 Oct off a screenshot —
   then a number typed by hand. Mock data only. */

const open = async (page: Page, value: number, daysBack = 0) => {
  await start(page)
  const client = testClient()
  await client.mutation(anyApi.e2eUpdate.readActivo, { as: 'yours' })
  const accounts: Array<{ _id: string; name: string }> = await client.query(
    anyApi.accounts.list,
    {},
  )
  const activo = accounts.find((a) => a.name === 'ActivoBank')
  if (!activo) throw new Error('no ActivoBank')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  await client.mutation(anyApi.accounts.setBalance, {
    accountId: activo._id,
    currency: 'EUR',
    value,
    dayStart: today.getTime(),
    ...(daysBack ? { asOf: Date.now() - daysBack * 86_400_000 } : {}),
  })
  await page.goto('/finances')
  await page.getByRole('button', { name: 'Show amounts' }).first().click()
  await page.getByRole('button', { name: 'Open ActivoBank' }).click()
  return page.getByRole('dialog')
}

test('a typed balance opens, says what the account is after, and one press removes it', async ({
  page,
}) => {
  const sheet = await open(page, 190.35)
  const line = sheet.getByTestId('typed-balance')
  await expect(line).toHaveCount(1)
  await line.getByRole('button', { name: /^typed/ }).click()
  await expect(
    line.getByText(/typed balance of \d+ Oct is removed\./),
  ).toBeVisible()
  await expect(line.getByText('ActivoBank now')).toBeVisible()
  await expect(line.getByText('€190.35')).toBeVisible()
  await expect(line.getByText('€153.21')).toBeVisible()
  await page.waitForTimeout(700)
  await page.screenshot(shot('typed-balance-open'))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(300)
  await page.screenshot(shot('typed-balance-open-phone'))
  await page.setViewportSize({ width: 1280, height: 720 })

  await line.getByRole('button', { name: 'remove this balance' }).click()
  await expect(sheet.getByText('removing…')).toBeVisible()
  await expect(sheet.getByText('Removed.')).toBeVisible()
  await expect(sheet.getByText('ActivoBank is €153.21 again.')).toBeVisible()
  await expect(sheet.getByTestId('typed-balance')).toHaveCount(0)
  await page.waitForTimeout(700)
  await page.screenshot(shot('typed-balance-removed'))
})

test('an older typed balance goes and the amount does not move', async ({
  page,
}) => {
  const sheet = await open(page, 1480, 20)
  const line = sheet.getByTestId('typed-balance')
  await line.getByRole('button', { name: /^typed/ }).click()
  await expect(line.getByText('not changed')).toBeVisible()
  await expect(line.getByText(/ActivoBank stays €153\.21/)).toBeVisible()
  await page.waitForTimeout(700)
  await page.screenshot(shot('typed-balance-older'))
  await line.getByRole('button', { name: 'remove this balance' }).click()
  await expect(sheet.getByText('ActivoBank stays €153.21.')).toBeVisible()
})

test('a balance a file set has no remove line', async ({ page }) => {
  await start(page)
  await testClient().mutation(anyApi.e2eUpdate.readActivo, { as: 'yours' })
  await page.goto('/finances')
  await page.getByRole('button', { name: 'Open ActivoBank' }).click()
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByText(/^balance · /).first()).toBeVisible()
  await expect(sheet.getByTestId('typed-balance')).toHaveCount(0)
})
