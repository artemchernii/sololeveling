import { expect, test } from 'vitest'

import { addedWords } from './addedWords'

test('says what came in, not just how many', () => {
  expect(addedWords({ rows: 1, positions: 1, names: ['Gold'] })).toBe(
    '1 position added · Gold',
  )
  expect(
    addedWords({ rows: 33, movements: 2, trades: 31, names: ['AAPL', 'MSFT'] }),
  ).toBe('2 movements, 31 trades added · AAPL, MSFT')
  expect(
    addedWords({
      rows: 6,
      trades: 6,
      names: ['A', 'B', 'C', 'D', 'E', 'F'],
    }),
  ).toBe('6 trades added · A, B, C, D and 2 more')
  expect(addedWords({ rows: 0, trades: 0 })).toBe('nothing new')
  /* An update applied before 9 Oct kept only the count. */
  expect(addedWords({ rows: 3 })).toBe('3 rows added')
})
