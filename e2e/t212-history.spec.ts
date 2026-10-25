import { expect, test } from '@playwright/test'
import { anyApi } from 'convex/server'
import type { Page } from '@playwright/test'

import { start, testClient } from './helpers'

const shot = (name: string) => ({ path: `e2e/screens/${name}.png` })

/* Trading 212's history (docs/specs/2026-10-18-t212-history.md, mockup
   t212-history.html). The account is the mock one of e2eBank.t212,
   connected; Trading 212 is the canned one of convex/t212Api.ts, and
   e2eBank.answer says what it answers next — its last answer made hours
   old, so opening Finances asks again. */

type Word = 'traded' | 'paid' | 'deposit' | 'early' | 'first'

const card = (page: Page) =>
  page.getByRole('button', { name: 'Open Trading 212' })
const block = (page: Page) => card(page).getByTestId('t212-came')
const lines = (page: Page) => block(page).getByTestId('t212-came-line')
const still = async (page: Page, name: string) => {
  await card(page).scrollIntoViewIfNeeded()
  await page.waitForTimeout(700)
  await page.screenshot(shot(name))
}

async function answered(page: Page, as: Word) {
  await start(page)
  await testClient().mutation(anyApi.e2eBank.t212, {})
  await page.goto('/finances')
  await card(page).getByRole('button', { name: 'connect' }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByRole('button', { name: 'connect' }).click()
  await sheet.getByRole('button', { name: 'Done' }).click()
  await expect(card(page).getByText(/from Trading 212 · today/)).toBeVisible()
  await testClient().mutation(anyApi.e2eBank.answer, { as })
  await page.goto('/finances')
}

test('a buy and a sell arrive with no file: their badges on the card, the month says BUY and SELL', async ({
  page,
}) => {
  await answered(page, 'traded')
  await expect(block(page).getByText('2 new')).toBeVisible()
  await expect(block(page).getByText('as Trading 212 shows')).toBeVisible()
  await expect(lines(page)).toHaveCount(2)
  await expect(lines(page).nth(0)).toContainText('buy')
  await expect(lines(page).nth(0)).toContainText('2 shares · €150')
  await expect(lines(page).nth(0)).toContainText('−€300')
  await expect(lines(page).nth(1)).toContainText('sell')
  await expect(lines(page).nth(1)).toContainText('+€640')
  /* Rows say it: the shares block does not show. */
  await expect(card(page).getByTestId('t212-changed')).toHaveCount(0)
  const month = card(page).getByTestId('month-trades')
  await expect(month).toContainText('buy€300')
  await expect(month).toContainText('sell€640')
  await still(page, 't212-history-traded')

  /* ✕: seen, and it stays closed; what was saved stays. */
  await block(page).getByRole('button', { name: 'close what came' }).click()
  await expect(block(page)).toHaveCount(0)
  await page.reload()
  await expect(month).toContainText('buy€300')
  await expect(block(page)).toHaveCount(0)
})

test('a dividend, interest and a fee: money in green, money out plain', async ({
  page,
}) => {
  await answered(page, 'paid')
  await expect(block(page).getByText('3 new')).toBeVisible()
  await expect(lines(page).nth(0)).toContainText('dividend')
  await expect(lines(page).nth(0)).toContainText('1 share · €1.38 each')
  await expect(lines(page).nth(0)).toContainText('+€1.38')
  await expect(lines(page).nth(1)).toContainText('interest')
  await expect(lines(page).nth(1)).toContainText('free cash')
  await expect(lines(page).nth(2)).toContainText('fee')
  await expect(lines(page).nth(2)).toContainText('−€0.45')
  await still(page, 't212-history-paid')
})

test('a deposit from Revolut: one transfer, saved in Revolut too', async ({
  page,
}) => {
  await answered(page, 'deposit')
  await expect(block(page).getByText('1 new')).toBeVisible()
  await expect(lines(page).nth(0)).toContainText('transfer')
  await expect(lines(page).nth(0)).toContainText('Revolut')
  await expect(lines(page).nth(0)).toContainText(/saved in Revolut · /)
  await expect(lines(page).nth(0)).toContainText('+€500')
  await still(page, 't212-history-deposit')
})

test('a deposit no bank has a row for: not saved in a bank', async ({
  page,
}) => {
  await answered(page, 'early')
  await expect(lines(page).nth(0)).toContainText('Deposit')
  await expect(lines(page).nth(0)).toContainText('not saved in a bank')
  await still(page, 't212-history-early')
})

test('the first answer after a file, at phone width: five new, one already added, the rest one press away', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await answered(page, 'first')
  await expect(block(page).getByText('5 new')).toBeVisible()
  await expect(block(page).getByText('1 already added')).toBeVisible()
  await expect(lines(page)).toHaveCount(3)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  await still(page, 't212-history-first-phone')
  await block(page).getByRole('button', { name: '2 more' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
})

/* The opened account (S10): each Trading 212 row as the card shows it. */
const opened = async (page: Page) => {
  await expect(block(page)).toBeVisible()
  await card(page).click({ position: { x: 24, y: 90 } })
  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()
  return sheet.getByTestId('sheet-line')
}

test('the opened account: dividend, interest and fee with their badges, none typed or deletable', async ({
  page,
}) => {
  await answered(page, 'paid')
  const rows = await opened(page)
  await expect(rows).toHaveCount(3)
  await expect(rows.nth(0)).toContainText('dividend')
  await expect(rows.nth(0)).toContainText('ASML')
  await expect(rows.nth(0)).toContainText('1 share · €1.38 each')
  await expect(rows.nth(0)).toContainText('+€1.38')
  await expect(rows.nth(1)).toContainText('interest')
  await expect(rows.nth(1)).toContainText('free cash')
  await expect(rows.nth(1)).toContainText('+€2.04')
  await expect(rows.nth(2)).toContainText('fee')
  await expect(rows.nth(2)).toContainText('−€0.45')
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByText('typed', { exact: true })).toHaveCount(0)
  await expect(sheet.getByRole('button', { name: 'delete' })).toHaveCount(0)
  await page.waitForTimeout(600)
  await page.screenshot(shot('t212-sheet-paid'))
})

/* 25 Oct: trades as the card shows them, not `NVDA · 2 sh`. */
test('the opened account: a buy and a sell with their badges and companies', async ({
  page,
}) => {
  await answered(page, 'traded')
  const rows = await opened(page)
  const buy = rows.filter({ hasText: 'buy' }).first()
  await expect(buy).toContainText('Nvidia')
  await expect(buy).toContainText('2 shares · €150')
  await expect(buy).toContainText('−€300')
  const sell = rows.filter({ hasText: 'sell' }).first()
  await expect(sell).toContainText('+€640')
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByText(/ sh$/)).toHaveCount(0)
  await page.waitForTimeout(600)
  await page.screenshot(shot('t212-sheet-traded'))
})

test('the opened account: a deposit saved in Revolut', async ({ page }) => {
  await answered(page, 'deposit')
  const rows = await opened(page)
  await expect(rows.nth(0)).toContainText('transfer')
  await expect(rows.nth(0)).toContainText(/saved in Revolut · /)
  await expect(rows.nth(0)).toContainText('+€500')
  await page.waitForTimeout(600)
  await page.screenshot(shot('t212-sheet-deposit'))
})

test('the opened account at phone width: a deposit no bank has', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await answered(page, 'early')
  const rows = await opened(page)
  await expect(rows.nth(0)).toContainText('transfer')
  await expect(rows.nth(0)).toContainText('not saved in a bank')
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  await page.waitForTimeout(600)
  await page.screenshot(shot('t212-sheet-early-phone'))
})
