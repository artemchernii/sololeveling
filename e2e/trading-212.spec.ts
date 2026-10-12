import { expect, test } from '@playwright/test'
import { anyApi } from 'convex/server'
import type { Page } from '@playwright/test'

import { start, testClient } from './helpers'

const shot = (name: string) => ({ path: `e2e/screens/${name}.png` })

/* Trading 212 connected (docs/specs/2026-10-12-trading-212.md). The
   account is the mock one of e2eBank.t212 — €1,280.30 free, 8 Nvidia at
   €150, 1 ASML at €640, from a file — and Trading 212 is the canned one of
   convex/t212Api.ts. e2eBank.answer says what it reports next and makes
   its last answer hours old, so opening Finances asks it again. */

const card = (page: Page) =>
  page.getByRole('button', { name: 'Open Trading 212' })
const total = (page: Page) => card(page).getByTestId('account-total')
const still = async (page: Page, name: string) => {
  await card(page).scrollIntoViewIfNeeded()
  await page.waitForTimeout(700)
  await page.screenshot(shot(name))
}

/** The mock Trading 212 account, on Finances, not connected. */
async function fromFile(page: Page) {
  await start(page)
  await testClient().mutation(anyApi.e2eBank.t212, {})
  await page.goto('/finances')
  await expect(total(page)).toContainText('€3,120.30')
}

/** Connected through the window, then Trading 212's next answer set. */
async function connected(
  page: Page,
  as: 'traded' | 'many' | 'cash' | 'refused' | 'down',
) {
  await fromFile(page)
  await card(page).getByRole('button', { name: 'connect' }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByRole('button', { name: 'connect' }).click()
  await sheet.getByRole('button', { name: 'Done' }).click()
  await expect(card(page).getByText(/from Trading 212 · today/)).toBeVisible()
  await testClient().mutation(anyApi.e2eBank.answer, { as })
}

test('connect: three facts, one press, asking at once, connected, the card says from Trading 212', async ({
  page,
}) => {
  await fromFile(page)
  await still(page, 't212-from-file')
  await card(page).getByRole('button', { name: 'connect' }).click()
  const sheet = page.getByRole('dialog')
  await expect(
    sheet.getByText('The app only reads: the cash and the positions.'),
  ).toBeVisible()
  await expect(sheet.getByText('The key stays on the backend.')).toBeVisible()
  await expect(sheet.getByText('Asked when you open Finances.')).toBeVisible()
  await expect(sheet.getByText(/here now: €3,120\.30/)).toBeVisible()
  await page.screenshot(shot('t212-connect'))

  await sheet.getByRole('button', { name: 'connect' }).click()
  await expect(sheet.getByText('asking Trading 212…')).toBeVisible()
  await expect(sheet.getByText('Trading 212 is connected')).toBeVisible()
  await expect(sheet.getByText('3 the same')).toBeVisible()
  await page.waitForTimeout(700)
  await page.screenshot(shot('t212-connected'))
  await sheet.getByRole('button', { name: 'Done' }).click()
  await expect(sheet).toBeHidden()

  await expect(
    card(page).getByText(/from Trading 212 · today \d\d:\d\d/),
  ).toBeVisible()
  await expect(card(page).getByLabel('from Trading 212')).toHaveCount(2)
  await expect(card(page).getByTestId('t212-changed')).toHaveCount(0)
  await expect(card(page).getByRole('button', { name: 'update' })).toBeVisible()
  await expect(card(page).getByRole('button', { name: 'connect' })).toHaveCount(
    0,
  )
  await still(page, 't212-fresh')
})

test('bought and sold: saved with no press, the block says it in euros until closed', async ({
  page,
}) => {
  await connected(page, 'traded')
  await page.goto('/finances')
  const block = card(page).getByTestId('t212-changed')
  await expect(block.getByText('3 changed')).toBeVisible()
  await expect(block.getByText('as Trading 212 shows')).toBeVisible()
  await expect(block.getByText('8 → 10 shares')).toBeVisible()
  await expect(block.getByText('€1,200', { exact: true })).toBeVisible()
  await expect(block.getByText('€1,500', { exact: true })).toBeVisible()
  await expect(block.getByText('1 → 0 shares')).toBeVisible()
  await expect(block.getByText('€640', { exact: true })).toBeVisible()
  await expect(block.getByText('Free cash')).toBeVisible()
  await expect(block.getByText('€1,620.30')).toBeVisible()
  /* Nvidia and the cash went up, ASML down. */
  await expect(block.getByLabel('up', { exact: true })).toHaveCount(2)
  await expect(block.getByLabel('down', { exact: true })).toHaveCount(1)
  await expect(total(page)).toContainText('€3,120.30')
  await expect(card(page).getByTestId('account-invested')).toContainText(
    '€1,500',
  )
  await still(page, 't212-changed')

  /* It stays: opening Finances again asks nothing and shows the same. */
  await page.reload()
  await expect(block.getByText('3 changed')).toBeVisible()

  /* ✕: seen. It stays closed, and what was saved stays. */
  await block.getByRole('button', { name: 'close what changed' }).click()
  await expect(block).toHaveCount(0)
  await page.reload()
  await expect(total(page)).toContainText('€3,120.30')
  await expect(block).toHaveCount(0)
})

test('the key is not accepted: the card keeps its numbers and says of when; try again asks', async ({
  page,
}) => {
  await connected(page, 'refused')
  await page.goto('/finances')
  await expect(
    card(page).getByText('Trading 212 did not accept the key'),
  ).toBeVisible()
  await expect(card(page).getByText(/cash and positions of/)).toBeVisible()
  await expect(total(page)).toContainText('€3,120.30')
  await expect(card(page).getByTestId('t212-changed')).toHaveCount(0)
  await still(page, 't212-refused')

  await testClient().mutation(anyApi.e2eBank.answer, { as: 'traded' })
  await card(page).getByRole('button', { name: 'try again' }).click()
  await expect(
    card(page).getByTestId('t212-changed').getByText('3 changed'),
  ).toBeVisible()
  await expect(
    card(page).getByText('Trading 212 did not accept the key'),
  ).toHaveCount(0)
})

test('Trading 212 does not answer: said on the card, nothing changed', async ({
  page,
}) => {
  await connected(page, 'down')
  await page.goto('/finances')
  await expect(card(page).getByText('Trading 212 did not answer')).toBeVisible()
  await expect(
    card(page).getByRole('button', { name: 'try again' }),
  ).toBeVisible()
  await expect(total(page)).toContainText('€3,120.30')
  await still(page, 't212-down')
})

test('twenty changed, at phone width: three on the card, the rest in a window', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await connected(page, 'many')
  await page.goto('/finances')
  const block = card(page).getByTestId('t212-changed')
  await expect(block.getByText('20 changed')).toBeVisible()
  /* Shares no market prices: saved at Trading 212's own price, and said. */
  await expect(
    block.getByText('20 shares · price from Trading 212'),
  ).toBeVisible()
  await expect(block.getByText('€200', { exact: true })).toBeVisible()
  await still(page, 't212-many-phone')
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)

  await block.getByRole('button', { name: '17 more' }).click()
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByText('Company 1', { exact: true })).toBeVisible()
  await expect(sheet.getByText('Company 20')).toBeVisible()
  await page.waitForTimeout(500)
  await page.screenshot(shot('t212-many-open'))
})

test('cash only: investments are none held', async ({ page }) => {
  await connected(page, 'cash')
  await page.goto('/finances')
  await expect(total(page)).toContainText('€3,040.30')
  await expect(card(page).getByText('none held')).toBeVisible()
  await still(page, 't212-cash-only')
})
