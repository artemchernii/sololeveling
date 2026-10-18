import { expect, test } from 'vitest'

import { fit, namedAccounts, transferMatches } from './transferMatch'
import type { Row, Stored } from './transferMatch'

const DAY = 86_400_000
const oct = (d: number) => new Date(2026, 9, d, 12).getTime()

const ACCOUNTS = [
  { id: 'activo', name: 'ActivoBank', tails: [] },
  { id: 'revolut', name: 'Revolut', tails: ['2789'] },
  { id: 'tr', name: 'Trade Republic', tails: [] },
]
const names = (line: string) => namedAccounts(line, ACCOUNTS)

/* His accounts on 11 Oct. Revolut's file wrote ActivoBank's side of the
   €700 top-up on Sat 3 Oct; ActivoBank's screenshot shows it on Tue the
   6th under another name. */
const topUpHere: Stored = {
  id: 'log-topup',
  accountId: 'activo',
  at: oct(3),
  cents: -70000,
  move: true,
  names: ['revolut'],
  paired: true,
  fromOther: true,
}
const compra: Row = {
  key: 'shot:1',
  accountId: 'activo',
  file: 'shot',
  at: oct(6),
  cents: -70000,
  move: false,
  names: names('COMPRA 2789 REVOLUT'),
}
/* ActivoBank sent Trade Republic €505.20 (booked 6 Oct); €500.63 arrived. */
const sent: Stored = {
  id: 'log-sent',
  accountId: 'activo',
  at: oct(6),
  cents: -50520,
  move: true,
  names: ['tr'],
  paired: false,
  fromOther: false,
}
const arrived: Row = {
  key: 'tr:0',
  accountId: 'tr',
  file: 'tr',
  at: oct(2),
  cents: 50063,
  move: false,
  names: [],
}

test('a line names his accounts by name and by card ending', () => {
  expect(names('COMPRA 2789 REVOLUT')).toEqual(['revolut'])
  expect(names('TRF P/ Trade Republic Bank GmbH')).toEqual(['tr'])
  expect(names('Top-up by *2789')).toEqual(['revolut'])
  expect(names('COMPRA 12789 CONTINENTE')).toEqual([])
  expect(names('Revolutionary Cafe')).toEqual([])
})

test('the card that paid names no account', () => {
  expect(names('COMPRA 2789 TRADE REPUBLIC BERLIN DE')).toEqual(['tr'])
  expect(names('COMPRA 2789 PINGO DOCE LISBOA')).toEqual([])
})

test('his €700 top-up, booked three days later under another name: already added', () => {
  expect(transferMatches([compra], [topUpHere])).toEqual([
    {
      key: 'shot:1',
      state: 'sure',
      sides: [{ id: 'log-topup', here: true, feeCents: 0 }],
    },
  ])
})

test('the same row with nothing in its line naming Revolut is a question', () => {
  const [found] = transferMatches([{ ...compra, names: [] }], [topUpHere])
  expect(found.state).toBe('ask')
})

test('a row this bank wrote itself is not offered: two €700 payments are two', () => {
  expect(
    transferMatches([compra], [{ ...topUpHere, fromOther: false }]),
  ).toEqual([])
})

test('€505.20 sent, €500.63 arrived: one transfer and a €4.57 fee, asked', () => {
  expect(transferMatches([arrived], [sent])).toEqual([
    {
      key: 'tr:0',
      state: 'ask',
      sides: [{ id: 'log-sent', here: false, feeCents: 457 }],
    },
  ])
})

test('the other order: the arrival is in the app, the sending file is dropped', () => {
  const row: Row = {
    key: 'shot:2',
    accountId: 'activo',
    file: 'shot',
    at: oct(6),
    cents: -50520,
    move: true,
    names: ['tr'],
  }
  const had: Stored = {
    id: 'log-arrived',
    accountId: 'tr',
    at: oct(2),
    cents: 50063,
    move: false,
    names: [],
    paired: false,
    fromOther: false,
  }
  expect(transferMatches([row], [had])).toEqual([
    {
      key: 'shot:2',
      state: 'ask',
      sides: [{ id: 'log-arrived', here: false, feeCents: 457 }],
    },
  ])
})

test("ActivoBank's file wrote Trade Republic's side as €505.20: its own €500.63 is that, a fee less", () => {
  const wrote: Stored = {
    id: 'log-side',
    accountId: 'tr',
    at: oct(6),
    cents: 50520,
    move: true,
    names: ['activo'],
    paired: true,
    fromOther: true,
  }
  expect(transferMatches([arrived], [wrote])).toEqual([
    {
      key: 'tr:0',
      state: 'ask',
      sides: [{ id: 'log-side', here: true, feeCents: 457 }],
    },
  ])
})

test('to the cent, both read as his own money: sure with no name', () => {
  const [found] = transferMatches(
    [{ ...arrived, cents: 50520, move: true }],
    [{ ...sent, names: [] }],
  )
  expect(found.state).toBe('sure')
})

test('both files in one drop: each row finds the other, once', () => {
  const topUp: Row = {
    key: 'rev:4',
    accountId: 'revolut',
    file: 'rev',
    at: oct(3),
    cents: 70000,
    move: true,
    names: [],
  }
  expect(transferMatches([topUp, compra], [])).toEqual([
    {
      key: 'rev:4',
      state: 'sure',
      sides: [{ id: 'shot:1', here: false, feeCents: 0 }],
    },
    {
      key: 'shot:1',
      state: 'sure',
      sides: [{ id: 'rev:4', here: false, feeCents: 0 }],
    },
  ])
})

test('two sides fit one row: asked, the closest first', () => {
  const row: Row = { ...arrived, at: oct(9), cents: 50000 }
  const a: Stored = { ...sent, id: 'a', at: oct(7), cents: -50000 }
  const b: Stored = { ...a, id: 'b', accountId: 'revolut', at: oct(8) }
  expect(transferMatches([row], [a, b])).toEqual([
    {
      key: 'tr:0',
      state: 'ask',
      sides: [
        { id: 'b', here: false, feeCents: 0 },
        { id: 'a', here: false, feeCents: 0 },
      ],
    },
  ])
})

test('one stored side, two rows: only the closer row takes it', () => {
  const far: Row = { ...arrived, key: 'tr:1', at: oct(1), cents: 50520 }
  const near: Row = { ...arrived, key: 'tr:2', at: oct(5), cents: 50520 }
  expect(transferMatches([far, near], [sent]).map((f) => f.key)).toEqual([
    'tr:2',
  ])
})

test('what does not fit', () => {
  const side = { ...sent, file: null }
  /* A fee over 2%, and over €10. */
  expect(fit({ ...arrived, cents: 49000 }, side)).toBeNull()
  expect(
    fit({ ...arrived, cents: 198900 }, { ...side, cents: -200000 }),
  ).toBeNull()
  /* More arrived than was sent. */
  expect(fit({ ...arrived, cents: 50600 }, side)).toBeNull()
  /* Six days apart. */
  expect(fit({ ...arrived, at: side.at - 6 * DAY }, side)).toBeNull()
  /* It already has its other side. */
  expect(fit(arrived, { ...side, paired: true })).toBeNull()
  /* Two rows that both left. */
  expect(fit({ ...arrived, cents: -50520 }, side)).toBeNull()
  /* A payment here and money in there, neither read as his own. */
  expect(fit(arrived, { ...side, move: false, names: [] })).toBeNull()
  /* Two rows of one file. */
  expect(fit(arrived, { ...side, file: 'tr' })).toBeNull()
})
