import { expect, test } from '@playwright/test'
import { anyApi } from 'convex/server'
import type { Page } from '@playwright/test'

import { start, testClient } from './helpers'
import { monthKey, nextMonthWord } from '../src/lib/marketRead'

const shot = (name: string) => ({ path: `e2e/screens/${name}.png` })

/* Insights I4 ASK (21 Oct, docs/specs/2026-10-19-insights.md; mockup
   design/treasury-mockup/ask.html round 2, his "go"). The test backend
   never calls out: the dev server has no Claude Code route under E2E_RUN,
   so a question goes to the API action, which answers with a canned
   answer (src/lib/marketAskCanned.ts) — or NOT REACHED when
   e2eMarketRead.arm says fail. A mock Broadcom is held. */

async function open(page: Page) {
  await start(page)
  await testClient().mutation(anyApi.e2eFundamentals.share, {
    shape: 'add',
    reading: { ageDays: 0.2 },
  })
  await page.goto('/finances?room=insights')
  const ask = page.getByTestId('ask')
  await expect(ask).toBeVisible()
  await expect(page.getByTestId('ask-pay')).toHaveText('💳 API CREDITS')
  return ask
}

test('S1 a question → asking at once → an answer with its kind, facts, model and cost', async ({
  page,
}) => {
  const ask = await open(page)
  /* No question yet: four cards, no thread. */
  await expect(page.getByTestId('ask-suggest')).toHaveCount(4)
  await expect(page.getByTestId('ask-thread')).toHaveCount(0)
  await expect(page.getByTestId('ask-spend')).toHaveText(/· \$0\.00 OF \$2\.00/)
  await ask.scrollIntoViewIfNeeded()
  await page.screenshot({ ...shot('insights-ask-empty'), fullPage: false })

  await page.getByTestId('ask-suggest').first().click()
  /* Pressed: the question shows at once, asking, and nothing more can be sent. */
  await expect(page.getByTestId('ask-q')).toContainText('Explain my allocation')
  await expect(page.getByTestId('ask-asking')).toContainText(
    'READING THE FACTS',
  )
  await expect(page.getByTestId('ask-input')).toBeDisabled()

  const answer = page.getByTestId('ask-answer')
  await expect(answer).toBeVisible({ timeout: 15_000 })
  await expect(answer).toHaveAttribute('data-kind', 'allocation')
  await expect(answer).toContainText('⚖️ ALLOCATION')
  await expect(answer).toContainText('one US chip company')
  await expect(answer.getByTestId('ask-fact')).toHaveCount(2)
  await expect(answer.getByTestId('ask-fact').first()).toContainText('MINE')
  await expect(page.getByTestId('ask-stamp')).toContainText('✦ SONNET 5.5')
  await expect(page.getByTestId('ask-stamp')).toContainText('9.4K IN · 380 OUT')
  await expect(page.getByTestId('ask-stamp')).toContainText('💳 $0.02')
  await expect(page.getByTestId('ask-spend')).toHaveText(/· \$0\.02 OF \$2\.00/)
  await expect(page.getByTestId('ask-count')).toHaveText(
    '1 QUESTION · THIS PAGE',
  )
  await expect(page.getByTestId('ask-input')).toBeEnabled()
  await page.screenshot(shot('insights-ask-answer'))
})

test('S2 🌐 on a typed question → sources and searches', async ({ page }) => {
  await open(page)
  await page.getByTestId('ask-web').click()
  await expect(page.getByTestId('ask-web')).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.getByTestId('ask-input').fill('What did Powell say this week?')
  await page.getByTestId('ask-input').press('Enter')
  await expect(page.getByTestId('ask-q')).toContainText('🌐 What did Powell')
  await expect(page.getByTestId('ask-asking')).toContainText('🌐 SEARCHING')
  const answer = page.getByTestId('ask-answer')
  await expect(answer).toHaveAttribute('data-kind', 'rates', {
    timeout: 15_000,
  })
  await expect(page.getByTestId('ask-sources')).toContainText(
    'REUTERS · 16 OCT',
  )
  await expect(page.getByTestId('ask-stamp')).toContainText('🌐 2 SEARCHES')
  await expect(page.getByTestId('ask-stamp')).toContainText('💳 $0.08')
  await page.screenshot(shot('insights-ask-web'))
})

