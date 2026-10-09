import { expect, test } from '@playwright/test'

import { start } from './helpers'

const shot = (name: string) => ({ path: `e2e/screens/${name}.png` })

/* Loading (9 Oct, loading.html). His words: "skeleton was really bad, felt
   like app crashed", "waiting for clerk auth … like nothing is going on".
   The data connection is held back so the wait can be seen. */
test('Finances: its own frame while the numbers load; a tab loads when first opened', async ({
  page,
}) => {
  await start(page)
  let release = () => {}
  const held = new Promise<void>((r) => (release = r))
  await page.routeWebSocket(/:3210\/api\/.*\/sync/, async (ws) => {
    await held
    ws.connectToServer()
  })
  await page.goto('/finances')
  await expect(page.getByText('capital · cash · investments')).toBeVisible()
  for (const label of ['investments', 'banks', 'cash'])
    await expect(
      page.getByRole('status').getByText(label, { exact: true }),
    ).toBeVisible()
  /* Flow is not asked for until it is opened. */
  await expect(page.getByText('Future balance')).toHaveCount(0)
  await page.waitForTimeout(1200)
  await page.screenshot(shot('loading-finances'))

  release()
  await expect(page.getByText('Revolut').first()).toBeVisible()
  await expect(page.getByRole('status', { name: 'Loading' })).toHaveCount(0)
  await page.getByRole('link', { name: /Flow/ }).click()
  await expect(page.getByText('Future balance')).toBeVisible()
})

test('sign-in: the System window says what is happening until Clerk answers', async ({
  page,
}) => {
  let release = () => {}
  const held = new Promise<void>((r) => (release = r))
  await page.route(/clerk.*\.js/, async (route) => {
    await held
    await route.continue()
  })
  await page.goto('/login')
  const wait = page.getByRole('status', { name: 'signing in' })
  await expect(wait).toBeVisible()
  await expect(wait.getByText('checking your session')).toBeVisible()
  await page.waitForTimeout(600)
  await page.screenshot(shot('loading-signin'))
  release()
  await expect(wait).toBeHidden({ timeout: 20_000 })
})
