import { useQuery } from 'convex-helpers/react/cache/hooks'

import { api } from '../../../convex/_generated/api'
import { MoneyIcon } from '@/components/finances/icons'
import { MoneyRow } from '@/components/finances/MoneyRow'
import { MonthCalendar } from '@/components/track/MonthCalendar'
import type { LoggedRow } from '@/components/track/MonthCalendar'
import { categoryLabel } from '@/lib/money'
import type { MoneyKind } from '@/lib/money'

const DAY = 86_400_000
const DAY_NAME = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})

/* Finances' History (F1): the shared month calendar, an icon per category
   spent on that day, and the tapped day's rows to put right. */
export function MoneyCalendar() {
  return (
    <MonthCalendar
      area="money"
      kinds={['expense', 'income']}
      icon={(row: LoggedRow, cls: string) => (
        <MoneyIcon
          kind={row.kind as MoneyKind}
          category={row.category}
          className={cls}
        />
      )}
      name={(row: LoggedRow) =>
        categoryLabel(row.kind as MoneyKind, row.category).toLowerCase()
      }
      day={(day) => <MoneyDay day={day} />}
    />
  )
}

function MoneyDay({ day }: { day: number }) {
  const rows = useQuery(api.logs.moneyRows, { start: day, end: day + DAY })
  if (rows === undefined) return null
  return (
    <div className="flex flex-col gap-1.5">
      <span className="label-caps">{DAY_NAME.format(new Date(day))}</span>
      {rows.length === 0 ? (
        <p className="text-[13px] text-ink-500">Nothing logged this day.</p>
      ) : (
        rows.map((row) => <MoneyRow key={row._id} row={row} />)
      )}
    </div>
  )
}
