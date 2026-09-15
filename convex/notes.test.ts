/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, test } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const SOMEONE_ELSE = 'https://clerk.test|user_them'

/* One backend per call. Fine for one person; never two of these to test
   ownership — two convexTest() backends are two databases, so "they cannot
   see my row" would pass even if every query returned everyone's. */
function as(subject: string) {
  return convexTest(schema, modules).withIdentity({ tokenIdentifier: subject })
}

/* Two people in one database: my row is really there when they look for it,
   and my id is real when they pass it. */
function twoOwners() {
  const t = convexTest(schema, modules)
  return {
    mine: t.withIdentity({ tokenIdentifier: ME }),
    theirs: t.withIdentity({ tokenIdentifier: SOMEONE_ELSE }),
  }
}

describe('a note is a thing you wrote down', () => {
  test('a title alone is enough', async () => {
    const t = as(ME)
    await t.mutation(api.notes.create, { title: 'Ask about the lease' })
    const notes = await t.query(api.notes.list, {})
    expect(notes).toHaveLength(1)
    expect(notes[0].body).toBe('')
    expect(notes[0].kind).toBe('note')
    expect(notes[0].tags).toEqual([])
  })

  test('a title of only whitespace is not', async () => {
    await expect(
      as(ME).mutation(api.notes.create, { title: '  ' }),
    ).rejects.toThrow()
  })

  test('listing by kind returns only that kind', async () => {
    const t = as(ME)
    await t.mutation(api.notes.create, { title: 'Dune', kind: 'book' })
    await t.mutation(api.notes.create, { title: 'A thought', kind: 'idea' })

    const books = await t.query(api.notes.list, { kind: 'book' })
    expect(books.map((n) => n.title)).toEqual(['Dune'])
    expect(await t.query(api.notes.list, {})).toHaveLength(2)
  })

  test('editing changes only what was passed', async () => {
    const t = as(ME)
    const noteId = await t.mutation(api.notes.create, {
      title: 'Dune',
      body: 'Fear is the mind-killer',
      kind: 'book',
    })
    await t.mutation(api.notes.update, { noteId, title: 'Dune (1965)' })

    const [note] = await t.query(api.notes.list, { kind: 'book' })
    expect(note.title).toBe('Dune (1965)')
    expect(note.body).toBe('Fear is the mind-killer')
  })

  test('deleting removes it', async () => {
    const t = as(ME)
    const noteId = await t.mutation(api.notes.create, { title: 'Temporary' })
    await t.mutation(api.notes.remove, { noteId })
    expect(await t.query(api.notes.list, {})).toEqual([])
  })
})

describe('ownership', () => {
  test('notes are not visible to anyone else', async () => {
    const { mine, theirs } = twoOwners()
    await mine.mutation(api.notes.create, { title: 'Mine' })
    expect(await theirs.query(api.notes.list, {})).toEqual([])
    expect(await mine.query(api.notes.list, {})).toHaveLength(1)
  })

  test('someone else cannot edit or delete my note', async () => {
    const { mine, theirs } = twoOwners()
    const noteId = await mine.mutation(api.notes.create, { title: 'Mine' })
    await expect(
      theirs.mutation(api.notes.update, { noteId, title: 'Theirs now' }),
    ).rejects.toThrow('No such note')
    await expect(theirs.mutation(api.notes.remove, { noteId })).rejects.toThrow(
      'No such note',
    )
    expect((await mine.query(api.notes.get, { noteId }))?.title).toBe('Mine')
  })

  test('signed out reads nothing', async () => {
    await expect(
      convexTest(schema, modules).query(api.notes.list, {}),
    ).rejects.toThrow()
  })
})

describe('notes.get', () => {
  test('mine by id, and null for someone else or a deleted one', async () => {
    /* One database, two people in it — so "not yours" is tested against a
       note that exists, not one the other test instance never had. */
    const db = convexTest(schema, modules)
    const t = db.withIdentity({ tokenIdentifier: ME })
    const theirs = db.withIdentity({ tokenIdentifier: SOMEONE_ELSE })

    const noteId = await t.mutation(api.notes.create, {
      title: 'Гоління',
      body: '* Станок\n* Леза',
    })
    expect((await t.query(api.notes.get, { noteId }))?.body).toBe(
      '* Станок\n* Леза',
    )

    expect(await theirs.query(api.notes.get, { noteId })).toBeNull()

    await t.mutation(api.notes.remove, { noteId })
    expect(await t.query(api.notes.get, { noteId })).toBeNull()
  })
})

describe('a note page read by a bad link', () => {
  test('an id that is not a note id reads as no note', async () => {
    expect(
      await as(ME).query(api.notes.get, { noteId: 'not-an-id' }),
    ).toBeNull()
  })
})
