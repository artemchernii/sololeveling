import { useQuery } from 'convex-helpers/react/cache/hooks'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { PILL_QUIET } from '@/components/finances/bits'
import { Veiled } from '@/components/finances/Veil'
import { SkeletonRows } from '@/components/Skeleton'
import { fmt, short } from './AccountSheetRows'

/* A confirmed file, opened again: what it read, as it read it, and which
   rows landed. Amounts are plain: a file's row is not yet a spend, income
   or move, so its sign is not coloured as one. */
export function FileView({ intakeId }: { intakeId: Id<'intakes'> }) {
  const f = useQuery(api.intake.fileRows, { intakeId })
  if (f === undefined) return <SkeletonRows rows={6} />
  const landed = f.rows.filter((r) => r.landed).length
  return (
    <div className="flex flex-col gap-3">
      <span className="flex flex-col gap-1">
        <span className="text-[15px] text-foreground">{f.title}</span>
        <span className="font-mono text-[11px] text-ink-400">
          {f.names.join(' · ')} · read {short(f.readAt)} · {f.rows.length} rows
          read, {landed} landed
        </span>
      </span>
      <Originals intakeId={intakeId} />
      <div className="flex flex-col">
        {f.rows.map((r, i) => (
          <div
            key={`${r.at}-${i}`}
            className="flex items-center gap-2.5 rounded-[10px] px-2.5 py-2"
          >
            <span className="w-14 shrink-0 font-mono text-[11px] text-ink-500">
              {short(r.at)}
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
      : 'file not kept — it went in before files were'
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
