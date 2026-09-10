import { v } from 'convex/values'

import { requireUser } from './auth'
import { query } from './_generated/server'

/* ⌘K's second layer: the rows you made, found by their own text. The first
   layer — pages and commands — is a static list on the client and needs no
   backend at all.
 
   This is a read, not an aggregation, so it does not belong in aggregate.ts.
   Nothing here counts anything: it returns the rows themselves, and the
   palette shows them grouped by what they are. There is deliberately no score
   and no single merged ranking — ordering six kinds against each other needs a
   relevance number, and a number with no sanctioned source is exactly what
   PLAN.md §1 forbids. Convex orders within a kind; we never order across.
 
   Owner scoping is the index's job here rather than a remembered `.filter()`:
   every search index carries ownerId as a filter field, so a query that
   forgot it would not compile. */

const PER_KIND = 5

const hitKind = v.union(
  v.literal('task'),
  v.literal('project'),
  v.literal('goal'),
  v.literal('note'),
  v.literal('event'),
  v.literal('principle'),
)

const hit = v.object({
  kind: hitKind,
  id: v.string(),
  title: v.string(),
  /* A second line, only where the match would otherwise be invisible — a note
     found by a word in its body needs to show that body. */
  subtitle: v.optional(v.string()),
  /** Where Enter lands. Only projects have a page of their own; everything
      else goes to the list it lives on. */
  to: v.string(),
})

/** The first line of a body, for a note matched on something you cannot see. */
function snippet(body: string): string | undefined {
  const flat = body.replace(/\s+/g, ' ').trim()
  if (flat.length === 0) {
    return undefined
  }
  return flat.length > 80 ? `${flat.slice(0, 80)}…` : flat
}

export const everything = query({
  args: { query: v.string() },
  returns: v.array(hit),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const text = args.query.trim()
    if (text.length === 0) {
      return []
    }

    const hits: Array<typeof hit.type> = []

    const tasks = await ctx.db
      .query('tasks')
      .withSearchIndex('search_title', (q) =>
        q.search('title', text).eq('ownerId', ownerId),
      )
      .take(PER_KIND)
    for (const task of tasks) {
      hits.push({
        kind: 'task',
        id: task._id,
        title: task.title,
        /* Today's three live on Quests and nowhere else (§3c.2); the rest are
           on the backlog. Landing on the page that does not hold it would be
           worse than not linking at all. */
        to: task.todayFor ? '/quests' : '/backlog',
      })
    }

    const projects = await ctx.db
      .query('projects')
      .withSearchIndex('search_title', (q) =>
        q.search('title', text).eq('ownerId', ownerId),
      )
      .take(PER_KIND)
    for (const project of projects) {
      hits.push({
        kind: 'project',
        id: project._id,
        title: project.title,
        to: `/projects/${project._id}`,
      })
    }

    const goals = await ctx.db
      .query('goals')
      .withSearchIndex('search_title', (q) =>
        q.search('title', text).eq('ownerId', ownerId),
      )
      .take(PER_KIND)
    for (const goal of goals) {
      hits.push({
        kind: 'goal',
        id: goal._id,
        title: goal.title,
        subtitle: goal.targetLabel,
        to: '/goals',
      })
    }

    /* Both halves of a note, merged. A note whose title and body both match
       would otherwise appear twice, so _id decides. */
    const notesByTitle = await ctx.db
      .query('notes')
      .withSearchIndex('search_title', (q) =>
        q.search('title', text).eq('ownerId', ownerId),
      )
      .take(PER_KIND)
    const notesByBody = await ctx.db
      .query('notes')
      .withSearchIndex('search_body', (q) =>
        q.search('body', text).eq('ownerId', ownerId),
      )
      .take(PER_KIND)
    const seen = new Set<string>()
    for (const note of [...notesByTitle, ...notesByBody]) {
      if (seen.has(note._id) || seen.size >= PER_KIND) {
        continue
      }
      seen.add(note._id)
      hits.push({
        kind: 'note',
        id: note._id,
        title: note.title,
        subtitle: snippet(note.body),
        to: '/notes',
      })
    }

    const events = await ctx.db
      .query('events')
      .withSearchIndex('search_title', (q) =>
        q.search('title', text).eq('ownerId', ownerId),
      )
      .take(PER_KIND)
    for (const event of events) {
      hits.push({
        kind: 'event',
        id: event._id,
        title: event.title,
        to: '/calendar',
      })
    }

    const principles = await ctx.db
      .query('principles')
      .withSearchIndex('search_text', (q) =>
        q.search('text', text).eq('ownerId', ownerId),
      )
      .take(PER_KIND)
    for (const principle of principles) {
      hits.push({
        kind: 'principle',
        id: principle._id,
        title: principle.text,
        to: '/principles',
      })
    }

    return hits
  },
})
