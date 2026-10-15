import { expect, test } from '@playwright/test'
import { anyApi } from 'convex/server'

import { showTrades, start, testClient } from './helpers'

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
  await expect(sheet.getByTestId('buys-line')).not.toContainText('add older')
  /* A month with no buy is not a statement missing. */
  await expect(sheet.getByText('A statement may be missing')).toHaveCount(0)
  await expect(sheet.getByText('4 buys')).toBeVisible()
  await page.screenshot({ ...shot('add-buys-check'), fullPage: true })

  /* Saved: said at once, then of gold — not "Revolut is up to date". */
  await sheet.getByRole('button', { name: /apply/ }).click()
  await expect(sheet.getByText(/saving/i).first()).toBeVisible()
  /* Counts as badges (14 Oct: "0 NEW · 9 SAVED BEFORE"). */
  const counts = sheet.getByTestId('buys-counts')
  await expect(counts).toContainText('4 new')
  await expect(counts).not.toContainText('saved before')
  await expect(sheet.getByText(/up to date/)).toHaveCount(0)
  /* Its icon, PAID with its round, and the buys themselves. */
  const card = sheet.getByTestId('buys-saved-card')
  await expect(card).toContainText('€1,100')
  await expect(card).toContainText('paid · 4 buy')
  await expect(card).toContainText('since')
  await expect(sheet.getByTestId('trade-row')).toHaveCount(4)
  await expect(sheet.getByRole('button', { name: 'rows' })).toHaveCount(0)
  /* One line: held · in the buys · missing. */
  const line = sheet.getByTestId('buys-line')
  await expect(line).toContainText('0.408365 oz')
  await expect(line).toContainText('0.286213 oz in the buys')
  await expect(line).toContainText('0.122152 oz missing')
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
  await expect(position.getByText('€1,100', { exact: true })).toBeVisible()
  await showTrades(position)
  await expect(position.getByTestId('round-now')).toContainText(
    '4 buy · €1,100',
  )
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
  await expect(sheet.getByTestId('buys-counts')).toContainText('4 new')
  await page.screenshot({ ...shot('add-buys-elsewhere-saved'), fullPage: true })
})

/* 14 Oct, his save: the buys were read right and written under another
   thing. The saved screen counts where this save's buys sit, so it
   turns from saved to a warning naming that thing, and REMOVE takes the
   save back. Mock data only. */
