import { expect, test } from '@playwright/test'
import { anyApi } from 'convex/server'

import { start, testClient } from './helpers'

const shot = (name: string) => ({ path: `e2e/screens/${name}.png` })

/* R8 · S2, the first run (docs/specs/2026-10-26-first-run.md, mockup
   design/firstrun-mockup/index.html). */

test('a new person: pick English, GO → saving → saved → closes into Today', async ({
  page,
}) => {
  await start(page)
  await testClient().mutation(anyApi.e2eFirstRun.newPerson, {})
  await page.goto('/dashboard')

  const win = page.getByRole('dialog', { name: 'First run' })
  await expect(win).toBeVisible()
  await expect(win.getByTestId('first-run-zone')).not.toBeEmpty()
  const go = win.getByRole('button', { name: 'GO' })
  await expect(go).toBeDisabled()
  await page.screenshot(shot('first-run-open'))

  await win.getByRole('button', { name: /English/ }).click()
  await expect(win.getByRole('button', { name: /English/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(go).toBeEnabled()
  await page.screenshot(shot('first-run-picked'))

  await go.click()
  await expect(win.getByText('SAVING').or(win.getByText('SAVED'))).toBeVisible()
  await expect(win.getByText('SAVED')).toBeVisible()
  await expect(win).toHaveCount(0)
  await expect(page.getByRole('heading', { level: 1 })).toContainText(',')
  await page.screenshot(shot('first-run-landed'))

  await page.goto('/languages')
  await expect(page.getByText('English').first()).toBeVisible()
  await page.reload()
  await expect(page.getByRole('dialog', { name: 'First run' })).toHaveCount(0)
})

test('NONE ends the first run and it does not come back', async ({ page }) => {
  await start(page)
  await testClient().mutation(anyApi.e2eFirstRun.newPerson, {})
  await page.goto('/dashboard')

  const win = page.getByRole('dialog', { name: 'First run' })
  await win.getByRole('button', { name: /NONE/ }).click()
  await win.getByRole('button', { name: 'GO' }).click()
  await expect(win).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'First run' })).toHaveCount(0)
})

test('someone past the first run never sees it', async ({ page }) => {
  await start(page)
  await page.goto('/dashboard')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'First run' })).toHaveCount(0)
})
