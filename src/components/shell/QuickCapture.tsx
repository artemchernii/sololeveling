import { useEffect, useMemo, useRef, useState } from 'react'
import { Command } from 'cmdk'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { useNavigate } from '@tanstack/react-router'
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Clock,
  Euro,
  PenLine,
  Plus,
  Scale,
  Timer,
  Trash2,
} from 'lucide-react'

import { Hint, PaletteShell } from './PaletteShell'
import { Key } from './Key'
import { VERB_ICONS, VerbTile } from './VerbIcon'
import { api } from '../../../convex/_generated/api'
import { NoteEditor } from '@/components/notes/NoteEditor'
import { AREAS, areaVars } from '@/lib/areas'
import {
  CAPTURE_CHOICES,
  CAPTURE_HINTS,
  formatLine,
  lineFromLog,
  parseCapture,
  projectVerbs,
  searchVerbs,
  suggestVerbs,
  toNumber,
  verbFor,
} from '@/lib/capture-parser'
import type { Area, LogKind, VerbInfo } from '@/lib/capture-parser'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { whenLabel } from '@/lib/format'
import { splitNote } from '@/lib/note-text'

/* PLAN.md §3: three seconds. `gym` ⏎ is still the whole of it.

   The line is the source of truth. Once it names a verb, the chips underneath
   show what the line is about to become — area, amount, words, when — and
   editing a chip rewrites the line, so there is still one parser and nothing
   can disagree with it. Area and time exist only as chips, because there is
   no fast way to type either and a grammar for them is a bigger invisible
   language.

   Reached three ways — the Log button, `/log` in search, and Enter on the
   first row of an empty search — and written in one place.

   Enter logs and stays open. An evening of catching up is several lines in a
   row, and a modal that closed after each one made it several trips. Esc is
   the way out, and the line just logged sits at the top with an undo, so
   staying open is also the moment a slip is cheapest to take back.

   `/` lists every verb with what it means, and matches on the meaning — the
   point of the list is the verb you have forgotten, so `/portuguese` has to
   find `pt`.

   `note` is the one verb that does not log. A note is written down, not done,
   so the line hands over to a writing sheet — first line the title, lists
   that carry on — and it saves to the notes table, where the Notes page and
   search find it. */

const CHIP =
  'motion-press chip-focus inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px]'
const NEUTRAL_CHIP = `${CHIP} bg-white/[0.06] text-ink-300 ring-1 ring-white/10 ring-inset hover:bg-white/10`
const AREA_CHIP = `${CHIP} bg-(--area)/14 text-(--area) ring-1 ring-(--area)/30 ring-inset hover:bg-(--area)/22`

/** What a count after logging is a count of, so "4" is never a bare number
    beside a word it does not count: `boxing` says "4 workouts", because
    every workout is counted, and `pt` says "3 Portuguese sessions". */
function countNoun(
  last: { kind: LogKind; area: Area; projectId?: string },
  count: number,
): string {
  const one = count === 1
  switch (last.kind) {
    case 'workout':
      return one ? 'workout' : 'workouts'
    case 'weight':
      return one ? 'weigh-in' : 'weigh-ins'
    case 'expense':
      return one ? 'expense' : 'expenses'
    case 'transfer':
      return one ? 'investment' : 'investments'
    case 'income':
      return one ? 'payment in' : 'payments in'
    case 'event':
      return one ? 'event' : 'events'
    case 'piece':
      return one ? 'piece' : 'pieces'
    case 'session': {
      const noun = one ? 'session' : 'sessions'
      if (last.projectId) return `${noun} on this project`
      if (last.area === 'portuguese') return `Portuguese ${noun}`
      if (last.area === 'career') return `work ${noun}`
      return noun
    }
    default:
      return one ? 'log' : 'logs'
  }
}

type NoteKind = Doc<'notes'>['kind']
const NOTE_KINDS: Array<NoteKind> = ['note', 'idea', 'book', 'reference']

/** A verb's icon at chip size, in its area colour. */
function ChipIcon({ icon }: { icon: VerbInfo['icon'] | undefined }) {
  if (!icon) return null
  const Icon = VERB_ICONS[icon]
  return <Icon className="size-3.5 shrink-0 text-(--area)" />
}

/* 35ms per chip: short enough that four chips are all in within a base
   duration of the first, long enough that the eye reads them as a sequence.
   It delays an existing motion rather than being a duration of its own. */
function beat(index: number): React.CSSProperties {
  return { animationDelay: `${index * 35}ms` }
}

