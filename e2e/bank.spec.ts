import { expect, test } from '@playwright/test'
import { anyApi } from 'convex/server'
import type { Page } from '@playwright/test'

import { start, testClient } from './helpers'

const shot = (name: string) => ({ path: `e2e/screens/${name}.png` })

/* A connected bank, slice 1b (docs/specs/2026-10-11-bank-connections.md).
   The bank is the canned one of convex/bankApi.ts: its "own page" is the
   app's callback with a code, one euro account, €727.49 booked. A code of
   "two" shows two accounts the app cannot tell apart. */

const card = (page: Page) =>
  page.getByRole('button', { name: 'Open ActivoBank' })

/** Signed in on the bad day, with ActivoBank a bank the app can connect. */
async function ready(page: Page) {
  await start(page)
  await testClient().mutation(anyApi.e2eBank.reachable, {})
}

/** Press connect, then continue — and stop at the bank's door: the address
    it would open comes back, for a test to change how the bank answered. */
async function toTheBank(page: Page, word = 'connect'): Promise<string> {
  let address = ''
  await page.route('**/bank/callback**', (route) => {
    address = route.request().url()
    /* No content: the page stays where it is, still "opening". */
    return route.fulfill({ status: 204 })
  })
  await card(page).getByRole('button', { name: word }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByRole('button', { name: /continue at ActivoBank/ }).click()
  await expect(sheet.getByText('opening ActivoBank')).toBeVisible()
  await expect.poll(() => address).toContain('state=')
  await page.unroute('**/bank/callback**')
  return address
}

test('connect: three facts, the bank, and its balance lands on the card', async ({
  page,
}) => {
  await ready(page)
  await page.goto('/finances')
  await expect(card(page).getByTestId('account-total')).toContainText('€830.50')
  await card(page).scrollIntoViewIfNeeded()
  await page.screenshot(shot('bank-card-before'))
  /* Only a bank Enable Banking lists is offered. */
  await expect(
    page
      .getByRole('button', { name: 'Open Cash' })
      .getByRole('button', { name: 'connect' }),
  ).toHaveCount(0)

  await card(page).getByRole('button', { name: 'connect' }).click()
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByText('Read only')).toBeVisible()
  await expect(sheet.getByText('Not seen by the app.')).toBeVisible()
  await expect(sheet.getByText('balance here: €830.50')).toBeVisible()
  await page.screenshot(shot('bank-connect'))

  await sheet.getByRole('button', { name: /continue at ActivoBank/ }).click()
  await expect(sheet.getByText('ActivoBank is connected')).toBeVisible()
  await expect(sheet.getByText('€727.49')).toBeVisible()
  await expect(sheet.getByText(/approved until/)).toBeVisible()
  await expect(page).toHaveURL(/\/finances$/)
  await page.waitForTimeout(600)
  await page.screenshot(shot('bank-connected'))

  await sheet.getByRole('button', { name: 'Done' }).click()
  await expect(sheet).toHaveCount(0)
  await expect(card(page).getByTestId('account-total')).toContainText('€727.49')
  await expect(
    card(page).getByText(/from the bank · today \d\d:\d\d/),
  ).toBeVisible()
  /* The bank reports all this card shows: nothing left to update by hand. */
  await expect(card(page).getByRole('button', { name: 'update' })).toHaveCount(
    0,
  )
  await expect(card(page).getByRole('button', { name: 'connect' })).toHaveCount(
    0,
  )
  await card(page).scrollIntoViewIfNeeded()
  await page.screenshot(shot('bank-card'))
})

