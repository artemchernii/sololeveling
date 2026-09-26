import { CircleHelp, Scale } from 'lucide-react'

import { DayLog } from '@/components/body/DayLog'
import { KindIcon, kindName } from '@/components/body/kinds'
import { MonthCalendar } from '@/components/track/MonthCalendar'
import type { LoggedRow } from '@/components/track/MonthCalendar'

/* Body's History calendar: sessions, shakes and weigh-ins, an icon per
   kind (26 Sep: "add back icons instead of red dot"), and the tapped day's
   rows in DayLog. */
export function BodyCalendar() {
  return (
    <MonthCalendar
      area="body"
      kinds={['workout', 'intake', 'weight']}
      icon={rowIcon}
      name={rowName}
      day={(day) => <DayLog day={day} />}
    />
  )
}

function rowName(row: LoggedRow): string {
  if (row.kind === 'weight') return 'weight'
  return kindName(row.category)
}

function rowIcon(row: LoggedRow, cls: string) {
  if (row.kind === 'weight') return <Scale className={cls} />
  if (row.category === null) {
    return <CircleHelp className={`${cls} text-state-warn`} />
  }
  return <KindIcon kind={row.category} className={cls} />
}
