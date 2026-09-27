import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'
import type { Infer } from 'convex/values'

/* PLAN.md §2. Every table carries `ownerId` — the Clerk `identity.subject` —
   and an owner-scoped index, so a query that reads across owners cannot be
   written by accident. There is one user today; the schema does not know that,
   and retrofitting ownership later is a day of work and a way to leak a net
   worth to a friend (§3b.4).

   Each index leads with `ownerId`, which means the same index also serves the
   owner-only read: `withIndex('by_owner_status', q => q.eq('ownerId', id))` is
   a prefix scan, not a table scan. No function needs a `.filter()` to stay in
   its own lane. */

/* An area is a slug now, not a member of a fixed set (R6, 21 Sep). Artem hit
   the wall twice in one day — a goal with nowhere to go but the wrong area,
   then a task on SoloLeveling badged `business` when it is a pet project —
   and a fixed enum cannot be made to fit by choosing more carefully.

   `v.string()` here, which is what lets a word he invented be written at all;
   the guard moved to `requireLiveArea()` in areas.ts, which every mutation
   taking an area calls. So the schema no longer knows the legal values,
   because the legal values are rows — and the check is now per owner, which a
   global union could never be: another owner's area is not one you may file
   under.

   What this change did *not* do is rewrite a row. The slug on every existing
   goal, task, log, event, project and state snapshot is exactly the string it
   already was, and `by_owner_area_time` was never rebuilt. Only the list of
   legal values moved.

   The ten built-in slugs live in `src/lib/area-slug.ts` as BUILTIN_AREAS —
   still named literally by the capture verbs and by monthCounts' tile rules,
   which is why they had to stay a typed list somewhere. */
export const areaSlug = v.string()

/* The six THIS MONTH tiles (PLAN.md §3 item 4) — the fixed shape monthCounts
   returns, deliberately not the area enum. A goal carrying one is a monthly
   target read against that tile's count (R2, 15 Sep). */
export const tileValidator = v.union(
  v.literal('projects'),
  v.literal('portuguese'),
  v.literal('body'),
  v.literal('money'),
  v.literal('style'),
  v.literal('social'),
)

export type Tile = Infer<typeof tileValidator>

const goalStatus = v.union(
  v.literal('active'),
  v.literal('done'),
  v.literal('dropped'),
)

const projectStatus = v.union(
  v.literal('focus'),
  v.literal('active'),
  v.literal('paused'),
  v.literal('completed'),
  v.literal('archived'),
)

const taskStatus = v.union(
  v.literal('open'),
  v.literal('done'),
  v.literal('skipped'),
)

/* Evidence, not intent. `task_done` is what ticking a box writes; every other
   kind is a thing that actually happened and the user confirmed (§3b.1). */
const logKind = v.union(
  v.literal('workout'),
  v.literal('weight'),
  v.literal('expense'),
  v.literal('transfer'),
  /* Money in — `earn`, `salary`. Added 14 Sep: nothing could record income,
     and money tracked only as it leaves is half a picture. */
  v.literal('income'),
  v.literal('session'),
  v.literal('conversation'),
  v.literal('event'),
  v.literal('people_met'),
  v.literal('task_done'),
  v.literal('piece'),
  /* Something taken rather than something done (R6b): protein, creatine,
     a vitamin. Deliberately NOT a workout — the dashboard's Body tile counts
     kind:'workout' (aggregate.ts TILE_KINDS), so a creatine filed as one
     would make the morning screen read "30 workouts this month". */
  v.literal('intake'),
  /* One movement or one topic, ticked from a routine list (25 Sep): Cat-cow
     under Stretch, Ser vs estar under Portuguese. Deliberately NOT a workout
     or a session — six stretches are one stretch session, and the Today tile
     counts sessions. The session is its own tap ("STRETCH DONE"). */
  v.literal('exercise'),
  /* Money moving between his own accounts (Treasury, 27 Sep): Revolut →
     Trade Republic, a withdrawal into notes. Not spending and not income —
     his statement read €6,601 out on paper, €561 of it spent. Deliberately
     NOT `transfer`, which the Money tile counts as money put aside. */
  v.literal('move'),
  v.literal('note'),
  v.literal('idea'),
  v.literal('custom'),
)

const noteKind = v.union(
  v.literal('note'),
  v.literal('idea'),
  v.literal('book'),
  v.literal('reference'),
)

const reviewPeriod = v.union(
  v.literal('daily'),
  v.literal('weekly'),
  v.literal('monthly'),
)

const area = areaSlug