test('two accounts at the bank: asked which one, reading, landed', async ({
  page,
}) => {
  await ready(page)
  await page.goto('/finances')
  const address = await toTheBank(page)
  await page.goto(address.replace('code=one', 'code=two'))

  const sheet = page.getByRole('dialog')
  await expect(sheet.getByText('Which one is this card?')).toBeVisible()
  await expect(sheet.getByText('ActivoBank shows 2 accounts')).toBeVisible()
  await expect(sheet.getByText('···· 9920')).toBeVisible()
  await page.screenshot(shot('bank-which'))
  /* Nothing is written until one is picked. */
  await expect(card(page).getByTestId('account-total')).toContainText('€830.50')

  await sheet.getByRole('button', { name: /Conta à Ordem/ }).click()
  await expect(sheet.getByText('Reading ActivoBank')).toBeVisible()
  await expect(sheet.getByText('ActivoBank is connected')).toBeVisible()
  await sheet.getByRole('button', { name: 'Done' }).click()
  await expect(sheet).toHaveCount(0)
  await expect(card(page).getByTestId('account-total')).toContainText('€727.49')
})

test('cancelled at the bank: not approved, nothing changed', async ({
  page,
}) => {
  await ready(page)
  await page.goto('/finances')
  const address = await toTheBank(page)
  await page.goto(address.replace('code=one', 'error=access_denied'))

  const sheet = page.getByRole('dialog')
  await expect(sheet.getByText('Not approved. Nothing changed.')).toBeVisible()
  await page.screenshot(shot('bank-refused'))
  await sheet.getByRole('button', { name: 'later' }).click()
  await expect(sheet).toHaveCount(0)
  await expect(card(page).getByTestId('account-total')).toContainText('€830.50')
  await expect(
    card(page).getByRole('button', { name: 'connect' }),
  ).toBeVisible()
  await expect(card(page).getByRole('button', { name: 'update' })).toBeVisible()
})

test('approval ended: the card says so, approve again, and it is read', async ({
  page,
}) => {
  await ready(page)
  await page.goto('/finances')
  await card(page).getByRole('button', { name: 'connect' }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByRole('button', { name: /continue at ActivoBank/ }).click()
  await sheet.getByRole('button', { name: 'Done' }).click()

  await testClient().mutation(anyApi.e2eBank.end, {})
  await expect(card(page).getByText(/approval ended/)).toBeVisible()
  await expect(
    card(page).getByText(/balance of today, \d\d:\d\d/),
  ).toBeVisible()
  await card(page).scrollIntoViewIfNeeded()
  await page.screenshot(shot('bank-ended'))

  await card(page).getByRole('button', { name: 'approve' }).click()
  await expect(sheet.getByText(/approval ended/)).toBeVisible()
  await expect(sheet.getByText('Read only')).toBeVisible()
  await sheet.getByRole('button', { name: /continue at ActivoBank/ }).click()
  await expect(sheet.getByText('ActivoBank is approved')).toBeVisible()
  await sheet.getByRole('button', { name: 'Done' }).click()
  await expect(card(page).getByText(/from the bank · today/)).toBeVisible()
  await expect(card(page).getByRole('button', { name: 'approve' })).toHaveCount(
    0,
  )
})

test('the bank fails after the approval: said in words, nothing saved', async ({
  page,
}) => {
  await ready(page)
  await page.goto('/finances')
  const address = await toTheBank(page)
  /* A one-time word the app never gave: the answer belongs to no approval. */
  await page.goto(address.replace(/state=[^&]+/, 'state=not-mine'))
  await expect(page.getByText('This approval is not open.')).toBeVisible()
  await page.screenshot(shot('bank-failed'))
  await page.getByRole('link', { name: 'back to Finances' }).click()
  await expect(card(page).getByTestId('account-total')).toContainText('€830.50')
})

test('phone width: the window and the connected card fit', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await ready(page)
  await page.goto('/finances')
  await card(page).getByRole('button', { name: 'connect' }).click()
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByText('Read only')).toBeVisible()
  await page.screenshot(shot('bank-connect-phone'))
  await sheet.getByRole('button', { name: /continue at ActivoBank/ }).click()
  await expect(sheet.getByText('ActivoBank is connected')).toBeVisible()
  await page.waitForTimeout(600)
  await page.screenshot(shot('bank-connected-phone'))
  await sheet.getByRole('button', { name: 'Done' }).click()
  await card(page).scrollIntoViewIfNeeded()
  await expect(card(page).getByText(/from the bank · today/)).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
})
