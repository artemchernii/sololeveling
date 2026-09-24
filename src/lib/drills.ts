import type { Doc } from '../../convex/_generated/dataModel'

export type DrillGroup = { group: string; drills: Array<Doc<'drills'>> }

/**
 * A routine per group, in the order its first drill was added, each drill in
 * its own order. Grouping, not counting: nothing here is a number on screen.
 */
export function groupDrills(drills: Array<Doc<'drills'>>): Array<DrillGroup> {
  const sorted = [...drills].sort((a, b) => a.sortOrder - b.sortOrder)
  const groups: Array<DrillGroup> = []
  for (const drill of sorted) {
    let g = groups.find((x) => x.group === drill.group)
    if (g === undefined) {
      g = { group: drill.group, drills: [] }
      groups.push(g)
    }
    g.drills.push(drill)
  }
  return groups
}
