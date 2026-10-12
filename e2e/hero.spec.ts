import { expect, test } from '@playwright/test'
import type { Locator } from '@playwright/test'
import { anyApi } from 'convex/server'

import { start, testClient } from './helpers'

const shot = (name: string) => ({ path: `e2e/screens/${name}.png` })
const DAY = 86_400_000

/* Safety net for the hero (12 Oct): capital, free cash against what is at
   brokers, and this month. The mock: Revolut €1,200 and $40 read eight
   days ago with €61.02 spent since, ActivoBank €830.50, Cash €5,000. */

const SPENT = [13.05, 6.7, 41.27]
const amount = async (line: Locator) =>
  Number(((await line.textContent()) ?? '').replace(/[^0-9.]/g, ''))

test('hero: capital is free cash and what is at brokers; in and out since salary', async ({
  page,
}) => {
  const days = await start(page)
  await page.goto('/finances')
  await page.getByRole('button', { name: 'Show amounts' }).first().click()
  const hero = page.locator('section', {
    hasText: 'capital · cash · investments',
  })
  /* €1,200 − €61.02 and $40 at 0.86, €830.50, €5,000. */
  await expect(hero.getByText('€7,003.88').first()).toBeVisible()
  const free = hero.getByRole('link', { name: /free cash/ })
  const brokers = hero.getByRole('link', { name: /at brokers/ })
  await expect(free).toContainText('€7,003.88')
  await expect(brokers).toContainText('€0')
  expect((await amount(free)) + (await amount(brokers))).toBeCloseTo(7003.88, 2)
  /* The groups: two banks, one wallet; no broker holds anything yet. */
  await expect(hero.getByRole('button', { name: /banks/ })).toContainText(
    '€2,003.88',
  )
  await expect(hero.getByRole('button', { name: /^cash/ })).toContainText(
    '€5,000',
  )

  /* This month: only the rows of this calendar month count (on the first
     days of a month some of the mock's rows are last month's). */
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
  const out = SPENT.filter((_, i) => days[i] >= monthStart).reduce(
    (n, v) => n + Math.round(v * 100),
    0,
  )
  if (out === 0)
    await expect(hero.getByText('nothing in or out this month')).toBeVisible()
  else {
    const eur = `€${(out / 100).toFixed(2)}`
    await expect(hero.getByText(`−${eur}`)).toBeVisible()
    await expect(hero.getByText(`out ${eur}`)).toBeVisible()
    await expect(hero.getByText('in €0')).toBeVisible()
  }
  /* Revolut is a bank and a broker, and its broker cash was never saved:
     said by name. */
  const todo = hero.getByTestId('hero-todo')
  await expect(
    todo.getByRole('button', { name: 'Revolut broker cash is missing' }),
  ).toBeVisible()
  /* Every balance of the mock is eight days old: each is named. */
  await expect(
    todo.getByRole('button', { name: 'ActivoBank balance outdated' }),
  ).toBeVisible()
  await expect(hero.getByText(/not read yet|balances as of/)).toHaveCount(0)
  await page.waitForTimeout(700)
  await page.screenshot(shot('hero'))

  /* A salary lands: the month turns green, capital grows by it. */
  await testClient().mutation(anyApi.e2e.paySalary, { day: days[0] - DAY })
  await expect(hero.getByText('€9,903.88').first()).toBeVisible()
  await expect(free).toContainText('€9,903.88')
  /* In and out now run from that salary, whatever the calendar month:
     the mock's three payments all came after it. */
  await expect(hero.getByText(/since salary on \d+ \w{3}/)).toBeVisible()
  await expect(hero.getByText('in €2,900')).toBeVisible()
  await expect(hero.getByText('out €61.02')).toBeVisible()
  await expect(hero.getByText('+€2,838.98')).toBeVisible()
  await expect(hero.getByText('this month')).toHaveCount(0)
  await page.waitForTimeout(700)
  await page.screenshot(shot('hero-salary'))
})

test('hero: a group opens on its accounts', async ({ page }) => {
  await start(page)
  await page.goto('/finances')
  await page.getByRole('button', { name: 'Show amounts' }).first().click()
  const hero = page.locator('section', {
    hasText: 'capital · cash · investments',
  })
  await hero.getByRole('button', { name: /banks/ }).click()
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByText('Revolut').first()).toBeVisible()
  await expect(sheet.getByText('ActivoBank').first()).toBeVisible()
  await expect(sheet.getByText('€830.50').first()).toBeVisible()
  await page.screenshot(shot('hero-banks'))
})

test('hero: an outdated balance opens UPDATE for that account', async ({
  page,
}) => {
  await start(page)
  await page.goto('/finances')
  const hero = page.locator('section', {
    hasText: 'capital · cash · investments',
  })
  await hero
    .getByRole('button', { name: 'ActivoBank balance outdated' })
    .click()
  await expect(
    page.getByRole('dialog').getByText(/update · ActivoBank/i),
  ).toBeVisible()
})
