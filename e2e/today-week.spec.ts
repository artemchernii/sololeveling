import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { anyApi } from 'convex/server'

import { start, testClient } from './helpers'

const shot = (name: string) => ({ path: `e2e/screens/${name}.png` })

/* Today's THIS WEEK (docs/specs/2026-10-18-today-week.md, mockup
   design/today-mockup/week.html). The browser's clock is fixed to a
   Wednesday 15:30 so the cells that are past, now and future are the same
   on any day the test runs. */
const NOW = new Date(2026, 9, 14, 15, 30)
const MONDAY = new Date(2026, 9, 12).getTime()

async function open(page: Page, seed = true) {
  await start(page)
  if (seed)
    await testClient().mutation(anyApi.e2e.todayWeek, { weekStart: MONDAY })
  await page.clock.install({ time: NOW })
  await page.goto('/dashboard')
  const week = page.getByRole('region', { name: 'This week' })
  await expect(week.getByTestId('week-grid')).toBeVisible()
  return week
}

test('THIS WEEK: an empty week, now in its cell, the future refused', async ({
  page,
}) => {
  const week = await open(page, false)
  await expect(week.locator('[data-testid^=cell-]')).toHaveCount(21)
  await expect(week.getByTestId('week-empty')).toHaveText('NOTHING LOGGED')
  for (const k of ['workout', 'langs', 'shake', 'post', 'commits'])
    await expect(week.getByTestId(`chip-${k}`)).toContainText('0')
  await expect(week.getByTestId('cell-1-2').getByTestId('week-now')).toHaveText(
    '15:30',
  )
  await expect(week.getByTestId('cell-0-3')).toHaveAttribute(
    'aria-disabled',
    'true',
  )
  await expect(week.getByTestId('cell-2-2')).toHaveAttribute(
    'aria-disabled',
    'true',
  )
  await week.getByTestId('cell-0-3').click()
  await expect(week.getByTestId('week-menu')).toHaveCount(0)
  await page.screenshot({ ...shot('today-week-empty'), fullPage: true })
})

test('THIS WEEK: a lived week — blocks in time order, hover says what', async ({
  page,
}) => {
  const week = await open(page)
  const mon = week.getByTestId('cell-0-0').locator('[data-block]')
  await expect(mon).toHaveCount(2)
  await expect(mon.nth(0)).toHaveAttribute('data-testid', 'block-workout')
  await expect(mon.nth(1)).toHaveAttribute('data-testid', 'block-shake')
  await expect(
    week.getByTestId('cell-2-0').getByTestId('block-langs'),
  ).toBeVisible()
  await expect(
    week.getByTestId('cell-1-1').getByTestId('block-post'),
  ).toBeVisible()
  for (const k of ['workout', 'langs', 'shake', 'post'])
    await expect(week.getByTestId(`chip-${k}`)).toContainText('1')
  await expect(week.getByTestId('week-empty')).toHaveCount(0)

  await mon.nth(0).hover()
  const tip = week.getByTestId('week-tip')
  await expect(tip).toContainText('WORKOUT')
  await expect(tip).toContainText('60 MIN · LEGS')
  await expect(tip).toContainText('MON 12 · 07:30')
  await page.waitForTimeout(900)
  await page.screenshot({ ...shot('today-week-lived'), fullPage: true })
})

test('THIS WEEK: press an empty cell, pick a kind — saving, then landed', async ({
  page,
}) => {
  const week = await open(page, false)
  await expect(week.getByTestId('week-empty')).toBeVisible()
  await week.getByTestId('cell-0-2').click()
  const menu = week.getByTestId('week-menu')
  await expect(menu).toContainText('WED 14 · 06:00')
  await menu.getByRole('menuitem', { name: 'Log WORKOUT' }).click()
  await expect(
    week.getByTestId('cell-0-2').getByTestId('block-workout'),
  ).toBeVisible()
  await expect(week.getByTestId('chip-workout')).toContainText('1')
  await expect(week.getByTestId('week-empty')).toHaveCount(0)
  await expect(week.getByTestId('week-save')).toBeVisible()
  await page.screenshot({ ...shot('today-week-added'), fullPage: true })
  await expect(week.getByTestId('week-save')).toBeHidden({ timeout: 5000 })

  await week.getByTestId('cell-1-2').click()
  await expect(week.getByTestId('week-menu')).toContainText('WED 14 · 15:30')
  await week.getByRole('menuitem', { name: 'Log SHAKE' }).click()
  const shake = week.getByTestId('cell-1-2').getByTestId('block-shake')
  await expect(shake).toBeVisible()
  await shake.hover()
  await expect(week.getByTestId('week-tip')).toContainText('WED 14 · 15:30')
})

test('THIS WEEK: drag a block — same band keeps its time, another takes its start, the future refuses', async ({
  page,
}) => {
  const week = await open(page)
  const cell = (key: string) => week.getByTestId(`cell-${key}`)

  await cell('0-0').getByTestId('block-workout').dragTo(cell('0-1'))
  const moved = cell('0-1').getByTestId('block-workout')
  await expect(moved).toBeVisible()
  await expect(cell('0-0').getByTestId('block-workout')).toHaveCount(0)
  await moved.hover()
  const tip = week.getByTestId('week-tip')
  await expect(tip).toContainText('MOVED')
  await expect(tip).toContainText('TUE 13 · 07:30')
  await expect(tip).toContainText('WAS MON 12 07:30')

  await cell('2-0').getByTestId('block-langs').dragTo(cell('1-1'))
  const lang = cell('1-1').getByTestId('block-langs')
  await expect(lang).toBeVisible()
  await lang.hover()
  await expect(tip).toContainText('TUE 13 · 12:00')
  await expect(tip).toContainText('WAS MON 12 19:00')
  await page.screenshot({ ...shot('today-week-moved'), fullPage: true })

  await cell('1-1').getByTestId('block-post').dragTo(cell('0-3'))
  await expect(cell('1-1').getByTestId('block-post')).toBeVisible()
  await expect(cell('0-3').getByTestId('block-post')).toHaveCount(0)
})

test('THIS WEEK: phone width — icons only, nothing wider than the screen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const week = await open(page)
  await expect(week.getByTestId('block-workout')).toBeVisible()
  await expect(week.getByTestId('block-workout').locator('span')).toBeHidden()
  const wide = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  )
  expect(wide).toBe(false)
  await page.waitForTimeout(900)
  await page.screenshot({ ...shot('today-week-phone'), fullPage: true })
})
