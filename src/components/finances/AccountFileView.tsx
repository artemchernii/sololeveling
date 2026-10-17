import { useQuery } from 'convex-helpers/react/cache/hooks'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { TakeBack } from '@/components/finances/AccountFileBack'
import type { Taken } from '@/components/finances/AccountFileBack'
import { PILL_QUIET } from '@/components/finances/bits'
import { AccountLogo, PayeeLogo } from '@/components/finances/Logo'
import { RowMark } from '@/components/finances/RowMark'
import { Veiled } from '@/components/finances/Veil'
import { SkeletonRows } from '@/components/Skeleton'
import { RefreshCw } from 'lucide-react'
import { fmt, short } from './AccountSheetRows'

/* A confirmed file, opened again: what it read, as it read it, and which
   rows landed. Amounts are plain: a file's row is not yet a spend, income
   or move, so its sign is not coloured as one. Under the file itself, the
   way to take it back (AccountFileBack). */
/* A file's name says what it is: a screenshot, else a statement. */
const IMAGE = /\.(png|jpe?g|webp|heic|gif)$/i
/* A trade's day with its year: a file of buys goes back years. */
const DAY = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

export function FileView({
  intakeId,
  domain,
  onTaken,
}: {
  intakeId: Id<'intakes'>
  /** The account's site, for its logo on a bank's answer. */
  domain?: string
  onTaken: (t: Taken) => void
}) {
  const f = useQuery(api.intake.fileRows, { intakeId })
  if (f === undefined) return <SkeletonRows rows={6} />
  const landed = f.rows.filter((r) => r.landed).length
  const buys = f.trades.filter((t) => t.side !== 'sell').length
  const sells = f.trades.length - buys
  const tradesSaved = f.trades.filter((t) => t.landed).length
  return (
    <div className="flex flex-col gap-3">
      {f.bank ? (
        <SyncedHead
          title={f.title}
          domain={domain}
          at={f.readAt}
          saved={landed}
          pending={f.rows.filter((r) => r.pending).length}
        />
      ) : (
        <span className="flex flex-col gap-1">
          <span className="text-[15px] text-foreground">{f.title}</span>
          <span className="font-mono text-[11px] text-ink-400">
            {f.names.join(' · ')} · read {short(f.readAt)} ·{' '}
            {f.trades.length > 0 && f.rows.length === 0
              ? `${[buys > 0 ? `${buys} buy` : '', sells > 0 ? `${sells} sell` : ''].filter(Boolean).join(' · ')} in the file · ${tradesSaved} saved`
              : f.positions.length > 0 && f.rows.length === 0
                ? `${f.positions.length} ${f.positions.length === 1 ? 'position' : 'positions'} read`
                : `${f.rows.length} rows in the file · ${landed} saved`}
          </span>
        </span>
      )}
      {f.bank ? null : <Originals intakeId={intakeId} />}
      {f.positions.length > 0 ? (
        /* What a broker's screen listed (13 Oct: Trading 212's screenshot
           opened on "0 rows in the file" and nothing under it). In euros,
           the shares small underneath. */
        <div data-testid="file-positions" className="flex flex-col">
          {f.positions.map((p, i) => (
            <div
              key={`${p.name}-${i}`}
              className="flex items-center gap-2.5 rounded-[10px] px-2.5 py-2"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[13.5px] text-foreground">
                  {p.name}
                </span>
                {p.shares !== null || p.symbol !== null ? (
                  <span className="font-mono text-[10.5px] text-ink-500">
                    {[
                      p.shares !== null
                        ? `${Math.round(p.shares * 1e6) / 1e6} sh`
                        : null,
                      p.symbol,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                ) : null}
              </span>
              {p.valueEur !== null ? (
                <span className="font-mono text-[13px] whitespace-nowrap text-foreground">
                  <Veiled>{fmt(p.valueEur)}</Veiled>
                </span>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {f.trades.length > 0 ? (
        /* A trades file: each buy and sell as read (14 Oct: "0 rows in
           the file" and nothing under his gold screenshot). */
        <div data-testid="file-trades" className="flex flex-col">
          {f.trades.map((t, i) => (
            <div
              key={`${t.at}:${i}`}
              data-testid="file-trade"
              className={`grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-3 border-t border-lift/6 px-2.5 py-2.5 first:border-t-0 ${t.landed ? '' : 'opacity-50'}`}
            >
              <span
                className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] tracking-[0.12em] uppercase ${t.side === 'sell' ? 'bg-state-danger/14 text-state-danger' : 'bg-state-good/14 text-state-good'}`}
              >
                {t.side}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5 font-mono">
                <span className="text-[13.5px] text-foreground">
                  <Veiled>{fmt(t.value, t.currency)}</Veiled>
                </span>
                <span className="truncate text-[10.5px] text-ink-500">
                  <Veiled>{Number(t.shares.toFixed(6))}</Veiled> · {t.name}
                </span>
              </span>
              <span
                className={`rounded-full px-2 py-0.5 font-mono text-[10px] tracking-[0.12em] uppercase ${t.landed ? 'bg-state-good/12 text-state-good' : 'bg-lift/[0.05] text-ink-400'}`}
              >
                {t.landed ? 'saved' : 'already added'}
              </span>
              <span className="text-right font-mono text-[11px] whitespace-nowrap text-ink-400">
                {DAY.format(new Date(t.at))}
              </span>
            </div>
          ))}
        </div>
      ) : null}
      <div className="flex flex-col">
        {f.rows.map((r, i) => (
          <div
            key={`${r.at}-${i}`}
            className="flex items-center gap-2.5 rounded-[10px] px-2.5 py-2"
          >
            <span className="w-14 shrink-0 font-mono text-[11px] text-ink-500">
              {short(r.at)}
            </span>
            <span className={r.landed || r.pending ? '' : 'opacity-45'}>
              <RowMark
                name={r.text}
                category={r.category}
                income={r.amount > 0}
              >
                <PayeeLogo name={r.text} />
              </RowMark>
            </span>
            <span className="min-w-0 flex-1 truncate text-[13.5px] text-foreground">
              {r.text}
            </span>
            {r.pending ? (
              <span className={`${BADGE} bg-state-warn/12 text-state-warn`}>
                <i className="size-1.5 animate-pulse rounded-full bg-current" />
                pending
              </span>
            ) : (
              <span className="font-mono text-[10px] tracking-[0.1em] text-ink-500 uppercase">
                {r.landed ? '' : 'left out'}
              </span>
            )}
            <span
              className={`font-mono text-[13px] whitespace-nowrap ${r.landed ? 'text-foreground' : r.pending ? 'text-ink-400' : 'text-ink-500 line-through'}`}
            >
              <Veiled>{fmt(r.amount, r.currency, true)}</Veiled>
            </span>
          </div>
        ))}
      </div>
      <TakeBack
        intakeId={intakeId}
        what={
          f.bank
            ? 'sync'
            : !f.names.every((n) => IMAGE.test(n))
              ? 'statement'
              : f.names.length > 1
                ? 'screenshots'
                : 'screenshot'
        }
        onTaken={onTaken}
      />
    </div>
  )
}

const BADGE =
  'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[9.5px] tracking-[0.12em] uppercase'

/* A bank's answer opened (17 Oct: "what the fuck is FILE NOT KEPT"):
   no file was dropped, so none is kept — the same Synced with bank line
   as on the sheet, and what it saved and showed pending. */
function SyncedHead({
  title,
  domain,
  at,
  saved,
  pending,
}: {
  title: string
  domain?: string
  at: number
  saved: number
  pending: number
}) {
  const time = new Date(at).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })
  return (
    <span className="flex items-center gap-3">
      <AccountLogo name={title} domain={domain} size={44} />
      <span className="flex min-w-0 flex-col gap-1.5">
        <span className="text-[15px] text-foreground">{title}</span>
        <span className="flex items-center gap-1.5 text-[13px] text-foreground">
          <RefreshCw className="size-3.5 text-lav-400 drop-shadow-[0_0_6px_var(--color-lav-400)]" />
          Synced with bank
        </span>
        <span className="flex flex-wrap gap-1.5">
          <span className={`${BADGE} bg-lift/[0.05] text-ink-400`}>
            {short(at)} · {time}
          </span>
          <span className={`${BADGE} bg-state-good/12 text-state-good`}>
            <i className="size-1.5 rounded-full bg-current" />
            {saved} saved
          </span>
          {pending > 0 ? (
            <span className={`${BADGE} bg-state-warn/12 text-state-warn`}>
              <i className="size-1.5 animate-pulse rounded-full bg-current" />
              {pending} pending
            </span>
          ) : null}
        </span>
      </span>
    </span>
  )
}

/* The file itself, next to what was read from it — kept 90 days
   (intake.KEEP_FILES_MS), then erased; the rows stay. */
function Originals({ intakeId }: { intakeId: Id<'intakes'> }) {
  const o = useQuery(api.intake.originals, { intakeId })
  if (o === undefined) return null
  const kept = o.files.some((f) => f.url !== null)
  const note = kept
    ? `file kept until ${short(o.keptUntil ?? Date.now())}`
    : o.keptUntil !== null && o.keptUntil <= Date.now()
      ? `file erased · ${short(o.keptUntil)}`
      : 'file not kept'
  return (
    <div className="flex flex-col gap-2">
      {o.files.map((f, i) =>
        f.url === null ? null : f.contentType.startsWith('image/') ? (
          <a
            key={i}
            href={f.url}
            target="_blank"
            rel="noreferrer"
            className="motion-press self-start overflow-hidden rounded-[12px] ring-1 ring-lift/12"
          >
            <img
              src={f.url}
              alt={f.name}
              className="max-h-[420px] w-auto object-contain"
            />
          </a>
        ) : (
          <a
            key={i}
            href={f.url}
            target="_blank"
            rel="noreferrer"
            className={`${PILL_QUIET} self-start`}
          >
            open {f.name} ↗
          </a>
        ),
      )}
      <span className="font-mono text-[10.5px] tracking-[0.08em] text-ink-500 uppercase">
        {note}
      </span>
    </div>
  )
}
