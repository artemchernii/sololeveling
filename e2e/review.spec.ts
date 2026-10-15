import { expect, test } from '@playwright/test'
import { anyApi } from 'convex/server'

import { start, testClient } from './helpers'

const shot = (name: string) => ({ path: `e2e/screens/${name}.png` })
const DAY = 86_400_000

/* Review on what the app gets by itself (docs/specs/2026-10-14-review-bento.md,
   mockup design/review-mockup/real.html). */

/** This week's Monday, Tuesday and Wednesday, local midnights. */
function thisWeek(): Array<number> {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  const monday = d.getTime() - ((d.getDay() + 6) % 7) * DAY
  return [monday, monday + DAY, monday + 2 * DAY]
}

test('Review: a lived week — spent without bills, commits, body, by day', async ({
  page,
}) => {
  await start(page)
  await testClient().mutation(anyApi.e2e.reviewWeek, { days: thisWeek() })
  await page.goto('/reviews')

  const bar = page.getByRole('region', { name: 'Week' })
  await expect(bar.getByText(/DAY \d OF 7/)).toBeVisible()
  const monday = bar.getByTestId('day-0')
  await expect(monday.getByLabel('2 commits')).toBeVisible()
  await expect(monday.getByText('€37.86 OUT')).toBeVisible()
  await expect(monday.getByText('GYM')).toBeVisible()
  await expect(bar.getByTestId('day-1').getByText('SHAKE')).toBeVisible()
  await monday.hover()
  const tip = monday.getByRole('tooltip')
  await expect(tip.getByText('Solo Leveling')).toBeVisible()
  await expect(tip.getByText('2 COMMITS')).toBeVisible()

  const money = page.getByRole('region', { name: 'Finances' })
  await expect(money.getByTestId('spent')).toHaveText('€50.44')
  /* 50.44 against last week's 74.05: less spent, so green and down. */
  await expect(money.getByTestId('spent-change')).toHaveText('€23.61')
  await expect(money.getByTestId('spent-change')).toHaveAttribute(
    'data-good',
    'true',
  )
  await expect(money.getByText('LAST WEEK · €74.05')).toBeVisible()
  await expect(money.getByTestId('bills')).toContainText(
    'BILLS NOT COUNTED · €22.14',
  )
  await expect(money.getByText('LATEST ROW')).toHaveCount(0)
  await expect(money.getByText('Veiga e Seabra')).toBeVisible()
  await expect(money.getByText('Anthropic')).toHaveCount(0)
  await expect(money.getByText('1 MORE →')).toBeVisible()
  await expect(money.getByText('CASH')).toBeVisible()

  const projects = page.getByRole('region', { name: 'Projects' })
  const sl = projects.getByTestId('project')
  await expect(sl.getByTestId('commits')).toHaveText('3')
  await expect(sl.getByText('TARGET')).toBeVisible()
  await expect(sl.getByText('1 last week')).toBeVisible()
  await expect(sl.getByText('fix(review): bills not counted')).toHaveCount(0)
  await expect(sl.getByText(/TASKS/)).toHaveCount(0)
  await expect(
    projects.getByTestId('project-quiet').getByText('0 COMMITS · 0 last week'),
  ).toBeVisible()

  const body = page.getByRole('region', { name: 'Body' })
  await expect(body.getByTestId('workouts')).toHaveText('2')
  await expect(body.getByTestId('shakes')).toHaveText('1')
  await expect(body.getByText('Gym 2')).toBeVisible()
  await expect(body.getByTestId('weight')).toContainText('75.4')

  await expect(page.getByRole('region', { name: 'Note' })).toHaveCount(0)
  await page.screenshot({ ...shot('review-week'), fullPage: true })
})

test('Review: a quiet week — no zero tiles, Finances and the AI review', async ({
  page,
}) => {
  await start(page)
  await page.goto('/reviews')
  await page.getByRole('button', { name: 'Week before' }).click()
  await page.getByRole('button', { name: 'Week before' }).click()

  const money = page.getByRole('region', { name: 'Finances' })
  await expect(money.getByTestId('spent')).toHaveText('€0')
  await expect(page.getByRole('region', { name: 'AI review' })).toBeVisible()
  for (const name of ['Projects', 'Body', 'Languages'])
    await expect(page.getByRole('region', { name })).toHaveCount(0)
  await expect(
    page.getByRole('region', { name: 'Week' }).getByText(/DAY \d OF 7/),
  ).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Week after' })).toBeEnabled()
  await page.screenshot({ ...shot('review-quiet'), fullPage: true })
})

test('Review: the AI review — GRILL ME turns on, a press answers', async ({
  page,
}) => {
  await start(page)
  await page.goto('/reviews')
  const ai = page.getByRole('region', { name: 'AI review' })
  await expect(ai.getByText('NOT READ')).toBeVisible()
  const grill = ai.getByRole('button', { name: 'GRILL ME' })
  await grill.click()
  await expect(grill).toHaveAttribute('aria-pressed', 'true')
  await ai.getByRole('button', { name: 'ANALYZE WEEK' }).click()
  await expect(ai.getByText('NOT CONNECTED')).toBeVisible()
  await page.screenshot(shot('review-ai'))
})

test('Review: a tile opens its page', async ({ page }) => {
  await start(page)
  await page.goto('/reviews')
  await page
    .getByRole('region', { name: 'Finances' })
    .getByRole('link', { name: 'Finances' })
    .click()
  await expect(page).toHaveURL(/\/finances/)
})

test('Review: phone width — nothing wider than the screen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await start(page)
  await testClient().mutation(anyApi.e2e.reviewWeek, { days: thisWeek() })
  await page.goto('/reviews')
  await expect(page.getByRole('region', { name: 'Projects' })).toBeVisible()
  const wide = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  )
  expect(wide).toBe(false)
  await page.screenshot({ ...shot('review-phone'), fullPage: true })
})
