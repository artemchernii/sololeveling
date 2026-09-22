import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from 'convex-helpers/react/cache/hooks'

import { api } from '../../../convex/_generated/api'
import { LanguagePanel } from '@/components/languages/LanguagePanel'
import { areaVars } from '@/lib/areas'

/* Languages (R6b-b). A tab per area ticked as a language in Settings, in
   `areas.order`, wearing its own colour.

   `api.areas.list({})` already excludes retired areas, which matters here:
   `areas.retire` deliberately leaves `track` set (so restoring the area
   brings its tab straight back), so filtering `track === 'language'` against
   a list that *included* retired rows would put a retired language's tab
   back on its own, with no restore. Passing `includeRetired: true` here would
   be exactly that bug.

   The selected tab lives in component state only — no route param, because
   nothing has asked this page to be linkable to one language yet. */
export function LanguageTabs() {
  const areas = useQuery(api.areas.list, {})
  const [selected, setSelected] = useState<string | undefined>(undefined)

  if (areas === undefined) return null

  const languages = areas.filter((a) => a.track === 'language')

  if (languages.length === 0) {
    return (
      <p className="text-[13px] text-ink-500">
        No area is marked as a language yet. Tick "Language" on an area's row in{' '}
        <Link
          to="/settings"
          className="text-lav-300 underline decoration-lav-500/40 underline-offset-2 transition-colors hover:text-lav-200"
        >
          Settings
        </Link>{' '}
        and it gets its own tab here.
      </p>
    )
  }

  const active = languages.find((a) => a.slug === selected) ?? languages[0]

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap gap-1.5">
        {languages.map((a) => {
          const on = a.slug === active.slug
          return (
            <button
              key={a.slug}
              type="button"
              onClick={() => setSelected(a.slug)}
              aria-pressed={on}
              style={areaVars(a.slug)}
              className={`motion-press rounded-full px-3 py-1.5 font-mono text-[11px] tracking-[0.14em] uppercase ring-1 transition-colors ${
                on
                  ? 'bg-(--area)/20 text-(--area) ring-(--area)/45'
                  : 'text-ink-600 ring-lift/10 hover:text-(--area) hover:ring-(--area)/30'
              }`}
            >
              {a.label}
            </button>
          )
        })}
      </div>

      {/* Keyed on the slug so switching tabs unmounts the old panel rather
          than reusing it with new props — the panel for a tab that is not
          selected does not need to be mounted, let alone hold its queries
          open in the background. */}
      <LanguagePanel
        key={active.slug}
        slug={active.slug}
        label={active.label}
      />
    </div>
  )
}
