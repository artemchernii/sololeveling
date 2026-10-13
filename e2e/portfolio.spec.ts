import { expect, test } from '@playwright/test'
import { anyApi } from 'convex/server'

import { start, testClient } from './helpers'

const shot = (name: string) => ({ path: `e2e/screens/${name}.png` })

/* Portfolio says where positions come from when it is empty, and shows
   everything owned in one list once a holdings screenshot is saved
   (5 Oct; the one list, 12 Oct). */
test('Portfolio: empty, then the positions a screenshot brought', async ({
  page,
}) => {
  await start(page)
  await page.goto('/finances?room=portfolio')
  await expect(page.getByText('Nothing owned yet')).toBeVisible()
  await page.screenshot(shot('portfolio-empty'))

  await testClient().mutation(anyApi.e2e.readHoldings, {})
  await page.goto('/finances')
  await page.getByRole('button', { name: 'add', exact: true }).first().click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'positions', exact: true })
    .click()
  const sheet = page.getByRole('dialog')
  await sheet
    .getByRole('button', { name: 'save 2 positions and the broker cash' })
    .click()
  await sheet.getByRole('link', { name: /Portfolio/ }).click()

  await expect(page).toHaveURL(/room=portfolio/)
  await expect(page.getByText('Nothing owned yet')).toHaveCount(0)
  await expect(page.getByText('worth now')).toBeVisible()
  await expect(page.getByText('2 positions')).toBeVisible()
  /* "put in" was meaningless (10 Oct): gone. */
  await expect(page.getByText(/put in/)).toHaveCount(0)
  for (const name of ['Apple', 'Microsoft'])
    await expect(page.getByText(name).first()).toBeVisible()
  /* The ADD window is still over the room: open the room afresh. */
  await page.goto('/finances?room=portfolio')
  await expect(page.getByText('everything owned · 2')).toBeVisible()
  await page.waitForTimeout(800)
  await page.screenshot({ ...shot('portfolio-held'), fullPage: true })

  /* One row a thing, biggest first (amounts stay veiled until "show"),
     and the order can be turned. */
  const rows = page.getByTestId('owned-row')
  await expect(rows).toHaveCount(2)
  await expect(rows.first()).toContainText('Apple')
  await expect(rows.first()).toContainText('2 shares')
  await expect(rows.first()).toContainText('Revolut')
  const upMost = page.getByRole('button', { name: 'up most' })
  await upMost.click()
  await expect(upMost).toHaveAttribute('aria-pressed', 'true')

  /* A kind in the split's legend filters the list; again clears it. */
  const stocks = page.getByRole('button', { name: /^stocks/ })
  await stocks.click()
  await expect(stocks).toHaveAttribute('aria-pressed', 'true')
  await expect(rows).toHaveCount(2)
  await stocks.click()
  await expect(stocks).toHaveAttribute('aria-pressed', 'false')

  /* A row opens the position's own page, with its own address. */
  await rows.first().getByRole('link').click()
  await expect(page).toHaveURL(/position=/)
  const position = page.getByTestId('position-page')
  await expect(
    position.getByRole('heading', { name: 'Apple Inc.' }),
  ).toBeVisible()
  for (const label of ['worth now', 'bought for', 'account', 'price'])
    await expect(position.getByText(label, { exact: true })).toBeVisible()
  await expect(page.getByText('everything owned · 2')).toHaveCount(0)
  await page.waitForTimeout(800)
  await page.screenshot({ ...shot('portfolio-position'), fullPage: true })

  /* The address alone opens it; back is the list again. */
  await page.reload()
  await expect(
    position.getByRole('heading', { name: 'Apple Inc.' }),
  ).toBeVisible()
  await position.getByRole('link', { name: 'Portfolio' }).click()
  await expect(page.getByText('everything owned · 2')).toBeVisible()
  await expect(page).not.toHaveURL(/position=/)

  /* An address for something not owned says so, with the way back. */
  await page.goto('/finances?room=portfolio&position=nothing')
  await expect(page.getByText('Not owned now')).toBeVisible()
  await position.getByRole('link', { name: 'Portfolio' }).click()
  await expect(rows).toHaveCount(2)

  /* What was sold out is folded under what is owned, until asked for. */
  await testClient().mutation(anyApi.e2ePortfolio.soldOut, {})
  const fold = page.getByRole('button', { name: 'sold · 1' })
  await expect(fold).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByTestId('sold-row')).toHaveCount(0)
  await fold.click()
  await expect(fold).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByTestId('sold-row')).toContainText('Shopify Inc.')
  await expect(rows).toHaveCount(2)
  await page.waitForTimeout(600)
  await page.screenshot({ ...shot('portfolio-held-sold'), fullPage: true })

  /* A phone: nothing runs off the side. */
  await page.setViewportSize({ width: 375, height: 812 })
  await expect(rows.first()).toContainText('Apple')
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({ ...shot('portfolio-phone'), fullPage: true })
  await rows.first().getByRole('link').click()
  await expect(
    position.getByRole('heading', { name: 'Apple Inc.' }),
  ).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({ ...shot('portfolio-position-phone'), fullPage: true })
})

/* What was sold out has its rows and a page, with nothing owned (13 Oct). */
test('Portfolio: a thing sold out has its row and its page', async ({
  page,
}) => {
  await start(page)
  await page.goto('/finances?room=portfolio')
  await expect(page.getByText('Nothing owned yet')).toBeVisible()
  await expect(page.getByRole('button', { name: /^sold/ })).toHaveCount(0)

  await testClient().mutation(anyApi.e2ePortfolio.soldOut, {})
  /* Nothing is owned, so the sold rows are the list: no fold to open. */
  await expect(page.getByText('sold · 1')).toBeVisible()
  const rows = page.getByTestId('sold-row')
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText('Shopify Inc.')
  await expect(rows.first()).toContainText(/SHOP · all sold .+ \d{4}/)
  await expect(rows.first()).toContainText('sold for')
  await expect(rows.first()).toContainText('bought for')
  await expect(page.getByTestId('owned-row')).toHaveCount(0)
  await page.waitForTimeout(600)
  await page.screenshot({ ...shot('portfolio-sold'), fullPage: true })

  await rows.first().getByRole('link').click()
  await expect(page).toHaveURL(/position=/)
  const position = page.getByTestId('position-page')
  await expect(
    position.getByRole('heading', { name: 'Shopify Inc.' }),
  ).toBeVisible()
  await expect(position.getByText(/^all sold .+ \d{4}$/)).toBeVisible()
  for (const label of ['worth now', 'bought for', 'sold for', 'up when sold'])
    await expect(position.getByText(label, { exact: true })).toBeVisible()
  await expect(position.getByText('bought and sold · 3')).toBeVisible()
  await page.waitForTimeout(800)
  await page.screenshot({ ...shot('portfolio-sold-position'), fullPage: true })

  /* Its address alone opens it. */
  await page.reload()
  await expect(
    position.getByRole('heading', { name: 'Shopify Inc.' }),
  ).toBeVisible()

  /* A phone: nothing runs off the side. */
  await page.setViewportSize({ width: 375, height: 812 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    ...shot('portfolio-sold-position-phone'),
    fullPage: true,
  })
})
