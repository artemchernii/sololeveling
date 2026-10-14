import { useState } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import type { FunctionReturnType } from 'convex/server'
import { Check, ChevronDown, TriangleAlert, X } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { Busy, PILL_QUIET } from '@/components/finances/bits'
import { TickerLogo } from '@/components/finances/Logo'
import { Veiled } from '@/components/finances/Veil'
import { useDayStarts } from '@/components/track/useDayStarts'
import { failureMessage } from '@/lib/convex-errors'
import { euros } from '@/lib/money'
import { fmt, short } from './AccountSheetRows'

/* Just added (14 Oct, mockup just-added.html, docs/specs/2026-10-14-
   just-added.md). Files he dropped today that saved something, on top of an account's
   sheet and of a thing's page: the sheet's own file row (IMG, name, days,
   OPEN ›), what it saved as badges, and REMOVE — which shows each row
   that goes and the before → after first, then the built take-back. */

export type JustFile = FunctionReturnType<typeof api.justAdded.list>[number]
/** A before → after the page knows: "Revolut · rows", "Gold · buy total". */
export type Sum = { label: string; now: string; after: string; under: string }

const HOUR = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
})
const when = (t: number, today: number) =>
  t >= today ? `today ${HOUR.format(new Date(t))}` : short(t)

