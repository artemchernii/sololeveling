/* Which + a dragged task is over (24 Sep, Waiting → steps).

   A + is 20px across — too small to hit exactly with a task in hand — so the
   nearest one within `radius` of the pointer counts, measured from its
   centre. Nothing within reach means nothing: a drop there flies the task
   back rather than guessing. */

export type Target = { key: string; x: number; y: number }

export function nearestTarget(
  point: { x: number; y: number },
  targets: Array<Target>,
  radius: number,
): string | null {
  let best: string | null = null
  let bestDistance = radius
  for (const t of targets) {
    const d = Math.hypot(t.x - point.x, t.y - point.y)
    if (d <= bestDistance) {
      best = t.key
      bestDistance = d
    }
  }
  return best
}
