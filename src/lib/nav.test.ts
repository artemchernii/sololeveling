import { describe, expect, test } from 'vitest'

import { mobileNav, navGroups } from './nav'

/* PLAN.md §3 (15 Sep): three groups, ten entries, Settings below them. A
   section that is not used is the thing the rethink exists to remove, so the
   list is pinned here rather than left to drift. */
describe('the sidebar is PLAN.md §3’s table', () => {
  test('three groups, ten entries, in this order', () => {
    expect(navGroups.map((g) => g.heading)).toEqual(['NOW', 'BUILD', 'TRACK'])
    expect(navGroups.flatMap((g) => g.items.map((i) => i.to))).toEqual([
      '/dashboard',
      '/calendar',
      '/reviews',
      '/projects',
      '/goals',
      '/backlog',
      '/notes',
      '/finances',
      '/body',
      '/languages',
    ])
  })

  test('the dashboard is called Today', () => {
    expect(navGroups[0].items[0].label).toBe('Today')
  })

  test('nothing removed on 15 Sep is listed', () => {
    const all = navGroups.flatMap((g) => g.items.map((i) => i.to))
    for (const gone of [
      '/quests',
      '/knowledge',
      '/principles',
      '/career',
      '/social',
      '/style',
      '/money',
      '/portuguese',
    ]) {
      expect(all).not.toContain(gone)
    }
  })

  test('only TRACK wears area colour', () => {
    for (const group of navGroups) {
      for (const item of group.items) {
        expect(item.area !== undefined).toBe(group.heading === 'TRACK')
      }
    }
  })

  test('mobile: five, Today first, More last', () => {
    expect(mobileNav.map((i) => i.label)).toEqual([
      'Today',
      'Calendar',
      'Projects',
      'Notes',
      'More',
    ])
  })
})