export function JustAdded({
  accountId,
  intakeIds,
  readAs,
  unit,
  sums,
  onOpen,
}: {
  accountId?: Id<'accounts'>
  intakeIds?: ReadonlyArray<Id<'intakes'>>
  /** A thing's page: also files that read it and saved it elsewhere. */
  readAs?: {
    symbols: ReadonlyArray<string>
    accountIds: ReadonlyArray<Id<'accounts'>>
  }
  /** "0.08275 oz", "3 shares" — on a thing's page. */
  unit?: (shares: number) => string
  sums: (f: JustFile) => Array<Sum>
  onOpen: (id: Id<'intakes'>) => void
}) {
  const days = useDayStarts(1)
  const files = useQuery(
    api.justAdded.list,
    accountId === undefined &&
      (intakeIds ?? []).length === 0 &&
      (readAs?.accountIds ?? []).length === 0
      ? 'skip'
      : {
          /* Today only (14 Oct): files stay in the history at their dates. */
          since: days[days.length - 1],
          accountId,
          intakeIds: intakeIds ? [...intakeIds] : undefined,
          readAs: readAs
            ? {
                symbols: [...readAs.symbols],
                accountIds: [...readAs.accountIds],
              }
            : undefined,
        },
  )
  const [asking, setAsking] = useState<Id<'intakes'> | null>(null)
  const [removed, setRemoved] = useState<{
    name: string
    badge: string
  } | null>(null)
  /* One line until pressed (14 Oct: five cards after one drop were a
     wall); × hides it on this device until a newer file is saved. */
  const [open, setOpen] = useState<boolean | null>(null)
  const key = `just-added-hidden:${accountId ?? [...(intakeIds ?? [])].sort().join(',')}`
  const [hid, setHidden] = useState(0)
  const list = files ?? []
  /* A file on the wrong thing is never hidden by × (14 Oct: "i need to
     know that something is wrong even if I close modal"). */
  const wrong = list.some(misplaced)
  const hidden = wrong ? 0 : Math.max(hid, readHidden(key))
  const newest = Math.max(0, ...list.map((f) => f.addedAt))
  /* A thing whose last file went has nothing to ask about: the line
     that says it was removed still stands. */
  if (removed === null && (list.length === 0 || newest <= hidden)) return null
  const today = days[days.length - 1]
  /* Open by itself while a file sits on the wrong thing. */
  const shown = (open ?? wrong) || removed !== null || asking !== null
  const buys = list.reduce((n, f) => n + f.buys, 0)
  const sells = list.reduce((n, f) => n + f.sells, 0)
  const rows = list.reduce((n, f) => n + (isTrades(f) ? 0 : f.saved), 0)
  return (
    <div data-testid="just-added" className="flex flex-col gap-2">
      <div
        data-testid="just-line"
        className={`motion-arrive flex items-center gap-1 rounded-[14px] py-1 pr-1 pl-3 ring-1 ring-inset ${wrong ? 'bg-state-warn/[0.07] ring-state-warn/35' : 'bg-lav-400/[0.06] ring-lav-400/22'}`}
      >
        <button
          type="button"
          aria-expanded={shown}
          onClick={() => setOpen(!shown)}
          className="motion-press flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left"
        >
          {newest >= today ? (
            <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-lav-400 shadow-[0_0_8px_var(--color-lav-400)]" />
          ) : null}
          <span className="label-caps shrink-0 text-lav-300">just added</span>
          <span className="shrink-0 font-mono text-[11px] text-ink-400">
            · {list.length} {list.length === 1 ? 'file' : 'files'}
          </span>
          {buys > 0 ? <Badge tone="buy">{buys} buy</Badge> : null}
          {sells > 0 ? <Badge tone="sell">{sells} sell</Badge> : null}
          {rows > 0 ? (
            <Badge tone="rows">
              {rows} {rows === 1 ? 'row' : 'rows'}
            </Badge>
          ) : null}
          <span className="truncate font-mono text-[11px] text-ink-400">
            · {newest >= today ? 'today' : short(newest)}
          </span>
          <Misplaced files={list} />
          <span className="flex-1" />
          <ChevronDown
            className={`size-4 shrink-0 text-lav-300 transition-transform ${shown ? 'rotate-180' : ''}`}
          />
        </button>
        <button
          type="button"
          aria-label="hide just added"
          onClick={() => {
            writeHidden(key, newest)
            setHidden(newest)
            setRemoved(null)
            setAsking(null)
          }}
          className="motion-press grid size-8 shrink-0 place-items-center rounded-full text-ink-400 hover:bg-lift/[0.06] hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>
      {removed ? (
        <div
          data-testid="just-removed"
          className="motion-land flex items-center gap-2.5 rounded-[14px] bg-state-good/[0.08] px-3 py-2.5 ring-1 ring-state-good/35 ring-inset"
        >
          <span className="motion-pop grid size-[26px] place-items-center rounded-full bg-state-good/16 text-state-good shadow-[0_0_18px_-4px_var(--color-state-good)]">
            <Check className="size-3.5" />
          </span>
          <Badge tone="out">{removed.badge}</Badge>
          <span className="truncate text-[13px] text-foreground">
            {removed.name}
          </span>
          <span className="font-mono text-[11px] text-ink-400">removed</span>
        </div>
      ) : null}
      {shown
        ? list.map((f, i) =>
            asking === f.id ? (
              <Ask
                key={f.id}
                file={f}
                unit={unit}
                sums={sums(f)}
                onKeep={() => setAsking(null)}
                onRemoved={() => {
                  setAsking(null)
                  setRemoved({ name: nameOf(f), badge: goneBadge(f) })
                }}
              />
            ) : (
              <Panel
                key={f.id}
                file={f}
                index={i}
                today={today}
                onOpen={() => onOpen(f.id)}
                onRemove={() => {
                  setRemoved(null)
                  setAsking(f.id)
                }}
              />
            ),
          )
        : null}
    </div>
  )
}

/* A file whose buys sit on another thing than it read (14 Oct): said
   on the line itself, so it is seen with every card closed. */
const misplaced = (f: JustFile) => f.things.some((t) => t.read !== undefined)

function Misplaced({ files }: { files: ReadonlyArray<JustFile> }) {
  const n = files.filter(misplaced).length
  if (n === 0) return null
  return (
    <span
      data-testid="just-misplaced"
      className="motion-land inline-flex shrink-0 items-center gap-1.5 rounded-full bg-state-warn/14 px-2.5 py-0.5 font-mono text-[10px] tracking-[0.12em] text-state-warn uppercase"
    >
      <TriangleAlert className="motion-pulse size-3" />
      {n} {n === 1 ? 'file' : 'files'} saved on another asset
    </span>
  )
}

/* Per device, and never in the way: storage may be blocked. */
function readHidden(key: string): number {
  try {
    return Number(localStorage.getItem(key) ?? 0) || 0
  } catch {
    return 0
  }
}
function writeHidden(key: string, at: number) {
  try {
    localStorage.setItem(key, String(at))
  } catch {
    /* not kept: it shows again next time */
  }
}