export default defineSchema({
  /* R6, 21 Sep. The set of areas used to be a ten-literal union in this file
     — so adding "English" meant a deploy, which is how Artem found a goal
     with nowhere to go. It is rows now; `areaSlug` above is what is left of
     the union, and the note there says why that is a string. */
  areas: defineTable({
    ownerId: v.string(),
    /* Permanent. Written into six tables; named literally by the capture
       verbs and by monthCounts' tile rules. Renaming never touches it. */
    slug: v.string(),
    /* What you read. This is the one an editor changes. */
    label: v.string(),
    /* 0–359. The theme owns lightness and chroma (tokens.css item 5), so this
       number is the whole of an area's colour. */
    hue: v.number(),
    /* Bold (25 Sep): the hue at the theme's deep, saturated pair
       (--area-bold-l/-c) instead of the soft one every area shares. Artem
       wanted Body "more brutal"; one area may be louder because he said so,
       not because its hue happens to be brighter. */
    bold: v.optional(v.boolean()),
    /* Silver (26 Sep): no hue at all — the theme's near-colourless pair
       (--area-silver-l/-c/-h). Artem, on Body in bold crimson: "lets try
       silver instead". Wins over bold when both are set. */
    silver: v.optional(v.boolean()),
    order: v.number(),
    /* Retired: gone from every picker, still painting the rows that carry it
       — a log is evidence and does not stop having happened. */
    retiredAt: v.optional(v.number()),
    /* Where this area's capture verbs file now. Required when retiring an
       area a verb names; always a live slug, so resolveSlug needs one hop. */
    replacedBy: v.optional(v.string()),
    /* Which TRACK page claims this area (R6b-b). Named generally and valued
       narrowly: Body claiming areas the same way later is one more literal
       here, not a second field. An area is a language because this says so —
       deriving it from session logs would need an exclusion for `work`, which
       is the hardcoded list R6 spent a row removing. */
    track: v.optional(v.literal('language')),
    /* Which language a language area is (25 Sep): 'pt-PT', 'en'. Gives the
       Languages page its flag, its name and its built-in path. A code from
       src/lib/languages/catalog.ts; absent until he says which. */
    lang: v.optional(v.string()),
  })
    .index('by_owner_order', ['ownerId', 'order'])
    .index('by_owner_slug', ['ownerId', 'slug']),

  goals: defineTable({
    ownerId: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    area,
    status: goalStatus,
    /* A target is what makes a progress bar honest. `targetLabel` is the human
       form ("B2", "€80,000"); `targetValue` + `unit` exist only when the goal
       is genuinely measurable, and only they may be divided by. */
    targetLabel: v.optional(v.string()),
    targetValue: v.optional(v.number()),
    unit: v.optional(v.string()),
    deadline: v.optional(v.string()), // ISO date
    /* Set only on a monthly target written from a THIS MONTH tile: then
       `targetValue` is per month, and the tile's log count is what it is
       read against. One active goal per tile — goals.setTileTarget keeps
       it that way. */
    tile: v.optional(tileValidator),
    /* Set only on a weekly target (26 Sep: "we lack a bit of emotion or
       motivation"): the category it counts — `gym`, `stretch`,
       `supplements` on Body; `class`, `homework`, `practice` on a language
       — and `targetValue` is per Monday-to-Sunday week, read against that
       area's logs of that category. One active goal per area and category
       — goals.setWeeklyTarget keeps it that way. */
    weekly: v.optional(v.string()),
    /* When it was called reached or dropped (24 Sep), so the shelf at the
       bottom of Goals can say "reached Sep 24". Cleared on reopening. A
       goal closed before this field existed has none, and says so. */
    closedAt: v.optional(v.number()),
  })
    .index('by_owner_status', ['ownerId', 'status'])
    .index('by_owner_tile', ['ownerId', 'tile'])
    .index('by_owner_weekly', ['ownerId', 'weekly'])
    .searchIndex('search_title', {
      searchField: 'title',
      filterFields: ['ownerId'],
    }),

  /* Steps on the way to a goal, in an order the person sets (R3, 16 Sep).
     A sequence, not a denominator: "2 of 4 milestones" would be a progress
     bar with an invented denominator, so nothing divides by these. Reaching
     one is a claim the person makes with one tap, like ticking a task. */
  milestones: defineTable({
    ownerId: v.string(),
    goalId: v.id('goals'),
    title: v.string(),
    dueDate: v.optional(v.string()), // ISO date
    /* An hour on the due day, "HH:MM", local (20 Sep). Never without
       dueDate — a time with no day is not a due date and has nowhere to sit
       on a calendar. Kept apart from the day rather than folded into one
       epoch: "by Friday" and "by Friday at 14:00" are different promises,
       and an epoch cannot tell them apart. */
    dueTime: v.optional(v.string()),
    reachedAt: v.optional(v.number()),
    sortOrder: v.number(),
  })
    .index('by_owner_goal', ['ownerId', 'goalId', 'sortOrder'])
    /* Due days in a window, for the calendar. On the ISO string rather than
       an epoch, because that is what is stored and it sorts the same. */
    .index('by_owner_due', ['ownerId', 'dueDate']),

  /* A project is a thing he is building, and it answers to nothing above it
     (21 Sep). It carried a required `goalId` until then. */
  projects: defineTable({
    ownerId: v.string(),
    /* A project's own kind, and the only thing that says what it is
       (21 Sep, his call). It used to wear its goal's area, and before that
       it carried a required `goalId`: "I said already that this GOAL -
       PROJECT bind is canceled. We dont give a fuck about it. It was a
       mistake."

       So a project answers to nothing above it now. It is a thing he is
       building, it has its own kind, and Goals is a separate list. */
    area: v.optional(area),
    title: v.string(),
    description: v.optional(v.string()),
    status: projectStatus,
    deadline: v.optional(v.string()), // ISO date
    /* Source 4 (R3c): a public GitHub repo as `owner/name`. Its commits are
       fetched hourly into `commits`; githubCheckedAt is when that last
       succeeded — the "as of" every reading must carry (PLAN.md §1). */
    githubRepo: v.optional(v.string()),
    githubCheckedAt: v.optional(v.number()),
    /* A project's own mark (20 Sep), uploaded by him — Convex file storage.
       Not derived from the repo: a GitHub owner avatar is a face, not a
       project logo. */
    logoId: v.optional(v.id('_storage')),
    /* Deliberately open-ended (20 Sep): a project he is building with no date
       he is willing to promise. Distinct from simply having no deadline —
       that is a project he has not thought about, and it says nothing. */
    ongoing: v.optional(v.boolean()),
    /* Targets he sets, which is the only thing that may put a ring round a
       number (PLAN.md §1: a progress bar renders only where a real
       denominator exists). Absent means no ring — never a guessed one. */
    commitTargetWeekly: v.optional(v.number()),
    minutesTargetMonthly: v.optional(v.number()),
    /* How many tasks he reckons this project is (20 Sep). Without it the
       tasks ring divides by the live task count, which can only ever read
       "all of the ones that exist" — 2/2 the moment both are ticked. With it
       the denominator is the size he expects the project to be. */
    taskTargetTotal: v.optional(v.number()),
  })
    .index('by_owner_status', ['ownerId', 'status']) // one 'focus' per owner — setFocus enforces
    /* Read only by the internal hourly check, which acts for every owner — the
       one index here not led by ownerId. An absent repo sorts before every
       string, so gte('') is exactly the connected projects. */
    .index('by_github_repo', ['githubRepo'])
    .searchIndex('search_title', {
      searchField: 'title',
      filterFields: ['ownerId'],
    }),

  /* The first external reading (PLAN.md §1 source 4, R3c): a commit as GitHub
     reported it, stored — never fetched at render. `repo` is kept on each row
     so a project whose repo changes stops counting the old one's commits
     without deleting them. Counted per week; nothing is derived from them. */
  commits: defineTable({
    ownerId: v.string(),
    projectId: v.id('projects'),
    repo: v.string(),
    sha: v.string(),
    message: v.string(), // first line only
    url: v.string(),
    authoredAt: v.number(),
    fetchedAt: v.number(),
    /* More than one parent — "Merge pull request #51 from …". Stored as a
       fact and excluded when counting (20 Sep), because a merge is
       bookkeeping rather than work, and GitHub's own activity stats leave
       them out: counting them made a week's number partly a measure of how
       often he opened a PR. Optional because rows written before 20 Sep do
       not carry it; a backfill fills them in. */
    isMerge: v.optional(v.boolean()),
  })
    .index('by_owner_project_time', ['ownerId', 'projectId', 'authoredAt'])
    .index('by_project_sha', ['projectId', 'sha']),

  /* Files pinned to a note or a task (20 Sep): screenshots, PDFs, anything
     he drops or pastes. One table with two possible parents rather than two
     tables, because a screenshot means the same thing wherever it is pinned
     and he asked for it in both places on the same day.

     Exactly one of noteId/taskId is set — checked in convex/attachments.ts,
     because a validator cannot say "one of these two". The bytes live in
     Convex file storage; this row is the fact that they belong here. */
  attachments: defineTable({
    ownerId: v.string(),
    noteId: v.optional(v.id('notes')),
    taskId: v.optional(v.id('tasks')),
    /* A page of a Vault sheet (26 Sep, "2-3 sheets to one ANALYZE"): the
       sheet — language, session, revisits — is a `vaultSheets` row, and
       each file is a page pointing at it. A note/task attachment has no
       sheet; a page has no note or task. vault.ts keeps them apart. */
    sheetId: v.optional(v.id('vaultSheets')),
    /* Legacy, from R7a's first day, when a sheet was one file: the page
       carried the language, the session and the revisit itself.
       vault.migrateSheets moves them onto a sheet and clears them; drop
       these three once every deployment has run it. */
    area: v.optional(areaSlug),
    logId: v.optional(v.id('logs')),
    revisedAt: v.optional(v.number()),
    storageId: v.id('_storage'),
    name: v.string(),
    contentType: v.string(),
    size: v.number(),
  })
    .index('by_owner_note', ['ownerId', 'noteId'])
    .index('by_owner_task', ['ownerId', 'taskId'])
    .index('by_owner_area', ['ownerId', 'area'])
    .index('by_owner_log', ['ownerId', 'logId'])
    .index('by_owner_sheet', ['ownerId', 'sheetId']),

  /* A Vault sheet (26 Sep): one or more pages from class or homework, read
     together as one. It belongs to a language and, when he says which, to
     the session it came from; a removed session leaves it "not linked". */
  vaultSheets: defineTable({
    ownerId: v.string(),
    area: areaSlug,
    logId: v.optional(v.id('logs')),
    /* When he last went over it — tapped "Revised". The Revisit strip
       brings back the ones longest untouched. Not a log: going over a
       sheet is not a session. */
    revisedAt: v.optional(v.number()),
  })
    .index('by_owner_area', ['ownerId', 'area'])
    .index('by_owner_log', ['ownerId', 'logId']),

  /* What a model read in a Vault document (R7a, 26 Sep): written once, when
     it was attached, and never sent again. Text, never a number on screen —
     and stored, attributed to the model that wrote it, and timestamped, the
     conditions PLAN.md §1 sets for anything from outside. It proves nothing:
     it never marks a topic learned or a session done. The token counts are
     the provider's own, kept to see what the Vault costs, not to show. */
  readings: defineTable({
    ownerId: v.string(),
    /* The sheet it read, every page at once (26 Sep). A reading from R7a's
       first day names a single page instead, until vault.migrateSheets
       moves it onto that page's sheet. */
    sheetId: v.optional(v.id('vaultSheets')),
    attachmentId: v.optional(v.id('attachments')),
    status: v.union(
      v.literal('reading'),
      v.literal('done'),
      v.literal('failed'),
    ),
    /* How the Vault sorts it (26 Sep: "we want classification"): a short
       title in the model's words, one kind from READING_KINDS, and a few
       topic tags. Absent on readings made before they existed. */
    title: v.optional(v.string()),
    kind: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    text: v.optional(v.string()),
    summary: v.optional(v.string()),
    conclusion: v.optional(v.string()),
    words: v.optional(
      v.array(v.object({ term: v.string(), meaning: v.string() })),
    ),
    /* New sentences in the sheet's grammar, each with its meaning (26 Sep:
       "in response maybe generate example"). Written by the model, not
       copied from the sheet. Absent on readings made before they existed. */
    examples: v.optional(
      v.array(v.object({ sentence: v.string(), meaning: v.string() })),
    ),
    /* The rules the sheet teaches, each with its pattern and examples (26
       Sep: "this shit is just text, we need to give as well rule +
       examples"). Absent on readings made before they existed. */
    rules: v.optional(
      v.array(
        v.object({
          name: v.string(),
          pattern: v.string(),
          explanation: v.string(),
          examples: v.array(
            v.object({ sentence: v.string(), meaning: v.string() }),
          ),
        }),
      ),
    ),
    model: v.string(),
    /** When it was asked for — the 30-a-month cap counts these. */
    requestedAt: v.number(),
    readAt: v.optional(v.number()),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    error: v.optional(v.string()),
  })
    .index('by_owner_attachment', ['ownerId', 'attachmentId'])
    .index('by_owner_sheet', ['ownerId', 'sheetId'])
    .index('by_owner_time', ['ownerId', 'requestedAt']),

  tasks: defineTable({
    ownerId: v.string(),
    title: v.string(), // a task is creatable from this alone
    notes: v.optional(v.string()),
    projectId: v.optional(v.id('projects')),
    goalId: v.optional(v.id('goals')),
    area: v.optional(area),
    dueDate: v.optional(v.string()), // ISO date
    scheduledAt: v.optional(v.number()),
    durationMin: v.optional(v.number()),
    rrule: v.optional(v.string()), // recurring template; instances expanded on the client
    priority: v.number(),
    status: taskStatus,
    completedAt: v.optional(v.number()),
    /* ISO date, set only while this task is one of today's three (§3c.1).
       pickForToday sets it; dropFromToday clears it; a finished task keeps
       it until the day ends. `pickedAt` orders the three by when they were
       chosen, so a pick lands in the slot you were looking at rather than
       wherever its creation date sorts it (16 Sep). */
    todayFor: v.optional(v.string()),
    pickedAt: v.optional(v.number()),
    /* Put away without being done or deleted (24 Sep): out of the backlog
       and the calendar, back from the Archived tab. Not a status — it is
       still open, and undoing it should not have to guess which it was. */
    archivedAt: v.optional(v.number()),
  })
    .index('by_owner_status', ['ownerId', 'status'])
    /* The Done tab (17 Sep): what was ticked, newest first, within a period.
       by_owner_status orders by creation, which is not when it was done. */
    .index('by_owner_status_completed', ['ownerId', 'status', 'completedAt'])
    .index('by_owner_today', ['ownerId', 'todayFor'])
    .index('by_project', ['projectId'])
    /* A goal's own tasks, on its card (24 Sep). */
    .index('by_owner_goal', ['ownerId', 'goalId'])
    .index('by_owner_due', ['ownerId', 'dueDate'])
    /* The week view asks "what is scheduled between these two instants", and
       status cannot answer it. An absent `scheduledAt` sorts before every
       number, so a `gte(from)` range excludes undated tasks without a filter —
       the same shape as events' by_owner_rrule, for the same reason. */
    .index('by_owner_scheduled', ['ownerId', 'scheduledAt'])
    .searchIndex('search_title', {
      searchField: 'title',
      filterFields: ['ownerId'],
    }),

  events: defineTable({
    ownerId: v.string(),
    title: v.string(),
    area: v.optional(area),
    projectId: v.optional(v.id('projects')),
    /* R5 (24 Sep). Which goal this time is spent towards. Beside `projectId`,
       not instead of it: a gym session serves a goal and belongs to no
       project, a client call belongs to a project whose goal is elsewhere. */
    goalId: v.optional(v.id('goals')),
    startsAt: v.number(),
    endsAt: v.number(),
    rrule: v.optional(v.string()),
    notes: v.optional(v.string()),
    /* R5. Minutes before the start to remind, 0 = at the start. Delivered by
       an open tab only (src/lib/reminders.ts): push to a closed app waits for
       the bell (PLAN §4 Late). */
    remindMin: v.optional(v.number()),
  })
    .index('by_owner_start', ['ownerId', 'startsAt'])
    /* A series that began in March still has occurrences in June, so a window
       read on `startsAt` cannot find it — the row is behind the window and the
       occurrences are computed. This index is how the running series are read
       without scanning every past event. PLAN §2 lists only `by_owner_start`;
       this is the one addition, and it exists because expansion is client-side.
       `.gte('rrule', '')` selects exactly the rows that have one: an absent
       optional field sorts before every string. */
    .index('by_owner_rrule', ['ownerId', 'rrule'])
    .searchIndex('search_title', {
      searchField: 'title',
      filterFields: ['ownerId'],
    }),

  /* Quick capture lands here. Append-only: a log is a record of something that
     happened, so it is never edited into a different truth. */
  /* A routine's items (25 Sep): the exercises under Stretch or Gym, the
     topics and tenses under a language. Intent, not evidence — a drill is a
     thing he means to do; pressing DID writes the `exercise` log that says he
     did. `group` is the category that log files under, a plain word like
     logs.meta.category. Created in the UI, never seeded. */
  drills: defineTable({
    ownerId: v.string(),
    area: areaSlug,
    group: v.string(),
    title: v.string(),
    /* A topic's standing, in words (25 Sep, his call): still learning it, or
       solid. Not a score and never counted into one. */
    mark: v.optional(v.union(v.literal('learning'), v.literal('solid'))),
    /* The built-in path topic this drill tracks (25 Sep), e.g.
       'b1-conjuntivo-presente'. Absent for a drill he typed himself. */
    ref: v.optional(v.string()),
    sortOrder: v.number(),
    /* Retired, not deleted: its exercise logs are evidence and stay. */
    retiredAt: v.optional(v.number()),
  }).index('by_owner_area', ['ownerId', 'area']),

  logs: defineTable({
    ownerId: v.string(),
    kind: logKind,
    area,
    occurredAt: v.number(),
    value: v.optional(v.number()), // 60 (min), 48 (eur), 75.4 (kg)
    unit: v.optional(v.string()),
    text: v.optional(v.string()), // "push day", "groceries"
    taskId: v.optional(v.id('tasks')),
    projectId: v.optional(v.id('projects')),
    /* Which of his accounts it happened in (Treasury, 27 Sep) — money rows
       only. What makes a statement's rows matchable against what he has,
       and a balance explainable. */
    accountId: v.optional(v.id('accounts')),
    meta: v.optional(
      v.object({
        reps: v.optional(v.number()),
        sets: v.optional(v.number()),
        weightKg: v.optional(v.number()),
        category: v.optional(v.string()),
        people: v.optional(v.number()),
        /* The routine item an `exercise` row was ticked from. The row keeps
           its own text and category, so retiring the drill loses nothing. */
        drillId: v.optional(v.id('drills')),
        /* The bill this payment was the tap on (Finances F3). The row is
           the evidence; the bill is only what it was for. */
        recurringId: v.optional(v.id('recurring')),
        /* Money rows read off a statement or screenshot (Treasury): the
           clean merchant name, the line as the bank printed it, the
           intake it came from, and — for a move — the other account. */
        merchant: v.optional(v.string()),
        raw: v.optional(v.string()),
        intakeId: v.optional(v.id('intakes')),
        otherAccountId: v.optional(v.id('accounts')),
        /* A transfer is two rows, one in each of his accounts (27 Sep): the
           arriving side names the leaving side here, so the pair is seen,
           matched and removed as one. */
        pairOf: v.optional(v.id('logs')),
      }),
    ),
  })
    .index('by_owner_time', ['ownerId', 'occurredAt'])
    .index('by_owner_area_time', ['ownerId', 'area', 'occurredAt'])
    /* Time on one project (R3): a range over one project's logs, rather than
       every log this month filtered in JavaScript. A log with no project has
       an absent projectId and never matches an eq(). */
    .index('by_owner_project_time', ['ownerId', 'projectId', 'occurredAt'])
    .index('by_owner_account_time', ['ownerId', 'accountId', 'occurredAt']),

  /* The second number source: latest row for a key wins. Keys in use so far —
     weight, bench, net_worth, cefr_level, protein_avg, savings. */
  stateSnapshots: defineTable({
    ownerId: v.string(),
    area,
    key: v.string(),
    value: v.optional(v.number()),
    textValue: v.optional(v.string()),
    unit: v.optional(v.string()),
    recordedAt: v.number(),
  }).index('by_owner_key_time', ['ownerId', 'key', 'recordedAt']),

  notes: defineTable({
    ownerId: v.string(),
    title: v.string(),
    body: v.string(),
    tags: v.array(v.string()),
    projectId: v.optional(v.id('projects')),
    goalId: v.optional(v.id('goals')),
    kind: noteKind,
    /* When the words last changed (24 Sep), for the list's "edited" line.
       Absent on a note never edited since — its creation time says it all. */
    updatedAt: v.optional(v.number()),
    /* Put away, not deleted (24 Sep): out of the list, still found by
       search, back with one tap from the Archived tab. */
    archivedAt: v.optional(v.number()),
  })
    .index('by_owner_kind', ['ownerId', 'kind'])
    /* The notes on one project's page (R3). _creationTime is the implicit last
       column, so ordering desc is newest first without a sort. */
    .index('by_owner_project', ['ownerId', 'projectId'])
    /* Two, because a search index carries exactly one field and a note is
       findable by either half of it. convex/search.ts queries both and
       de-duplicates by _id. */
    .searchIndex('search_title', {
      searchField: 'title',
      filterFields: ['ownerId'],
    })
    .searchIndex('search_body', {
      searchField: 'body',
      filterFields: ['ownerId'],
    }),

  /* Where his money sits (Finances F2, 26 Sep): Revolut, BPI, a broker.
     Typed in by him — nothing is seeded. A balance is not stored here: it
     is a state, `stateSnapshots` keyed `balance:<accountId>`, so the latest
     reading wins and every earlier one stays as history. */
  accounts: defineTable({
    ownerId: v.string(),
    name: v.string(),
    /* What it is — any of these, at least one (27 Sep: Revolut is a bank
       and a broker; the notes in his wallet are cash). */
    kinds: v.array(
      v.union(v.literal('bank'), v.literal('broker'), v.literal('cash')),
    ),
    /* The currencies it holds, EUR first by default. Each has its own
       balance reading (`balance:<accountId>:<CUR>`), shown in euros at the
       stored ECB rate. */
    currencies: v.array(v.string()),
    /* The site its logo comes from ("revolut.com"). Optional: an account
       without one shows its initial. */
    domain: v.optional(v.string()),
    /* Which bank or broker it is at, from the catalogue in
       src/lib/institutions.ts ("revolut"). Revolut's current account and its
       Invest account are two accounts of one institution (27 Sep), so cash
       into Invest is an ordinary transfer. Absent on one he named himself. */
    institution: v.optional(v.string()),
    /* The last four digits of its IBAN and of its cards, as printed on a
       statement — how a transfer's other side is recognised as his own
       account ("PT50…0120" is BPI) and how a dropped statement finds which
       account it is. */
    ibanTails: v.optional(v.array(v.string())),
    cardTails: v.optional(v.array(v.string())),
    order: v.number(),
    /* Gone from the lists; its readings and trades stay, because they
       happened. */
    retiredAt: v.optional(v.number()),
  }).index('by_owner_order', ['ownerId', 'order']),

  /* A bill or a salary that comes round (Finances F3): the plan, not the
     payment. Tapping "paid" writes the expense log that is the evidence
     (`logs.meta.recurringId`) — nothing is logged by itself (CLAUDE.md,
     intent is not evidence). */
  recurring: defineTable({
    ownerId: v.string(),
    name: v.string(),
    kind: v.union(v.literal('expense'), v.literal('income')),
    amount: v.number(), // euros
    category: v.optional(v.string()),
    accountId: v.optional(v.id('accounts')),
    cadence: v.union(v.literal('monthly'), v.literal('yearly')),
    /* 1–31, or 0 for the last day of the month; a 31 in a 30-day month
       falls on the 30th. */
    day: v.number(),
    /* Yearly only: 0–11. */
    month: v.optional(v.number()),
    endedAt: v.optional(v.number()),
  }).index('by_owner', ['ownerId']),

  /* A ticker he holds or held (Finances F4), found by search and never
     typed as a code: Yahoo Finance's symbol (`TSLA`, `VWCE.DE`), with the
     exchange and currency it quotes in. One row per owner and symbol. */
  instruments: defineTable({
    ownerId: v.string(),
    symbol: v.string(),
    name: v.string(),
    exchange: v.string(),
    currency: v.string(),
    type: v.string(), // 'EQUITY', 'ETF'
    isin: v.optional(v.string()),
  })
    .index('by_owner_symbol', ['ownerId', 'symbol'])
    /* Read only by the daily price check, which acts for every owner —
       like projects.by_github_repo. */
    .index('by_symbol', ['symbol']),

  /* A buy or a sell (Finances F4): shares and the price per share he paid,
     in euros, as the broker confirmed. A position is the sum of its
     trades' shares — PLAN.md §1's sum rule, over trade rows. */
  trades: defineTable({
    ownerId: v.string(),
    accountId: v.id('accounts'),
    instrumentId: v.id('instruments'),
    side: v.union(v.literal('buy'), v.literal('sell')),
    shares: v.number(),
    priceEur: v.number(),
    occurredAt: v.number(),
    /* Brought in from a screenshot rather than typed: what he held on the
       day of the import, at his average price. */
    importId: v.optional(v.id('intakes')),
    /* What he already held when the app first saw the account — a first
       holdings screenshot. It has no cash side: the money left long before.
       Every other buy takes its cost out of the broker's cash, and every
       sell puts it back (aggregate.ts, readBalances). */
    opening: v.optional(v.boolean()),
  })
    .index('by_owner_time', ['ownerId', 'occurredAt'])
    .index('by_owner_instrument', ['ownerId', 'instrumentId'])
    .index('by_owner_account', ['ownerId', 'accountId']),

  /* Source 4 (Finances F4): a closing price as Yahoo Finance reported it,
     stored by the daily check — never fetched at render. */
  prices: defineTable({
    ownerId: v.string(),
    instrumentId: v.id('instruments'),
    price: v.number(),
    currency: v.string(),
    /** The market time the price is for. */
    asOf: v.number(),
    fetchedAt: v.number(),
    source: v.string(),
  }).index('by_owner_instrument_time', ['ownerId', 'instrumentId', 'asOf']),

  /* Source 4: an exchange rate, one currency into euros, as the ECB
     published it (via Frankfurter). What lets a US share be shown in
     euros without inventing the conversion. */
  fxRates: defineTable({
    ownerId: v.string(),
    currency: v.string(), // 'USD' — euros per one of these
    rate: v.number(),
    asOf: v.number(),
    fetchedAt: v.number(),
    source: v.string(),
  }).index('by_owner_currency_time', ['ownerId', 'currency', 'asOf']),

  /* Anything he drops on + (Treasury, 27 Sep): statements (PDF/CSV) and
     screenshots, any bank or broker, read once by Claude Haiku 4.5. The
     reader says what it is — TRANSACTIONS (a statement, a history screen)
     or HOLDINGS (a broker's positions) — and returns rows he checks. Rows
     are a proposal: nothing becomes a log, a trade or a balance until he
     confirms. */
  intakes: defineTable({
    ownerId: v.string(),
    /* The account it is about — his pick, or the reader's guess matched to
       one of his accounts by name; he can change it in the review. */
    accountId: v.optional(v.id('accounts')),
    storageIds: v.array(v.id('_storage')),
    status: v.union(
      v.literal('reading'),
      v.literal('ready'),
      v.literal('failed'),
      v.literal('done'),
    ),
    /* TRADES (27 Sep, "adding money"): a broker's order history or a trade
       confirmation — buys and sells with their own dates and prices. */
    kind: v.optional(
      v.union(
        v.literal('transactions'),
        v.literal('holdings'),
        v.literal('trades'),
      ),
    ),
    /* What the reader says it is: "Revolut statement · EUR · Aug 1 →
       Sep 27". Words for the review's title, nothing computes with it. */
    title: v.optional(v.string()),
    institution: v.optional(v.string()),
    /* The last four digits of the IBAN or card the file is about, when it
       prints them — how it finds which of his accounts it is. */
    accountTail: v.optional(v.string()),
    transactions: v.optional(
      v.array(
        v.object({
          occurredAt: v.number(),
          merchant: v.string(),
          raw: v.string(),
          /* Signed, in `currency`: −6.70 is money out. */
          amount: v.number(),
          currency: v.string(),
          pending: v.boolean(),
          /* The reader's read of what it is. `self` — to or from his own
             name, or one of his accounts: a move, not spending. */
          counterparty: v.optional(v.string()),
          self: v.boolean(),
          category: v.optional(v.string()),
        }),
      ),
    ),
    positions: v.optional(
      v.array(
        v.object({
          name: v.string(),
          isin: v.optional(v.string()),
          shares: v.optional(v.number()),
          priceEur: v.optional(v.number()),
          valueEur: v.optional(v.number()),
          /* % since buy, as printed — TR's list shows this and no shares. */
          changePct: v.optional(v.number()),
          /* Which candidate the right share class is (Alphabet (A) →
             GOOGL), and that ticker's price in euros when it was read —
             what shares and cost are worked out from. */
          preferred: v.optional(v.number()),
          todayPriceEur: v.optional(v.number()),
          todayAsOf: v.optional(v.number()),
          candidates: v.array(
            v.object({
              symbol: v.string(),
              name: v.string(),
              exchange: v.string(),
              type: v.string(),
            }),
          ),
        }),
      ),
    ),
    trades: v.optional(
      v.array(
        v.object({
          occurredAt: v.number(),
          name: v.string(),
          isin: v.optional(v.string()),
          side: v.union(v.literal('buy'), v.literal('sell')),
          shares: v.number(),
          /* Per share, in `currency` as printed. */
          price: v.number(),
          currency: v.string(),
          /* The same ticker search as holdings: candidates and which one
             the right share class is. */
          preferred: v.optional(v.number()),
          candidates: v.array(
            v.object({
              symbol: v.string(),
              name: v.string(),
              exchange: v.string(),
              type: v.string(),
            }),
          ),
        }),
      ),
    ),
    /* A closing balance printed on it, if any. */
    balance: v.optional(
      v.object({
        currency: v.string(),
        value: v.number(),
        asOf: v.number(),
      }),
    ),
    cashEur: v.optional(v.number()),
    totalEur: v.optional(v.number()),
    error: v.optional(v.string()),
    model: v.optional(v.string()),
    readAt: v.optional(v.number()),
    /* The reading, made visible (27 Sep): what he dropped, by name. */
    files: v.optional(
      v.array(
        v.object({
          name: v.string(),
          size: v.number(),
          contentType: v.string(),
        }),
      ),
    ),
    /* The files' SHA-256s, sorted and joined: the same file dropped again
       reuses the first reading instead of paying for a second. */
    fingerprint: v.optional(v.string()),
    reusedFrom: v.optional(v.id('intakes')),
    /* When this read began — a retry starts the clock again. */
    readingSince: v.optional(v.number()),
    /* What the reader has found so far, written as it streams: the bank,
       what the file is, how many rows (and how many he already has), the
       latest few, and the balance when it lands. Nothing here is saved as
       money; it is the view of a reading in progress. */
    progress: v.optional(
      v.object({
        stage: v.union(
          v.literal('opening'),
          v.literal('columns'),
          v.literal('rows'),
          v.literal('tickers'),
        ),
        kind: v.optional(
          v.union(
            v.literal('transactions'),
            v.literal('holdings'),
            v.literal('trades'),
          ),
        ),
        institution: v.optional(v.string()),
        title: v.optional(v.string()),
        accountTail: v.optional(v.string()),
        rows: v.number(),
        have: v.number(),
        recent: v.array(
          v.object({
            occurredAt: v.number(),
            label: v.string(),
            amount: v.number(),
            currency: v.string(),
            have: v.boolean(),
            move: v.boolean(),
          }),
        ),
        balance: v.optional(
          v.object({
            value: v.number(),
            currency: v.string(),
            asOf: v.number(),
          }),
        ),
      }),
    ),
    /* What the reading cost, in US dollars, from the API's own token
       counts — shown on the reading so a test never surprises him. */
    costUsd: v.optional(v.number()),
    /* A failure a second try could fix (busy, unreachable), or not. */
    retryable: v.optional(v.boolean()),
    /* What the file had that this does not bring in, in its own words:
       "Left out: 184 dividend, 126 cash top-up." */
    note: v.optional(v.string()),
    /* A trade history too long for this row (his Revolut export: 3,595
       trades since 2020) lives in intakeTrades; this says how many. */
    historyTrades: v.optional(v.number()),
    historyTickers: v.optional(v.number()),
  })
    .index('by_owner', ['ownerId'])
    .index('by_owner_fingerprint', ['ownerId', 'fingerprint']),

  /* A long trade history read from a CSV, one row per trade or split, until
     he confirms it. Kept apart from intakes because a row there holds at
     most a megabyte. */
  intakeTrades: defineTable({
    ownerId: v.string(),
    intakeId: v.id('intakes'),
    occurredAt: v.number(),
    name: v.string(),
    isin: v.optional(v.string()),
    side: v.union(v.literal('buy'), v.literal('sell'), v.literal('split')),
    shares: v.number(),
    /* Per share, in `currency`; 0 for a split. */
    price: v.number(),
    currency: v.string(),
  }).index('by_intake', ['intakeId', 'occurredAt']),

  /* A CSV's column map, remembered by its header (27 Sep): the second
     export from the same bank is read with no model at all. */
  csvLayouts: defineTable({
    ownerId: v.string(),
    headerKey: v.string(),
    layout: v.object({
      kind: v.union(v.literal('transactions'), v.literal('trades')),
      institution: v.optional(v.string()),
      accountTail: v.optional(v.string()),
      currency: v.optional(v.string()),
      dateColumn: v.number(),
      dateOrder: v.union(v.literal('ymd'), v.literal('dmy'), v.literal('mdy')),
      decimal: v.union(v.literal('.'), v.literal(',')),
      descriptionColumn: v.optional(v.number()),
      amountColumn: v.optional(v.number()),
      outColumn: v.optional(v.number()),
      inColumn: v.optional(v.number()),
      feeColumn: v.optional(v.number()),
      currencyColumn: v.optional(v.number()),
      balanceColumn: v.optional(v.number()),
      stateColumn: v.optional(v.number()),
      pendingValues: v.array(v.string()),
      skipValues: v.array(v.string()),
      tickerColumn: v.optional(v.number()),
      nameColumn: v.optional(v.number()),
      isinColumn: v.optional(v.number()),
      typeColumn: v.optional(v.number()),
      buyPrefixes: v.array(v.string()),
      sellPrefixes: v.array(v.string()),
      splitPrefixes: v.array(v.string()),
      quantityColumn: v.optional(v.number()),
      priceColumn: v.optional(v.number()),
    }),
    updatedAt: v.number(),
  }).index('by_owner_header', ['ownerId', 'headerKey']),

  /* What a merchant is, as he taught it (Treasury, 27 Sep): change "Bnp
     Toc" to eating out once and every row of it — this statement and the
     next — files itself. Keyed by the merchant's cleaned name. */
  merchantRules: defineTable({
    ownerId: v.string(),
    key: v.string(),
    category: v.string(),
    updatedAt: v.number(),
  }).index('by_owner_key', ['ownerId', 'key']),

  principles: defineTable({
    ownerId: v.string(),
    text: v.string(),
    sortOrder: v.number(),
  })
    .index('by_owner_order', ['ownerId', 'sortOrder'])
    .searchIndex('search_text', {
      searchField: 'text',
      filterFields: ['ownerId'],
    }),

  reviews: defineTable({
    ownerId: v.string(),
    period: reviewPeriod,
    periodStart: v.string(), // ISO date
    closedAt: v.optional(v.number()),
    answers: v.object({
      didHappen: v.optional(v.string()), // what I actually did
      movedForward: v.optional(v.string()),
      avoided: v.optional(v.string()),
      overthought: v.optional(v.string()),
      shouldChange: v.optional(v.string()),
    }),
    decision: v.optional(v.string()), // the one sentence "what changes next week"
  }).index('by_owner_period_start', ['ownerId', 'period', 'periodStart']),
})
