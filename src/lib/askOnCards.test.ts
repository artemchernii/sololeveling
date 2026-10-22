import { expect, test } from 'vitest'

import { askAlloc, askBox, askIdea, askLine } from './askOnCards'

test('a read line asks why of its title, its own end mark dropped', () => {
  expect(askLine('Tech is 41% of the money')).toBe(
    'Tech is 41% of the money — why?',
  )
  expect(askLine(' Chips ran hot! ')).toBe('Chips ran hot — why?')
})

test('a box asks about its call, else its move, else its name', () => {
  const base = { name: 'AVGO', frozen: false, move: '+7.4%', period: '1M' }
  expect(askBox({ ...base, call: 'wait' })).toBe('Why is AVGO WAIT?')
  expect(askBox({ ...base, call: 'add' })).toBe('Why is AVGO ADD?')
  expect(askBox({ ...base, call: null })).toBe('What moved AVGO +7.4% in 1M?')
  expect(askBox({ ...base, call: null, move: null })).toBe('What about AVGO?')
  expect(askBox({ ...base, name: 'OZON', call: null, frozen: true })).toBe(
    'Why is OZON FROZEN?',
  )
})

test('an allocation line asks with both numbers, the world only where it has one', () => {
  expect(askAlloc('tech', 41.2, 26)).toBe('Why is tech 41%, world 26%?')
  expect(askAlloc('gold', 6, 0)).toBe('Why is gold 6%, world 0%?')
  expect(askAlloc('us', 71, null)).toBe('Why is US 71%?')
  expect(askAlloc('health', null, 10)).toBe('Why is health MISSING?')
})

test('an idea asks what could go wrong', () => {
  expect(askIdea('JNJ')).toBe('What could go wrong with JNJ?')
})
