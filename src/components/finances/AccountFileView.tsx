import { useQuery } from 'convex-helpers/react/cache/hooks'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { TakeBack } from '@/components/finances/AccountFileBack'
import type { Taken } from '@/components/finances/AccountFileBack'
import { PILL_QUIET } from '@/components/finances/bits'
import { PayeeLogo } from '@/components/finances/Logo'
import { RowMark } from '@/components/finances/RowMark'
import { Veiled } from '@/components/finances/Veil'
import { SkeletonRows } from '@/components/Skeleton'
import { fmt, short } from './AccountSheetRows'

/* A confirmed file, opened again: what it read, as it read it, and which
   rows landed. Amounts are plain: a file's row is not yet a spend, income
   or move, so its sign is not coloured as one. Under the file itself, the
   way to take it back (AccountFileBack). */
/* A file's name says what it is: a screenshot, else a statement. */
const IMAGE = /\.(png|jpe?g|webp|heic|gif)$/i

export function FileView({
  intakeId,
  onTaken,
}: {
  intakeId: Id<'intakes'>
  onTaken: (t: Taken) => void
}) {
  const f = useQuery(api.intake.fileRows, { intakeId })
  if (f === undefined) return <SkeletonRows rows={6} />
  const landed = f.rows.filter((r) => r.landed).length
  return (
    <div className="flex flex-col gap-3">
      <span className="flex flex-col gap-1">
        <span className="text-[15px] text-foreground">{f.title}</span>
        <span className="font-mono text-[11px] text-ink-400">
          {f.names.join(' · ')} · read {short(f.readAt)} ·{' '}
          {f.positions.length > 0 && f.rows.length === 0
            ? `${f.positions.length} ${f.positions.length === 1 ? 'position' : 'positions'} read`
            : `${f.rows.length} rows in the file · ${landed} saved`}
        </span>
      </span>
      <Originals intakeId={intakeId} />
      <TakeBack
        intakeId={intakeId}
        what={
          !f.names.every((n) => IMAGE.test(n))
            ? 'statement'
            : f.names.length > 1
              ? 'screenshots'
              : 'screenshot'
        }
        onTaken={onTaken}
      />
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
            <span className="font-mono text-[10px] tracking-[0.1em] text-ink-500 uppercase">
              {r.pending ? 'pending' : r.landed ? '' : 'left out'}
            </span>
            <span
              className={`font-mono text-[13px] whitespace-nowrap ${r.landed ? 'text-foreground' : 'text-ink-500 line-through'}`}
            >
              <Veiled>{fmt(r.amount, r.currency, true)}</Veiled>
            </span>
          </div>
        ))}
      </div>
    </div>
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
