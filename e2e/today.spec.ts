import { expect, test } from '@playwright/test'
import { anyApi } from 'convex/server'

import { start, testClient } from './helpers'

const shot = (name: string) => ({ path: `e2e/screens/${name}.png` })

/* Today: THIS WEEK with TASKS TODAY in it, and THIS MONTH as his six
   (docs/specs/2026-10-25-today-tasks-grid.md, mockup
   design/today-mockup/three.html). */

function month() {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
  const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime()
  const dayEnd = new Date(now)
  dayEnd.setHours(24, 0, 0, 0)
  return { now: now.getTime(), dayEnd: dayEnd.getTime(), monthStart, prevStart }
}

test('Today: an empty day — the bar, an own task, a tick in the week', async ({
  page,
}) => {
  await start(page)
  await page.goto('/dashboard')

  const week = page.getByRole('region', { name: 'This week' })
  const bar = week.getByTestId('task-bar')
  await expect(bar.getByTestId('three-count')).toHaveText('0 OF 3')
  await expect(bar.getByTestId('task-chip')).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Today' })).toHaveCount(0)

  await bar.getByRole('button', { name: /＋ TASK/ }).click()
  const own = bar.getByPlaceholder('own task')
  await expect(own).toBeFocused()
  await own.fill('Write the post')
  await own.press('Enter')
  const chip = bar.getByTestId('task-chip')
  await expect(chip.getByText('Write the post')).toBeVisible()
  await expect(bar.getByTestId('task-menu')).toHaveCount(0)
  await expect(bar.getByTestId('three-count')).toHaveText('1 OF 3')

  await chip.getByRole('button', { name: 'Complete Write the post' }).click()
  await expect(chip).toHaveAttribute('data-done', 'true')
  await expect(week.getByTestId('block-task')).toHaveCount(1)
  await page.screenshot({ ...shot('today-empty-day'), fullPage: true })

  await chip.getByRole('button', { name: 'Un-tick Write the post' }).click()
  await expect(chip).toHaveAttribute('data-done', 'false')
  await expect(week.getByTestId('block-task')).toHaveCount(0)
})

test('Today: PT and ENG apart — chips, pills, the tile and its presses', async ({
  page,
}) => {
  await start(page)
  await testClient().mutation(anyApi.e2eToday.twoLanguages, { at: Date.now() })
  await page.goto('/dashboard')

  const week = page.getByRole('region', { name: 'This week' })
  await expect(week.getByTestId('chip-langs-portuguese')).toContainText('PT1')
  await expect(week.getByTestId('chip-langs-english')).toContainText('ENG1')
  await expect(week.getByTestId('block-langs')).toHaveCount(2)

  const langs = page
    .getByRole('region', { name: 'This month' })
    .getByTestId('tile-langs')
  await expect(langs.getByTestId('lang-PT')).toHaveText('PT 1')
  await expect(langs.getByTestId('lang-ENG')).toHaveText('ENG 1')
  await langs.getByRole('button', { name: '+ ENG' }).click()
  const kinds = langs.getByTestId('session-kinds')
  await expect(kinds.getByRole('menuitem')).toHaveText([
    'CLASS · 50 MIN',
    'HOMEWORK',
    'AT HOME',
  ])
  await kinds.getByRole('menuitem', { name: 'HOMEWORK' }).click()
  await expect(kinds).toHaveCount(0)
  await expect(
    langs.getByRole('button', { name: /SAVING|SAVED/ }),
  ).toBeVisible()
  await expect(langs.getByTestId('lang-ENG')).toHaveText('ENG 2')
  await expect(langs.getByTestId('lang-PT')).toHaveText('PT 1')
  await page.screenshot({ ...shot('today-two-languages'), fullPage: true })
})

/* 25 Oct: `eng` in ⌘L, as `pt` (docs/specs/2026-10-25-same-days-eng.md). */
test('Today: eng homework 20 in ⌘L lands on ENG', async ({ page }) => {
  await start(page)
  await testClient().mutation(anyApi.e2eToday.twoLanguages, { at: Date.now() })
  await page.goto('/dashboard')
  const langs = page
    .getByRole('region', { name: 'This month' })
    .getByTestId('tile-langs')
  await expect(langs.getByTestId('lang-ENG')).toHaveText('ENG 1')

  await page.keyboard.press('ControlOrMeta+l')
  await page.keyboard.type('eng homework 20')
  await expect(page.getByRole('dialog').getByText('English')).toBeVisible()
  await page.screenshot({ ...shot('today-eng-capture'), fullPage: true })
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toContainText(
    /eng homework 20\s*logged/,
  )
  await page.keyboard.press('Escape')
  await expect(langs.getByTestId('lang-ENG')).toHaveText('ENG 2')
  await expect(langs.getByTestId('lang-PT')).toHaveText('PT 1')
})

test('Today: 0 against 0 shows no comparison', async ({ page }) => {
  await start(page)
  await page.goto('/dashboard')
  const post = page
    .getByRole('region', { name: 'This month' })
    .getByTestId('tile-post')
  await expect(post.getByTestId('count')).toHaveText('0')
  await expect(post.getByTestId('delta')).toHaveCount(0)
  await expect(post.getByText('= SAME')).toHaveCount(0)
})

test('Today: NEXT, a pick from the day, and the month against its same days', async ({
  page,
}) => {
  await start(page)
  await testClient().mutation(anyApi.e2e.todayMonth, month())
  await page.goto('/dashboard')

  const bar = page.getByTestId('task-bar')
  await expect(bar.getByTestId('next-title')).toHaveText('PT')
  await expect(bar.getByTestId('next-in')).toContainText(/^IN .* · 60 MIN$/)

  await bar.getByRole('button', { name: /＋ TASK/ }).click()
  await bar.getByRole('menuitem', { name: 'Pick PT' }).click()
  await expect(bar.getByTestId('task-chip').getByText('PT')).toBeVisible()
  await bar.getByRole('button', { name: /＋ TASK/ }).click()
  await expect(bar.getByRole('menuitem', { name: 'Pick PT' })).toHaveCount(0)

  const six = page.getByRole('region', { name: 'This month' })
  const work = six.getByTestId('tile-workout')
  await expect(work.getByTestId('count')).toHaveText('3')
  /* 25 Oct: the month before over the same days, its span beside it. */
  const before = new Date()
  before.setDate(0)
  const last = Math.min(new Date().getDate(), before.getDate())
  const mon = before
    .toLocaleDateString('en-GB', { month: 'short' })
    .slice(0, 3)
    .toUpperCase()
  const span = last === 1 ? `1 ${mon}` : `1–${last} ${mon}`
  await expect(work.getByTestId('was')).toHaveText(`${span} · 2`)
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
