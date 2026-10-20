import { expect, test } from '@playwright/test'
import { anyApi } from 'convex/server'
import type { Page } from '@playwright/test'

import { start, testClient } from './helpers'

const shot = (name: string) => ({ path: `e2e/screens/${name}.png` })

/* Trade Republic's cash from the bank (19 Oct, docs/specs/2026-10-19-tr-bank-cash.md,
   mockup design/treasury-mockup/cash-lines.html). A broker the bank API
   reaches: its one cash line comes from Enable Banking, balance only — its
   rows stay with its statement, where a buy is a buy and not a spend. A
   screenshot then brings positions, not cash. The canned bank of
   convex/bankApi.ts answers €727.49; the mock Trade Republic holds €300. */

const card = (page: Page) =>
  page.getByRole('button', { name: 'Open Trade Republic' })

async function connected(page: Page) {
  await start(page)
  await testClient().mutation(anyApi.e2eUpdate.addBroker, {})
  await page.goto('/finances')
  await card(page).getByRole('button', { name: 'connect' }).click()
  const sheet = page.getByRole('dialog')
  await sheet
    .getByRole('button', { name: /continue at Trade Republic/ })
    .click()
  await expect(sheet.getByText('Trade Republic is connected')).toBeVisible()
  await sheet.getByRole('button', { name: 'Done' }).click()
  await expect(sheet).toHaveCount(0)
}

test('connect: the bank brings its free cash, positions keep UPDATE', async ({
  page,
}) => {
  await start(page)
  await testClient().mutation(anyApi.e2eUpdate.addBroker, {})
  await page.goto('/finances')
  await expect(card(page).getByText(/free cash\s*EUR\s*€300/)).toBeVisible()
  await card(page).scrollIntoViewIfNeeded()
  await page.screenshot(shot('tr-bank-before'))

  await card(page).getByRole('button', { name: 'connect' }).click()
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByText('balance here: €300')).toBeVisible()
  await sheet
    .getByRole('button', { name: /continue at Trade Republic/ })
    .click()
  await expect(sheet.getByText('Trade Republic is connected')).toBeVisible()
  await expect(sheet.getByText('€727.49')).toBeVisible()
  await sheet.getByRole('button', { name: 'Done' }).click()

  await expect(card(page).getByText(/free cash\s*EUR\s*€727\.49/)).toBeVisible()
  await expect(card(page).getByLabel('from the bank')).toBeVisible()
  await expect(
    card(page).getByText(/from the bank · today \d\d:\d\d/),
  ).toBeVisible()
  /* Positions still come from a screenshot or a statement. */
  await expect(card(page).getByRole('button', { name: 'update' })).toBeVisible()
  await expect(card(page).getByRole('button', { name: 'connect' })).toHaveCount(
    0,
  )
  await card(page).scrollIntoViewIfNeeded()
  await page.screenshot(shot('tr-bank-connected'))
})

test('the next check: its balance only, no rows saved', async ({ page }) => {
  await connected(page)
  /* The canned bank answers two payments and €685.09 — for a bank, rows. */
  await testClient().mutation(anyApi.e2eBank.answer, { as: 'two' })
  await page.goto('/finances')
  await expect(card(page).getByText(/free cash\s*EUR\s*€685\.09/)).toBeVisible()
  await expect(card(page).getByText(/\d+ new/)).toHaveCount(0)
  await expect(card(page).getByText('not saved — 1 question open')).toHaveCount(
    0,
  )
  await expect(page.getByText('PINGO DOCE', { exact: false })).toHaveCount(0)
})

test('a screenshot after connecting: positions saved, the bank keeps the cash', async ({
  page,
}) => {
  await connected(page)
  await testClient().mutation(anyApi.e2e.readHoldings, {})
  await page.goto('/finances')
  await page.getByRole('button', { name: 'add', exact: true }).first().click()
  const sheet = page.getByRole('dialog')
  await sheet.getByRole('button', { name: 'positions', exact: true }).click()
  await sheet.getByRole('button', { name: 'Trade Republic' }).click()
  await expect(sheet.getByTestId('cash-from-bank')).toHaveText(
    /from the bank\s*€727\.49/,
  )
  await expect(sheet.getByTestId('cash-on-screen')).toHaveText(
    /on the screen\s*€120\s*not saved/,
  )
  await page.screenshot({ ...shot('tr-bank-screenshot-check'), fullPage: true })
  const save = sheet.getByRole('button', { name: 'save 2 positions' })
  /* A slow save shows it is saving, at once. */
  await page.context().setOffline(true)
  await save.click()
  await expect(sheet.getByText('saving')).toBeVisible()
  await page.context().setOffline(false)
  await expect(sheet.getByRole('link', { name: /Portfolio/ })).toBeVisible()
  await sheet
    .getByRole('button', { name: /done|close/i })
    .first()
    .click()
  await expect(sheet).toBeHidden()
  await expect(card(page).getByText(/free cash\s*EUR\s*€727\.49/)).toBeVisible()
  await expect(card(page).getByTestId('account-invested')).toBeVisible()
  await card(page).scrollIntoViewIfNeeded()
  await page.screenshot(shot('tr-bank-positions'))
})
