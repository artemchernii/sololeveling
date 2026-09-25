import { useEffect, useRef, useState } from 'react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { useMutation } from 'convex/react'
import { ChevronDown, ChevronUp, Plus, RotateCcw, Trash2 } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { ACCENT_FROM, ACCENT_TO, BUILTIN_AREAS } from '@/lib/area-slug'
import { areaVars } from '@/lib/areas'
import { failureMessage } from '@/lib/convex-errors'

const BUILTIN = new Set<string>(BUILTIN_AREAS.map((a) => a.slug))

/* The slugs a built-in capture verb names (capture-parser.ts). In step with
   NAMED_BY_A_VERB in convex/areas.ts — this copy decides whether to *ask*
   where those words go, that one decides whether to *allow* the retire, and
   the mutation is the authoritative one. */
const NAMED_BY_A_VERB = new Set([
  'business',
  'career',
  'knowledge',
  'life',
  'portuguese',
  'body',
  'money',
  'style',
  'social',
])

/**
 * R6 (PLAN.md §4). The set of areas, as a thing he edits.
 *
 * Every write is a mutation in convex/areas.ts and every refusal it can throw
 * is a sentence in convex-errors.ts. Nothing on this page is a number: an area
 * has no count, no share and no bar, because it has no tile and no
 * denominator. "47 things filed under life" is the number that makes people
 * close the app.
 */
