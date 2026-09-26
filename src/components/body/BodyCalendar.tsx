import { useMutation } from 'convex/react'
import { CircleHelp, Scale } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import { DayLog } from '@/components/body/DayLog'
import { KindIcon, kindName } from '@/components/body/kinds'
import { LogPastDay } from '@/components/track/LogPastDay'
import type { PastKind } from '@/components/track/LogPastDay'
import { MonthCalendar } from '@/components/track/MonthCalendar'
import type { LoggedRow } from '@/components/track/MonthCalendar'
import { useDayStarts } from '@/components/track/useDayStarts'
import { KINDS, SESSION_LABEL } from '@/lib/body/library'

/* Body's History calendar: sessions, shakes and weigh-ins, an icon per
   kind (26 Sep: "add back icons instead of red dot"), and the tapped day's
   rows in DayLog. A day that has gone can be logged from here too (26 Sep:
   "we can't log past events"): the same session and shake rows Today's
   buttons write, dated that day. */
export function BodyCalendar() {
  const today = useDayStarts(1).at(-1) as number
  const create = useMutation(api.logs.create)
  const kinds: Array<PastKind> = [
    ...KINDS.map((kind) => ({
      key: kind,
      label: SESSION_LABEL[kind],
      icon: <KindIcon kind={kind} className="size-3.5" />,
      log: (occurredAt: number) =>
        create({
          kind: 'workout',
          area: 'body',
          occurredAt,
          category: kind,
          text: `${SESSION_LABEL[kind].toLowerCase()} session`,
        }),
    })),
    {
      key: 'supplements',
      label: 'Shake',
      icon: <KindIcon kind="supplements" className="size-3.5" />,
      log: (occurredAt: number) =>
        create({
          kind: 'intake',
          area: 'body',
          occurredAt,
          category: 'supplements',
          text: 'protein + creatine shake',
        }),
    },
  ]
  return (
    <MonthCalendar
      area="body"
      kinds={['workout', 'intake', 'weight']}
      icon={rowIcon}
      name={rowName}
      day={(day) => (
        <div className="flex flex-col gap-3">
          {day < today ? <LogPastDay day={day} kinds={kinds} /> : null}
          <DayLog day={day} />
        </div>
      )}
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
