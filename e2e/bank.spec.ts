import { expect, test } from '@playwright/test'
import { anyApi } from 'convex/server'
import type { Page } from '@playwright/test'

import { start, testClient } from './helpers'

/* A connected bank, slice 1b (docs/specs/2026-10-11-bank-connections.md).
   The bank is the canned one of convex/bankApi.ts: its "own page" is the
   app's callback with a code, one euro account, €727.49 booked. */

const card = (page: Page) =>
  page.getByRole('button', { name: 'Open ActivoBank' })

/** The address the bank's page would send him back to. */
async function fromTheBank(): Promise<string> {
  await testClient().mutation(anyApi.e2eBank.reachable, {})
  const accounts: Array<{ _id: string; name: string }> =
    await testClient().query(anyApi.accounts.list, {})
  const activo = accounts.find((a) => a.name === 'ActivoBank')
  return await testClient().action(anyApi.bank.connect, {
    accountId: activo?._id,
  })
}

test('back from the bank: its balance is read and is on the card', async ({
  page,
}) => {
  await start(page)
  await page.goto(await fromTheBank())
  await expect(page).toHaveURL(/\/finances$/)
  await expect(card(page).getByTestId('account-total')).toContainText('€727.49')
  await expect(card(page).getByText('from the bank today')).toBeVisible()
  await card(page).scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'e2e/screens/bank-back.png' })
})

test('an answer that belongs to no approval: said in words, nothing saved', async ({
  page,
}) => {
  await start(page)
  const address = await fromTheBank()
  await page.goto(address.replace(/state=[^&]+/, 'state=not-mine'))
  await expect(page.getByText('This approval is not open.')).toBeVisible()
  await page.screenshot({ path: 'e2e/screens/bank-failed.png' })
  await page.getByRole('link', { name: 'back to Finances' }).click()
  await expect(card(page).getByTestId('account-total')).toContainText('€830.50')
})

test('cancelled at the bank: back on Finances, nothing changed', async ({
  page,
}) => {
  await start(page)
  const address = await fromTheBank()
  await page.goto(address.replace('code=one', 'error=access_denied'))
  await expect(page).toHaveURL(/\/finances$/)
  await expect(card(page).getByTestId('account-total')).toContainText('€830.50')
  expect(await testClient().query(anyApi.bank.links, {})).toEqual([])
})
