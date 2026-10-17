import { expect, test } from '@playwright/test'
import { anyApi } from 'convex/server'

import { start, testClient } from './helpers'

const shot = (name: string) => ({ path: `e2e/screens/${name}.png` })

/* Find and sort on the Portfolio list (17 Oct, mockup find.html): a
   field by name or ticker over the rows already loaded, sold ones too,
   and A–Z beside the built sorts, kept on this device. Eight mock
   positions and a sold Shopify. Mock data only. */
test('Portfolio: find by name or ticker, sort A–Z', async ({ page }) => {
  await start(page)
  await testClient().mutation(anyApi.e2eFind.manyHeld, {})
  await testClient().mutation(anyApi.e2ePortfolio.soldOut, {})
  await page.goto('/finances?room=portfolio')
  await page.evaluate(() => localStorage.removeItem('portfolio-sort'))
  await page.reload()

  const rows = page.getByTestId('owned-row')
  const sold = page.getByTestId('sold-row')
  const field = page.getByRole('searchbox', { name: 'name or ticker' })
  await expect(rows).toHaveCount(8)
  await expect(page.getByText('everything owned · 8')).toBeVisible()

  /* S1 part of a name: only the rows that match, n of m. */
  await field.fill('nv')
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0)).toContainText('NVIDIA')
  await expect(rows.nth(1)).toContainText('Novo Nordisk')
  await expect(page.getByText('everything owned · 2 of 8')).toBeVisible()
  await page.waitForTimeout(500)
  await page.screenshot({ ...shot('portfolio-find'), fullPage: true })

  /* S4 nothing matches: 0 FOUND, CLEAR brings every row back. */
  await field.fill('oracle')
  await expect(rows).toHaveCount(0)
  await expect(page.getByText('0 found', { exact: true })).toBeVisible()
  await page.screenshot(shot('portfolio-find-none'))
  await page.getByRole('button', { name: 'clear', exact: true }).click()
  await expect(field).toHaveValue('')
  await expect(rows).toHaveCount(8)

  /* S3 a sold thing's name: the sold fold opens with it alone. */
  await field.fill('shop')
  await expect(rows).toHaveCount(0)
  await expect(page.getByText('0 found', { exact: true })).toHaveCount(0)
  await expect(sold).toHaveCount(1)
  await expect(sold.first()).toContainText('Shopify')
  await expect(page.getByRole('button', { name: /sold · 1/ })).toBeVisible()

  /* Esc clears; "/" jumps to the field. */
  await field.press('Escape')
  await expect(field).toHaveValue('')
  await page.locator('body').click({ position: { x: 5, y: 5 } })
  await page.keyboard.press('/')
  await expect(field).toBeFocused()

  /* S5 A–Z: rows by name, and still A–Z after a reload. */
  const az = page.getByRole('button', { name: 'a–z', exact: true })
  await az.click()
  await expect(az).toHaveAttribute('aria-pressed', 'true')
  await expect(rows.first()).toContainText('Amazon')
  await expect(rows.last()).toContainText('Visa')
  await page.reload()
  await expect(az).toHaveAttribute('aria-pressed', 'true')
  await expect(rows.first()).toContainText('Amazon')
  await page.getByRole('button', { name: 'biggest', exact: true }).click()
  await expect(rows.first()).toContainText('ASML')

  /* S2 a ticker: that row; pressing it opens its page. */
  await field.fill('pltr')
  await expect(rows).toHaveCount(1)
  await rows.first().getByRole('link').click()
  await expect(page).toHaveURL(/position=/)
  await expect(
    page
      .getByTestId('position-page')
      .getByRole('heading', { name: 'Palantir' }),
  ).toBeVisible()
})

/* S6 a short list has no field; S7 on a phone the field fits. */
test('Portfolio: no field for a short list, and the field on a phone', async ({
  page,
}) => {
  await start(page)
  await testClient().mutation(anyApi.e2e.readHoldings, {})
  await page.goto('/finances')
  await page.getByRole('button', { name: 'add', exact: true }).first().click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'positions', exact: true })
    .click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'save 2 positions and the broker cash' })
    .click()
  await page.goto('/finances?room=portfolio')
  await expect(page.getByTestId('owned-row')).toHaveCount(2)
  await expect(page.getByRole('searchbox')).toHaveCount(0)

  await testClient().mutation(anyApi.e2eFind.manyHeld, {})
  await page.setViewportSize({ width: 375, height: 812 })
  const field = page.getByRole('searchbox', { name: 'name or ticker' })
  await expect(field).toBeVisible()
  await field.fill('tesla')
  await expect(page.getByTestId('owned-row')).toHaveCount(1)
  const wide = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  )
  expect(wide).toBeLessThanOrEqual(0)
  await field.evaluate((el) => el.scrollIntoView({ block: 'start' }))
  await page.mouse.wheel(0, -90)
  await page.waitForTimeout(500)
  await page.screenshot(shot('portfolio-find-phone'))

  /* The light theme: the field and the lit letters still read. */
  await page.emulateMedia({ colorScheme: 'light' })
  await page.waitForTimeout(500)
  await page.screenshot(shot('portfolio-find-phone-light'))
})
