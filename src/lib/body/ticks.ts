/* Today's ticks on a workout list (26 Sep). A guide while training, not a
   record: the session is the one thing Body saves. They live in this
   browser so a refresh mid-workout keeps them, and they start empty each
   day — yesterday's ticks are not today's workout.

   No React: the component wraps storage access and this does the rest. */

export type Ticks = Record<string, ReadonlyArray<string>>

/** Stored ticks for `today`, or none when they are another day's or
    unreadable. */
export function readTicks(raw: string | null, today: string): Ticks {
  if (raw === null) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return {}
    const { day, ticks } = parsed as { day?: unknown; ticks?: unknown }
    if (day !== today || typeof ticks !== 'object' || ticks === null) return {}
    const out: Record<string, Array<string>> = {}
    for (const [workout, ids] of Object.entries(ticks)) {
      if (Array.isArray(ids)) {
        out[workout] = ids.filter((id): id is string => typeof id === 'string')
      }
    }
    return out
  } catch {
    return {}
  }
}

export function writeTicks(ticks: Ticks, today: string): string {
  return JSON.stringify({ day: today, ticks })
}

export function toggleTick(
  ticks: Ticks,
  workoutId: string,
  exerciseId: string,
): Ticks {
  const current = ticks[workoutId] ?? []
  const next = current.includes(exerciseId)
    ? current.filter((id) => id !== exerciseId)
    : [...current, exerciseId]
  return { ...ticks, [workoutId]: next }
}