test('ADD BUYS: buys saved on another thing are named, never said saved', async ({
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
  await position.getByRole('button', { name: 'add buys' }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByRole('button', { name: /apply/ }).click()
  await expect(sheet.getByTestId('buys-counts')).toContainText('4 new')

  /* The trades now sit on iShares Digital Security, as his did. */
  await testClient().mutation(anyApi.e2ePortfolio.misplaceBuys, {})
  await expect(sheet.getByText('Not saved on Gold')).toBeVisible()
  await expect(sheet.getByText(/buys saved/)).toHaveCount(0)
  const away = sheet.getByTestId('buys-away-thing')
  await expect(away).toHaveCount(1)
  await expect(away).toContainText('iShares Digital Security')
  await expect(away).toContainText('4 buy')
  await expect(away).toContainText('saved on')
  await expect(away).toContainText('in the file')
  await expect(away).not.toContainText('instead')
  await expect(sheet.getByTestId('buys-counts')).toHaveCount(0)
  await expect(sheet.getByTestId('buys-line')).toHaveCount(0)
  await expect(sheet.getByRole('button', { name: 'undo' })).toHaveCount(0)
  await page.waitForTimeout(700)
  await page.screenshot({ ...shot('add-buys-away'), fullPage: true })

  /* Closed, the page still says it: the file read as Gold, on the
     thing it was saved on, amber. */
  await sheet.getByRole('button', { name: 'done' }).click()
  await expect(sheet).toBeHidden()
  const just = position.getByTestId('just-added')
  await expect(just.getByTestId('just-misplaced')).toContainText(
    '1 file saved on another asset',
  )
  const file = just.getByTestId('just-file')
  await expect(file).toContainText('in the file')
  await expect(file).toContainText('saved on')
  await expect(file).toContainText('iShares Digital Security')
  await expect(file).not.toContainText('in already')
  await page.screenshot({ ...shot('add-buys-away-page'), fullPage: true })

  /* REMOVE on the saved screen: said at once, then the save is gone
     from both things. */
  await testClient().mutation(anyApi.e2ePortfolio.goldBuys, {})
  await position.getByRole('button', { name: 'add buys' }).click()
  await sheet.getByRole('button', { name: /apply/ }).click()
  await expect(sheet.getByTestId('buys-counts')).toContainText('4 new')
  await testClient().mutation(anyApi.e2ePortfolio.misplaceBuys, {})
  const away2 = sheet.getByTestId('buys-away-thing')
  await expect(away2).toContainText('4 buy')
  await away2.getByRole('button', { name: 'remove' }).click()
  await expect(sheet.getByText('removing…')).toBeVisible()
  await expect(sheet.getByText('Removed', { exact: true })).toBeVisible()
  await page.screenshot({ ...shot('add-buys-away-removed'), fullPage: true })
})

/* 14 Oct, his drop: five screenshots of gold scrolled one after another,
   IMG_9290's last three rows IMG_9291's first three. Each buy counts
   once, as the save counts it — not "too much". Mock data only. */
test('ADD BUYS: a buy in two overlapping screenshots counts once', async ({
  page,
}) => {
  await start(page)
  await testClient().mutation(anyApi.e2ePortfolio.goldBuys, { drop: true })
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
  await expect(sheet.getByTestId('buys-row')).toHaveCount(19)
  await expect(sheet.getByTestId('buys-line')).toContainText('0.408365 oz')
  await expect(sheet.getByTestId('buys-line')).toContainText('every buy in')
  await expect(sheet.getByText(/too much/)).toHaveCount(0)
  await page.screenshot({ ...shot('add-buys-overlap'), fullPage: true })
  await sheet.getByRole('button', { name: /apply/ }).click()
  await expect(sheet.getByTestId('buys-line')).toContainText('every buy in')
  await expect(sheet.getByTestId('buys-counts')).toContainText('19 new')
  /* PAID speaks of the round held now: 7 buys since 17 Feb 2026. */
  await expect(sheet.getByTestId('buys-saved-card')).toContainText(
    'paid · 7 buy',
  )
  await page.waitForTimeout(700)
  await page.screenshot({ ...shot('add-buys-saved-rounds'), fullPage: true })
  await sheet.getByRole('button', { name: 'done' }).click()
  await expect(position.getByText('buys and sells · 19')).toBeVisible()
  await expect(
    position.getByText('paid · 7 buy', { exact: true }),
  ).toBeVisible()
  await expect(position.getByTestId('paid-since')).toContainText('since')
  await expect(position.getByText(/down since|up since/)).not.toContainText(
    'bought',
  )
  /* Two rounds sold out in 2023, folded with their own sums. */
  await showTrades(position)
  const now = position.getByTestId('round-now')
  await expect(now).toContainText('7 buy')
  await expect(now.getByTestId('trade-row')).toHaveCount(7)
  const closed = position.getByTestId('round-closed')
  await expect(closed).toHaveCount(2)
  await expect(closed.first()).toContainText('4 buy')
  await expect(closed.first()).toContainText('1 sell')
  await expect(closed.first().getByTestId('trade-row')).toHaveCount(0)
  await closed.first().getByRole('button').first().click()
  await expect(closed.first().getByTestId('trade-row')).toHaveCount(5)
  await page.screenshot({ ...shot('position-rounds'), fullPage: true })

  /* × asks on the row; KEEP leaves it; REMOVE keeps it struck with UNDO
     (15 Oct, mockup trade-remove.html). */
  const first = now.getByTestId('trade-row').first()
  await first.getByRole('button', { name: 'Remove this trade' }).click()
  await expect(now.getByText('remove?')).toBeVisible()
  await now.getByRole('button', { name: 'keep' }).click()
  await expect(now.getByTestId('trade-row')).toHaveCount(7)
  await first.getByRole('button', { name: 'Remove this trade' }).click()
  await now.getByRole('button', { name: 'remove', exact: true }).click()
  await expect(now.getByTestId('trade-removed')).toHaveCount(1)
  await expect(now.getByTestId('trade-row')).toHaveCount(6)
  await expect(
    position.getByText('paid · 6 buy', { exact: true }),
  ).toBeVisible()
  await page.waitForTimeout(600)
  await page.screenshot({ ...shot('trade-removed'), fullPage: true })
  await now.getByRole('button', { name: 'undo' }).click()
  await expect(now.getByTestId('trade-removed')).toHaveCount(0)
  await expect(now.getByTestId('trade-row')).toHaveCount(7)
  await expect(
    position.getByText('paid · 7 buy', { exact: true }),
  ).toBeVisible()

  /* Removed, then the page opened again: folded at the end, UNDO there. */
  await now
    .getByTestId('trade-row')
    .first()
    .getByRole('button', { name: 'Remove this trade' })
    .click()
  await now.getByRole('button', { name: 'remove', exact: true }).click()
  await expect(now.getByTestId('trade-removed')).toHaveCount(1)
  await page.reload()
  await page.getByRole('button', { name: 'Show amounts' }).first().click()
  const fold = position.getByTestId('trades-removed')
  await expect(fold).toContainText('removed · 1')
  await fold.getByRole('button').first().click()
  await page.waitForTimeout(600)
  await page.screenshot({ ...shot('trade-removed-folded'), fullPage: true })
  await fold.getByRole('button', { name: 'undo' }).click()
  await expect(fold).toHaveCount(0)
  await expect(
    position.getByText('paid · 7 buy', { exact: true }),
  ).toBeVisible()

  /* The same drop again: nothing new, nineteen saved before. */
  await testClient().mutation(anyApi.e2ePortfolio.goldBuys, { drop: true })
  await position.getByRole('button', { name: 'add buys' }).click()
  await sheet.getByRole('button', { name: /apply/ }).click()
  const counts = sheet.getByTestId('buys-counts')
  await expect(counts).toContainText('0 new')
  await expect(counts).toContainText('19 saved before')
  await expect(sheet.getByRole('button', { name: 'undo' })).toHaveCount(0)
  await page.waitForTimeout(700)
  await page.screenshot({ ...shot('add-buys-saved-none'), fullPage: true })
})
