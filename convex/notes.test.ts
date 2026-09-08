/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, test } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const SOMEONE_ELSE = 'https://clerk.test|user_them'

function as(subject: string) {
  return convexTest(schema, modules).withIdentity({ tokenIdentifier: subject })
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
    await as(ME).mutation(api.notes.create, { title: 'Mine' })
    expect(await as(SOMEONE_ELSE).query(api.notes.list, {})).toEqual([])
  })

  test('someone else cannot edit or delete my note', async () => {
    const noteId = await as(ME).mutation(api.notes.create, { title: 'Mine' })
    const theirs = as(SOMEONE_ELSE)
    await expect(
      theirs.mutation(api.notes.update, { noteId, title: 'Theirs now' }),
    ).rejects.toThrow()
    await expect(
      theirs.mutation(api.notes.remove, { noteId }),
    ).rejects.toThrow()
  })

  test('signed out reads nothing', async () => {
    await expect(
      convexTest(schema, modules).query(api.notes.list, {}),
    ).rejects.toThrow()
  })
})
