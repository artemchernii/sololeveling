import { expect, test } from '@playwright/test'
import { anyApi } from 'convex/server'

import { start, testClient } from './helpers'

const shot = (name: string) => ({ path: `e2e/screens/${name}.png` })

/* Today: one live TODAY card and THIS MONTH as his six
   (docs/specs/2026-10-17-today-rework.md, mockup design/today-mockup/month.html). */

function month() {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
  const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime()
  const dayEnd = new Date(now)
  dayEnd.setHours(24, 0, 0, 0)
  return { now: now.getTime(), dayEnd: dayEnd.getTime(), monthStart, prevStart }
}

test('Today: an empty day — picks, an own task, a tick', async ({ page }) => {
  await start(page)
  await page.goto('/dashboard')

  const day = page.getByRole('region', { name: 'Today' })
  await expect(day.getByText('0 EVENTS')).toBeVisible()
  await expect(day.getByTestId('three-count')).toHaveText('0 OF 3')
  await expect(page.getByText('The rest is yours')).toHaveCount(0)
  await expect(page.getByText('CURRENT STATE')).toHaveCount(0)

  const own = day.getByPlaceholder('＋ own task')
  await own.fill('Write the post')
  await own.press('Enter')
  const first = day.getByTestId('slot-0')
  await expect(first.getByText('Write the post')).toBeVisible()
  await expect(day.getByTestId('three-count')).toHaveText('1 OF 3')
  await expect(day.getByPlaceholder('＋ own task')).toBeFocused()

  await first.getByRole('button', { name: 'Complete Write the post' }).click()
  await expect(first).toHaveAttribute('data-done', 'true')
  await expect(first.getByText('DONE')).toBeVisible()
  await page.screenshot({ ...shot('today-empty-day'), fullPage: true })

  await first.getByRole('button', { name: 'Un-tick Write the post' }).click()
  await expect(first).toHaveAttribute('data-done', 'false')
})

test('Today: NEXT, a pick from the day, and the month against September', async ({
  page,
}) => {
  await start(page)
  await testClient().mutation(anyApi.e2e.todayMonth, month())
  await page.goto('/dashboard')

  const day = page.getByRole('region', { name: 'Today' })
  await expect(day.getByTestId('next-title')).toHaveText('PT')
  await expect(day.getByTestId('next-in')).toContainText(/^IN .* · 60 MIN$/)
  await expect(day.getByTestId('now-mark')).toBeVisible()

  await day.getByRole('button', { name: 'Pick PT' }).click()
  await expect(day.getByTestId('slot-0').getByText('PT')).toBeVisible()
  await expect(day.getByRole('button', { name: 'Pick PT' })).toHaveCount(0)

  const six = page.getByRole('region', { name: 'This month' })
  const work = six.getByTestId('tile-workout')
  await expect(work.getByTestId('count')).toHaveText('3')
  await expect(work.getByText('SEPTEMBER 2')).toBeVisible()
  await expect(work.getByTestId('delta')).toHaveText('▲ 1')
  const langs = six.getByTestId('tile-langs')
  await expect(langs.getByText('0 / 4')).toBeVisible()
  await expect(langs.getByTestId('delta')).toHaveText('▼ 1')
  await expect(six.getByTestId('tile-post').getByTestId('count')).toHaveText(
    '1',
  )
  await expect(
    six.getByTestId('tile-commits').getByText('AUTO · GITHUB'),
  ).toBeVisible()
  await expect(
    six.getByTestId('tile-worth').getByText('AUTO · BANK'),
  ).toBeVisible()
  await page.screenshot({ ...shot('today-lived-month'), fullPage: true })

  const press = work.getByRole('button', { name: '+ WORKOUT' })
  await press.click()
  await expect(work.getByRole('button', { name: /SAVING/ })).toBeVisible()
  await expect(work.getByRole('button', { name: /SAVED/ })).toBeVisible()
  await expect(work.getByTestId('count')).toHaveText('4')
  await expect(work.getByRole('button', { name: '+ WORKOUT' })).toBeVisible({
    timeout: 5000,
  })
})

test('Today: phone width — one column, nothing wider than the screen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await start(page)
  await page.goto('/dashboard')
  await expect(page.getByTestId('three-count')).toBeVisible()
  await expect(page.getByTestId('tile-worth')).toBeVisible()
  const wide = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  )
  expect(wide).toBe(false)
  await page.screenshot({ ...shot('today-phone'), fullPage: true })
})
