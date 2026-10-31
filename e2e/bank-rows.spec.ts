import { expect, test } from '@playwright/test'
import { anyApi } from 'convex/server'
import type { Page } from '@playwright/test'

import { start, testClient } from './helpers'

const shot = (name: string) => ({ path: `e2e/screens/${name}.png` })

/* A connected bank, slice 2 (docs/specs/2026-10-11-bank-connections.md):
   the bank's own rows. The bank is the canned one of convex/bankApi.ts —
   connected at €727.49, then e2eBank.answer says what it reports next and
   makes its last answer hours old, so opening Finances asks it again. */

const card = (page: Page) =>
  page.getByRole('button', { name: 'Open ActivoBank' })

/** ActivoBank connected, and the bank's next answer set. */
async function connected(page: Page, as: 'two' | 'twin' | 'many') {
  await start(page)
  await testClient().mutation(anyApi.e2eBank.reachable, {})
  await page.goto('/finances')
  await card(page).getByRole('button', { name: 'connect' }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByRole('button', { name: /continue at ActivoBank/ }).click()
  await expect(sheet.getByText('ActivoBank is connected')).toBeVisible()
  await sheet.getByRole('button', { name: 'Done' }).click()
  await expect(card(page).getByTestId('account-total')).toContainText('€727.49')
  await testClient().mutation(anyApi.e2eBank.answer, { as })
}

test('rows arrive and add up: saved with no press, shown on the card until closed', async ({
  page,
}) => {
  await connected(page, 'two')
  await page.goto('/finances')
  const arrived = card(page).getByTestId('bank-arrived')
  await expect(arrived.getByText('2 new')).toBeVisible()
  await expect(arrived.getByText('as the bank shows')).toBeVisible()
  await expect(arrived.getByText('€727.49')).toBeVisible()
  await expect(arrived.getByText('€42.40')).toBeVisible()
  await expect(arrived.getByText('€685.09')).toBeVisible()
  await expect(card(page).getByTestId('account-total')).toContainText('€685.09')
  await expect(
    card(page).getByText(/from the bank · today \d\d:\d\d/),
  ).toBeVisible()
  await card(page).scrollIntoViewIfNeeded()
  await page.waitForTimeout(700)
  await page.screenshot(shot('bank-arrived'))

  /* It stays: opening Finances again asks nothing and shows the same. */
  await page.reload()
  await expect(arrived.getByText('2 new')).toBeVisible()

  /* ✕: seen. The rows stay saved. */
  await arrived.getByRole('button', { name: 'close what arrived' }).click()
  await expect(arrived).toHaveCount(0)
  await expect(card(page).getByTestId('account-total')).toContainText('€685.09')
  /* Pending money was not written: two rows, not three. */
  await card(page).click()
  const sheet = page.getByRole('dialog')
  /* Clean list (31 Oct): the sync is one pill on top, never a card in
     the list; the day says what went out. ✕ on the card was seeing the
     rows: no NEW, no dots (his "We dont want to show NEW all the time"). */
  const pill = sheet.getByTestId('sync-pill')
  await expect(pill).toContainText(/synced with bank/i)
  await expect(pill).not.toContainText('new')
  await expect(
    sheet.getByText('Synced with bank', { exact: true }),
  ).toHaveCount(0)
  await expect(sheet.getByTestId('day-out').first()).toContainText('2 out')
  await expect(sheet.getByTestId('day-out').first()).toContainText('−€42.40')
  await expect(sheet.getByTestId('row-new')).toHaveCount(0)
  await expect(sheet.getByText('TRF P/ ANDREI PAVLOV')).toBeVisible()
  await expect(sheet.getByText(/PINGO DOCE/)).toBeVisible()
  /* Each row reads as who was paid, the bank's line underneath (13 Oct). */
  await expect(
    sheet.getByTestId('row-name').filter({ hasText: /^Andrei Pavlov$/ }),
  ).toBeVisible()
  await expect(
    sheet.getByTestId('row-name').filter({ hasText: /^Pingo Doce$/ }),
  ).toBeVisible()
  await expect(
    sheet.getByTestId('row-bank').filter({ hasText: 'TRF P/ ANDREI PAVLOV' }),
  ).toBeVisible()
  await page.screenshot(shot('row-names-account'))
  await expect(sheet.getByText(/SPOTIFY/)).toHaveCount(0)
  /* Pingo Doce was filed once under its short name: the bank's line has
     its group and its logo. A transfer to a person was never filed: no
     group, to be filed once. */
  const shop = sheet.locator('div.group', { hasText: 'PINGO DOCE' })
  await expect(shop.getByText('groceries')).toBeVisible()
  await expect(shop.locator('img')).toHaveCount(1)
  const person = sheet.locator('div.group', { hasText: 'ANDREI PAVLOV' })
  await expect(person.getByText('groceries')).toHaveCount(0)
  await expect(person.locator('[data-group]')).toHaveCount(0)
  await page.waitForTimeout(500)
  await page.screenshot(shot('bank-rows-group'))
})

test('a payment the account already has: not saved, asked, answered once', async ({
  page,
}) => {
  await connected(page, 'twin')
  await page.goto('/finances')
  await expect(
    card(page).getByText('not saved — 1 question open'),
  ).toBeVisible()
  /* Nothing of the account is written while it waits. */
  await expect(card(page).getByTestId('account-total')).toContainText('€727.49')
  await expect(card(page).getByTestId('bank-arrived')).toHaveCount(0)
  await card(page).scrollIntoViewIfNeeded()
  await page.waitForTimeout(700)
  await page.screenshot(shot('bank-question'))

  await card(page).getByRole('button', { name: 'open question' }).click()
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByText('Is this the same payment?')).toBeVisible()
  await expect(sheet.getByText('bank shows €702.49')).toBeVisible()
  await expect(sheet.getByText('Top-up by *2789')).toBeVisible()
  await page.waitForTimeout(700)
  await page.screenshot(shot('bank-question-open'))

  await sheet.getByRole('button', { name: /same payment/ }).click()
  await expect(sheet.getByText('as the bank shows')).toBeVisible()
  await sheet.getByRole('button', { name: /^apply/ }).click()
  await expect(sheet.getByText('saving…')).toBeVisible()
  await expect(sheet.getByText('ActivoBank is up to date')).toBeVisible()
  await page.screenshot(shot('bank-question-landed'))
  await sheet.getByRole('button', { name: 'done' }).click()
  await expect(sheet).toBeHidden()

  await expect(card(page).getByTestId('account-total')).toContainText('€702.49')
  await expect(card(page).getByText('not saved — 1 question open')).toHaveCount(
    0,
  )
  await expect(
    card(page).getByTestId('bank-arrived').getByText('1 new'),
  ).toBeVisible()
})

test('a month at once, at phone width: sixty rows, the card stays a card', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await connected(page, 'many')
  await page.goto('/finances')
  const arrived = card(page).getByTestId('bank-arrived')
  await expect(arrived.getByText('60 new')).toBeVisible()
  await expect(arrived.getByText('€667.49')).toBeVisible()
  await card(page).scrollIntoViewIfNeeded()
  await page.waitForTimeout(700)
  await page.screenshot(shot('bank-arrived-phone'))
  const box = await card(page).boundingBox()
  expect(box?.height ?? 999).toBeLessThan(420)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  /* NEW until seen (31 Oct): the first open shows 60 NEW and the dots;
     that open is seeing them, so the next one and the card show neither. */
  await card(page).click()
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByTestId('sync-pill')).toContainText('60 new')
  await expect(sheet.getByTestId('row-new').first()).toBeVisible()
  await sheet.getByRole('button', { name: 'Close' }).click()
  await expect(arrived).toHaveCount(0)
  await card(page).click()
  await expect(sheet.getByTestId('sync-pill')).not.toContainText('new')
  await expect(sheet.getByTestId('row-new')).toHaveCount(0)
})
