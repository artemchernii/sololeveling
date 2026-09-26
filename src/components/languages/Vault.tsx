import { useCallback, useRef, useState } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import {
  BookOpen,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  FileText,
  GraduationCap,
  House,
  Loader2,
  Paperclip,
  Plus,
  RotateCcw,
  X,
} from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { TrackPanel } from '@/components/track/TrackPanel'
import { useDayStarts } from '@/components/track/useDayStarts'
import { clock } from '@/lib/format'
import { MAX_READ_BYTES, READING_MODEL_NAME, readableKind } from '@/lib/reading'

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
export function useSheetUpload(area: string) {
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
      } catch {
        setError(`${file.name || 'The file'} did not upload — try again.`)
      } finally {
        setBusy(false)
      }
    },
    [add, area, generateUploadUrl],
  )

  return { upload, busy, error }
}

export function Vault({ slug }: { slug: string }) {
  const sheets = useQuery(api.vault.list, { area: slug })

  return (
    <div className="flex flex-col gap-[18px]">
      <AddSheet slug={slug} />
      {sheets === undefined ? null : sheets.length === 0 ? (
        <p className="px-1 text-[13.5px] text-ink-400">
          Nothing in the Vault yet. Add the sheet from your last class — a scan
          or a photo is fine — and it comes back with a summary, a conclusion
          and the words worth learning.
        </p>
      ) : (
        sheets.map((sheet, i) => (
          <SheetCard key={sheet._id} sheet={sheet} delay={i * 60} />
        ))
      )}
    </div>
  )
}

/* Which session the sheet belongs to, then the file. Today's class is
   picked for him when there is one, else the latest session; "Not
   linked" is always there — some homework has no session to hang on. */
function AddSheet({ slug }: { slug: string }) {
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
  const { upload, busy, error } = useSheetUpload(slug)

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

function SheetCard({ sheet, delay }: { sheet: Sheet; delay: number }) {
  const retry = useMutation(api.vault.retry)
  const remove = useMutation(api.vault.remove)
  const [confirm, setConfirm] = useState(false)
  const [full, setFull] = useState(false)
  const [copied, setCopied] = useState(false)
  const reading = sheet.reading

  return (
    <section
      style={{ animationDelay: `${delay}ms` }}
      className="system-frame motion-arrive relative flex min-w-0 flex-col gap-4 p-4 sm:p-5"
    >
      <header className="flex min-w-0 items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-[8px] bg-lav-400/10 text-lav-400 ring-1 ring-lav-400/25">
          <FileText className="size-4" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-[14.5px] text-foreground">
            {sheet.name}
          </span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10.5px] tracking-[0.1em] text-ink-400 uppercase">
            {sheet.session ? (
              <span className="inline-flex items-center gap-1 text-ink-200">
                <span className="text-area">
                  <KindIcon category={sheet.session.category} />
                </span>
                {sessionLabel(sheet.session.category, sheet.session.occurredAt)}
              </span>
            ) : (
              <span>not linked</span>
            )}
          </span>
        </span>
        {sheet.url ? (
          <a
            href={sheet.url}
            target="_blank"
            rel="noreferrer"
            aria-label="Open the sheet"
            className="motion-press grid size-8 shrink-0 place-items-center rounded-full text-ink-400 ring-1 ring-lift/12 transition-colors ring-inset hover:text-foreground hover:ring-lav-400/40"
          >
            <ExternalLink className="size-3.5" />
          </a>
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

      {reading === null || reading.status === 'reading' ? (
        <p className="flex items-center gap-2 text-[13px] text-lav-400">
          <span className="system-pulse inline-block size-2 rotate-45 bg-lav-400" />
          Reading the sheet…
        </p>
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
        <div className="motion-land flex flex-col gap-4">
          <Part label="summary">{reading.summary}</Part>
          <Part label="conclusion">{reading.conclusion}</Part>
          {reading.words && reading.words.length > 0 ? (
            <div className="flex flex-col gap-2">
              <span className="label-caps">words</span>
              <div className="flex flex-wrap gap-1.5">
                {reading.words.map((w) => (
                  <span
                    key={w.term}
                    className="inline-flex items-baseline gap-1.5 rounded-[6px] bg-lift/[0.04] px-2 py-1 ring-1 ring-lift/10 ring-inset"
                  >
                    <span className="text-[13px] text-foreground">
                      {w.term}
                    </span>
                    <span className="text-[12px] text-ink-400">
                      {w.meaning}
                    </span>
                  </span>
                ))}
              </div>
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
          <span className="font-mono text-[10px] text-ink-600">
            read by {READING_MODEL_NAME}
            {reading.readAt
              ? ` · ${DATE.format(new Date(reading.readAt))}, ${clock(new Date(reading.readAt))}`
              : ''}
          </span>
        </div>
      )}
    </section>
  )
}

function Part({
  label,
  children,
}: {
  label: string
  children: string | undefined
}) {
  if (!children) return null
  return (
    <div className="flex flex-col gap-1.5">
      <span className="label-caps">{label}</span>
      <p className="text-[14px] leading-relaxed text-ink-100">{children}</p>
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
