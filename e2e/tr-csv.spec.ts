import { expect, test } from '@playwright/test'
import { anyApi } from 'convex/server'

import { start, testClient } from './helpers'

const shot = (name: string) => ({ path: `e2e/screens/${name}.png` })

/* Trade Republic's own CSV export (21 Nov): money rows and buys in one
   file, read with no model. Mock Trade Republic holds €300. */

const HEADER =
  '"datetime","date","account_type","category","type","asset_class","name","symbol","shares","price","amount","fee","tax","currency","original_amount","original_currency","fx_rate","description","transaction_id","counterparty_name","counterparty_iban","payment_reference","mcc_code"'

const day = (t: number) => new Date(t).toISOString().slice(0, 10)

function trCsv(days: Array<number>): Buffer {
  const [, , d3, d4] = days
  return Buffer.from(
    [
      HEADER,
      `"${day(d3)}T09:30:00Z","${day(d3)}","DEFAULT","CASH","DIVIDEND","STOCK","MasterCard","US57636Q1040","0.5","","0.300000","","-0.06","EUR","0.33","USD","0.9","Cash Dividend for ISIN US57636Q1040","a1","","","",""`,
      `"${day(d4)}T19:42:00Z","${day(d4)}","DEFAULT","TRADING","BUY","STOCK","NVIDIA","US67066G1040","0.5000000000","100.0000000000","-50.00","-1.00","-0.04","EUR","","","","Buy trade US67066G1040 NVIDIA CORP., quantity: 0.5","a2","","","",""`,
    ].join('\n'),
  )
}

test('a Trade Republic export: its dividend and its buy, read and saved', async ({
  page,
}) => {
  const days = await start(page)
  await testClient().mutation(anyApi.e2eUpdate.addBroker, {})
  await page.goto('/finances')
  await page
    .getByRole('button', { name: 'Open Trade Republic' })
    .getByRole('button', { name: 'update' })
    .click()
  const sheet = page.getByRole('dialog', { name: 'update · Trade Republic' })
  await page.locator('input[type=file]').setInputFiles({
    name: 'Transaction export.csv',
    mimeType: 'text/csv',
    buffer: trCsv(days),
  })
  const apply = sheet.getByRole('button', { name: /apply 1 account/ })
  await expect(apply).toBeVisible({ timeout: 30_000 })
  await expect(sheet.getByText('1 new', { exact: true })).toBeVisible()
  await expect(sheet.getByText(/1 trades?/)).toBeVisible()
  await page.waitForTimeout(700)
  await page.screenshot(shot('tr-csv-check'))
  await apply.click()
  await expect(sheet.getByText('saving…')).toBeVisible()
  /* 300 + 0.24 (0.30 less 0.06 tax) − 51.04 (50 and 1.04 fee and tax). */
  await expect(sheet.getByText('Trade Republic updated')).toBeVisible({
    timeout: 30_000,
  })
  await expect(sheet.getByText('€249.20 · from')).toBeVisible()
  await page.screenshot(shot('tr-csv-landed'))
})