export function Areas() {
  const areas = useQuery(api.areas.list, { includeRetired: true })
  const ensure = useMutation(api.areas.ensure)
  const create = useMutation(api.areas.create)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState('')

  /* Opening this page is what turns the ten built-ins into rows — the one
     call site of ensure(). The ref is because StrictMode mounts twice in dev,
     and ensure, while idempotent, should not be asked twice for nothing. */
  const ensured = useRef(false)
  useEffect(() => {
    if (ensured.current) return
    ensured.current = true
    void ensure({})
  }, [ensure])

  const all = areas ?? []
  const live = all.filter((a) => a.retiredAt === undefined)
  const retired = all.filter((a) => a.retiredAt !== undefined)

  return (
    /* Closed by default (21 Sep, his call — "it takes a lot of space").
       Ten rows is most of a settings page, and this is a section you open to
       change something and then leave alone for weeks, unlike Appearance
       right above it.

       <details> rather than a useState toggle, for the same reason the area
       badge uses a native <select>: it brings its own keyboard behaviour, and
       on a phone it is the control the platform already knows. The summary
       carries every area's colour as a dot, so the row says what is inside
       without being opened — a thing you can see beats a thing you read. */
    <details className="glass motion-arrive group rounded-[22px] p-6 [&[open]]:pb-6">
      <summary className="flex cursor-pointer list-none items-center gap-3 select-none">
        <span className="label-caps transition-colors group-hover:text-ink-300">
          Areas
        </span>
        <span
          className="flex flex-1 flex-wrap items-center gap-1.5 group-open:hidden"
          aria-hidden
        >
          {live.map((area) => (
            <span
              key={area._id}
              style={areaVars(area.slug)}
              className="size-2.5 rounded-full bg-(--area)"
            />
          ))}
        </span>
        <span className="flex-1 group-not-open:hidden" />
        <ChevronDown
          className="size-4 shrink-0 text-ink-600 transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>

      <div className="mt-3 flex flex-col gap-3">
        <p className="text-[12.5px] text-ink-600">
          What a thing is. Rename one and every badge follows — the word stored
          on your rows never changes, so nothing has to be refiled.
        </p>

        <ul className="mt-1 flex flex-col gap-1">
          {live.map((area, i) => (
            <AreaRow
              key={area._id}
              area={area}
              live={live}
              first={i === 0}
              last={i === live.length - 1}
              onError={setError}
            />
          ))}
        </ul>

        <p className="text-[12.5px] text-ink-600">
          Press an area&rsquo;s dot to change its colour, make it bold, or mark
          it as a language you&rsquo;re learning.
        </p>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const label = adding.trim()
            if (label.length === 0) return
            setError(null)
            void create({ label })
              .then(() => setAdding(''))
              .catch((reason: unknown) => setError(failureMessage(reason)))
          }}
        >
          <input
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            /* Enter submits explicitly. The browser's implicit-submission rule
             should cover a form with one text field and a submit button, and
             it was measured not to here — four ways round: with the handler
             Enter adds the area, without it Enter does nothing at all. Typing
             a word and pressing Enter is the whole gesture, so it is wired
             rather than assumed. */
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
              e.preventDefault()
              e.currentTarget.form?.requestSubmit()
            }}
            placeholder="A new area — English, Music, Admin"
            aria-label="Name of the new area"
            className="flex-1 rounded-[7px] bg-lift/[0.05] px-3 py-2 text-[12.5px] text-foreground outline-none placeholder:text-ink-700"
          />
          <button
            type="submit"
            className="motion-press flex items-center gap-1.5 rounded-[7px] bg-lift/10 px-3 text-ink-300 hover:bg-lift/15"
          >
            <Plus className="size-3.5" aria-hidden />
            <span className="label-caps">Add</span>
          </button>
        </form>

        {error !== null ? (
          <p className="motion-arrive text-[12.5px] text-state-danger">
            {error}
          </p>
        ) : null}

        {retired.length > 0 ? (
          <>
            <div className="label-caps mt-3">Retired</div>
            <ul className="flex flex-col gap-1 opacity-60">
              {retired.map((area) => (
                <RetiredRow key={area._id} area={area} onError={setError} />
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </details>
  )
}

function AreaRow({
  area,
  live,
  first,
  last,
  onError,
}: {
  area: Doc<'areas'>
  live: Array<Doc<'areas'>>
  first: boolean
  last: boolean
  onError: (message: string | null) => void
}) {
  const rename = useMutation(api.areas.rename)
  const setHue = useMutation(api.areas.setHue)
  const setTrack = useMutation(api.areas.setTrack)
  const reorder = useMutation(api.areas.reorder)
  const retire = useMutation(api.areas.retire)
  const remove = useMutation(api.areas.remove)
  const [label, setLabel] = useState(area.label)
  /* The slider is local while it is being dragged and written once on
     release: onChange fires per pixel, and a mutation per pixel is a write
     storm for a value nobody reads until you let go. */
  const [hue, setLocalHue] = useState(area.hue)
  const [retiring, setRetiring] = useState(false)
  const [picking, setPicking] = useState(false)
  const setBold = useMutation(api.areas.setBold)

  function run(work: Promise<unknown>) {
    onError(null)
    void work.catch((reason: unknown) => onError(failureMessage(reason)))
  }

  function move(by: number) {
    const slugs = live.map((a) => a.slug)
    const at = slugs.indexOf(area.slug)
    ;[slugs[at], slugs[at + by]] = [slugs[at + by], slugs[at]]
    run(reorder({ slugs }))
  }

  function pickHue(next: number) {
    setLocalHue(next)
    if (next !== area.hue) run(setHue({ slug: area.slug, hue: next }))
  }

  return (
    <li
      style={areaVars(area.slug)}
      className="flex flex-col gap-2 rounded-[10px] bg-lift/[0.04] px-3 py-2"
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setPicking((p) => !p)}
          aria-expanded={picking}
          aria-label={`Colour of the ${area.label} area`}
          title="Change colour"
          className={`motion-press size-5 shrink-0 rounded-full bg-(--area) ring-offset-2 ring-offset-background transition-shadow hover:ring-2 hover:ring-(--area)/60 ${
            picking ? 'ring-2 ring-(--area)' : ''
          }`}
        />
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => {
            if (label.trim() === area.label) return
            run(rename({ slug: area.slug, label }))
          }}
          aria-label={`Name of the ${area.label} area`}
          className="min-w-0 flex-1 bg-transparent text-[12.5px] text-foreground outline-none"
        />
        {area.bold ? (
          <span className="label-caps shrink-0 text-(--area)">bold</span>
        ) : null}
        {area.track === 'language' ? (
          <span
            title="Has its own tab on the Languages page"
            className="label-caps shrink-0 text-lav-300"
          >
            language tab
          </span>
        ) : null}
        <button
          type="button"
          disabled={first}
          onClick={() => move(-1)}
          className="motion-press text-ink-600 hover:text-ink-300 disabled:opacity-25"
        >
          <ChevronUp className="size-4" aria-hidden />
          <span className="sr-only">Move {area.label} up</span>
        </button>
        <button
          type="button"
          disabled={last}
          onClick={() => move(1)}
          className="motion-press text-ink-600 hover:text-ink-300 disabled:opacity-25"
        >
          <ChevronDown className="size-4" aria-hidden />
          <span className="sr-only">Move {area.label} down</span>
        </button>
        {retiring ? (
          <Retiring
            area={area}
            live={live}
            onCancel={() => setRetiring(false)}
            onRetire={(replacedBy) => {
              setRetiring(false)
              run(retire({ slug: area.slug, replacedBy }))
            }}
            onDelete={() => {
              setRetiring(false)
              run(remove({ slug: area.slug }))
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setRetiring(true)}
            className="label-caps motion-press shrink-0 text-ink-600 hover:text-ink-300"
          >
            Retire
          </button>
        )}
      </div>
      {picking ? (
        <ColourPicker
          hue={hue}
          bold={area.bold === true}
          onHue={pickHue}
          onBold={(bold) => run(setBold({ slug: area.slug, bold }))}
          language={area.track === 'language'}
          onLanguage={(on) =>
            run(setTrack({ slug: area.slug, track: on ? 'language' : null }))
          }
          onSlide={setLocalHue}
          onRelease={() => {
            if (hue >= ACCENT_FROM && hue <= ACCENT_TO) {
              setLocalHue(area.hue)
              onError(
                'That colour is the one reserved for live and focus. Pick another.',
              )
              return
            }
            pickHue(hue)
          }}
        />
      ) : null}
    </li>
  )
}

/* Colour, as colours (25 Sep): "color picker is not that good". A row of
   real swatches drawn in the area's own lightness and chroma — soft or
   bold — so what you press is what you get, then a slider for anything in
   between, then BOLD: the deep, saturated pair instead of the shared soft
   one. The accent's band (live and focus) has no swatch and is refused on
   the slider. */
const SWATCHES = [0, 20, 45, 70, 95, 125, 150, 180, 205, 230, 250, 320, 345]

function ColourPicker({
  hue,
  bold,
  onHue,
  onBold,
  onSlide,
  onRelease,
  language,
  onLanguage,
}: {
  hue: number
  bold: boolean
  onHue: (hue: number) => void
  onBold: (bold: boolean) => void
  onSlide: (hue: number) => void
  onRelease: () => void
  language: boolean
  onLanguage: (on: boolean) => void
}) {
  const pair = bold
    ? 'var(--area-bold-l) var(--area-bold-c)'
    : 'var(--area-l) var(--area-c)'
  return (
    <div className="motion-arrive flex flex-col gap-3 rounded-[10px] bg-background/40 p-3 ring-1 ring-lift/10 ring-inset">
      <div className="flex flex-wrap gap-2">
        {SWATCHES.map((h) => (
          <button
            key={h}
            type="button"
            onClick={() => onHue(h)}
            aria-label={`Hue ${h}`}
            aria-pressed={h === hue}
            style={{ background: `oklch(${pair} ${h})` }}
            className={`motion-press size-8 rounded-[10px] transition-transform hover:scale-110 ${
              h === hue
                ? 'ring-2 ring-foreground ring-offset-2 ring-offset-background'
                : ''
            }`}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="range"
          min={0}
          max={359}
          value={hue}
          aria-label="Fine-tune the hue"
          onChange={(e) => onSlide(Number(e.target.value))}
          onPointerUp={onRelease}
          onKeyUp={onRelease}
          style={{
            background: `linear-gradient(to right, ${Array.from(
              { length: 13 },
              (_, i) => `oklch(${pair} ${i * 30})`,
            ).join(', ')})`,
          }}
          className="h-2 min-w-40 flex-1 cursor-pointer appearance-none rounded-full accent-(--area)"
        />
        <button
          type="button"
          onClick={() => onBold(!bold)}
          aria-pressed={bold}
          className={`motion-press rounded-full px-3 py-1 font-mono text-[11px] font-semibold tracking-[0.14em] uppercase ring-1 transition-colors ring-inset ${
            bold
              ? 'bg-(--area) text-background ring-(--area)'
              : 'text-ink-400 ring-lift/20 hover:text-foreground'
          }`}
        >
          Bold
        </button>
      </div>
      <span className="font-mono text-[10.5px] text-ink-500">
        Bold = deep and saturated. Soft = the calm tone every area shares.
      </span>
      <label className="flex cursor-pointer items-center gap-2.5 border-t border-lift/[0.08] pt-3 text-[12.5px] text-ink-300">
        <input
          type="checkbox"
          checked={language}
          onChange={(e) => onLanguage(e.target.checked)}
          className="size-4 accent-(--area)"
        />
        This is a language I&rsquo;m learning — give it its own tab on the
        Languages page
      </label>
    </div>
  )
}

/**
 * The question the refusals would otherwise ask.
 *
 * `AREA_NEEDS_A_REPLACEMENT` exists as a backstop, but an error is a bad way
 * to learn that `note` has to go somewhere — so the control asks first. An
 * area on one of the six tiles still gets its Retire offered and still gets
 * refused, deliberately: a control that is simply missing teaches nothing.
 */
function Retiring({
  area,
  live,
  onCancel,
  onRetire,
  onDelete,
}: {
  area: Doc<'areas'>
  live: Array<Doc<'areas'>>
  onCancel: () => void
  onRetire: (replacedBy: string | undefined) => void
  onDelete: () => void
}) {
  const others = live.filter((a) => a.slug !== area.slug)

  if (NAMED_BY_A_VERB.has(area.slug)) {
    return (
      <span className="flex shrink-0 items-center gap-2">
        <span className="text-[11.5px] text-ink-500">
          File its capture words under
        </span>
        <select
          defaultValue=""
          aria-label={`Where ${area.label}'s quick-capture words go`}
          onChange={(e) => {
            if (e.target.value !== '') onRetire(e.target.value)
          }}
          className="rounded-[6px] bg-lift/10 px-2 py-1 text-[11.5px] text-foreground outline-none"
        >
          <option value="" disabled>
            choose…
          </option>
          {others.map((a) => (
            <option key={a.slug} value={a.slug}>
              {a.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onCancel}
          className="label-caps motion-press text-ink-600"
        >
          Cancel
        </button>
      </span>
    )
  }

  /* Nothing in code names this area, so it can also simply go. Delete is the
     honest act for one invented by mistake; retire is for one he is done
     with. areas.remove refuses if anything is filed under it. */
  return (
    <span className="flex shrink-0 items-center gap-2">
      <button
        type="button"
        onClick={() => onRetire(undefined)}
        className="label-caps motion-press text-state-danger"
      >
        Retire
      </button>
      {BUILTIN.has(area.slug) ? null : (
        <button
          type="button"
          onClick={onDelete}
          className="motion-press text-ink-600 hover:text-state-danger"
        >
          <Trash2 className="size-3.5" aria-hidden />
          <span className="sr-only">Delete {area.label}</span>
        </button>
      )}
      <button
        type="button"
        onClick={onCancel}
        className="label-caps motion-press text-ink-600"
      >
        Cancel
      </button>
    </span>
  )
}

function RetiredRow({
  area,
  onError,
}: {
  area: Doc<'areas'>
  onError: (message: string | null) => void
}) {
  const restore = useMutation(api.areas.restore)
  return (
    <li
      style={areaVars(area.slug)}
      className="flex items-center gap-3 rounded-[10px] bg-lift/[0.04] px-3 py-2"
    >
      <span
        className="size-2.5 shrink-0 rounded-full bg-(--area)"
        aria-hidden
      />
      <span className="flex-1 text-[12.5px] text-ink-300">{area.label}</span>
      {/* Where its capture words went — not how many rows still carry it.
          That count has no tile and no denominator, and he knows what he
          stopped doing. */}
      {area.replacedBy !== undefined ? (
        <span className="label-caps text-ink-600">→ {area.replacedBy}</span>
      ) : null}
      <button
        type="button"
        onClick={() => {
          onError(null)
          void restore({ slug: area.slug }).catch((reason: unknown) =>
            onError(failureMessage(reason)),
          )
        }}
        className="label-caps motion-press flex items-center gap-1 text-ink-600 hover:text-ink-300"
      >
        <RotateCcw className="size-3" aria-hidden />
        Restore
      </button>
    </li>
  )
}
