/* Where the dots go, and whether the last one moved the right way.

   PLAN.md §1, "a state read as a series" (21 Sep): the stored rows and
   nothing between them. There is no smoothing here, no interpolation across a
   gap, no trend line and no projection — the caller draws straight segments
   between consecutive dots, and x follows the instant a reading was recorded
   so that three weeks of silence look like three weeks of silence.

   No React, no Convex: it is arithmetic, and it is tested as arithmetic. */

export type Reading = { value: number; recordedAt: number }

export type Geometry = {
  points: Array<{ x: number; y: number }>
  /** Null when no goal gives a target — then no line is drawn for one. */
  targetY: number | null
  min: number
  max: number
}

/** A hair of room above and below, so a dot is never half outside the box. */
const PAD = 0.4

export function geometry(
  readings: Array<Reading>,
  opts: { width: number; height: number; target?: number },
): Geometry | null {
  if (readings.length === 0) return null

  const values = readings.map((r) => r.value)
  if (opts.target !== undefined) values.push(opts.target)

  let min = Math.min(...values) - PAD
  let max = Math.max(...values) + PAD
  /* A weight that has not moved would divide by zero. A flat line through the
     middle is the honest picture of "it did not change". */
  if (max - min < 0.01) {
    min -= 0.5
    max += 0.5
  }

  const y = (value: number) =>
    opts.height - ((value - min) / (max - min)) * opts.height

  const first = readings[0].recordedAt
  const last = readings[readings.length - 1].recordedAt
  const span = last - first

  const points = readings.map((reading) => ({
    /* One reading, or several on the same instant: put it at the right-hand
       edge rather than dividing by a zero span. */
    x: span === 0 ? opts.width : ((reading.recordedAt - first) / span) * opts.width,
    y: y(reading.value),
  }))

  return {
    points,
    targetY: opts.target === undefined ? null : y(opts.target),
    min,
    max,
  }
}

/**
 * Whether the most recent change went toward the target or away from it.
 *
 * A state, not a grade (§3d.3): it names which way the last step went and
 * says nothing about how far there is to go. Two readings and a target, or it
 * says nothing at all.
 */
export function drift(
  readings: Array<Reading>,
  target: number | undefined,
): 'good' | 'warn' | 'none' {
  if (target === undefined || readings.length < 2) return 'none'
  const latest = readings[readings.length - 1].value
  const previous = readings[readings.length - 2].value
  const was = Math.abs(previous - target)
  const is = Math.abs(latest - target)
  if (is < was) return 'good'
  if (is > was) return 'warn'
  return 'none'
}
