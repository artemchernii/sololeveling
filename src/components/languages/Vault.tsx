import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import {
  ArrowDownUp,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Copy,
  ExternalLink,
  FileText,
  GraduationCap,
  House,
  Loader2,
  Paperclip,
  Plus,
  RotateCcw,
  Search,
  Target,
  X,
} from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { TrackPanel } from '@/components/track/TrackPanel'
import { useDayStarts } from '@/components/track/useDayStarts'
import { clock } from '@/lib/format'
import {
  MAX_READ_BYTES,
  READING_MODEL_NAME,
  isReadingKind,
  readableKind,
} from '@/lib/reading'
import type { ReadingKind } from '@/lib/reading'
import {
  arrange,
  byMonth,
  dueForRevisit,
  kindCounts,
} from '@/lib/vault-library'
import type { LibrarySheet, Order } from '@/lib/vault-library'

/* The Vault (R7a, 26 Sep; docs/specs/2026-09-26-r7a-vault.md): the sheets
   from class and homework, each on the session it came from, and what the
   reader found in it — the summary, the conclusion, the words, the full
   text. What the model wrote is labelled as the model's, with the time it
   read it; it is text, never a number, and it marks nothing done. */

const ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp'

const KIND_LABEL: Record<string, string> = {
  class: 'Class',
  homework: 'Homework',
  practice: 'At home',
}

const DATE = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})

function KindIcon({ category }: { category: string | null }) {
  const cls = 'size-3.5'
  if (category === 'class') return <GraduationCap className={cls} />
  if (category === 'homework') return <BookOpen className={cls} />
  if (category === 'practice') return <House className={cls} />
  return <FileText className={cls} />
}

function sessionLabel(category: string | null, at: number): string {
  return `${KIND_LABEL[category ?? ''] ?? 'Session'} · ${DATE.format(new Date(at))}`
}

/**
 * Bytes to storage, then `vault.add`. Checked here first so a file the
 * reader cannot see is never uploaded; the server checks again and says
 * why when it refuses.
 */
export function useSheetUpload(area: string, onAdded?: (id: string) => void) {
  const generateUploadUrl = useMutation(api.attachments.generateUploadUrl)
  const add = useMutation(api.vault.add)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const upload = useCallback(
    async (file: File, logId: Id<'logs'> | undefined) => {
      setError(null)
      if (readableKind(file.type) === null) {
        setError('The Vault reads PDFs and photos (JPG, PNG, WebP).')
        return
      }
      if (file.size > MAX_READ_BYTES) {
        setError('That file is larger than 10 MB.')
        return
      }
      setBusy(true)
      try {
        const url = await generateUploadUrl()
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': file.type },
          body: file,
        })
        if (!res.ok) throw new Error(String(res.status))
        const { storageId } = (await res.json()) as {
          storageId: Id<'_storage'>
        }
        const out = await add({
          area,
          logId,
          storageId,
          name: file.name || 'sheet',
          contentType: file.type,
          size: file.size,
        })
        if (!out.ok) setError(out.error)
        else onAdded?.(out.attachmentId)
      } catch {
        setError(`${file.name || 'The file'} did not upload — try again.`)
      } finally {
        setBusy(false)
      }
    },
    [add, area, generateUploadUrl, onAdded],
  )

  return { upload, busy, error }
}

