import { expect, test } from '@playwright/test'

import { start } from './helpers'

const shot = (name: string) => ({ path: `e2e/screens/${name}.png` })

/* Safety net for Flow (5 Oct): the room opens on its three tabs, the
   month's rows are there, and a bill typed in one line answers at once,
   lands, and closes. */

test('Flow: nothing coming yet, then the month row by row', async ({
  page,
}) => {
  await start(page)
  await page.goto('/finances?room=flow')
  const flow = page.getByRole('navigation', { name: 'Flow' })
  await expect(
    flow.getByRole('button', { name: /Future balance/ }),
  ).toHaveAttribute('aria-current', 'page')
  await expect(page.getByText('Nothing coming yet')).toBeVisible()
  await page.screenshot(shot('flow-ahead-empty'))

  await flow.getByRole('button', { name: /Movements/ }).click()
  for (const name of ['Guacamole', 'Bolt', 'Continente'])
    await expect(page.getByText(name).first()).toBeVisible()
  await page.screenshot(shot('flow-movements'))

  /* The legend draws the strip's own marks, each with a short word. */
  const legend = page.getByTestId('movements-legend')
  for (const [mark, word] of [
    ['out', 'out'],
    ['in', 'in'],
    ['bill', "a bill's day"],
    ['to-come', 'a bill to come'],
    ['quiet', 'nothing moved'],
  ]) {
    const key = legend.locator(`[data-mark="${mark}"]`)
    await expect(key).toHaveText(word)
    await expect(key.locator('i')).toBeVisible()
  }
  await expect(legend.getByText(/red:|green:/)).toHaveCount(0)

  /* A day nothing moved says so in a colour of its own, not label grey. */
  const days = page.getByRole('list', { name: 'Days' })
  /* Such a day draws a grey dash, never a small red bar. */
  const quietDay = days.getByRole('listitem').nth(9)
  await expect(quietDay.locator('[data-quiet]')).toHaveCount(1)
  await expect(quietDay.locator('.bg-state-danger\\/60')).toHaveCount(0)
  await quietDay.hover()
  const quiet = page.getByTestId('day-quiet')
  await expect(quiet).toHaveText('nothing moved')
  await expect(quiet).toHaveClass(/text-state-warn/)
  await page.screenshot(shot('flow-movements-quiet-day'))
  /* A day still to come is the app's lavender. */
  const toCome = days.locator('button[disabled]')
  /* On a month's last day there is none. */
  if ((await toCome.count()) > 0) {
    await toCome.last().hover({ force: true })
    await expect(quiet).toHaveText('still to come')
    await expect(quiet).toHaveClass(/text-lav-300/)
  }
})

test('Flow: a bill in one line — adding, done, closed, on the list', async ({
  page,
}) => {
  await start(page)
  await page.goto('/finances?room=flow')
  await page.getByRole('button', { name: /a bill from statements/ }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByLabel('A bill in one line').fill('Holmes Place 49 monthly 1')
  await sheet.getByRole('button', { name: 'Revolut' }).click()
  await page.screenshot(shot('bill-typed'))
  await sheet.getByRole('button', { name: 'add', exact: true }).click()
  await expect(sheet.getByText('adding')).toBeVisible()
  await expect(sheet).toHaveCount(0, { timeout: 5_000 })
  await expect(page.getByText(/Holmes Place — /)).toBeVisible()
  await page.waitForTimeout(600)
  await page.screenshot(shot('bill-landed'))
  await expect(page.getByText('Nothing coming yet')).toHaveCount(0)
})

/* 11 Oct: one shortfall was tagged on every later bill of the account
   ("this wording is killing me"). The first says how much to add and by
   when; a later month says it once. */
test('Flow: a bill the account cannot cover says how much to add, once', async ({
  page,
}) => {
  await start(page)
  await page.goto('/finances?room=flow')
  await page.getByRole('button', { name: /a bill from statements/ }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByLabel('A bill in one line').fill('Landlord 90000 monthly 1')
  await sheet.getByRole('button', { name: 'Revolut' }).click()
  await sheet.getByRole('button', { name: 'add', exact: true }).click()
  await expect(sheet).toHaveCount(0, { timeout: 5_000 })

  await expect(page.getByText(/not enough funds in 1 account/)).toHaveCount(2)
  await expect(page.getByText(/not enough funds · .* missing/)).toHaveCount(1)
  await expect(
    page.getByText(/Revolut (has|is at) .*, add .* before 1 /),
  ).toHaveCount(1)
  await expect(page.getByText(/^add .* to Revolut$/)).toHaveCount(2)
  await expect(page.getByText('the usual month — nothing new')).toHaveCount(0)
  await expect(
    page.getByText(/not enough on the day|already at|not covered/),
  ).toHaveCount(0)
  await page.getByRole('button', { name: 'Show amounts' }).click()
  await page
    .getByText(/^add .* to Revolut$/)
    .first()
    .scrollIntoViewIfNeeded()
  await page.waitForTimeout(600)
  await page.screenshot(shot('flow-short-once'))
})
