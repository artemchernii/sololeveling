import { expect, test } from '@playwright/test'
import { anyApi } from 'convex/server'

import { start, testClient } from './helpers'

const shot = (name: string) => ({ path: `e2e/screens/${name}.png` })

/* R8 · S3a: what a guest (someone who did the first run) does not get —
   mockup design/firstrun-mockup/guest.html, his picks 27 Oct. */

async function asGuest(lang: 'en' | null) {
  const c = testClient()
  await c.mutation(anyApi.e2eFirstRun.newPerson, {})
  await c.mutation(anyApi.profiles.finishFirstRun, {
    lang,
    timezone: 'Europe/Lisbon',
  })
}

test('a guest: no Finances, no LEVEL, Today is WORKOUT and their language', async ({
  page,
}) => {
  await start(page)
  await asGuest('en')
  await page.goto('/dashboard')

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Body' }).first()).toBeVisible()
  await expect(page.getByRole('link', { name: 'Finances' })).toHaveCount(0)
  await expect(page.getByText(/^level \d+/i)).toHaveCount(0)

  const week = page.getByRole('region', { name: 'This week' })
  await expect(week.getByTestId('chip-workout')).toBeVisible()
  await expect(week.getByTestId('chip-langs-english')).toBeVisible()
  await expect(week.getByTestId('chip-shake')).toHaveCount(0)
  await expect(week.getByTestId('chip-post')).toHaveCount(0)
  await expect(week.getByTestId('chip-commits')).toHaveCount(0)

  const month = page.getByRole('region', { name: 'This month' })
  await expect(month.getByText('LANGS', { exact: true })).toBeVisible()
  await expect(month.getByText('WORKOUT', { exact: true })).toBeVisible()
  for (const gone of ['SHAKE', 'POST', 'COMMITS', 'WORTH'])
    await expect(month.getByText(gone, { exact: true })).toHaveCount(0)
  await page.screenshot({ ...shot('guest-today'), fullPage: true })

  await page.goto('/body')
  await expect(page.getByText('[ body ]')).toBeVisible()
  await expect(page.locator('img[src="/body/body.jpg"]')).toHaveCount(0)

  await page.goto('/reviews')
  await expect(page.getByText(/^SPENT ·/)).toHaveCount(0)
  await expect(page.getByText(/^WORTH ·/)).toHaveCount(0)
})

test('a guest with NONE: no LANGS tile and no language chip', async ({
  page,
}) => {
  await start(page)
  await asGuest(null)
  await page.goto('/dashboard')

  const month = page.getByRole('region', { name: 'This month' })
  await expect(month.getByText('WORKOUT', { exact: true })).toBeVisible()
  await expect(month.getByText('LANGS', { exact: true })).toHaveCount(0)
  const week = page.getByRole('region', { name: 'This week' })
  await expect(week.getByTestId('chip-workout')).toBeVisible()
  await expect(week.locator('[data-testid^="chip-langs"]')).toHaveCount(0)
})

test('Artem keeps everything: Finances, LEVEL, all six', async ({ page }) => {
  await start(page)
  await page.goto('/dashboard')
  await expect(
    page.getByRole('link', { name: 'Finances' }).first(),
  ).toBeVisible()
  await expect(page.getByText(/^level \d+/i)).toBeVisible()
  const month = page.getByRole('region', { name: 'This month' })
  for (const tile of ['LANGS', 'WORKOUT', 'SHAKE', 'POST', 'COMMITS', 'WORTH'])
    await expect(month.getByText(tile, { exact: true })).toBeVisible()
})