export function Vault({ slug }: { slug: string }) {
  const sheets = useQuery(api.vault.list, { area: slug })
  const markRevised = useMutation(api.vault.markRevised)
  const [kind, setKind] = useState<ReadingKind | 'all'>('all')
  const [query, setQuery] = useState('')
  const [order, setOrder] = useState<Order>('newest')
  const [open, setOpen] = useState<string | null>(null)
  const [now] = useState(() => Date.now())

  /* Esc folds the open sheet back into its row (26 Sep). */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen('')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (sheets === undefined) return <AddSheet slug={slug} />

  const byId = new Map(sheets.map((s) => [s._id as string, s]))
  const library = sheets.map(toLibrary)
  const shown = arrange(library, { kind, query, order })
  const due = dueForRevisit(library, now)
  /* A sheet being read stays open, so the scan is seen; otherwise the
     one he tapped. */
  const reading = sheets.find(
    (s) => s.reading === null || s.reading.status === 'reading',
  )
  const opened = open ?? (reading ? reading._id : null)

  function show(id: string) {
    setOpen(id)
    setKind('all')
    setQuery('')
    requestAnimationFrame(() =>
      document
        .getElementById(`sheet-${id}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    )
  }

  return (
    <div className="flex flex-col gap-[18px]">
      <AddSheet slug={slug} onAdded={(id) => setOpen(id)} />

      {due.length > 0 ? (
        <TrackPanel
          area={slug}
          title="revisit"
          aside={
            <span className="hidden font-mono text-[10.5px] text-ink-500 sm:inline">
              the ones longest untouched
            </span>
          }
        >
          <div className="flex flex-col gap-1.5">
            {due.map((d, i) => (
              <div
                key={d.id}
                style={{ animationDelay: `${i * 60}ms` }}
                className="motion-land flex min-w-0 items-center gap-3 rounded-[8px] px-2 py-2 ring-1 ring-lav-400/15 ring-inset"
              >
                <KindBadge kind={d.kind} />
                <button
                  type="button"
                  onClick={() => show(d.id)}
                  className="flex min-w-0 flex-1 flex-col text-left"
                >
                  <span className="truncate text-[13.5px] text-foreground hover:text-lav-400">
                    {d.title}
                  </span>
                  <span className="font-mono text-[10.5px] text-ink-500">
                    {d.revisedAt === undefined
                      ? `added ${DATE.format(new Date(d.addedAt))} · not gone over yet`
                      : `last gone over ${DATE.format(new Date(d.revisedAt))}`}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void markRevised({
                      attachmentId: byId.get(d.id)!._id,
                    })
                  }
                  className="motion-press inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] text-ink-200 ring-1 ring-lav-400/35 ring-inset hover:bg-lav-400/10 hover:text-foreground"
                >
                  <Check className="size-3.5" />
                  Revised
                </button>
              </div>
            ))}
          </div>
        </TrackPanel>
      ) : null}

      {sheets.length === 0 ? (
        <p className="px-1 text-[13.5px] text-ink-400">
          Nothing in the Vault yet. Add the sheet from your last class — a scan
          or a photo is fine — and it comes back with a title, a summary, a
          conclusion, examples and the words worth learning.
        </p>
      ) : (
        <TrackPanel area={slug} title="library">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-sink/20 px-3 py-1.5 ring-1 ring-lift/12 ring-inset focus-within:ring-lav-400/50">
                <Search className="size-3.5 shrink-0 text-ink-500" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search titles, words, the text…"
                  aria-label="Search the Vault"
                  className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground placeholder:text-ink-600 focus:outline-none"
                />
                {query ? (
                  <button
                    type="button"
                    aria-label="Clear the search"
                    onClick={() => setQuery('')}
                    className="text-ink-500 hover:text-foreground"
                  >
                    <X className="size-3.5" />
                  </button>
                ) : null}
              </label>
              <button
                type="button"
                onClick={() =>
                  setOrder((o) => (o === 'newest' ? 'oldest' : 'newest'))
                }
                className="motion-press inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-[10.5px] tracking-[0.12em] text-ink-300 uppercase ring-1 ring-lift/12 ring-inset hover:text-foreground hover:ring-lav-400/35"
              >
                <ArrowDownUp className="size-3.5" />
                {order}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <KindChip
                label="All"
                count={library.length}
                on={kind === 'all'}
                onClick={() => setKind('all')}
              />
              {kindCounts(library).map((k) => (
                <KindChip
                  key={k.kind}
                  label={KIND_NAME[k.kind]}
                  count={k.count}
                  on={kind === k.kind}
                  onClick={() => setKind(kind === k.kind ? 'all' : k.kind)}
                />
              ))}
            </div>

            {shown.length === 0 ? (
              <p className="px-1 py-2 text-[13px] text-ink-400">
                Nothing matches — try another word, or All.
              </p>
            ) : (
              byMonth(shown).map((group) => (
                <div key={group.key} className="flex flex-col gap-1.5">
                  <span className="label-caps pt-1">{group.label}</span>
                  {group.sheets.map((item) => {
                    const sheet = byId.get(item.id)!
                    return item.id === opened ? (
                      <div
                        key={item.id}
                        id={`sheet-${item.id}`}
                        className="scroll-mt-24"
                      >
                        <SheetCard
                          sheet={sheet}
                          delay={0}
                          onClose={() => setOpen('')}
                        />
                      </div>
                    ) : (
                      <LibraryRow
                        key={item.id}
                        item={item}
                        sheet={sheet}
                        onOpen={() => setOpen(item.id)}
                      />
                    )
                  })}
                </div>
              ))
            )}
          </div>
        </TrackPanel>
      )}
    </div>
  )
}

const KIND_NAME: Record<ReadingKind, string> = {
  grammar: 'Grammar',
  vocabulary: 'Vocabulary',
  reading: 'Reading',
  writing: 'Writing',
  conversation: 'Conversation',
  exam: 'Exam',
  other: 'Other',
}

function toLibrary(sheet: Sheet): LibrarySheet {
  const r = sheet.reading
  return {
    id: sheet._id,
    title: r?.title || sheet.name.replace(/\.[a-z0-9]+$/i, ''),
    kind: isReadingKind(r?.kind) ? r.kind : 'other',
    tags: r?.tags ?? [],
    at: sheet.session?.occurredAt ?? sheet._creationTime,
    addedAt: sheet._creationTime,
    revisedAt: sheet.revisedAt,
    read: r?.status === 'done',
    haystack: [
      r?.summary,
      r?.conclusion,
      r?.text,
      ...(r?.words ?? []).map((w) => `${w.term} ${w.meaning}`),
      ...(r?.examples ?? []).map((e) => `${e.sentence} ${e.meaning}`),
    ]
      .filter(Boolean)
      .join(' '),
  }
}

function KindChip({
  label,
  count,
  on,
  onClick,
}: {
  label: string
  count: number
  on: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`motion-press inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] ring-1 transition-colors ring-inset ${
        on
          ? 'bg-lav-400/12 text-foreground ring-lav-400/45'
          : 'text-ink-400 ring-lift/12 hover:text-foreground hover:ring-lav-400/35'
      }`}
    >
      {label}
      <span className="font-mono text-[10.5px] text-ink-500">{count}</span>
    </button>
  )
}

function KindBadge({ kind }: { kind: ReadingKind }) {
  return (
    <span className="shrink-0 rounded-[4px] px-1.5 py-0.5 font-mono text-[9.5px] tracking-[0.12em] text-lav-400 uppercase ring-1 ring-lav-400/30 ring-inset">
      {KIND_NAME[kind]}
    </span>
  )
}

/* One sheet, closed: a thumbnail, the title the reader gave it, its kind,
   a couple of tags and its class — enough to find it without opening. */
function LibraryRow({
  item,
  sheet,
  onOpen,
}: {
  item: LibrarySheet
  sheet: Sheet
  onOpen: () => void
}) {
  const status = sheet.reading?.status ?? 'reading'
  const image = readableKind(sheet.contentType)?.block === 'image'
  return (
    <button
      type="button"
      onClick={onOpen}
      className="motion-arrive group flex min-w-0 items-center gap-3 rounded-[8px] px-2 py-2 text-left ring-1 ring-transparent transition-colors ring-inset hover:bg-lav-400/6 hover:ring-lav-400/25"
    >
      <span className="relative grid h-12 w-9 shrink-0 place-items-center overflow-hidden rounded-[3px] bg-lift/[0.08] ring-1 ring-lift/15">
        {image && sheet.url ? (
          <img
            src={sheet.url}
            alt=""
            decoding="async"
            className="size-full object-cover object-top"
          />
        ) : (
          <FileText className="size-4 text-ink-400" />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-[14px] text-foreground group-hover:text-lav-300">
          {item.title}
        </span>
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <KindBadge kind={item.kind} />
          {item.tags.slice(0, 2).map((t) => (
            <span key={t} className="font-mono text-[10.5px] text-ink-500">
              #{t}
            </span>
          ))}
          <span className="font-mono text-[10.5px] text-ink-500">
            {sheet.session
              ? sessionLabel(sheet.session.category, sheet.session.occurredAt)
              : DATE.format(new Date(sheet._creationTime))}
          </span>
        </span>
      </span>
      {status === 'reading' ? (
        <Loader2 className="size-4 shrink-0 animate-spin text-lav-400" />
      ) : status === 'failed' ? (
        <span className="font-mono text-[10px] text-state-danger">failed</span>
      ) : null}
      <ChevronRight className="size-4 shrink-0 text-ink-600 transition-transform group-hover:translate-x-0.5 group-hover:text-lav-400" />
    </button>
  )
}

/* Which session the sheet belongs to, then the file. Today's class is
   picked for him when there is one, else the latest session; "Not
   linked" is always there — some homework has no session to hang on. */
function AddSheet({
  slug,
  onAdded,
}: {
  slug: string
  onAdded?: (id: string) => void
}) {
  const dayStarts = useDayStarts(2)
  const recent = useQuery(api.logs.listForArea, {
    area: slug,
    since: dayStarts[0],
  })
  const sessions = (recent?.rows ?? [])
    .filter((row) => row.kind === 'session')
    .slice(0, 6)
  const today = dayStarts[dayStarts.length - 1]
  const suggested =
    sessions.find(
      (s) => s.meta?.category === 'class' && s.occurredAt >= today,
    ) ?? sessions.at(0)
  const [picked, setPicked] = useState<Id<'logs'> | 'none' | null>(null)
  const logId = picked === null ? suggested?._id : picked
  const input = useRef<HTMLInputElement>(null)
  const { upload, busy, error } = useSheetUpload(slug, onAdded)

  return (
    <TrackPanel
      area={slug}
      title="add a sheet"
      aside={
        <span className="hidden font-mono text-[10.5px] text-ink-500 sm:inline">
          read once by {READING_MODEL_NAME}
        </span>
      }
    >
      <div className="flex flex-col gap-3">
        <span className="label-caps">from</span>
        <div className="flex flex-wrap gap-1.5">
          {sessions.map((s) => {
            const on = logId === s._id
            return (
              <button
                key={s._id}
                type="button"
                onClick={() => setPicked(s._id)}
                aria-pressed={on}
                className={`motion-press inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] ring-1 transition-colors ring-inset ${
                  on
                    ? 'bg-lav-400/12 text-foreground ring-lav-400/45'
                    : 'text-ink-400 ring-lift/12 hover:text-foreground hover:ring-lav-400/35'
                }`}
              >
                <span className="text-area">
                  <KindIcon category={s.meta?.category ?? null} />
                </span>
                {sessionLabel(s.meta?.category ?? null, s.occurredAt)}
              </button>
            )
          })}
          <button
            type="button"
            onClick={() => setPicked('none')}
            aria-pressed={logId === undefined || logId === 'none'}
            className={`motion-press rounded-full px-3 py-1.5 text-[12.5px] ring-1 transition-colors ring-inset ${
              logId === undefined || logId === 'none'
                ? 'bg-lav-400/12 text-foreground ring-lav-400/45'
                : 'text-ink-400 ring-lift/12 hover:text-foreground hover:ring-lav-400/35'
            }`}
          >
            Not linked
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
            className="motion-press inline-flex items-center gap-2 rounded-full bg-lav-400 px-4 py-2 text-[13px] font-medium text-background shadow-[0_0_22px_-6px_var(--system-shine)] disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            {busy ? 'Uploading…' : 'Choose a PDF or photo'}
          </button>
          {error ? (
            <span className="text-[12.5px] text-state-danger">{error}</span>
          ) : null}
        </div>
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) {
              void upload(file, logId === 'none' ? undefined : logId)
            }
          }}
        />
      </div>
    </TrackPanel>
  )
}

type Sheet = NonNullable<
  ReturnType<typeof useQuery<typeof api.vault.list>>
>[number]

function SheetCard({
  sheet,
  delay,
  onClose,
}: {
  sheet: Sheet
  delay: number
  onClose?: () => void
}) {
  const retry = useMutation(api.vault.retry)
  const remove = useMutation(api.vault.remove)
  const markRevised = useMutation(api.vault.markRevised)
  const [confirm, setConfirm] = useState(false)
  const [full, setFull] = useState(false)
  const [copied, setCopied] = useState(false)
  const reading = sheet.reading
  const busy = reading === null || reading.status === 'reading'

  return (
    <section
      style={{ animationDelay: `${delay}ms` }}
      className="system-frame motion-arrive relative grid min-w-0 gap-4 p-4 sm:grid-cols-[168px_minmax(0,1fr)] sm:p-5"
    >
      <Preview sheet={sheet} reading={busy} />

      <div className="flex min-w-0 flex-col gap-4">
        <header className="flex min-w-0 items-start gap-3">
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-[15px] leading-snug text-foreground">
              {sheet.reading?.title || sheet.name}
            </span>
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10.5px] tracking-[0.1em] text-ink-400 uppercase">
              {sheet.session ? (
                <span className="inline-flex items-center gap-1 text-ink-200">
                  <span className="text-area">
                    <KindIcon category={sheet.session.category} />
                  </span>
                  {sessionLabel(
                    sheet.session.category,
                    sheet.session.occurredAt,
                  )}
                </span>
              ) : (
                <span>not linked</span>
              )}
              {isReadingKind(sheet.reading?.kind) ? (
                <KindBadge kind={sheet.reading.kind} />
              ) : null}
              {(sheet.reading?.tags ?? []).map((t) => (
                <span key={t} className="normal-case">
                  #{t}
                </span>
              ))}
            </span>
          </span>
          {onClose ? (
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="motion-press grid size-8 shrink-0 place-items-center rounded-full text-ink-400 ring-1 ring-lift/12 ring-inset hover:text-foreground hover:ring-lav-400/40"
            >
              <ChevronUp className="size-4" />
            </button>
          ) : null}
          {confirm ? (
            <span className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => void remove({ attachmentId: sheet._id })}
                className="motion-press rounded-full bg-state-danger/15 px-2.5 py-1 text-[12px] text-state-danger ring-1 ring-state-danger/40 ring-inset"
              >
                Remove
              </button>
              <button
                type="button"
                aria-label="Keep it"
                onClick={() => setConfirm(false)}
                className="motion-press grid size-7 place-items-center rounded-full text-ink-400 hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </span>
          ) : (
            <button
              type="button"
              aria-label="Remove this sheet"
              onClick={() => setConfirm(true)}
              className="motion-press grid size-8 shrink-0 place-items-center rounded-full text-ink-600 transition-colors hover:bg-state-danger/10 hover:text-state-danger"
            >
              <X className="size-3.5" />
            </button>
          )}
        </header>

        {busy ? (
          <ReadingNow since={reading?.requestedAt} />
        ) : reading.status === 'failed' ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[13px] text-state-danger">
              {reading.error ?? 'It could not be read.'}
            </span>
            <button
              type="button"
              onClick={() => void retry({ attachmentId: sheet._id })}
              className="motion-press inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] text-ink-200 ring-1 ring-lav-400/35 ring-inset hover:bg-lav-400/10"
            >
              <RotateCcw className="size-3.5" />
              Retry
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {reading.summary ? (
              <p className="motion-land text-[15px] leading-relaxed text-ink-100">
                {reading.summary}
              </p>
            ) : null}

            {reading.rules && reading.rules.length > 0 ? (
              <div className="flex flex-col gap-2">
                <span className="label-caps">rules</span>
                <div className="grid gap-2.5 lg:grid-cols-2">
                  {reading.rules.map((rule, i) => (
                    <RuleCard key={rule.name} rule={rule} delay={60 + i * 70} />
                  ))}
                </div>
              </div>
            ) : null}

            {reading.conclusion ? (
              <div
                style={{ animationDelay: '200ms' }}
                className="motion-land flex gap-3 rounded-[10px] bg-lav-400/8 px-3.5 py-3 ring-1 ring-lav-400/25 ring-inset"
              >
                <Target className="mt-0.5 size-4 shrink-0 text-lav-400" />
                <span className="flex flex-col gap-1">
                  <span className="label-caps text-lav-400">practise next</span>
                  <span className="text-[14px] leading-relaxed text-ink-100">
                    {reading.conclusion}
                  </span>
                </span>
              </div>
            ) : null}

            {reading.words && reading.words.length > 0 ? (
              <div
                style={{ animationDelay: '260ms' }}
                className="motion-land flex flex-col gap-2"
              >
                <span className="label-caps">words</span>
                <dl className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                  {reading.words.map((w) => (
                    <div
                      key={w.term}
                      className="flex min-w-0 items-baseline gap-2 border-b border-lift/[0.06] pb-1.5"
                    >
                      <dt className="shrink-0 text-[14px] font-medium text-foreground">
                        {w.term}
                      </dt>
                      <dd className="min-w-0 truncate text-[13px] text-ink-400">
                        {w.meaning}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}

            {reading.examples && reading.examples.length > 0 ? (
              <div
                style={{ animationDelay: '320ms' }}
                className="motion-land flex flex-col gap-2"
              >
                <span className="label-caps">
                  {reading.rules && reading.rules.length > 0
                    ? 'more examples'
                    : 'examples'}
                </span>
                <Examples items={reading.examples} />
              </div>
            ) : null}

            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setFull((f) => !f)}
                  aria-expanded={full}
                  className="motion-press inline-flex items-center gap-1.5 font-mono text-[10.5px] tracking-[0.14em] text-ink-400 uppercase transition-colors hover:text-foreground"
                >
                  <ChevronDown
                    className={`size-3.5 transition-transform ${full ? 'rotate-180' : ''}`}
                  />
                  full text
                </button>
                {full && reading.text ? (
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard
                        .writeText(reading.text ?? '')
                        .then(() => {
                          setCopied(true)
                          setTimeout(() => setCopied(false), 1500)
                        })
                    }}
                    className="motion-press inline-flex items-center gap-1 font-mono text-[10.5px] text-ink-400 transition-colors hover:text-foreground"
                  >
                    {copied ? (
                      <Check className="size-3.5 text-state-good" />
                    ) : (
                      <Copy className="size-3.5" />
                    )}
                    {copied ? 'copied' : 'copy'}
                  </button>
                ) : null}
              </div>
              {full ? (
                <pre className="motion-arrive max-h-96 overflow-auto rounded-[8px] bg-sink/20 p-3 font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-ink-200 ring-1 ring-lift/10 ring-inset">
                  {reading.text}
                </pre>
              ) : null}
            </div>
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] text-ink-600">
              <span>
                read by {READING_MODEL_NAME}
                {reading.readAt
                  ? ` · ${DATE.format(new Date(reading.readAt))}, ${clock(new Date(reading.readAt))}`
                  : ''}
              </span>
              <button
                type="button"
                onClick={() => void markRevised({ attachmentId: sheet._id })}
                className="motion-press inline-flex items-center gap-1 text-ink-400 transition-colors hover:text-lav-400"
              >
                <Check className="size-3" />
                {sheet.revisedAt
                  ? `gone over ${DATE.format(new Date(sheet.revisedAt))}`
                  : 'mark revised'}
              </button>
              {/* Another call, so it counts toward the 30 — for a sheet
                  read before examples existed, or a reading that missed. */}
              <button
                type="button"
                onClick={() => void retry({ attachmentId: sheet._id })}
                className="motion-press inline-flex items-center gap-1 text-ink-500 transition-colors hover:text-lav-400"
              >
                <RotateCcw className="size-3" />
                read again
              </button>
            </span>
          </div>
        )}
      </div>
    </section>
  )
}

/* One rule the sheet teaches (26 Sep: "we need to give as well rule +
   examples"): its name, the pattern as a formula, when to use it, and
   sentences that use it. */
function RuleCard({
  rule,
  delay,
}: {
  rule: {
    name: string
    pattern: string
    explanation: string
    examples: Array<{ sentence: string; meaning: string }>
  }
  delay: number
}) {
  return (
    <div
      style={{ animationDelay: `${delay}ms` }}
      className="motion-land flex min-w-0 flex-col gap-2.5 rounded-[10px] bg-lift/[0.03] p-3.5 ring-1 ring-lift/10 ring-inset"
    >
      <span className="text-[14.5px] font-medium text-foreground">
        {rule.name}
      </span>
      {rule.pattern ? (
        <code className="rounded-[6px] bg-lav-400/10 px-2.5 py-1.5 font-mono text-[12.5px] leading-relaxed break-words text-lav-300 ring-1 ring-lav-400/25 ring-inset">
          {rule.pattern}
        </code>
      ) : null}
      {rule.explanation ? (
        <p className="text-[13.5px] leading-relaxed text-ink-300">
          {rule.explanation}
        </p>
      ) : null}
      {rule.examples.length > 0 ? <Examples items={rule.examples} /> : null}
    </div>
  )
}

function Examples({
  items,
}: {
  items: Array<{ sentence: string; meaning: string }>
}) {
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((e) => (
        <li
          key={e.sentence}
          className="flex flex-col border-l-2 border-lav-400/50 pl-3"
        >
          <span className="text-[14px] text-foreground">{e.sentence}</span>
          <span className="text-[12.5px] text-ink-400 italic">{e.meaning}</span>
        </li>
      ))}
    </ul>
  )
}

/* The sheet itself, small, at the side of its card (26 Sep: "we want
   better preview of doc"). A photo as a photo; a PDF in the browser's own
   viewer, its first page showing. Tapping opens it whole. While it is
   being read, the System's scan line sweeps over it. */
function Preview({ sheet, reading }: { sheet: Sheet; reading: boolean }) {
  const kind = readableKind(sheet.contentType)
  return (
    <a
      href={sheet.url ?? undefined}
      target="_blank"
      rel="noreferrer"
      aria-label={`Open ${sheet.name}`}
      className={`group relative block aspect-[210/297] max-h-72 self-start overflow-hidden rounded-[10px] bg-sink/20 ring-1 transition-shadow sm:max-h-none ${
        reading
          ? 'ring-lav-400/70 shadow-[0_0_28px_-6px_var(--system-shine)]'
          : 'ring-lift/15 hover:ring-lav-400/50'
      }`}
    >
      {sheet.url === null ? null : kind?.block === 'image' ? (
        <img
          src={sheet.url}
          alt=""
          decoding="async"
          className="absolute inset-0 size-full object-cover object-top"
        />
      ) : (
        <iframe
          src={`${sheet.url}#toolbar=0&navpanes=0&view=FitH`}
          title={sheet.name}
          tabIndex={-1}
          /* Wider than its box, so the viewer's scrollbar sits
             outside it — the page, not the viewer, is what shows. */
          className="pointer-events-none absolute inset-y-0 left-0 h-full w-[calc(100%+18px)]"
        />
      )}
      {reading ? (
        <>
          <span className="absolute inset-0 bg-lav-400/10" />
          <span className="system-beam" />
        </>
      ) : (
        <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-linear-to-t from-background/85 to-transparent pt-8 pb-2 font-mono text-[10px] tracking-[0.14em] text-foreground uppercase opacity-0 transition-opacity group-hover:opacity-100 [@media(hover:none)]:opacity-100">
          <ExternalLink className="size-3" />
          open
        </span>
      )}
    </a>
  )
}

