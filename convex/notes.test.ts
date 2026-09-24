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

describe('notes on a project', () => {
  test('lists the notes attached to one project, newest first', async () => {
    const t = as(ME)
    const oreum = await t.mutation(api.projects.create, { title: 'Oreum' })
    const other = await t.mutation(api.projects.create, { title: 'Other' })

    await t.mutation(api.notes.create, { title: 'Pricing', projectId: oreum })
    await t.mutation(api.notes.create, { title: 'Loose thought' })
    await t.mutation(api.notes.create, {
      title: 'Not this one',
      projectId: other,
    })
    await t.mutation(api.notes.create, {
      title: 'Onboarding',
      projectId: oreum,
    })

    const notes = await t.query(api.notes.listByProject, { projectId: oreum })
    expect(notes.map((n) => n.title)).toEqual(['Onboarding', 'Pricing'])
  })

  test('another owner’s project has no notes for you, and a bad id is empty', async () => {
    const { mine, theirs } = twoOwners()
    const oreum = await mine.mutation(api.projects.create, { title: 'Oreum' })
    await mine.mutation(api.notes.create, {
      title: 'Pricing',
      projectId: oreum,
    })

    expect(
      await theirs.query(api.notes.listByProject, { projectId: oreum }),
    ).toEqual([])
    expect(
      await mine.query(api.notes.listByProject, { projectId: 'nope' }),
    ).toEqual([])
  })
})

/* 24 Sep: the list row says when a note was edited and what is attached. */
describe('the list row', () => {
  test('edited is set by a change to the words, not by filing', async () => {
    const t = as(ME)
    const noteId = await t.mutation(api.notes.create, { title: 'Razor' })
    let [row] = await t.query(api.notes.list, {})
    expect(row.updatedAt).toBeUndefined()

    await t.mutation(api.notes.update, { noteId, kind: 'reference' })
    ;[row] = await t.query(api.notes.list, {})
    expect(row.updatedAt).toBeUndefined()

    await t.mutation(api.notes.update, { noteId, body: 'T-shaped' })
    ;[row] = await t.query(api.notes.list, {})
    expect(row.updatedAt).toBeTypeOf('number')
  })

  test('counts its own images and files, and nobody else’s', async () => {
    const { mine, theirs } = twoOwners()
    const noteId = await mine.mutation(api.notes.create, { title: 'Shots' })
    await theirs.mutation(api.notes.create, { title: 'Theirs' })

    async function attach(name: string, contentType: string) {
      const storageId = await mine.run((ctx) =>
        ctx.storage.store(new Blob(['x'], { type: contentType })),
      )
      await mine.mutation(api.attachments.add, {
        noteId,
        storageId,
        name,
        contentType,
        size: 1,
      })
    }
    await attach('a.png', 'image/png')
    await attach('b.jpg', 'image/jpeg')
    await attach('c.pdf', 'application/pdf')

    const [row] = await mine.query(api.notes.list, {})
    expect({ images: row.images, files: row.files }).toEqual({
      images: 2,
      files: 1,
    })
    const [theirRow] = await theirs.query(api.notes.list, {})
    expect({ images: theirRow.images, files: theirRow.files }).toEqual({
      images: 0,
      files: 0,
    })
  })
})

/* 24 Sep: archive and bulk delete from the list. */
describe('archive and delete several', () => {
  test('archived leaves the list and appears under Archived, and back', async () => {
    const t = as(ME)
    await t.mutation(api.notes.create, { title: 'Keep' })
    const b = await t.mutation(api.notes.create, { title: 'Put away' })

    await t.mutation(api.notes.setArchived, { noteIds: [b], archived: true })
    expect((await t.query(api.notes.list, {})).map((n) => n.title)).toEqual([
      'Keep',
    ])
    expect(
      (await t.query(api.notes.list, { archived: true })).map((n) => n.title),
    ).toEqual(['Put away'])

    await t.mutation(api.notes.setArchived, { noteIds: [b], archived: false })
    expect(await t.query(api.notes.list, {})).toHaveLength(2)
    expect(await t.query(api.notes.list, { archived: true })).toHaveLength(0)
  })

  test('an archived note leaves its project page too', async () => {
    const t = as(ME)
    const projectId = await t.mutation(api.projects.create, { title: 'Oreum' })
    const noteId = await t.mutation(api.notes.create, {
      title: 'Old',
      projectId,
    })
    await t.mutation(api.notes.setArchived, {
      noteIds: [noteId],
      archived: true,
    })
    expect(await t.query(api.notes.listByProject, { projectId })).toHaveLength(
      0,
    )
  })

  test('deletes several at once', async () => {
    const t = as(ME)
    const ids = [
      await t.mutation(api.notes.create, { title: 'One' }),
      await t.mutation(api.notes.create, { title: 'Two' }),
      await t.mutation(api.notes.create, { title: 'Three' }),
    ]
    await t.mutation(api.notes.removeMany, { noteIds: ids.slice(0, 2) })
    expect((await t.query(api.notes.list, {})).map((n) => n.title)).toEqual([
      'Three',
    ])
  })

  test("one note of someone else's refuses the whole batch", async () => {
    const { mine, theirs } = twoOwners()
    const my = await mine.mutation(api.notes.create, { title: 'Mine' })
    const their = await theirs.mutation(api.notes.create, { title: 'Theirs' })

    await expect(
      mine.mutation(api.notes.removeMany, { noteIds: [my, their] }),
    ).rejects.toThrow('No such note')
    await expect(
      mine.mutation(api.notes.setArchived, {
        noteIds: [my, their],
        archived: true,
      }),
    ).rejects.toThrow('No such note')
    /* Nothing half-done: mine is still here and not archived. */
    expect(await mine.query(api.notes.list, {})).toHaveLength(1)
    expect(await theirs.query(api.notes.list, {})).toHaveLength(1)
  })
})
