import { expect, test } from '@playwright/test'
import { anyApi } from 'convex/server'

import { start, testClient } from './helpers'

const shot = (name: string) => ({ path: `e2e/screens/${name}.png` })

/* R8 · S3b (docs/specs/2026-10-27-delete-account.md, mockup
   design/firstrun-mockup/delete.html). The Clerk test user is shared by
   every test, so Clerk's own delete is never let through: any DELETE to
   Clerk is aborted, and the app signs out instead — the page still ends on
   sign-in with what went. */

test('a guest: DELETE ACCOUNT → NO UNDO → DELETE ALL → deleting → nothing of theirs left', async ({
  page,
}) => {
  /* Clerk's browser SDK sends a delete as POST ?_method=DELETE. */
  await page.route('**/*', (route) => {
    const r = route.request()
    const del = r.method() === 'DELETE' || r.url().includes('_method=DELETE')
    /* Only the user's own delete (/v1/me): signing out still goes through. */
    return del && /clerk.*\/v1\/me(\?|$)/.test(r.url())
      ? route.abort()
      : route.continue()
  })
  await start(page)
  const c = testClient()
  await c.mutation(anyApi.e2eFirstRun.newPerson, {})
  await c.mutation(anyApi.profiles.finishFirstRun, {
    lang: 'en',
    timezone: 'Europe/Lisbon',
  })
  await page.goto('/settings')

  const card = page.getByRole('region', { name: 'Delete account' })
  /* The test user also owns other tests' rows, so any count will do. */
  await expect(card.getByTestId('delete-rows')).toHaveText(/^\d+$/)
  await card.getByRole('button', { name: 'DELETE ACCOUNT' }).click()
  await expect(card.getByText('NO UNDO')).toBeVisible()
  await page.screenshot(shot('delete-armed'))

  await card.getByRole('button', { name: 'KEEP' }).click()
  await expect(card.getByText('NO UNDO')).toHaveCount(0)
  await card.getByRole('button', { name: 'DELETE ACCOUNT' }).click()
  await card.getByRole('button', { name: 'DELETE ALL' }).click()
  await expect(card.getByText(/^DELETING · \d+ OF/)).toBeVisible()
  await page.screenshot(shot('delete-deleting'))

  /* Everything of theirs is gone: no profile, no row — the next open is a
     new person's. Clerk's own account delete is the one step this test
     cannot press (above); Artem's second account checks it. */
  await expect
    .poll(async () => (await c.query(anyApi.profiles.mine, {})).needsFirstRun, {
      timeout: 30_000,
    })
    .toBe(true)
  /* Still a guest: anyone not Artem is one, profile or not (27 Oct). */
  expect(await c.query(anyApi.account.counts, {})).toMatchObject({
    guest: true,
  })
})

test('Artem has no delete card', async ({ page }) => {
  await start(page)
  await page.goto('/settings')
  await expect(page.getByText('Appearance').first()).toBeVisible()
  await expect(
    page.getByRole('region', { name: 'Delete account' }),
  ).toHaveCount(0)
})
