import { expect, test } from '@playwright/test'
import { anyApi } from 'convex/server'

import { start, testClient } from './helpers'

const shot = (name: string) => ({ path: `e2e/screens/${name}.png` })

/* The positions screen for a screenshot that does not reach its total
   (11 Oct): the two numbers, and the buttons say what they do. */
test('the positions screen: it does not add up, "save anyway" answers and lands', async ({
  page,
}) => {
  await start(page)
  await testClient().mutation(anyApi.e2eHoldingsTotal.cutScreen, {})
  await page.goto('/finances')
  await page.getByRole('button', { name: 'Show amounts' }).first().click()
  /* Opened the way he does (12 Oct): ADD, then the account's positions. */
  await page.getByRole('button', { name: 'add', exact: true }).first().click()
  const sheet = page.getByRole('dialog')
  await sheet.getByRole('button', { name: /^(check )?positions$/ }).click()
  const box = sheet.getByTestId('total-differs')
  await expect(
    box.getByText(
      'Revolut: €900 in the positions and broker cash, €1,312.30 total on the screenshot.',
    ),
  ).toBeVisible()
  await expect(
    sheet.getByRole('button', { name: 'do not save Revolut' }),
  ).toBeVisible()
  await page.waitForTimeout(700)
  await page.screenshot({ ...shot('holdings-total-screen'), fullPage: true })
  await sheet.getByRole('button', { name: 'save Revolut anyway' }).click()
  await expect(sheet.getByText(/saving|Portfolio/).first()).toBeVisible()
  await expect(sheet.getByRole('link', { name: /Portfolio/ })).toBeVisible()
  await page.waitForTimeout(1200)
  await page.screenshot(shot('holdings-total-screen-landed'))
})
