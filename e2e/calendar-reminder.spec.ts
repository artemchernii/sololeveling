import { expect, test } from '@playwright/test'
import { anyApi } from 'convex/server'

import { start, testClient } from './helpers'

const shot = (name: string) => ({ path: `e2e/screens/${name}.png` })

/* N1b (17 Oct, docs/specs/2026-10-15-n1-notifications.md): "if I schedule
   stretch or run or class you send me reminder 10 min before". A new event
   opens at 10 min; saved, the server holds one reminder job for it. */

const pad = (n: number) => String(n).padStart(2, '0')

test('a new event opens at 10 min and saves its reminder job', async ({
  page,
}) => {
  await start(page)
  await page.goto('/calendar')

  await page
    .getByRole('button', { name: /^Add an event at 09:00/ })
    .first()
    .click()
  const dialog = page.getByRole('dialog', { name: 'New event' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: '10 min' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(dialog.getByRole('button', { name: 'None' })).toHaveAttribute(
    'aria-pressed',
    'false',
  )

  /* Tomorrow at 21:00, so its reminder is still ahead whenever this runs. */
  const t = new Date()
  t.setDate(t.getDate() + 1)
  t.setHours(21, 0, 0, 0)
  const title = `Run ${Date.now()}`
  await dialog.getByPlaceholder(/Gym, PT/).fill(title)
  await dialog
    .locator('input[type="datetime-local"]')
    .fill(
      `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T21:00`,
    )
  await dialog.locator('input[type="time"]').fill('22:00')
  await dialog.screenshot(shot('calendar-reminder-new'))

  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog.getByRole('status', { name: 'Saving' })).toBeVisible()
  await expect(dialog.getByText('Event added')).toBeVisible()
  await expect(dialog).toBeHidden()

  const rows = (await testClient().query(anyApi.events.listInRange, {
    from: t.getTime() - 60_000,
    to: t.getTime() + 60_000,
  })) as Array<{ title: string; remindMin?: number; remindJob?: string }>
  const saved = rows.find((r) => r.title === title)
  expect(saved?.remindMin).toBe(10)
  expect(saved?.remindJob).toBeTruthy()
})
