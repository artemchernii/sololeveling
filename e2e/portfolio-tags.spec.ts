import { expect, test } from '@playwright/test'
import { anyApi } from 'convex/server'

import { start, testClient } from './helpers'

const shot = (name: string) => ({ path: `e2e/screens/${name}.png` })

/* Tags and map on Portfolio (18 Oct, mockup tags-map.html, "go emoji"):
   each row carries its sector and region, the bar under worth turns by
   kind, sector or region, and a press keeps only its rows. Eight mock
   shares, seven read, Coca-Cola MISSING. Mock data only. */
test('Portfolio: tags on rows, the bar by sector and region', async ({
  page,
}) => {
  await start(page)
  await testClient().mutation(anyApi.e2eFind.manyHeld, {})
  await testClient().mutation(anyApi.e2eTags.tagged, {})
  await page.goto('/finances?room=portfolio')

  const rows = page.getByTestId('owned-row')
  await expect(rows).toHaveCount(8)

  /* S1 each row's two tags. */
  const asml = rows.filter({ hasText: 'ASML Holding' })
  await expect(asml.getByTestId('tag')).toHaveText(['💻tech', '🇪🇺europe'])
  const ko = rows.filter({ hasText: 'Coca-Cola' })
  await expect(ko.getByTestId('tag')).toHaveText(['⚠️missing', '⚠️missing'])

  /* S2 by sector: tech €1,730 · 57%; a press keeps its three rows. */
  await page.getByRole('button', { name: 'sector', exact: true }).click()
  const part = page.getByTestId('map-part')
  await expect(part.filter({ hasText: 'tech' })).toContainText('57%')
  await page.waitForTimeout(800)
  await page.screenshot({ ...shot('portfolio-tags-sector'), fullPage: true })
  await part.filter({ hasText: 'tech' }).click()
  await expect(rows).toHaveCount(3)
  await expect(page.getByText('everything owned · 3')).toBeVisible()

  /* S3 by region: us 71%, europe 27%, missing last; europe keeps two. */
  await page.getByRole('button', { name: 'region', exact: true }).click()
  await expect(rows).toHaveCount(8)
  await expect(part).toHaveCount(3)
  await expect(part.nth(0)).toContainText('us')
  await expect(part.nth(0)).toContainText('71%')
  await expect(part.nth(2)).toContainText('missing')
  await part.filter({ hasText: 'europe' }).click()
  await expect(rows).toHaveCount(2)
  await page.waitForTimeout(800)
  await page.screenshot({ ...shot('portfolio-tags-region'), fullPage: true })

  /* S4 the pressed part's pill clears it. */
  await page.getByRole('button', { name: 'europe ✕' }).click()
  await expect(rows).toHaveCount(8)

  /* S5 phone width. */
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(500)
  await page.screenshot({ ...shot('portfolio-tags-phone'), fullPage: true })
})