const nameOf = (f: JustFile) => f.names.join(' · ') || 'A file'
const isTrades = (f: JustFile) => f.things.length > 0
const rowsOf = (n: number) => `${n} ${n === 1 ? 'row' : 'rows'}`
const goneBadge = (f: JustFile) =>
  isTrades(f)
    ? [
        f.buys > 0 ? `−${f.buys} buy` : '',
        f.sells > 0 ? `−${f.sells} sell` : '',
      ]
        .filter(Boolean)
        .join(' · ')
    : `−${rowsOf(f.saved)}`

function Badge({
  tone,
  children,
}: {
  tone: 'buy' | 'sell' | 'out' | 'in' | 'rows' | 'warn'
  children: React.ReactNode
}) {
  const look = {
    buy: 'bg-state-good/14 text-state-good',
    sell: 'bg-state-danger/14 text-state-danger',
    out: 'bg-state-danger/14 text-state-danger',
    in: 'bg-lift/[0.05] text-ink-400',
    rows: 'bg-lav-400/14 text-lav-300',
    warn: 'bg-state-warn/14 text-state-warn',
  }[tone]
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-0.5 font-mono text-[10px] tracking-[0.12em] uppercase ${look}`}
    >
      {children}
    </span>
  )
}

function Panel({
  file: f,
  index,
  today,
  onOpen,
  onRemove,
}: {
  file: JustFile
  index: number
  today: number
  onOpen: () => void
  onRemove: () => void
}) {
  return (
    <div
      data-testid="just-file"
      style={{ animationDelay: `${index * 70}ms` }}
      className={`motion-arrive flex flex-col gap-2 rounded-[14px] px-3 py-2.5 ring-1 ring-inset ${misplaced(f) ? 'bg-state-warn/[0.07] ring-state-warn/35' : f.saved > 0 ? 'bg-lav-400/[0.06] ring-lav-400/22' : 'bg-lift/[0.03] ring-lift/10'}`}
    >
      <button
        type="button"
        onClick={onOpen}
        className="motion-press flex items-center gap-2.5 rounded-[10px] bg-sink/30 px-2.5 py-2 text-left hover:bg-sink/50"
      >
        <span className="grid h-[30px] w-[26px] shrink-0 place-items-center rounded-[5px] bg-lift/[0.08] font-mono text-[8.5px] text-ink-300">
          {f.images ? 'IMG' : 'PDF'}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[13px] text-foreground">
            {nameOf(f)}
          </span>
          <span className="font-mono text-[10.5px] text-ink-400">
            {f.from !== null && f.to !== null
              ? `${short(f.from)} → ${short(f.to)} · `
              : ''}
            added {when(f.addedAt, today)}
          </span>
        </span>
        <span className="font-mono text-[10px] tracking-[0.12em] text-lav-300 uppercase">
          open ›
        </span>
      </button>
      <span className="flex flex-wrap items-center gap-1.5">
        {f.things.map((t) =>
          t.read !== undefined ? (
            /* Two things with their places (14 Oct): what the file
               holds, and where it was saved. */
            <span
              key={t.symbol}
              className="inline-flex min-w-0 flex-wrap items-center gap-1.5 text-[12.5px] text-foreground"
            >
              <TriangleAlert className="motion-pulse size-3.5 shrink-0 text-state-warn" />
              <span className="label-caps">in the file</span>
              {t.read}
              <span className="label-caps text-state-warn">saved on</span>
              <TickerLogo
                symbol={t.symbol}
                type={t.type}
                name={t.name}
                size={18}
              />
              {t.name}
            </span>
          ) : (
            <span
              key={t.symbol}
              className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-200"
            >
              <TickerLogo
                symbol={t.symbol}
                type={t.type}
                name={t.name}
                size={18}
              />
              {t.name}
            </span>
          ),
        )}
        {f.buys > 0 ? <Badge tone="buy">{f.buys} buy</Badge> : null}
        {f.sells > 0 ? <Badge tone="sell">{f.sells} sell</Badge> : null}
        {!isTrades(f) && f.saved > 0 ? (
          <Badge tone="rows">{rowsOf(f.saved)}</Badge>
        ) : null}
        {f.saved === 0 ? <Badge tone="in">0 saved</Badge> : null}
        {f.had > 0 && !misplaced(f) ? (
          <Badge tone="in">{f.had} already added</Badge>
        ) : null}
        <span className="flex-1" />
        {f.saved > 0 ? (
          <button
            type="button"
            onClick={onRemove}
            className="motion-press inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-[10.5px] tracking-[0.12em] text-state-danger uppercase ring-1 ring-state-danger/40 ring-inset"
          >
            <X className="size-3.5" />
            remove
          </button>
        ) : null}
      </span>
    </div>
  )
}

function Ask({
  file: f,
  unit,
  sums,
  onKeep,
  onRemoved,
}: {
  file: JustFile
  unit?: (shares: number) => string
  sums: Array<Sum>
  onKeep: () => void
  onRemoved: () => void
}) {
  const takeBack = useMutation(api.undoFile.takeBack)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const more = f.saved - f.rows.length
  return (
    <div
      data-testid="just-ask"
      className="motion-arrive flex flex-col gap-2.5 rounded-[14px] bg-state-danger/[0.06] px-3 py-3 ring-1 ring-state-danger/35 ring-inset"
    >
      <span className="label-caps truncate text-state-danger">
        remove · {nameOf(f)}
      </span>
      <div className="flex flex-col">
        {f.rows.map((r, i) => (
          <div
            key={`${r.at}:${i}`}
            style={{ animationDelay: `${i * 50}ms` }}
            className="motion-arrive flex items-center gap-2 border-t border-lift/6 py-1.5 first:border-t-0"
          >
            {r.side === 'row' ? null : <Badge tone={r.side}>{r.side}</Badge>}
            <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink-200">
              <Veiled>
                {r.side === 'row'
                  ? `${fmt(r.value, r.currency)}${r.label ? ` · ${r.label}` : ''}`
                  : `${euros(r.value)}${unit === undefined ? '' : ` · ${unit(r.shares)}`}`}
              </Veiled>
            </span>
            <span className="font-mono text-[11px] text-ink-500">
              {short(r.at)}
            </span>
            <Badge tone="out">goes</Badge>
          </div>
        ))}
        {more > 0 ? (
          <span className="border-t border-lift/6 pt-1.5 font-mono text-[11px] text-ink-400">
            {more} more
          </span>
        ) : null}
      </div>
      {sums.length > 0 ? (
        <div className="grid grid-cols-2 gap-2">
          {sums.map((s) => (
            <div
              key={s.label}
              className="flex flex-col gap-1 rounded-[12px] bg-lift/[0.04] px-3 py-2.5"
            >
              <span className="label-caps">{s.label}</span>
              <span className="text-[17px] font-light text-foreground tabular-nums">
                <Veiled>
                  <s className="text-ink-500 decoration-1">{s.now}</s>
                  <span className="mx-1.5 text-[13px] text-ink-500">→</span>
                  {s.after}
                </Veiled>
              </span>
              <span className="font-mono text-[11px] text-ink-400">
                {s.under}
              </span>
            </div>
          ))}
        </div>
      ) : null}
      {failed ? (
        <span className="font-mono text-[11px] text-state-danger">
          {failed}
        </span>
      ) : null}
      <span className="flex justify-end gap-1.5">
        <button
          type="button"
          onClick={onKeep}
          disabled={busy}
          className={PILL_QUIET}
        >
          keep
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setBusy(true)
            setFailed(null)
            takeBack({ intakeId: f.id })
              .then(onRemoved)
              .catch((e: unknown) => {
                setBusy(false)
                setFailed(failureMessage(e) ?? 'Not removed — try again.')
              })
          }}
          className="motion-press inline-flex items-center gap-1.5 rounded-full bg-state-danger/20 px-3 py-1.5 font-mono text-[10.5px] tracking-[0.12em] text-foreground uppercase disabled:opacity-70"
        >
          <Busy on={busy} doing="removing…">
            <X className="size-3.5" />
            remove
          </Busy>
        </button>
      </span>
    </div>
  )
}
