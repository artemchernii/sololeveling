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
})

test('Flow: a bill in one line — adding, done, closed, on the list', async ({
  page,
}) => {
  await start(page)
  await page.goto('/finances?room=flow')
  await page
    .getByRole('button', { name: /a bill from your statements/ })
    .click()
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
