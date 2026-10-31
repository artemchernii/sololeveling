import { expect, test } from '@playwright/test'
import { anyApi } from 'convex/server'

import { start, testClient } from './helpers'

const shot = (name: string) => ({ path: `e2e/screens/${name}.png` })

/* TARGET on Portfolio (31 Oct, mockup targets.html, his "Go"; spec
   docs/specs/2026-10-31-targets.md): each bucket now against his own €
   range, and the cash waiting split by the rule. Eight mock shares
   (€3,050), a gold fund (€2,000), a coin (€300), no bonds; the reset's
   accounts hold the cash. Mock data only. */
test('Portfolio: TARGET — not set, set, the split, a bucket keeps its rows', async ({
  page,
}) => {
  await start(page)
  await testClient().mutation(anyApi.e2eFind.manyHeld, {})
  await testClient().mutation(anyApi.e2eTargets.funds, {})
  await page.goto('/finances?room=portfolio')
  await page.getByRole('button', { name: 'show' }).first().click()
  await page.getByRole('button', { name: 'target', exact: true }).click()

  /* S1 nothing set: four buckets, NOT SET, no split. */
  const rows = page.getByTestId('target-row')
  await expect(rows).toHaveCount(4)
  await expect(rows.filter({ hasText: 'gold' })).toContainText('now €2,000')
  await expect(rows.filter({ hasText: 'gold' })).toContainText('not set')
  await expect(rows.filter({ hasText: 'stocks' })).toContainText('rest')
  await expect(page.getByTestId('target-put')).toHaveCount(0)
  await page.waitForTimeout(800)
  await page.screenshot({ ...shot('targets-not-set'), fullPage: true })

  /* S6 his targets: saving at once, a tick, the edit closes. */
  await page.getByRole('button', { name: 'set targets' }).click()
  for (const [field, value] of [
    ['gold min €', '3000'],
    ['gold max €', '5000'],
    ['bonds min €', '5000'],
    ['bonds max €', '5000'],
    ['crypto min €', '0'],
    ['crypto max €', '2000'],
  ])
    await page.getByLabel(field, { exact: true }).fill(value)
  await page.getByRole('button', { name: 'save' }).click()
  await expect(page.getByRole('status', { name: 'Saving' })).toBeVisible()
  await expect(page.getByRole('status', { name: 'Saved' })).toBeVisible()
  await expect(page.getByLabel('gold min €')).toHaveCount(0)

  /* S2 each bucket against its range. */
  await expect(rows.filter({ hasText: 'gold' })).toContainText('to add €1,000')
  await expect(rows.filter({ hasText: 'bonds' })).toContainText('to add €5,000')
  await expect(rows.filter({ hasText: 'crypto' })).toContainText('in target')
  await expect(rows.filter({ hasText: 'crypto' })).toContainText(
    'target up to €2,000',
  )

  /* S3 more cash than is missing: gold and bonds filled, the rest to
     stocks. */
  const puts = page.getByTestId('target-put')
  await expect(puts).toHaveCount(3)
  await expect(puts.filter({ hasText: 'gold' })).toContainText('€1,000')
  await expect(puts.filter({ hasText: 'bonds' })).toContainText('€5,000')
  await expect(puts.filter({ hasText: 'stocks' })).toContainText(
    'after every target',
  )
  await page.waitForTimeout(800)
  await page.screenshot({ ...shot('targets-set'), fullPage: true })

  /* Keeping €6,000 leaves less than is missing: shared by what each
     misses, gold 1 to bonds 5. */
  await page.getByRole('button', { name: 'targets', exact: true }).click()
  await page.getByLabel('keep cash €', { exact: true }).fill('6000')
  await page.getByRole('button', { name: 'save' }).click()
  await expect(page.getByLabel('keep cash €')).toHaveCount(0)
  await expect(puts).toHaveCount(2)
  await expect(page.getByText(/keep €6,000/)).toBeVisible()

  /* S5 a bucket keeps its rows in the list. */
  await rows.filter({ hasText: 'gold' }).click()
  await expect(page.getByTestId('owned-row')).toHaveCount(1)
  await expect(page.getByTestId('owned-row')).toContainText('Physical Gold')
  await rows.filter({ hasText: 'gold' }).click()
  await expect(page.getByTestId('owned-row')).toHaveCount(10)

  /* S7 phone width. */
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(600)
  await page.screenshot({ ...shot('targets-phone'), fullPage: true })
})
