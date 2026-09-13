import { useMemo, useRef, useState } from 'react'
import { Command } from 'cmdk'
import { useMutation, useQuery } from 'convex/react'
import { Check, Clock, Plus } from 'lucide-react'

import { Hint, PaletteShell } from './PaletteShell'
import { Key } from './Key'
import { api } from '../../../convex/_generated/api'
import { AREAS, areaVars } from '@/lib/areas'
import {
  CAPTURE_CHOICES,
  CAPTURE_HINTS,
  formatLine,
  lineFromLog,
  parseCapture,
  suggestVerbs,
  toNumber,
  verbFor,
} from '@/lib/capture-parser'
import type { Area, LogKind } from '@/lib/capture-parser'
import type { Id } from '../../../convex/_generated/dataModel'
import { whenLabel } from '@/lib/format'

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
   staying open is also the moment a slip is cheapest to take back. */

const CHIP =
  'motion-press chip-focus inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px]'
const NEUTRAL_CHIP = `${CHIP} bg-white/[0.06] text-ink-300 ring-1 ring-white/10 ring-inset hover:bg-white/10`
const AREA_CHIP = `${CHIP} bg-(--area)/14 text-(--area) ring-1 ring-(--area)/30 ring-inset hover:bg-(--area)/22`

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
  /* An area chosen for one verb. Keyed by the kind it was chosen for, so
     changing the verb drops it without an effect racing the recent list that
     sets both at once. */
  const [areaFor, setAreaFor] = useState<{ kind: LogKind; area: Area } | null>(
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

  /** The last thing logged while the modal has been open, for the ✓ row. */
  const [justLogged, setJustLogged] = useState<{
    id: Id<'logs'>
    line: string
    area: Area
  } | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const createLog = useMutation(api.logs.create)
  const removeLog = useMutation(api.logs.remove)

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
      setJustLogged(null)
    }
  }

  const recents = useMemo(() => {
    const seen = new Set<string>()
    const out: Array<{
      id: string
      line: string
      kind: LogKind
      area: Area
      at: number
    }> = []
    for (const row of recentRows ?? []) {
      /* The row just logged is already on screen, with its undo. */
      if (row._id === justLogged?.id) continue
      const line = lineFromLog(row)
      if (line === null || seen.has(line)) continue
      seen.add(line)
      out.push({
        id: row._id,
        line,
        kind: row.kind,
        area: row.area,
        at: row.occurredAt,
      })
      if (out.length === 5) break
    }
    return out
  }, [recentRows, justLogged])

  const trimmed = input.trim()
  const result = parseCapture(input)
  const verb = result.verb
  const typed = result.typed ?? {}
  const area: Area | undefined = verb
    ? areaFor?.kind === verb.kind
      ? areaFor.area
      : verb.area
    : undefined

  const suggestions = suggestVerbs(
    input,
    recents.map((r) => r.line.split(' ')[0]),
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
    setAttempted(true)
    setFailure(null)
    if (!result.ok) {
      return
    }
    const filed = area ?? result.log.area
    try {
      const id = await createLog({
        ...result.log,
        area: filed,
        occurredAt: when ?? Date.now(),
      })
      /* Back to a blank line, ready for the next one. `when` goes back to now
         as well: a back-dated time that quietly carried over to the next line
         would file today's thing under yesterday. */
      setJustLogged({ id, line: trimmed, area: filed })
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

  /** Takes the log back and puts its line back in the field, so a slip is
      corrected by editing rather than retyping. */
  async function undo() {
    if (!justLogged) return
    const { id, line } = justLogged
    setJustLogged(null)
    await removeLog({ logId: id })
    takeLine(line)
  }

  return (
    <PaletteShell
      open={open}
      onOpenChange={onOpenChange}
      label="Log"
      icon={Plus}
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
          /* An empty line lets cmdk pick the highlighted recent instead. */
          if (trimmed.length === 0) return
          e.preventDefault()
          void submit()
        }
      }}
      footer={
        <>
          <Hint>
            <Key>↵</Key>
            {trimmed.length === 0 && recents.length > 0 ? 'use' : 'log it'}
          </Hint>
          {ghost ? (
            <Hint className="motion-arrive">
              <Key>tab</Key>
              complete
            </Hint>
          ) : null}
          <Hint className="ml-auto">
            <Key>esc</Key>
            {justLogged ? 'done' : 'close'}
          </Hint>
        </>
      }
    >
      {trimmed.length === 0 && justLogged ? (
        <div
          key={justLogged.id}
          style={areaVars(justLogged.area)}
          className="motion-arrive mx-1.5 mt-2 flex items-center gap-3 rounded-[10px] bg-(--area)/10 px-3.5 py-2"
        >
          <Check
            className="size-3.5 shrink-0 text-(--area)"
            strokeWidth={2.5}
          />
          <span className="font-mono text-[13px] text-foreground">
            {justLogged.line}
          </span>
          <span className="text-[12px] text-(--area)">logged</span>
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
                    setAreaFor({ kind: recent.kind, area: recent.area })
                    takeLine(recent.line)
                  }}
                  style={areaVars(recent.area)}
                  className="motion-press mx-1.5 flex cursor-pointer items-center gap-3 rounded-[10px] px-3.5 py-2 text-ink-300 data-[selected=true]:bg-(--area)/10 data-[selected=true]:text-foreground"
                >
                  <span className="size-2 shrink-0 rounded-full bg-(--area)" />
                  <span className="font-mono text-[13px]">{recent.line}</span>
                  <span className="ml-auto text-[11.5px] text-ink-600">
                    {whenLabel(recent.at)}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>
        ) : (
          /* Day one: nothing logged, so nothing recent. The grammar is the
             empty state until there is a history to show instead — and each
             example fills the line, so it can be tried rather than read. */
          <ul className="space-y-0.5 px-2 py-2.5">
            {CAPTURE_HINTS.map(({ example, hint, area: tone }) => (
              <li key={example}>
                <button
                  type="button"
                  onClick={() => takeLine(example)}
                  style={areaVars(tone)}
                  className="motion-press flex w-full items-baseline gap-3 rounded-[10px] px-3 py-1.5 text-left hover:bg-(--area)/10"
                >
                  <span className="size-2 shrink-0 translate-y-[-1px] self-center rounded-full bg-(--area)" />
                  <span className="w-[164px] shrink-0 font-mono text-[12.5px] text-ink-200">
                    {example}
                  </span>
                  <span className="text-[12.5px] text-ink-600">{hint}</span>
                </button>
              </li>
            ))}
          </ul>
        )
      ) : verb && area ? (
        /* Keyed by kind: the block arrives when the line first names a verb
           and again when it names a different one, and stays still while you
           type the rest. */
        <div key={verb.kind} className="motion-arrive px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              style={areaVars(area)}
              className={AREA_CHIP}
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
                style={areaVars(area)}
                className={`${NEUTRAL_CHIP} cursor-text focus-within:bg-(--area)/10 focus-within:ring-(--area)/55`}
              >
                {verb.unit === 'eur' ? (
                  <span className="text-ink-500">€</span>
                ) : null}
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
                  size={Math.max(
                    2,
                    (
                      valueDraft ??
                      String(result.ok ? (result.log.value ?? '') : '')
                    ).length,
                  )}
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
                  className={`min-w-0 bg-transparent text-center outline-none placeholder:text-ink-600 ${
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
                {verb.unit && verb.unit !== 'eur' ? (
                  <span className="text-ink-500">{verb.unit}</span>
                ) : null}
              </label>
            ) : null}

            <label
              style={areaVars(area)}
              className={`${NEUTRAL_CHIP} cursor-text focus-within:bg-(--area)/10 focus-within:ring-(--area)/55`}
            >
              <input
                data-chip-input
                aria-label={verb.amount === 'none' ? 'What' : 'Words'}
                value={
                  textDraft ??
                  (result.ok ? (result.log.text ?? '') : (typed.text ?? ''))
                }
                placeholder={verb.amount === 'none' ? 'what?' : '+ words'}
                size={
                  1 +
                  Math.max(
                    6,
                    (textDraft ?? (result.ok ? (result.log.text ?? '') : ''))
                      .length,
                  )
                }
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
                className={`min-w-0 bg-transparent outline-none placeholder:text-ink-600 ${
                  result.ok && result.defaulted.text && textDraft === null
                    ? 'text-ink-500'
                    : 'text-foreground'
                }`}
              />
            </label>

            <button
              type="button"
              className={NEUTRAL_CHIP}
              aria-expanded={picker === 'when'}
              onClick={() => setPicker(picker === 'when' ? null : 'when')}
            >
              <Clock className="size-3.5 text-ink-500" />
              {when === null ? 'now' : whenLabel(when)}
            </button>
          </div>

          {picker === 'area' ? (
            <div className="motion-arrive mt-3 flex flex-wrap gap-1.5">
              {AREAS.map((choice) => (
                <button
                  key={choice}
                  type="button"
                  style={areaVars(choice)}
                  onClick={() => {
                    setAreaFor({ kind: verb.kind, area: choice })
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
                const tone = verbFor(word)?.area ?? 'life'
                return (
                  <button
                    key={word}
                    type="button"
                    style={areaVars(tone)}
                    onClick={() => takeLine(`${word} `)}
                    className={`${AREA_CHIP} font-mono`}
                  >
                    {word}
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="motion-arrive">
              <p className="text-[13px] text-ink-500">
                “{trimmed.split(/\s+/)[0]}” isn’t a verb. Pick one, or keep it
                as a note.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  style={areaVars('life')}
                  onClick={() => takeLine(`note ${trimmed}`)}
                  className={AREA_CHIP}
                >
                  save as a note
                </button>
                <span className="mx-1 h-4 w-px bg-white/10" />
                {CAPTURE_CHOICES.map(({ word, area: tone }) => (
                  <button
                    key={word}
                    type="button"
                    style={areaVars(tone)}
                    onClick={() => takeLine(`${word} `)}
                    className={`${NEUTRAL_CHIP} font-mono text-[12.5px] hover:text-(--area)`}
                  >
                    {word}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </PaletteShell>
  )
}
