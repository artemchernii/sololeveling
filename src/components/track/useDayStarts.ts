import { useEffect, useState } from 'react'

import { dayStartsBack, STRIP_WEEKS } from '@/lib/day-strip'
import { startOfLocalDay } from '@/lib/today'

/* The strip's midnights, kept for a render but not for a night (26 Sep).

   Pages held them in `useState` so a query's arguments stay put between
   renders — and so a tab left open past midnight kept asking about
   yesterday: a DID at 00:02 wrote a row after the last day asked for, and
   the hero never showed it. This keeps the array stable within a day and
   swaps it when the local day changes: at the next midnight, and on
   returning to the tab, since a sleeping laptop does not run timers. */
export function useDayStarts(weeks: number = STRIP_WEEKS): Array<number> {
  const [days, setDays] = useState(() => dayStartsBack(weeks))
  const today = days[days.length - 1]

  useEffect(() => {
    const check = () => {
      if (startOfLocalDay() !== today) setDays(dayStartsBack(weeks))
    }
    const next = new Date(today)
    next.setDate(next.getDate() + 1)
    const timer = setTimeout(check, next.getTime() - Date.now() + 1000)
    document.addEventListener('visibilitychange', check)
    window.addEventListener('focus', check)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', check)
      window.removeEventListener('focus', check)
    }
  }, [today, weeks])

  return days
}
