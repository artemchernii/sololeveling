import type { Doc } from '../../convex/_generated/dataModel'
import type { Area } from './capture-parser'

export type Tile = NonNullable<Doc<'goals'>['tile']>

export type MonthTile = {
  key: Tile
  label: string
  noun: string
  /** The colour the tile wears — a kind, never a grade (§3d.3). */
  area?: Area
}

/* PLAN.md §3 item 4: the six tiles, in monthCounts' order. Labels say
   Languages and Finances since 15 Sep. The keys are permanent: R6 (21 Sep)
   made areas data by keeping the slug as the stored identity, so there is no
   enum to migrate and these never move. The first tile was "Projects" until
   16 Sep, but it
   counts every ticked task, on a project or not — so it says Tasks. Its key
   stays `projects` (the schema's tile enum). It has no area colour: it counts
   ticked tasks from every area, so no one colour is true of it. */
export const MONTH_TILES: ReadonlyArray<MonthTile> = [
  { key: 'projects', label: 'Tasks', noun: 'tasks done' },
  {
    key: 'portuguese',
    label: 'Languages',
    noun: 'sessions logged',
    area: 'portuguese',
  },
  { key: 'body', label: 'Body', noun: 'workouts done', area: 'body' },
  {
    key: 'money',
    label: 'Finances',
    noun: 'transfers to the floor',
    area: 'money',
  },
  {
    key: 'style',
    label: 'Style',
    noun: 'pieces bought or altered',
    area: 'style',
  },
  { key: 'social', label: 'Social', noun: 'events attended', area: 'social' },
]
