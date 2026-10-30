import { expect, test } from '@playwright/test'
import { anyApi } from 'convex/server'
import type { Page } from '@playwright/test'

import { start, testClient } from './helpers'
import { cannedRows } from '../src/lib/rowsAskPrompt'
import type { RowFact } from '../src/lib/rowsAsk'

const shot = (name: string) => ({ path: `e2e/screens/${name}.png` })

/* The localhost model pick (22 Oct, docs/specs/2026-10-22-model-pick.md,
   mockup design/model-pick/ option B, his "go with B"). The test backend
   has no Claude Code route, so the page's `/__claude/*` calls are answered
   here: ready, and the canned rows answer stamped with the model the page
   sent — nothing calls out. */

async function proPath(page: Page) {
  const asked: Array<string | undefined> = []
  await page.route('**/__claude/**', async (route) => {
    const req = route.request()
    if (req.method() === 'GET') return route.fulfill({ json: { ready: true } })
    const body = req.postDataJSON() as { model?: string; facts: Array<RowFact> }
    asked.push(body.model)
    await route.fulfill({
      json: {
        ok: true,
        raw: cannedRows(body.facts),
        model: body.model,
        inputTokens: 14_000,
        outputTokens: 410,
        searches: 0,
      },
    })
  })
  return asked
}

async function open(page: Page) {
  await page.keyboard.press('ControlOrMeta+j')
  const drawer = page.getByTestId('rows-drawer')
  await expect(drawer).toHaveAttribute('aria-hidden', 'false')
  return drawer
}

function august(): number {
  const now = new Date()
  const y = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1
  return new Date(y, 7, 1).getTime()
}

test('S1–S3 PRO badge opens the pick → OPUS asked and stamped → kept after reload', async ({
  page,
}) => {
  const asked = await proPath(page)
  await start(page)
  await testClient().mutation(anyApi.e2eRowsAsk.month, { from: august() })
  await page.goto('/dashboard')
  await expect(page.getByTestId('rows-open')).toBeVisible()
  let drawer = await open(page)

  const pick = drawer.getByTestId('model-pick')
  await expect(pick).toHaveText('PRO · SONNET 5.5 ▾')
  await expect(drawer.getByTestId('rows-pay')).toHaveCount(0)

  await pick.click()
  const options = drawer.getByTestId('model-option')
  await expect(options).toHaveText([
    /HAIKU 5\.5.*⚡ FAST/,
    /✓SONNET 5\.5.*DEFAULT/,
    /OPUS 5\.5.*🔋 HEAVY/,
  ])
  await expect(drawer.getByTestId('model-menu')).toHaveCSS('opacity', '1')
  await page.screenshot(shot('model-pick-menu'))

  /* Esc folds the menu, not the drawer. */
  await page.keyboard.press('Escape')
  await expect(drawer.getByTestId('model-menu')).toHaveCount(0)
  await expect(drawer).toHaveAttribute('aria-hidden', 'false')

  await pick.click()
  await options.nth(2).click()
  await expect(drawer.getByTestId('model-menu')).toHaveCount(0)
  await expect(pick).toHaveText('PRO · OPUS 5.5 ▾')

  await drawer.getByTestId('rows-suggest').first().click()
  const answer = drawer.getByTestId('rows-answer')
  await expect(answer).toBeVisible({ timeout: 15_000 })
  expect(asked).toEqual(['claude-opus-5-5'])
  const stamp = answer.getByTestId('rows-stamp')
  await expect(stamp).toContainText('✦ OPUS 5.5')
  await expect(stamp).toContainText('PRO · $0.00')
  await page.screenshot(shot('model-pick-answer'))

  await page.reload()
  await expect(page.getByTestId('rows-open')).toBeVisible()
  drawer = await open(page)
  await expect(drawer.getByTestId('model-pick')).toHaveText(
    'PRO · OPUS 5.5 ▾',
  )
})

test('S4 the API path has no pick', async ({ page }) => {
  await start(page)
  await page.goto('/dashboard')
  await expect(page.getByTestId('rows-open')).toBeVisible()
  const drawer = await open(page)
  await expect(drawer.getByTestId('rows-pay')).toBeVisible()
  await expect(drawer.getByTestId('model-pick')).toHaveCount(0)
})

test('S5 a phone: the badge and ✕ on one line, the menu inside the sheet', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await proPath(page)
  await start(page)
  await page.goto('/dashboard')
  await expect(page.getByTestId('rows-open')).toBeVisible()
  await page.getByTestId('rows-open').click()
  const drawer = page.getByTestId('rows-drawer')
  await expect(drawer).toHaveAttribute('aria-hidden', 'false')
  const pick = drawer.getByTestId('model-pick')
  await expect(pick).toBeVisible()
  /* Measured once the sheet has slid up and stopped. */
  await expect
    .poll(async () => {
      const p = (await pick.boundingBox())!
      const x = (await drawer.getByTestId('rows-close').boundingBox())!
      return Math.round(p.y + p.height / 2 - (x.y + x.height / 2))
    })
    .toBe(0)
  await pick.click()
  await expect(drawer.getByTestId('model-menu')).toHaveCSS('opacity', '1')
  const m = (await drawer.getByTestId('model-menu').boundingBox())!
  expect(m.x).toBeGreaterThanOrEqual(0)
  expect(m.x + m.width).toBeLessThanOrEqual(375)
  await page.screenshot(shot('model-pick-phone'))
})

test('S6 one pick: HAIKU on the Insights read is the ASK drawer’s too', async ({
  page,
}) => {
  await proPath(page)
  await start(page)
  await testClient().mutation(anyApi.e2eFundamentals.share, {
    shape: 'add',
    reading: { ageDays: 0.2 },
  })
  await page.goto('/finances?room=insights')
  const hero = page.getByTestId('read-hero')
  const read = hero.getByTestId('model-pick')
  await expect(read).toHaveText('PRO PLAN · SONNET 5.5 ▾')
  await read.click()
  await hero.getByTestId('model-option').first().click()
  await expect(read).toHaveText('PRO PLAN · HAIKU 5.5 ▾')
  /* Not read yet: the model line names the one the press asks. */
  await expect(hero.locator('.ins-model')).toHaveText('HAIKU 5.5')
  await page.screenshot(shot('model-pick-read'))

  await page.getByTestId('ask-open').click()
  const drawer = page.getByTestId('ask-drawer')
  await expect(drawer).toHaveAttribute('aria-hidden', 'false')
  await expect(drawer.getByTestId('model-pick')).toHaveText(
    'PRO · HAIKU 5.5 ▾',
  )
  await expect(drawer.getByTestId('ask-pay')).toHaveCount(0)
})
