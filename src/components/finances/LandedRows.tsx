import { useQuery } from 'convex-helpers/react/cache/hooks'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { fmt, short } from '@/components/finances/AccountSheetRows'
import { PayeeLogo } from '@/components/finances/Logo'
import { RowMark } from '@/components/finances/RowMark'
import { Veiled } from '@/components/finances/Veil'

/* How many rows a landed card opens at once: a look inside, not the
   account's sheet. */
const SHOWN = 8

/* The rows a save brought in, behind ROWS on the landed card (12 Oct;
   design/treasury-mockup/update-account.html). Only what was saved — a
   row the account already had is not shown as new. */
export function LandedRows({ files }: { files: Array<Id<'intakes'>> }) {
  return (
    <div
      data-testid="landed-rows"
      className="motion-land flex flex-col border-t border-lift/[0.06] pt-2"
    >
      {files.map((id) => (
        <FileRows key={id} intakeId={id} />
      ))}
    </div>
  )
}

function FileRows({ intakeId }: { intakeId: Id<'intakes'> }) {
  const f = useQuery(api.intake.fileRows, { intakeId })
  if (f === undefined) return <div className="h-9" />
  const saved = f.rows.filter((r) => r.landed)
  return (
    <>
      {saved.slice(0, SHOWN).map((r, i) => (
        <div
          key={`${r.at}-${i}`}
          className="flex items-center gap-2.5 py-1.5 text-[12.5px]"
        >
          <span className="w-12 shrink-0 font-mono text-[10.5px] text-ink-500">
            {short(r.at)}
          </span>
          <RowMark name={r.text} category={r.category} income={r.amount > 0}>
            <PayeeLogo name={r.text} />
          </RowMark>
          <span className="min-w-0 flex-1 truncate text-ink-200">{r.text}</span>
          <span
            className={`font-mono whitespace-nowrap ${r.amount > 0 ? 'text-state-good' : 'text-ink-200'}`}
          >
            <Veiled>{fmt(r.amount, r.currency, true)}</Veiled>
          </span>
        </div>
      ))}
      {saved.length > SHOWN ? (
        <span className="label-caps py-1.5 pl-[58px]">
          and {saved.length - SHOWN} more
        </span>
      ) : null}
    </>
  )
}
