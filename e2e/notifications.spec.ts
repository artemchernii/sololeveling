import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { anyApi } from 'convex/server'

import { start, testClient } from './helpers'

const shot = (name: string) => ({ path: `e2e/screens/${name}.png` })

/* N1 (15 Oct, docs/specs/2026-10-15-n1-notifications.md). No real push in
   a test: the browser's permission, worker and subscription are stubbed
   before the page loads, and the test backend has a public key and no
   private one, so nothing is ever sent. */

const IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'

/** The browser as an installed app whose permission is `perm`. */
async function stubPush(page: Page, perm: NotificationPermission) {
  await page.addInitScript((initial) => {
    const w = window as unknown as Record<string, unknown>
    let permission = initial
    let sub: object | null = null
    const fakeSub = {
      endpoint: 'https://push.example.test/e2e-device',
      toJSON: () => ({ keys: { p256dh: 'p256dh-e2e', auth: 'auth-e2e' } }),
    }
    const reg = {
      pushManager: {
        getSubscription: async () => sub,
        subscribe: async () => {
          await new Promise((r) => setTimeout(r, 400))
          sub = fakeSub
          return fakeSub
        },
      },
    }
    class FakeNotification {
      static get permission() {
        return permission
      }
      static async requestPermission() {
        permission = 'granted'
        return permission
      }
    }
    w.Notification = FakeNotification
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        register: async () => reg,
        getRegistration: async () =>
          sub || permission === 'granted' ? reg : undefined,
        ready: Promise.resolve(reg),
      },
    })
    const mm = window.matchMedia.bind(window)
    window.matchMedia = (q: string) =>
      q === '(display-mode: standalone)'
        ? ({ matches: true } as MediaQueryList)
        : mm(q)
  }, perm)
}

test('S1 an iPhone in Safari sees the three taps', async ({ browser }) => {
  const ctx = await browser.newContext({
    userAgent: IOS,
    viewport: { width: 390, height: 844 },
  })
  const page = await ctx.newPage()
  await start(page)
  await page.goto('/phone')
  const win = page.getByTestId('phone-window')
  await expect(win).toHaveAttribute('data-state', 'in-safari')
  await expect(win.getByText('[ IPHONE ]')).toBeVisible()
  await expect(win.getByText('IN SAFARI')).toBeVisible()
  await expect(win.getByText('1 · SHARE')).toBeVisible()
  await win.getByText('2 · ADD').click()
  await expect(win.getByText('Add to Home Screen')).toBeVisible()
  await page.waitForTimeout(700) // the window has opened
  await page.screenshot(shot('n1-in-safari'))
  await ctx.close()
})

test('S2 S3 ALLOW, then a test lands in the bell', async ({ page }) => {
  await stubPush(page, 'default')
  await start(page)
  await page.goto('/phone')
  const win = page.getByTestId('phone-window')
  await expect(win).toHaveAttribute('data-state', 'ask')
  await expect(win.getByText('NOT ON')).toBeVisible()
  await win.getByRole('button', { name: 'ALLOW' }).click()
  await expect(win.getByText('allowing…')).toBeVisible()
  await expect(win).toHaveAttribute('data-state', 'on')
  await expect(win.getByText('10 MIN BEFORE')).toBeVisible()

  await win.getByRole('button', { name: 'SEND A TEST' }).click()
  await expect(win.getByText('SENT')).toBeVisible()
  await page.waitForTimeout(700) // the window has opened
  await page.screenshot(shot('n1-on'))

  await page.getByRole('button', { name: 'Notifications' }).click()
  const panel = page.getByTestId('bell-panel')
  await expect(panel.getByTestId('bell-row')).toHaveCount(1)
  await expect(panel.getByText('Test', { exact: true })).toBeVisible()
})

test('S4 blocked shows where to allow it', async ({ page }) => {
  await stubPush(page, 'denied')
  await start(page)
  await page.goto('/phone')
  const win = page.getByTestId('phone-window')
  await expect(win).toHaveAttribute('data-state', 'blocked')
  await expect(win.getByText('BLOCKED')).toBeVisible()
  await expect(win.getByText(/SITE SETTINGS → NOTIFICATIONS/)).toBeVisible()
})

test('S5 the bell lists today, a row opens and its dot goes', async ({
  page,
}) => {
  await start(page)
  const client = testClient()
  await client.mutation(anyApi.push.subscribe, {
    endpoint: 'https://push.example.test/iphone',
    p256dh: 'p',
    auth: 'a',
    device: 'iphone',
  })
  await client.mutation(anyApi.push.sendTest, {})
  await client.mutation(anyApi.push.sendTest, {})
  await page.goto('/dashboard')
  await expect(page.getByTestId('bell-count')).toHaveText('2')
  await page.getByRole('button', { name: 'Notifications' }).click()
  const panel = page.getByTestId('bell-panel')
  await expect(panel.getByText('[ TODAY ]')).toBeVisible()
  await expect(panel.getByText('2 NEW')).toBeVisible()
  await expect(panel.getByText('NOW')).toBeVisible()
  await expect(panel.getByText('EARLIER TODAY')).toBeVisible()
  await expect(panel.getByText('iPhone')).toBeVisible()
  await page.waitForTimeout(700) // the window has opened
  await page.screenshot(shot('n1-bell'))

  await panel.getByTestId('bell-row').first().click()
  await expect(page).toHaveURL(/\/phone$/)
  await expect(page.getByTestId('bell-count')).toHaveText('1')
})

test('S6 S7 nothing today, no iPhone: the QR', async ({ page }) => {
  await start(page)
  await page.goto('/dashboard')
  await expect(page.getByTestId('bell-count')).toHaveCount(0)
  await page.getByRole('button', { name: 'Notifications' }).click()
  const panel = page.getByTestId('bell-panel')
  await expect(panel.getByText('NOTHING TODAY')).toBeVisible()
  await expect(panel.getByTestId('bell-qr')).toBeVisible()
  await expect(panel.getByText('NO IPHONE')).toBeVisible()
  await page.waitForTimeout(700) // the window has opened
  await page.screenshot(shot('n1-bell-empty'))
})
