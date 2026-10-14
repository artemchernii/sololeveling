import { expect, test } from '@playwright/test'
import { anyApi } from 'convex/server'

import { start, testClient } from './helpers'

const shot = (name: string) => ({ path: `e2e/screens/${name}.png` })

/* ADD BUYS on one position's page (14 Oct, mockup add-buys.html,
   docs/specs/2026-10-13-add-buys.md): gold held with no buy saved, and a
   screenshot of four of its buys already read. The window speaks of
   gold — its buys, their sum, the ounces they reach — not of Revolut.
   Mock data only. */
test('ADD BUYS: four buys read, some of what is held still missing, saved', async ({
  page,
}) => {
  await start(page)
  await testClient().mutation(anyApi.e2ePortfolio.goldBuys, {})
  await page.goto('/finances?room=portfolio')
  await page.getByRole('button', { name: 'Show amounts' }).first().click()
  await page
    .getByTestId('owned-row')
    .filter({ hasText: 'Gold' })
    .getByRole('link')
    .click()
  const position = page.getByTestId('position-page')
  /* No buy saved: the tile says so, in grey. */
  await expect(position.getByText('not in the files yet')).toBeVisible()
  await expect(position.getByTestId('buys-missing')).toHaveCount(0)

  await position.getByRole('button', { name: 'add buys' }).click()
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByText('add buys · Gold')).toBeVisible()
  const check = sheet.getByTestId('buys-check')
  await expect(check).toContainText('buys read')
  await expect(check).toContainText('all new')
  await expect(check).toContainText('€1,100')
  await expect(check).toContainText('0.286213 oz')
  await expect(check).toContainText('0.408365 oz')
  await expect(sheet.getByTestId('buys-row')).toHaveCount(4)
  await expect(sheet.getByTestId('buys-line')).toContainText(
    '0.122152 oz missing',
  )
  /* A month with no buy is not a statement missing. */
  await expect(sheet.getByText('A statement may be missing')).toHaveCount(0)
  await expect(sheet.getByText('4 buys')).toBeVisible()
  await page.screenshot({ ...shot('add-buys-check'), fullPage: true })

  /* Saved: said at once, then of gold — not "Revolut is up to date". */
  await sheet.getByRole('button', { name: /apply/ }).click()
  await expect(sheet.getByText(/saving/i).first()).toBeVisible()
  await expect(sheet.getByText('4 buys saved · Gold')).toBeVisible()
  await expect(sheet.getByText(/up to date/)).toHaveCount(0)
  /* Its icon, the sum, and the buys themselves — nothing to open. */
  await expect(sheet.getByText('4 buys added')).toBeVisible()
  await expect(sheet.getByText('€1,100')).toBeVisible()
  await expect(sheet.getByTestId('buys-row')).toHaveCount(4)
  await expect(sheet.getByRole('button', { name: 'rows' })).toHaveCount(0)
  await expect(sheet.getByTestId('buys-line')).toContainText(
    '0.122152 oz missing',
  )
  await page.waitForTimeout(700)
  await page.screenshot({ ...shot('add-buys-saved'), fullPage: true })
  await sheet.getByRole('button', { name: 'done' }).click()
  await expect(sheet).toBeHidden()

  /* The tile: the buys' sum, and what is still missing as a state. */
  /* PAID, the units the buys reach of what is held, the rest missing. */
  await expect(position.getByText('paid · 4 buy')).toBeVisible()
  const missing = position.getByTestId('buys-missing')
  await expect(missing).toContainText('0.286213 of 0.408365 oz')
  await expect(missing).toContainText('0.122152 oz missing')
  await expect(position.getByText('needs every buy')).toBeVisible()
  await expect(position.getByText('€1,100')).toBeVisible()
  await expect(position.getByText('buys and sells · 4')).toBeVisible()
  await page.screenshot({ ...shot('add-buys-page'), fullPage: true })

  /* The same screenshot again would add nothing: every row is saved. */
  await testClient().mutation(anyApi.e2ePortfolio.goldBuys, {})
  await position.getByRole('button', { name: 'add buys' }).click()
  await expect(sheet.getByTestId('buys-check')).toContainText('4 already saved')
})

/* 14 Oct, his drop: two screenshots of iShares Physical Gold from
   Trading 212 on Gold's ADD BUYS. They are named, with where they
   belong; nothing is saved until they are removed. Mock data only. */
test('ADD BUYS: files for another thing are named and never saved here', async ({
  page,
}) => {
  await start(page)
  await testClient().mutation(anyApi.e2ePortfolio.goldBuys, { fund: true })
  await page.goto('/finances?room=portfolio')
  await page.getByRole('button', { name: 'Show amounts' }).first().click()
  await page
    .getByTestId('owned-row')
    .filter({ hasText: 'Gold' })
    .getByRole('link')
    .click()
  const position = page.getByTestId('position-page')
  await position.getByRole('button', { name: 'add buys' }).click()
  const sheet = page.getByRole('dialog')

  /* Not asked which account: the files are not saved here at all. */
  const others = sheet.getByTestId('buys-other-file')
  await expect(others).toHaveCount(2)
  await expect(sheet.getByTestId('buys-elsewhere')).toContainText(
    'not Gold · not saved here',
  )
  await expect(others.first()).toContainText('3 rows · iShares Physical Gold')
  await expect(sheet.getByTestId('buys-elsewhere')).toContainText(
    'belongs on its own page · Trading 212',
  )
  await expect(sheet.getByRole('button', { name: /apply/ })).toBeHidden()
  await expect(sheet.getByTestId('buys-row')).toHaveCount(4)
  await page.screenshot({ ...shot('add-buys-elsewhere'), fullPage: true })

  /* Removed: said at once, gone, and APPLY is back — Gold's alone. */
  await others.first().getByRole('button', { name: 'remove' }).click()
  await expect(others).toHaveCount(1)
  await others.first().getByRole('button', { name: 'remove' }).click()
  await expect(sheet.getByTestId('buys-elsewhere')).toHaveCount(0)
  await sheet.getByRole('button', { name: /apply/ }).click()
  await expect(sheet.getByText('4 buys saved · Gold')).toBeVisible()
  await page.screenshot({ ...shot('add-buys-elsewhere-saved'), fullPage: true })
})