test('S3 failed → NOT REACHED, nothing paid, ASK AGAIN answers', async ({
  page,
}) => {
  await open(page)
  await testClient().mutation(anyApi.e2eMarketRead.arm, { shape: 'fail' })
  await page.getByTestId('ask-suggest').nth(1).click()
  const failed = page.getByTestId('ask-failed')
  await expect(failed).toBeVisible({ timeout: 15_000 })
  await expect(failed).toContainText('✕ NOT REACHED')
  await expect(failed).toContainText('$0.00 · NOTHING PAID')
  await expect(failed).toContainText('NO RETRY')
  await expect(page.getByTestId('ask-q')).toContainText('✕ NOT ANSWERED')
  await expect(page.getByTestId('ask-spend')).toHaveText(/· \$0\.00 OF \$2\.00/)
  await page.screenshot(shot('insights-ask-failed'))

  await testClient().mutation(anyApi.e2eMarketRead.arm, { shape: 'calm' })
  await page.getByTestId('ask-again').click()
  await expect(page.getByTestId('ask-answer')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('ask-failed')).toHaveCount(0)
  await expect(page.getByTestId('ask-q')).toHaveCount(1)
})

test('S4 cap reached → the box gives way to CAP REACHED', async ({ page }) => {
  await open(page)
  await testClient().mutation(anyApi.e2eMarketRead.spend, { usd: 2 })
  const cap = page.getByTestId('ask-cap')
  await expect(cap).toContainText('CAP REACHED')
  await expect(cap).toContainText('$2.00 OF $2.00')
  await expect(cap).toContainText(`NEXT ${nextMonthWord(monthKey(Date.now()))}`)
  await expect(page.getByTestId('ask-input')).toHaveCount(0)
  await expect(page.getByTestId('ask-suggest').first()).toBeDisabled()
  await page.screenshot(shot('insights-ask-cap'))
})

test('S5 reload → the thread is gone; switching rooms keeps it', async ({
  page,
}) => {
  await open(page)
  await page.getByTestId('ask-suggest').first().click()
  await expect(page.getByTestId('ask-answer')).toBeVisible({ timeout: 15_000 })
  await page.getByRole('link', { name: 'Portfolio', exact: true }).click()
  await page.getByRole('link', { name: 'Insights', exact: true }).click()
  await expect(page.getByTestId('ask-answer')).toBeVisible()
  await page.reload()
  await expect(page.getByTestId('ask')).toBeVisible()
  await expect(page.getByTestId('ask-thread')).toHaveCount(0)
  await expect(page.getByTestId('ask-suggest')).toHaveCount(4)
  /* The answer's cost was counted; the words were not kept. */
  await expect(page.getByTestId('ask-spend')).toHaveText(/· \$0\.02 OF \$2\.00/)
})

test('S6 phone width: no sideways scroll', async ({ page }) => {
  await open(page)
  await page.getByTestId('ask-suggest').first().click()
  await expect(page.getByTestId('ask-answer')).toBeVisible({ timeout: 15_000 })
  await page.setViewportSize({ width: 375, height: 812 })
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      ),
    )
    .toBeLessThanOrEqual(0)
  await page.getByTestId('ask').scrollIntoViewIfNeeded()
  await page.screenshot(shot('insights-ask-phone'))
})

test('S7 asked for ideas → cards with fetched prices; owned, in NEXT and unknown tickers left out', async ({
  page,
}) => {
  await open(page)
  /* A read first, so NEXT shows its ideas. */
  await page.getByTestId('read-market').click()
  await expect(page.getByTestId('read-hero')).toHaveAttribute(
    'data-state',
    'done',
    { timeout: 15_000 },
  )
  await expect(page.getByTestId('idea-card')).toHaveCount(2, {
    timeout: 15_000,
  })
  await page.getByTestId('ask-input').fill('Give me more ideas')
  await page.getByTestId('ask-send').click()
  const answer = page.getByTestId('ask-answer')
  await expect(answer).toHaveAttribute('data-kind', 'ideas', {
    timeout: 15_000,
  })
  await expect(answer).toContainText('💡 IDEAS')
  await expect(page.getByTestId('ask-in-next')).toContainText(
    'IN NEXT · NOVO-B.CO',
  )
  const cards = answer.getByTestId('ask-idea')
  await expect(cards).toHaveCount(2, { timeout: 15_000 })
  await expect(answer.locator('[data-ticker="JNJ"]')).toContainText('$187')
  await expect(answer.locator('[data-ticker="JNJ"]')).toContainText(
    'MODEL · NOT ADVICE',
  )
  await expect(answer.locator('[data-ticker="EXV1.DE"]')).toContainText(
    'WRONG IF',
  )
  await expect(answer.locator('[data-ticker="ZZZZ"]')).toHaveCount(0)
  await expect(answer.locator('[data-ticker="NOVO-B.CO"]')).toHaveCount(0)
  /* NEXT keeps its own two. */
  await expect(page.getByTestId('idea-card')).toHaveCount(2)
  /* They arrive one after another, then stand. */
  await expect(cards.last()).toHaveCSS('opacity', '1')
  await answer.scrollIntoViewIfNeeded()
  await page.screenshot(shot('insights-ask-ideas'))
})
