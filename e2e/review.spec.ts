import { expect, test } from '@playwright/test'
import { anyApi } from 'convex/server'

import { start, testClient } from './helpers'

const shot = (name: string) => ({ path: `e2e/screens/${name}.png` })
const DAY = 86_400_000

/* Review, the bento (docs/specs/2026-10-14-review-bento.md). */

/** This week's Monday, Tuesday and Wednesday, local midnights. */
function thisWeek(): Array<number> {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  const monday = d.getTime() - ((d.getDay() + 6) % 7) * DAY
  return [monday, monday + DAY, monday + 2 * DAY]
}

test('Review: a lived week — every tile counts it, a plain note is OTHER', async ({
  page,
}) => {
  const resetDays = await start(page)
  const week = thisWeek()
  await testClient().mutation(anyApi.e2e.reviewWeek, { days: week })
  await page.goto('/reviews')
  /* reset's three spends sit on the days before today: some of them fall
     in this week, depending on the weekday the test runs. */
  const spends = resetDays.slice(0, 3).filter((d) => d >= week[0]).length

  const activity = page.getByRole('region', { name: 'Activity' })
  await expect(activity.getByText('called Dyson')).toBeVisible()
  await expect(activity.getByText('OTHER 1')).toBeVisible()
  const bar = page.getByRole('region', { name: 'Week' })
  await expect(bar.getByTestId('logged')).toHaveText(String(5 + spends))
  await expect(bar.getByTestId('tasks-done')).toHaveText('1')

  const body = page.getByRole('region', { name: 'Body' })
  await expect(body.getByTestId('workouts')).toHaveText('3')
  await expect(body.getByTestId('kind-gym')).toHaveText('2')
  await expect(body.getByText('WEIGHT')).toBeVisible()
  await expect(body.getByText('MISSING')).toBeVisible()

  await expect(page.getByRole('region', { name: 'Finances' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Languages' })).toBeVisible()
  await page.screenshot({ ...shot('review-week'), fullPage: true })
})

test('Review: a quiet week — every tile is there, at zero', async ({
  page,
}) => {
  await start(page)
  await page.goto('/reviews')
  await page.getByRole('button', { name: 'Week before' }).click()
  await page.getByRole('button', { name: 'Week before' }).click()

  await expect(
    page.getByRole('region', { name: 'Activity' }).getByText('0 LOGGED'),
  ).toBeVisible()
  await expect(
    page.getByRole('region', { name: 'Week' }).getByTestId('logged'),
  ).toHaveText('0')
  for (const name of ['Finances', 'Body', 'Languages', 'Note'])
    await expect(page.getByRole('region', { name })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Week after' })).toBeEnabled()
  await page.screenshot({ ...shot('review-quiet'), fullPage: true })
})

test('Review: the week closes with one line — saving, closed, saved', async ({
  page,
}) => {
  await start(page)
  await page.goto('/reviews')
  await expect(page.getByRole('button', { name: 'Week after' })).toBeDisabled()

  const note = page.getByRole('region', { name: 'Note' })
  await note.getByRole('textbox').fill('Class on Wednesday')
  await note.getByRole('button', { name: 'CLOSE WEEK' }).click()
  await expect(note.getByText('saving')).toBeVisible()
  await expect(note.getByText('SAVED')).toBeVisible()
  await expect(
    page.getByRole('region', { name: 'Week' }).getByText('CLOSED'),
  ).toBeVisible()
  await expect(note.getByRole('textbox')).toHaveCount(0)
  await expect(note.getByText('Class on Wednesday')).toBeVisible()
  await page.screenshot(shot('review-closed'))
})

test('Review: a tile opens its page', async ({ page }) => {
  await start(page)
  await page.goto('/reviews')
  await page
    .getByRole('region', { name: 'Body' })
    .getByRole('link', { name: 'Body' })
    .click()
  await expect(page).toHaveURL(/\/body/)
})

test('Review: phone width — two columns, nothing wider than the screen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await start(page)
  await page.goto('/reviews')
  await expect(page.getByRole('region', { name: 'Finances' })).toBeVisible()
  const wide = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  )
  expect(wide).toBe(false)
  await page.screenshot({ ...shot('review-phone'), fullPage: true })
})
