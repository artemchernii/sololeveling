import { expect, test } from '@playwright/test'
import { anyApi } from 'convex/server'

import { start, testClient } from './helpers'
import type { Page } from '@playwright/test'

const shot = (name: string) => ({ path: `e2e/screens/${name}.png` })

/* Broker cash (10 Oct): Revolut is a bank and a broker, so its card has
   two cash lines. The Invest screenshot's cash goes to the broker's, and
   the bank's euros stay as they were. Mock data, a canned reading. */

const card = (page: Page, name: string) =>
  page.getByRole('button', { name: `Open ${name}` })

/** "€1,234.56" anywhere in a line, as a number. */
const amount = (text: string | null) =>
  Number((text ?? '').match(/€([\d,]+(?:\.\d+)?)/)?.[1].replace(/,/g, ''))

async function openCheck(page: Page) {
  await testClient().mutation(anyApi.e2e.readHoldings, {})
  await page.goto('/finances')
  await page.getByText('Revolut Invest screenshot').first().click()
  return page.getByRole('dialog')
}

test('S2 never read: the card says so, and adds nothing for it', async ({
  page,
}) => {
  await start(page)
  await page.goto('/finances')
  const revolut = card(page, 'Revolut')
  await expect(revolut.getByTestId('broker-cash')).toHaveText(
    /broker cash\s*never read/,
  )
  /* €1,200 and $40 at 0.86: the bank's alone. */
  await expect(revolut.getByTestId('account-total')).toHaveText('€1,234.40')
  await expect(card(page, 'ActivoBank').getByTestId('broker-cash')).toHaveCount(
    0,
  )
  await page.screenshot({ ...shot('broker-cash-never'), fullPage: true })
})

test('S1 Invest screenshot into Revolut: broker cash lands beside the free cash', async ({
  page,
}) => {
  await start(page)
  const sheet = await openCheck(page)
  await expect(sheet.getByText('broker cash', { exact: true })).toBeVisible()
  await expect(
    sheet.getByText(
      'Goes to broker cash. Your free cash at Revolut stays €1,234.40.',
    ),
  ).toBeVisible()
  const save = sheet.getByRole('button', {
    name: 'save 2 positions and the broker cash',
  })
  await expect(save).toBeEnabled()
  await page.screenshot({ ...shot('broker-cash-check'), fullPage: true })

  /* A slow save shows it is saving, at once. */
  await page.context().setOffline(true)
  await save.click()
  await expect(sheet.getByText('saving')).toBeVisible()
  await page.context().setOffline(false)
  await expect(sheet.getByRole('link', { name: /Portfolio/ })).toBeVisible()
  await page.screenshot(shot('broker-cash-landed'))
  await sheet
    .getByRole('button', { name: /done|close/i })
    .first()
    .click()
  await expect(sheet).toBeHidden()

  const revolut = card(page, 'Revolut')
  await expect(revolut.getByTestId('broker-cash')).toHaveText(
    /broker cash\s*€120/,
  )
  await expect(revolut.getByText(/free cash\s*EUR\s*€1,200/)).toBeVisible()
  await expect(revolut.getByTestId('cash-bar')).toBeVisible()
  /* The total is the three added: free cash, broker cash, investments. */
  const invested = amount(
    await revolut.getByTestId('account-invested').textContent(),
  )
  expect(invested).toBeGreaterThan(0)
  const total = amount(await revolut.getByTestId('account-total').textContent())
  expect(total).toBeCloseTo(1234.4 + 120 + invested, 2)
  await page.screenshot({ ...shot('broker-cash-card'), fullPage: true })
})

test('S3 the same screenshot into a broker that is only a broker: its free cash, as before', async ({
  page,
}) => {
  await start(page)
  await testClient().mutation(anyApi.e2e.addBroker, {})
  const sheet = await openCheck(page)
  await sheet.getByRole('button', { name: 'Trade Republic' }).click()
  await expect(sheet.getByText('broker cash')).toHaveCount(0)
  await expect(sheet.getByText(/stays €/)).toHaveCount(0)
  await sheet
    .getByRole('button', { name: 'save 2 positions and the cash' })
    .click()
  await expect(sheet.getByRole('link', { name: /Portfolio/ })).toBeVisible()
  await sheet
    .getByRole('button', { name: /done|close/i })
    .first()
    .click()
  const tr = card(page, 'Trade Republic')
  await expect(tr.getByText(/free cash\s*EUR\s*€120/)).toBeVisible()
  await expect(tr.getByTestId('broker-cash')).toHaveCount(0)
  await expect(card(page, 'Revolut').getByTestId('broker-cash')).toHaveText(
    /never read/,
  )
})

test('S4 a failed save says so and writes nothing', async ({ page }) => {
  await start(page)
  const sheet = await openCheck(page)
  await sheet.getByRole('button', { name: /€120/ }).click()
  await sheet.getByLabel('Broker cash in the account').fill('99999999999')
  await sheet.getByRole('button', { name: /^save 2 positions/ }).click()
  await expect(sheet.getByText('That is not an amount.')).toBeVisible()
  await expect(sheet.getByRole('button', { name: /^save 2/ })).toBeEnabled()
  await page.screenshot(shot('broker-cash-failed'))
  await page.keyboard.press('Escape')
  await page.goto('/finances')
  await expect(card(page, 'Revolut').getByTestId('broker-cash')).toHaveText(
    /never read/,
  )
})

test('S5 phone width and light theme: the lines keep their height', async ({
  page,
}) => {
  await start(page)
  await page.goto('/finances')
  const line = card(page, 'Revolut').getByTestId('broker-cash')
  await expect(line).toBeVisible()
  const never = (await line.boundingBox())?.height
  const sheet = await openCheck(page)
  await sheet
    .getByRole('button', { name: 'save 2 positions and the broker cash' })
    .click()
  await expect(sheet.getByRole('link', { name: /Portfolio/ })).toBeVisible()
  await sheet
    .getByRole('button', { name: /done|close/i })
    .first()
    .click()
  await expect(line).toHaveText(/€120/)
  expect((await line.boundingBox())?.height).toBe(never)

  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ colorScheme: 'light' })
  await page.reload()
  await expect(line).toHaveText(/€120/)
  expect((await line.boundingBox())?.height).toBe(never)
  const box = await card(page, 'Revolut').boundingBox()
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(390)
  await card(page, 'Revolut').scrollIntoViewIfNeeded()
  await page.screenshot(shot('broker-cash-phone-light'))
})
