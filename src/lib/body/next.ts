import { PROGRAMS } from './library'
import type { Program, RoutineDay } from './library'

/* NEXT UP on Body (25 Sep): one routine to do today, out of the ones he
   has picked. A pick, not a number — nothing here is counted onto the
   screen, and the reason is words.

   The order is his: mobility first (his back, daily), then the gym when a
   day's rest has passed, alternating A and B by whichever was done longest
   ago, then anything else not done today. */

const DAY_MS = 86_400_000

export type NextPick = { program: Program; day: RoutineDay; reason: string }

/**
 * @param picked   day ids he has in Today (from his drills' refs)
 * @param lastDone when any exercise of that day was last logged, or null
 * @param todayStart local midnight today
 */
export function nextRoutine(
  picked: ReadonlySet<string>,
  lastDone: (dayId: string) => number | null,
  todayStart: number,
): NextPick | null {
  const days = PROGRAMS.flatMap((program) =>
    program.days
      .filter((day) => picked.has(day.id))
      .map((day) => ({ program, day, at: lastDone(day.id) })),
  )
  const notToday = days.filter((d) => d.at === null || d.at < todayStart)
  const oldestFirst = (list: typeof days) =>
    [...list].sort((a, b) => (a.at ?? -Infinity) - (b.at ?? -Infinity))

  const mobility = notToday.find((d) => d.program.kind === 'stretch')
  if (mobility) {
    return {
      program: mobility.program,
      day: mobility.day,
      reason:
        mobility.at === null
          ? 'Not started yet — mobility is the one to do every day.'
          : 'Not done today — mobility is the one to do every day.',
    }
  }

  const gym = days.filter((d) => d.program.kind === 'gym')
  const lastGym = Math.max(-Infinity, ...gym.map((d) => d.at ?? -Infinity))
  /* Rested: no gym day today or yesterday. */
  if (gym.length > 0 && lastGym < todayStart - DAY_MS) {
    const pick = oldestFirst(gym)[0]
    const previous = gym.find((d) => d.at === lastGym)
    return {
      program: pick.program,
      day: pick.day,
      reason:
        previous === undefined
          ? 'No gym day logged yet — start here.'
          : `Rested since ${previous.day.name} — this one is next.`,
    }
  }

  const rest = oldestFirst(notToday.filter((d) => d.program.kind !== 'gym')).at(
    0,
  )
  if (rest) {
    return {
      program: rest.program,
      day: rest.day,
      reason:
        rest.at === null ? 'Not started yet.' : 'Done longest ago of the rest.',
    }
  }
  return null
}
