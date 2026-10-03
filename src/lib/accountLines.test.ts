import { describe, expect, test } from 'vitest'

import {
  accountLines,
  firstDay,
  joinGroups,
  laneClusters,
  laneRows,
  layout,
  niceStep,
  ownMoves,
} from './accountLines'

const D = 86_400_000

describe('accountLines', () => {
  test("a broker's line is its cash and its shares together; a day with neither is not drawn", () => {
    expect(
      accountLines(
        [
          { accountId: 't212', values: [null, 12994.22] },
          { accountId: 'bpi', values: [5077.97, 5000] },
        ],
        [{ accountId: 't212', values: [null, 2017.36] }],
      ),
    ).toEqual([
      { accountId: 't212', values: [null, 15011.58] },
      { accountId: 'bpi', values: [5077.97, 5000] },
    ])
  })
})

describe('layout', () => {
  test('an account with one day in the range is a pin and does not set the scale (Trading 212, 3 Oct)', () => {
    const l = layout(
      [
        { accountId: 't212', values: [null, null, 15011] },
        { accountId: 'tr', values: [5600, 5700, 5753] },
        { accountId: 'bpi', values: [null, 3497, 2740] },
      ],
      0,
    )
    expect(l).toEqual({ lined: ['tr', 'bpi'], pinned: ['t212'], step: 2000 })
  })
  test('only pins: they set the scale, nothing else could', () => {
    expect(layout([{ accountId: 'a', values: [null, 900] }], 0).step).toBe(250)
  })
  test('the range starts where it says', () => {
    expect(
      layout([{ accountId: 'a', values: [99999, 100, 120] }], 1).step,
    ).toBe(50)
  })
})

test('nice steps: 1 · 2 · 2.5 · 5 × 10ⁿ, four of them reaching the top', () => {
  expect([5753, 7999, 450, 15011, 0].map(niceStep)).toEqual([
    2000, 2000, 200, 5000, 1,
  ])
})

test('the first day an account has a value', () => {
  expect([firstDay([null, null, 3]), firstDay([null])]).toEqual([2, null])
})

test('accounts that joined within a week share one tag', () => {
  expect(
    joinGroups([
      { accountId: 'activo', at: 3 * D },
      { accountId: 'bpi', at: 1 * D },
      { accountId: 'revolut', at: 2 * D },
      { accountId: 't212', at: 64 * D },
    ]),
  ).toEqual([
    { at: 1 * D, accountIds: ['bpi', 'revolut', 'activo'] },
    { at: 64 * D, accountIds: ['t212'] },
  ])
})

describe('ownMoves', () => {
  test('his transfers once each, whichever side names the other account (3 Oct)', () => {
    const row = (
      day: number,
      accountId: string,
      value: number,
      otherAccountId: string | null,
    ) => ({ at: day * D, accountId, value, otherAccountId })
    expect(
      ownMoves([
        row(1, 'bpi', -1100, 'activo'),
        row(1, 'activo', 1100, null),
        row(33, 'revolut', 700, 'activo'),
        row(33, 'activo', -700, 'revolut'),
        row(32, 'activo', 1000, 'bpi'),
        row(32, 'bpi', -1000, 'activo'),
        row(32, 'revolut', -312.33, 'revolut'),
        row(18, 'tr', 2400, null),
      ]),
    ).toEqual([
      { at: 1 * D, from: 'bpi', to: 'activo', amount: 1100 },
      { at: 32 * D, from: 'bpi', to: 'activo', amount: 1000 },
      { at: 33 * D, from: 'activo', to: 'revolut', amount: 700 },
    ])
  })
})

test('lane rows: a label that would overlap one already there drops to the second row', () => {
  expect(
    laneRows([
      { start: 100, end: 220 },
      { start: 150, end: 270 },
      { start: 400, end: 520 },
      // a right-edge label reading leftwards into the one before
      { start: 330, end: 410 },
      { start: 600, end: 650 },
    ]),
  ).toEqual([0, 1, 0, 1, 0])
})

test('events too close to label apart become one cluster', () => {
  expect(laneClusters([400, 100, 130, 160, 300, 900], 90)).toEqual([
    [1, 2, 3],
    [4],
    [0],
    [5],
  ])
})