/* While the reader works: the System's title breathing, a spinner, and how
   long it has been — the real seconds since it was asked for, not a
   progress figure nobody measured. */
function ReadingNow({ since }: { since: number | undefined }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(tick)
  }, [])
  const seconds =
    since === undefined ? 0 : Math.max(0, Math.round((now - since) / 1000))
  return (
    <div className="motion-arrive flex items-center gap-3 rounded-[6px] bg-lav-400/8 px-3 py-3 ring-1 ring-lav-400/30 ring-inset">
      <Loader2 className="size-5 shrink-0 animate-spin text-lav-400" />
      <span className="flex min-w-0 flex-col gap-1">
        <span className="system-title system-pulse text-[12px]">
          [ reading document ]
        </span>
        <span className="font-mono text-[11px] text-ink-300">
          {READING_MODEL_NAME} is reading every line · {seconds}s
        </span>
      </span>
    </div>
  )
}

/* The paperclip on a session in History: how many sheets it has, and a
   way to add one to it straight from there. */
export function SessionSheets({
  slug,
  logId,
  count,
}: {
  slug: string
  logId: Id<'logs'>
  count: number
}) {
  const input = useRef<HTMLInputElement>(null)
  const { upload, busy, error } = useSheetUpload(slug)
  return (
    <span className="relative flex shrink-0 items-center">
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        aria-label={
          count > 0
            ? `${count} sheet${count === 1 ? '' : 's'} — add another`
            : 'Add a sheet from this session'
        }
        title={error ?? undefined}
        className={`motion-press inline-flex h-6 items-center gap-0.5 rounded-full px-1.5 font-mono text-[10.5px] transition-colors ${
          error
            ? 'text-state-danger'
            : count > 0
              ? 'text-lav-400'
              : 'text-ink-600 hover:text-lav-400'
        }`}
      >
        {busy ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Paperclip className="size-3.5" />
        )}
        {count > 0 ? count : null}
      </button>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void upload(file, logId)
        }}
      />
    </span>
  )
}
