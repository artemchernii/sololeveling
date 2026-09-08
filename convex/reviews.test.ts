/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, test } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const SOMEONE_ELSE = 'https://clerk.test|user_them'
const WEEK = '2026-09-07'

function as(subject: string) {
  return convexTest(schema, modules).withIdentity({ tokenIdentifier: subject })
}

describe('a week is written before it is closed', () => {
  test('there is nothing there until something is saved', async () => {
    expect(
      await as(ME).query(api.reviews.forWeek, { periodStart: WEEK }),
    ).toBeNull()
  })

  test('saving twice edits the same week rather than making a second', async () => {
    const t = as(ME)
    const first = await t.mutation(api.reviews.save, {
      periodStart: WEEK,
      answers: { didHappen: 'Shipped the calendar' },
    })
    const second = await t.mutation(api.reviews.save, {
      periodStart: WEEK,
      answers: { didHappen: 'Shipped the calendar', avoided: 'The gym' },
    })
    expect(second).toBe(first)

    const review = await t.query(api.reviews.forWeek, { periodStart: WEEK })
    expect(review?.answers.avoided).toBe('The gym')
  })

  test('a different week is a different row', async () => {
    const t = as(ME)
    await t.mutation(api.reviews.save, {
      periodStart: WEEK,
      answers: { didHappen: 'This week' },
    })
    await t.mutation(api.reviews.save, {
      periodStart: '2026-09-14',
      answers: { didHappen: 'Next week' },
    })
    const review = await t.query(api.reviews.forWeek, { periodStart: WEEK })
    expect(review?.answers.didHappen).toBe('This week')
  })
})

describe('closing needs the sentence that changes something', () => {
  test('a week with answers but no decision will not close', async () => {
    const t = as(ME)
    await t.mutation(api.reviews.save, {
      periodStart: WEEK,
      answers: { didHappen: 'A lot', avoided: 'The gym' },
    })
    await expect(
      t.mutation(api.reviews.close, { periodStart: WEEK }),
    ).rejects.toThrow(/what changes next week/i)
  })

  test('whitespace is not a decision', async () => {
    const t = as(ME)
    await t.mutation(api.reviews.save, {
      periodStart: WEEK,
      answers: {},
      decision: '   ',
    })
    await expect(
      t.mutation(api.reviews.close, { periodStart: WEEK }),
    ).rejects.toThrow()
  })

  test('with a decision it closes and says when', async () => {
    const t = as(ME)
    await t.mutation(api.reviews.save, {
      periodStart: WEEK,
      answers: {},
      decision: 'Gym before the laptop opens',
    })
    await t.mutation(api.reviews.close, { periodStart: WEEK })
    const review = await t.query(api.reviews.forWeek, { periodStart: WEEK })
    expect(review?.closedAt).toBeTypeOf('number')
  })

  test('an unwritten week cannot be closed', async () => {
    await expect(
      as(ME).mutation(api.reviews.close, { periodStart: WEEK }),
    ).rejects.toThrow()
  })

  /* Closing is a ritual, not a lock: a review is a record of what you thought,
     and correcting it later is honest. */
  test('a closed week can still be edited, and reopened', async () => {
    const t = as(ME)
    await t.mutation(api.reviews.save, {
      periodStart: WEEK,
      answers: {},
      decision: 'Gym first',
    })
    await t.mutation(api.reviews.close, { periodStart: WEEK })

    await t.mutation(api.reviews.save, {
      periodStart: WEEK,
      answers: { avoided: 'Actually, the gym again' },
      decision: 'Gym first, properly',
    })
    expect(
      (await t.query(api.reviews.forWeek, { periodStart: WEEK }))?.closedAt,
    ).toBeTypeOf('number')

    await t.mutation(api.reviews.reopen, { periodStart: WEEK })
    expect(
      (await t.query(api.reviews.forWeek, { periodStart: WEEK }))?.closedAt,
    ).toBeUndefined()
  })
})

describe('ownership', () => {
  test('a week is not visible to anyone else', async () => {
    await as(ME).mutation(api.reviews.save, {
      periodStart: WEEK,
      answers: { didHappen: 'Mine' },
    })
    expect(
      await as(SOMEONE_ELSE).query(api.reviews.forWeek, { periodStart: WEEK }),
    ).toBeNull()
  })

  test('signed out reads nothing', async () => {
    await expect(
      convexTest(schema, modules).query(api.reviews.forWeek, {
        periodStart: WEEK,
      }),
    ).rejects.toThrow()
  })
})