/** A datetime-local value, in local time, for an instant. */
function toLocalInput(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function QuickCapture({
  open,
  onOpenChange,
  initialInput = '',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** What `/log workout 60` typed for you before handing over. */
  initialInput?: string
}) {
  const [input, setInput] = useState(initialInput)
  /* An area chosen for one verb. Keyed by the verb's word, so changing the
     verb drops it without an effect racing the recent list that sets both at
     once — and by word rather than kind, since `pt` and `work` are both
     sessions and must not share an override. */
  const [areaFor, setAreaFor] = useState<{ word: string; area: Area } | null>(
    null,
  )
  /** null is "now", resolved at the moment of logging, not of opening. */
  const [when, setWhen] = useState<number | null>(null)
  const [picker, setPicker] = useState<'area' | 'when' | null>(null)
  const [attempted, setAttempted] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  /* What a chip is showing while you type in it. Rewriting the line on every
     keystroke would trim `push ` to `push` and swallow the space you are about
     to follow with a second word. */
  const [valueDraft, setValueDraft] = useState<string | null>(null)
  const [textDraft, setTextDraft] = useState<string | null>(null)

  /** The note being written, once the line says `note`. Null otherwise. */
  const [noteText, setNoteText] = useState<string | null>(null)
  const [noteKind, setNoteKind] = useState<NoteKind>('note')
  const noteRef = useRef<HTMLTextAreaElement>(null)

  /* The last thing done from this modal, for the row at the top: a line
     logged, with how many of its kind this month and an undo; or a past log
     removed, with an undo that writes it back. One row, so the two never
     stack and the undo always means the most recent action. */
  const [last, setLast] = useState<
    | {
        type: 'logged'
        id: Id<'logs'>
        line: string
        kind: LogKind
        area: Area
        at: number
        projectId?: Id<'projects'>
      }
    | { type: 'removed'; line: string; row: Doc<'logs'> }
    | { type: 'noted'; id: Id<'notes'>; title: string }
    | { type: 'tasked'; id: Id<'tasks'>; title: string }
    | null
  >(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const createLog = useMutation(api.logs.create)
  const removeLog = useMutation(api.logs.remove)
  const createNote = useMutation(api.notes.create)
  const createTask = useMutation(api.tasks.create)
  const removeTask = useMutation(api.tasks.remove)
  /* Your live projects, each of which is a verb — `sololeveling 90`. */
  const projects = useQuery(api.projects.listLive, {})
  const extra = useMemo(() => projectVerbs(projects ?? []), [projects])
  /** Which row is on its way out, so it can animate before it is removed. */
  const [leaving, setLeaving] = useState<string | null>(null)
  const removeNote = useMutation(api.notes.remove)
  const navigate = useNavigate()

  /* Subscribed whether or not the modal is open, so it opens with the list
     already there rather than flashing a skeleton every time. */
  const recentRows = useQuery(api.logs.recent, {})

  /* Reset to a blank state whenever the modal opens. Done during render
     against the previous `open`, not in an effect, so the first painted frame
     is already the new one. */
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setInput(initialInput)
      setAreaFor(null)
      setWhen(null)
      setPicker(null)
      setAttempted(false)
      setFailure(null)
      setValueDraft(null)
      setTextDraft(null)
      setLast(null)
      setNoteText(null)
      setNoteKind('note')
    }
  }

  const recents = useMemo(() => {
    const seen = new Set<string>()
    const out: Array<{
      id: string
      line: string
      word: string
      icon: VerbInfo['icon']
      area: Area
      at: number
      row: Doc<'logs'>
    }> = []
    for (const row of recentRows ?? []) {
      /* The row just logged is already on screen, with its undo. */
      if (last?.type === 'logged' && row._id === last.id) continue
      const line = lineFromLog(row, extra)
      if (line === null || seen.has(line)) continue
      seen.add(line)
      const word = line.split(' ')[0]
      out.push({
        id: row._id,
        line,
        word,
        icon: verbFor(word, extra)?.icon ?? 'sticky-note',
        area: row.area,
        at: row.occurredAt,
        row,
      })
      if (out.length === 5) break
    }
    return out
  }, [recentRows, last, extra])

  const trimmed = input.trim()
  const result = parseCapture(input, extra)
  const verb = result.verb
  const typed = result.typed ?? {}
  const area: Area | undefined = verb
    ? areaFor?.word === verb.word
      ? areaFor.area
      : verb.area
    : undefined

  /* Entering note mode: whatever followed `note` on the line moves into the
     sheet, and the line keeps only the word — so there is one place the note
     is being written, not two halves of it. Done during render against the
     previous state, like the open reset above, so no frame shows both. */
  const isNote = verb?.action === 'note'
  const isTask = verb?.action === 'task'
  /* A draft is never thrown away by the line: change `note` to something else
     by accident and back, and the sheet still holds what was written. It is
     cleared only by saving, or by closing the modal. */
  if (isNote && (noteText === null || (noteText === '' && typed.text))) {
    setNoteText(typed.text ?? '')
    setInput(trimmed.split(/\s+/)[0])
  }

  useEffect(() => {
    if (!isNote) return
    requestAnimationFrame(() => {
      const el = noteRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
    })
  }, [isNote])

  const slashed = trimmed.startsWith('/')
  const slashMatches = slashed ? searchVerbs(trimmed.slice(1), extra) : []
  const [firstWord = '', ...restWords] = trimmed.split(/\s+/)
  const rest = restWords.join(' ')
  /** Verbs that mean the first word, when it is not one itself. */
  const meant = verb || slashed ? [] : searchVerbs(firstWord, extra)

  /* A log count, from aggregate.ts like every other number — for the month
     the line was logged into, which is not this month if it was back-dated. */
  const loggedLast = last?.type === 'logged' ? last : null
  const loggedMonth = loggedLast ? new Date(loggedLast.at) : null
  const count = useQuery(
    api.aggregate.kindCount,
    last?.type === 'logged' && loggedMonth
      ? {
          kind: last.kind,
          /* A session is written by pt, work and every project, so it is
             counted within what this one was: its project, or its area. */
          ...(last.kind === 'session'
            ? last.projectId
              ? { projectId: last.projectId }
              : { area: last.area }
            : {}),
          start: new Date(
            loggedMonth.getFullYear(),
            loggedMonth.getMonth(),
            1,
          ).getTime(),
          end: new Date(
            loggedMonth.getFullYear(),
            loggedMonth.getMonth() + 1,
            1,
          ).getTime(),
        }
      : 'skip',
  )
  const now = new Date()
  const countLabel =
    count === undefined || loggedMonth === null || loggedLast === null
      ? null
      : loggedMonth.getFullYear() === now.getFullYear() &&
          loggedMonth.getMonth() === now.getMonth()
        ? `${count} ${countNoun(loggedLast, count)} this month`
        : `${count} ${countNoun(loggedLast, count)} in ${loggedMonth.toLocaleDateString(undefined, { month: 'long' })}`

  const suggestions = suggestVerbs(
    input,
    recents.map((r) => r.word),
    extra,
  )
  const ghost =
    suggestions.length > 0 ? suggestions[0].slice(input.length) : undefined

  function focusLine() {
    requestAnimationFrame(() => {
      const el = inputRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
    })
  }

  function takeLine(line: string) {
    setInput(line)
    setAttempted(false)
    setFailure(null)
    focusLine()
  }

  /* The words chip shows what you typed, or a default you can see — never
     the text as stored. For `boxing 60 sparring` the row says "boxing
     sparring", but the chip is "sparring": editing it writes back into the
     line, and the line already starts with `boxing`. */
  const chipText =
    typed.text ??
    (result.ok && result.defaulted.text ? (result.log.text ?? '') : '')

  /** A chip edit, written back into the line alongside what was typed. */
  function rewrite(patch: { value?: number | null; text?: string | null }) {
    if (!verb) return
    const word = trimmed.split(/\s+/)[0]
    setInput(
      formatLine({
        word,
        value:
          patch.value === undefined ? typed.value : (patch.value ?? undefined),
        text: patch.text === undefined ? typed.text : (patch.text ?? undefined),
      }),
    )
    setAttempted(false)
  }

  async function submit() {
    if (isNote) {
      await saveNote()
      return
    }
    if (isTask) {
      await addTask()
      return
    }
    setAttempted(true)
    setFailure(null)
    if (!result.ok) {
      return
    }
    const filed = area ?? result.log.area
    const at = when ?? Date.now()
    try {
      const id = await createLog({
        ...result.log,
        area: filed,
        occurredAt: at,
      })
      /* Back to a blank line, ready for the next one. `when` goes back to now
         as well: a back-dated time that quietly carried over to the next line
         would file today's thing under yesterday. */
      setLast({
        type: 'logged',
        id,
        line: trimmed,
        kind: result.log.kind,
        area: filed,
        at,
        projectId: result.log.projectId,
      })
      setInput('')
      setAreaFor(null)
      setWhen(null)
      setPicker(null)
      setAttempted(false)
      setValueDraft(null)
      setTextDraft(null)
      focusLine()
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'That did not log.')
    }
  }

  /** `todo` — a task to the backlog, from its title alone (§3b.3). */
  async function addTask() {
    setAttempted(true)
    setFailure(null)
    if (!result.ok || !result.log.text) return
    try {
      const title = result.log.text
      const id = await createTask({ title, area })
      setLast({ type: 'tasked', id, title })
      setInput('')
      setAreaFor(null)
      setAttempted(false)
      setTextDraft(null)
      focusLine()
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'That did not save.')
    }
  }

  function leaveNote() {
    setInput('')
    setFailure(null)
    setAttempted(false)
    focusLine()
  }

  async function saveNote() {
    if (noteText === null) return
    const { title, body } = splitNote(noteText)
    if (title.length === 0) {
      setAttempted(true)
      setFailure('A note needs a first line — it becomes the title.')
      noteRef.current?.focus()
      return
    }
    try {
      const id = await createNote({ title, body, kind: noteKind })
      setLast({ type: 'noted', id, title })
      setNoteText(null)
      setNoteKind('note')
      setInput('')
      setAttempted(false)
      setFailure(null)
      focusLine()
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'That did not save.')
    }
  }

  /** Undoes whatever the top row says was just done, and nothing more: a
      log or a note is taken back, a removed log is written back as it was.
      It used to put the line back in the field as well, which made undo
      read as "edit" — two actions behind one word (settled 14 Sep). Fixing a
      log is retyping it; fixing a note is its own page. */
  async function undo() {
    if (!last) return
    const action = last
    setLast(null)
    if (action.type === 'logged') {
      await removeLog({ logId: action.id })
      focusLine()
      return
    }
    if (action.type === 'noted') {
      await removeNote({ noteId: action.id })
      focusLine()
      return
    }
    if (action.type === 'tasked') {
      await removeTask({ taskId: action.id })
      focusLine()
      return
    }
    const { row } = action
    await createLog({
      kind: row.kind,
      area: row.area,
      occurredAt: row.occurredAt,
      value: row.value,
      unit: row.unit,
      text: row.text,
      taskId: row.taskId,
      projectId: row.projectId,
    })
    focusLine()
  }

  /** A past log that should not exist — logged twice, logged wrong. Removed
      at once, with the undo row as the safety rather than a confirm dialog:
      a question asked before every removal is one you stop reading. */
  async function remove(recent: { line: string; row: Doc<'logs'> }) {
    setLeaving(recent.row._id)
    await new Promise((resolve) => setTimeout(resolve, 200))
    await removeLog({ logId: recent.row._id })
    setLeaving(null)
    setLast({ type: 'removed', line: recent.line, row: recent.row })
    focusLine()
  }

  return (
    <PaletteShell
      open={open}
      onOpenChange={onOpenChange}
      label="Log"
      icon={verb ? VERB_ICONS[verb.icon] : Plus}
      iconKey={verb?.icon ?? 'plus'}
      placeholder="What happened?"
      value={input}
      inputRef={inputRef}
      ghost={ghost}
      /* The panel takes the colour of what you are logging, the moment the
         line names it: its edge, its icon, a wash behind the field. It is the
         quickest way to see that `pt` went to Portuguese, before reading a
         word of the chips. */
      panelStyle={
        area
          ? {
              ...areaVars(area),
              borderColor: 'color-mix(in oklab, var(--area) 38%, transparent)',
              /* A glow of the area's colour behind the panel, on top of the
                 glass's own shadow — the whole modal takes on what the line
                 has become, not only its edge. */
              boxShadow:
                'var(--glass-shadow), 0 28px 80px -28px color-mix(in oklab, var(--area) 45%, transparent)',
              transition:
                'border-color var(--motion-base) var(--motion-ease), box-shadow var(--motion-base) var(--motion-ease)',
            }
          : undefined
      }
      iconClassName={area ? 'text-(--area)' : 'text-ink-500'}
      fieldClassName={area ? 'bg-(--area)/[0.07]' : ''}
      onValueChange={(next) => {
        setInput(next)
        setAttempted(false)
        setFailure(null)
      }}
      onClear={() => {
        setInput('')
        setAreaFor(null)
        setWhen(null)
        setPicker(null)
        setAttempted(false)
        setFailure(null)
      }}
      onInputKeyDown={(e) => {
        const atEnd = e.currentTarget.selectionStart === input.length
        if (
          suggestions.length > 0 &&
          ((e.key === 'Tab' && !e.shiftKey) ||
            (e.key === 'ArrowRight' && atEnd))
        ) {
          e.preventDefault()
          takeLine(`${suggestions[0]} `)
          return
        }
        if (e.key === 'Enter') {
          /* An empty line picks the highlighted recent, and a slash picks
             the highlighted verb — both are cmdk's to handle. */
          if (trimmed.length === 0 || slashed) return
          e.preventDefault()
          /* In a note, Enter on the line means "start writing", not "save":
             the sheet is where the note is. ⌘↵ saves from either place. */
          if (isNote && !(e.metaKey || e.ctrlKey)) {
            noteRef.current?.focus()
            return
          }
          void submit()
        }
      }}
      footer={
        <>
          {isNote ? (
            <Hint>
              <Key>⌘↵</Key>
              save note
            </Hint>
          ) : (
            <Hint>
              <Key>↵</Key>
              {(trimmed.length === 0 && recents.length > 0) || slashed
                ? 'use'
                : 'log it'}
            </Hint>
          )}
          {/* The way into the list has to be visible, or it is one more
              thing to remember — which is the problem the list solves. */}
          {trimmed.length === 0 ? (
            <Hint>
              <Key>/</Key>
              all verbs
            </Hint>
          ) : null}
          {ghost ? (
            <Hint className="motion-arrive">
              <Key>tab</Key>
              complete
            </Hint>
          ) : null}
          <Hint className="ml-auto">
            <Key>esc</Key>
            {last ? 'done' : 'close'}
          </Hint>
        </>
      }
    >
      {trimmed.length === 0 && last ? (
        <div
          key={last.type === 'removed' ? `removed-${last.row._id}` : last.id}
          style={
            last.type === 'logged'
              ? areaVars(last.area)
              : last.type === 'noted'
                ? areaVars('knowledge')
                : last.type === 'tasked'
                  ? areaVars('business')
                  : areaVars(last.row.area)
          }
          /* Arrives, and — for something added — rings once in its colour
             while the tick draws itself. A removal only arrives: nothing to
             celebrate there, only something to undo. */
          className={`motion-arrive relative mx-1.5 mt-2 flex items-center gap-3 rounded-[10px] px-3.5 py-2 ${
            last.type === 'removed' ? 'bg-white/[0.04]' : 'bg-(--area)/10'
          }`}
        >
          {last.type !== 'removed' ? (
            <span
              aria-hidden
              className="motion-pulse pointer-events-none absolute inset-0 rounded-[10px]"
            />
          ) : null}
          {last.type !== 'removed' ? (
            <Check
              className="motion-draw size-3.5 shrink-0 text-(--area)"
              strokeWidth={2.5}
            />
          ) : (
            <Trash2 className="size-3.5 shrink-0 text-ink-500" />
          )}
          <span
            className={`min-w-0 truncate text-[13px] ${
              last.type === 'noted' || last.type === 'tasked'
                ? 'text-foreground'
                : last.type === 'logged'
                  ? 'font-mono text-foreground'
                  : 'font-mono text-ink-500 line-through decoration-ink-600'
            }`}
          >
            {last.type === 'noted' || last.type === 'tasked'
              ? last.title
              : last.line}
          </span>
          {last.type === 'noted' ? (
            /* Saved, and one tap from being read — no count: a note counts
               towards nothing (notes.ts). */
            <button
              type="button"
              onClick={() => {
                onOpenChange(false)
                void navigate({ to: '/notes/$id', params: { id: last.id } })
              }}
              className="motion-press flex shrink-0 items-center gap-1 text-[12px] text-(--area) hover:underline"
            >
              saved to notes
              <ArrowUpRight className="size-3" />
            </button>
          ) : last.type === 'tasked' ? (
            /* To the backlog — the one place unpicked tasks live, and no
               count of them here (§3c): "added", never "12 open". */
            <button
              type="button"
              onClick={() => {
                onOpenChange(false)
                void navigate({ to: '/backlog' })
              }}
              className="motion-press flex shrink-0 items-center gap-1 text-[12px] text-(--area) hover:underline"
            >
              added to backlog
              <ArrowUpRight className="size-3" />
            </button>
          ) : last.type === 'logged' ? (
            <span className="text-[12px] text-(--area)">
              logged
              {/* Nothing until the count has answered: a placeholder number
                  would be a fixture (§3d.2). */}
              {countLabel ? (
                <span className="text-ink-400"> · {countLabel}</span>
              ) : null}
            </span>
          ) : (
            <span className="text-[12px] text-ink-500">removed</span>
          )}
          <button
            type="button"
            onClick={() => void undo()}
            className="motion-press ml-auto rounded-full px-2.5 py-1 text-[12px] text-ink-400 hover:bg-white/10 hover:text-foreground"
          >
            undo
          </button>
        </div>
      ) : null}

      {trimmed.length === 0 ? (
        recentRows === undefined ? (
          /* Shape, never values (§3d.2): three rows the height the recent
             list will be. */
          <div className="space-y-2 px-5 py-4" aria-hidden>
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-5 w-2/5 rounded-full bg-white/[0.05]" />
            ))}
          </div>
        ) : recents.length > 0 ? (
          <Command.List className="pb-2">
            <Command.Group heading="Recent">
              {recents.map((recent) => (
                <Command.Item
                  key={recent.id}
                  value={recent.id}
                  onSelect={() => {
                    setAreaFor({ word: recent.word, area: recent.area })
                    takeLine(recent.line)
                  }}
                  style={areaVars(recent.area)}
                  className={`group motion-press mx-1.5 flex cursor-pointer items-center gap-3 rounded-[10px] px-3 py-1.5 text-ink-300 data-[selected=true]:bg-(--area)/10 data-[selected=true]:text-foreground ${
                    leaving === recent.id ? 'motion-leave' : ''
                  }`}
                >
                  <VerbTile icon={recent.icon} />
                  <span className="font-mono text-[13px]">{recent.line}</span>
                  <span className="ml-auto text-[11.5px] text-ink-600">
                    {whenLabel(recent.at)}
                  </span>
                  {/* Shown on the row you are on — hovered or highlighted —
                      and always on a touch screen, which has no hover. */}
                  <button
                    type="button"
                    aria-label={`Remove ${recent.line}, ${whenLabel(recent.at)}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      void remove(recent)
                    }}
                    className="motion-press chip-focus -my-1 -mr-2 grid size-7 place-items-center rounded-full text-ink-600 opacity-0 group-hover:opacity-100 group-data-[selected=true]:opacity-100 hover:bg-white/10 hover:text-foreground focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>
        ) : (
          /* Day one: nothing logged, so nothing recent. The grammar is the
             empty state until there is a history to show instead — and each
             example fills the line, so it can be tried rather than read. */
          <ul className="space-y-0.5 px-2 py-2.5">
            {CAPTURE_HINTS.map(({ example, hint, area: tone, icon }) => (
              <li key={example}>
                <button
                  type="button"
                  onClick={() => takeLine(example)}
                  style={areaVars(tone)}
                  className="motion-press flex w-full items-center gap-3 rounded-[10px] px-3 py-1 text-left hover:bg-(--area)/10"
                >
                  <VerbTile icon={icon} size="sm" />
                  <span className="w-[164px] shrink-0 font-mono text-[12.5px] text-ink-200">
                    {example}
                  </span>
                  <span className="text-[12.5px] text-ink-600">{hint}</span>
                </button>
              </li>
            ))}
          </ul>
        )
      ) : slashed ? (
        <Command.List
          key="verbs"
          className="motion-arrive max-h-[52vh] overflow-y-auto pb-2"
        >
          {slashMatches.length > 0 ? (
            <Command.Group heading="Verbs">
              {slashMatches.map((choice) => (
                <Command.Item
                  key={choice.word}
                  value={choice.word}
                  onSelect={() => takeLine(`${choice.word} `)}
                  style={areaVars(choice.area)}
                  className="motion-press mx-1.5 flex cursor-pointer items-center gap-3 rounded-[10px] px-3 py-1.5 text-ink-300 data-[selected=true]:bg-(--area)/10 data-[selected=true]:text-foreground"
                >
                  <VerbTile icon={choice.icon} />
                  <span className="w-[96px] shrink-0 font-mono text-[13px]">
                    {choice.word}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-500">
                    {choice.hint}
                  </span>
                  <span className="shrink-0 font-mono text-[10.5px] tracking-[0.12em] text-(--area) uppercase">
                    {choice.area}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          ) : (
            <div className="px-5 py-4">
              <p className="text-[13px] text-ink-500">
                No verb means “{trimmed.slice(1)}”.
              </p>
              <button
                type="button"
                style={areaVars('knowledge')}
                onClick={() => takeLine(`note ${trimmed.slice(1)}`)}
                className={`${AREA_CHIP} mt-3`}
              >
                keep it as a note
              </button>
            </div>
          )}
        </Command.List>
      ) : isNote && noteText !== null ? (
        <div
          key="note"
          style={areaVars('knowledge')}
          className="motion-arrive px-5 pt-3 pb-4"
        >
          <div className="flex flex-wrap items-center gap-1.5">
            {/* The way back, for a change of mind. What was written stays as
                a draft — type `note` again and it is still there. Backspace
                in an empty sheet does the same. */}
            <button
              type="button"
              onClick={leaveNote}
              className={`${NEUTRAL_CHIP} mr-1 h-7 px-2.5 text-[12px]`}
            >
              <ArrowLeft className="size-3.5" />
              log
            </button>
            {NOTE_KINDS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  setNoteKind(option)
                  noteRef.current?.focus()
                }}
                className={`${CHIP} h-7 px-2.5 font-mono text-[10.5px] tracking-[0.12em] uppercase ${
                  noteKind === option
                    ? 'bg-(--area)/16 text-(--area) ring-1 ring-(--area)/40 ring-inset'
                    : 'text-ink-500 hover:bg-(--area)/10 hover:text-(--area)'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
          <div className="mt-3 max-h-[46vh] overflow-y-auto rounded-[14px] bg-black/15 px-4 py-3 ring-1 ring-white/[0.06] focus-within:ring-(--area)/35">
            <NoteEditor
              textareaRef={noteRef}
              value={noteText}
              onChange={(next) => {
                setNoteText(next)
                setFailure(null)
                setAttempted(false)
              }}
              onSubmit={() => void saveNote()}
              onEmptyBackspace={leaveNote}
            />
          </div>
          <p
            className={`mt-2.5 text-[12px] ${failure ? 'text-foreground' : 'text-ink-600'}`}
          >
            {failure ??
              'The first line is the title. Lists carry on when you press Enter; Tab indents.'}
          </p>
        </div>
      ) : verb && area ? (
        /* Keyed by kind: the block arrives when the line first names a verb
           and again when it names a different one, and stays still while you
           type the rest. */
        <div key={verb.word} className="px-5 py-4">
          {/* Each chip arrives a beat after the one before it (see `beat`),
              so the row assembles in reading order instead of appearing as
              one block. */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              style={{ ...areaVars(area), ...beat(0) }}
              className={`${AREA_CHIP} motion-arrive`}
              aria-expanded={picker === 'area'}
              onClick={() => setPicker(picker === 'area' ? null : 'area')}
            >
              <span className="size-1.5 rounded-full bg-(--area)" />
              <span className="font-mono text-[11px] tracking-[0.12em] uppercase">
                {area}
              </span>
            </button>

            {verb.amount !== 'none' ? (
              <label
                style={{ ...areaVars(area), ...beat(1) }}
                className={`${NEUTRAL_CHIP} motion-arrive cursor-text focus-within:bg-(--area)/10 focus-within:ring-(--area)/55`}
              >
                {/* The unit as an icon at the front, so every chip opens on
                    one — the time chip already did, and a row where some
                    chips have a lead and some do not never lines up. */}
                {verb.unit === 'eur' ? (
                  <Euro className="size-3.5 shrink-0 text-(--area)" />
                ) : verb.unit === 'kg' ? (
                  <Scale className="size-3.5 shrink-0 text-(--area)" />
                ) : (
                  <Timer className="size-3.5 shrink-0 text-(--area)" />
                )}
                {/* Sized by an invisible copy of its own text (or its
                    placeholder) in the same grid cell, so the chip is exactly
                    as wide as what it says — `size` guessed from a character
                    count, and clipped "amount" to "am". */}
                <span className="inline-grid">
                  <span
                    aria-hidden
                    className="invisible col-start-1 row-start-1 whitespace-pre"
                  >
                    {(valueDraft ??
                      (result.ok
                        ? (result.log.value?.toString() ?? '')
                        : (typed.value?.toString() ?? ''))) ||
                      (verb.amount === 'required' ? 'amount' : '—')}
                  </span>
                  <input
                    data-chip-input
                    inputMode="decimal"
                    aria-label="Amount"
                    value={
                      valueDraft ??
                      (result.ok
                        ? (result.log.value?.toString() ?? '')
                        : (typed.value?.toString() ?? ''))
                    }
                    placeholder={verb.amount === 'required' ? 'amount' : '—'}
                    size={1}
                    onFocus={(e) => e.currentTarget.select()}
                    onBlur={() => setValueDraft(null)}
                    onChange={(e) => {
                      const cleaned = e.target.value.replace(/[^\d.,]/g, '')
                      setValueDraft(cleaned)
                      if (cleaned === '') rewrite({ value: null })
                      else {
                        const n = toNumber(cleaned)
                        if (n !== null) rewrite({ value: n })
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        void submit()
                      }
                    }}
                    /* A default is a real value you can see and change — dimmer
                       until you do, so it never reads as something you typed. */
                    className={`col-start-1 row-start-1 w-full min-w-0 bg-transparent outline-none placeholder:text-ink-600 ${
                      result.ok && result.defaulted.value && valueDraft === null
                        ? 'text-ink-500'
                        : 'text-foreground'
                    } ${
                      attempted && !result.ok && verb.amount === 'required'
                        ? 'placeholder:text-(--area)'
                        : ''
                    }`}
                    style={areaVars(area)}
                  />
                </span>
                {verb.unit === 'min' ? (
                  <span className="text-ink-500">min</span>
                ) : verb.unit === 'kg' ? (
                  <span className="text-ink-500">kg</span>
                ) : null}
              </label>
            ) : null}

            <label
              style={{ ...areaVars(area), ...beat(2) }}
              className={`${NEUTRAL_CHIP} motion-arrive cursor-text focus-within:bg-(--area)/10 focus-within:ring-(--area)/55`}
            >
              <PenLine className="size-3.5 shrink-0 text-(--area)" />
              <span className="inline-grid">
                <span
                  aria-hidden
                  className="invisible col-start-1 row-start-1 whitespace-pre"
                >
                  {(textDraft ?? chipText) ||
                    (verb.amount === 'none' ? 'what?' : 'words')}
                </span>
                <input
                  data-chip-input
                  aria-label={verb.amount === 'none' ? 'What' : 'Words'}
                  value={textDraft ?? chipText}
                  placeholder={verb.amount === 'none' ? 'what?' : 'words'}
                  size={1}
                  onFocus={(e) => e.currentTarget.select()}
                  onBlur={() => setTextDraft(null)}
                  onChange={(e) => {
                    setTextDraft(e.target.value)
                    rewrite({ text: e.target.value.trim() || null })
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      void submit()
                    }
                  }}
                  className={`col-start-1 row-start-1 w-full min-w-0 bg-transparent outline-none placeholder:text-ink-600 ${
                    result.ok && result.defaulted.text && textDraft === null
                      ? 'text-ink-500'
                      : 'text-foreground'
                  }`}
                />
              </span>
            </label>

            {/* A task has no time — it has not happened — so no when chip. */}
            {isTask ? null : (
              <button
                type="button"
                style={beat(3)}
                className={`${NEUTRAL_CHIP} motion-arrive`}
                aria-expanded={picker === 'when'}
                onClick={() => setPicker(picker === 'when' ? null : 'when')}
              >
                <Clock className="size-3.5 text-ink-500" />
                {when === null ? 'now' : whenLabel(when)}
              </button>
            )}
          </div>

          {picker === 'area' ? (
            <div className="motion-arrive mt-3 flex flex-wrap gap-1.5">
              {AREAS.map((choice) => (
                <button
                  key={choice}
                  type="button"
                  style={areaVars(choice)}
                  onClick={() => {
                    setAreaFor({ word: verb.word, area: choice })
                    setPicker(null)
                    focusLine()
                  }}
                  className={`${CHIP} h-7 px-2.5 font-mono text-[10.5px] tracking-[0.12em] uppercase ${
                    choice === area
                      ? 'bg-(--area)/22 text-(--area) ring-1 ring-(--area)/50 ring-inset'
                      : 'text-ink-500 hover:bg-(--area)/12 hover:text-(--area)'
                  }`}
                >
                  <span className="size-1.5 rounded-full bg-(--area)" />
                  {choice}
                </button>
              ))}
            </div>
          ) : null}

          {picker === 'when' ? (
            <div className="motion-arrive mt-3 flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                className={NEUTRAL_CHIP}
                onClick={() => {
                  setWhen(null)
                  setPicker(null)
                  focusLine()
                }}
              >
                now
              </button>
              <button
                type="button"
                className={NEUTRAL_CHIP}
                onClick={() => {
                  setWhen(Date.now() - 86_400_000)
                  setPicker(null)
                  focusLine()
                }}
              >
                yesterday, this time
              </button>
              {/* The platform's own picker — on a phone it is the wheel you
                  already know. Capped at now: a log is something that
                  happened, and the server refuses the future anyway. */}
              <input
                type="datetime-local"
                aria-label="When it happened"
                max={toLocalInput(Date.now())}
                value={toLocalInput(when ?? Date.now())}
                onChange={(e) => {
                  const ms = new Date(e.target.value).getTime()
                  if (Number.isFinite(ms)) setWhen(Math.min(ms, Date.now()))
                }}
                className={`${NEUTRAL_CHIP} [color-scheme:dark]`}
              />
            </div>
          ) : null}

          {/* One line, never two: what it is about to write, or what is
              still missing — louder once Enter has been tried. */}
          <p
            className={`mt-3 text-[12.5px] ${
              failure || (attempted && !result.ok)
                ? 'text-foreground'
                : 'text-ink-500'
            }`}
          >
            {failure ?? (result.ok ? result.summary : result.message)}
          </p>
        </div>
      ) : (
        <div className="px-5 py-4">
          {suggestions.length > 0 ? (
            <div className="motion-arrive flex flex-wrap items-center gap-2">
              {suggestions.map((word) => {
                const suggested = verbFor(word, extra)
                const tone = suggested?.area ?? 'life'
                return (
                  <button
                    key={word}
                    type="button"
                    style={areaVars(tone)}
                    onClick={() => takeLine(`${word} `)}
                    className={`${AREA_CHIP} font-mono`}
                  >
                    <ChipIcon icon={suggested?.icon} />
                    {word}
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="motion-arrive">
              <p className="text-[13px] text-ink-500">
                “{firstWord}” isn’t a verb.{' '}
                {meant.length > 0
                  ? 'Did you mean one of these?'
                  : 'Pick one, or keep it as a note.'}
              </p>
              {/* When something means what was typed, that is the answer and
                  it leads, in its colour; the note is the fallback beside it.
                  When nothing does, the note leads and every verb follows. */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {meant.length > 0
                  ? meant.map(({ word, area: tone, icon }) => (
                      <button
                        key={word}
                        type="button"
                        style={areaVars(tone)}
                        /* The rest of the line comes along: `portuguese 30`
                           becomes `pt 30`, not `pt` and a retype. */
                        onClick={() => takeLine(`${word} ${rest}`.trim())}
                        className={`${AREA_CHIP} font-mono`}
                      >
                        <ChipIcon icon={icon} />
                        {word}
                      </button>
                    ))
                  : null}
                <button
                  type="button"
                  style={areaVars('knowledge')}
                  onClick={() => takeLine(`note ${trimmed}`)}
                  className={meant.length > 0 ? NEUTRAL_CHIP : AREA_CHIP}
                >
                  save as a note
                </button>
                {meant.length === 0 ? (
                  <>
                    <span className="mx-1 h-4 w-px bg-white/10" />
                    {CAPTURE_CHOICES.map(({ word, area: tone, icon }) => (
                      <button
                        key={word}
                        type="button"
                        style={areaVars(tone)}
                        onClick={() => takeLine(`${word} ${rest}`.trim())}
                        className={`${NEUTRAL_CHIP} font-mono text-[12.5px] hover:text-(--area)`}
                      >
                        <ChipIcon icon={icon} />
                        {word}
                      </button>
                    ))}
                  </>
                ) : null}
              </div>
            </div>
          )}
        </div>
      )}
    </PaletteShell>
  )
}
