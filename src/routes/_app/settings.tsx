import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex-helpers/react/cache/hooks'

import { api } from '../../../convex/_generated/api'
import { Skeleton } from '@/components/Skeleton'
import { useTheme } from '@/integrations/theme/provider'
import { PALETTES, PREFERENCES } from '@/lib/theme'
import { useHeld } from '@/lib/loading'

export const Route = createFileRoute('/_app/settings')({
  component: Settings,
})

/* Settings proper is Phase 6. The one thing it carries now is the ownerId,
   because it is the only place that value is observable: every row in the
   database is scoped by it, and seeding a deployment's principles needs it
   typed into the CLI. Convex documents the token identifier as opaque, so it
   is read here rather than assembled from an issuer and a Clerk user id. */
function Settings() {
  const ownerId = useHeld(useQuery(api.auth.whoami))

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="glass flex flex-col gap-1 rounded-[22px] p-6">
        <div className="label-caps">Phase 6</div>
        <h1 className="text-[28px] font-light text-foreground">Settings</h1>
      </div>

      <Appearance />

      <div className="glass flex flex-col gap-2 rounded-[22px] p-6">
        <div className="label-caps">Owner ID</div>
        <code className="font-mono text-[12.5px] break-all text-ink-300">
          {ownerId === undefined ? (
            <span
              role="status"
              aria-label="Loading"
              className="flex h-5 items-center"
            >
              <Skeleton className="w-3/4" />
            </span>
          ) : (
            (ownerId ?? 'Not signed in')
          )}
        </code>
        <p className="text-[12.5px] text-ink-600">
          Every row you create is scoped to this. It is the argument{' '}
          <code className="font-mono">seed:run</code> takes.
        </p>
      </div>
    </div>
  )
}

/* System follows the device — macOS and iOS "Auto" switch at sunset — and
   Light or Dark overrides it on this device only (lib/theme.ts). */
function Appearance() {
  const { preference, setPreference, palette, setPalette, resolved } =
    useTheme()

  return (
    <div className="glass flex flex-col gap-4 rounded-[22px] p-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <div className="label-caps">Appearance</div>
          <div className="label-caps">showing {resolved}</div>
        </div>
        <Segmented
          label="Theme"
          options={PREFERENCES.map((value) => ({
            value,
            label:
              value === 'system'
                ? 'System'
                : value === 'light'
                  ? 'Light'
                  : 'Dark',
          }))}
          value={preference}
          onChange={setPreference}
        />
        <p className="text-[12.5px] text-ink-600">
          System follows this device, so the app turns light and dark with it.
          The choice is saved on this device only.
        </p>
      </div>

      <div className="flex flex-col gap-2 border-t border-lift/[0.07] pt-4">
        <div className="label-caps">Light palette · on trial</div>
        <Segmented
          label="Light palette"
          options={PALETTES}
          value={palette}
          onChange={setPalette}
        />
        <p className="text-[12.5px] text-ink-600">
          Three candidates to live with before one is kept.{' '}
          {resolved === 'dark'
            ? 'Switch the theme to Light to see them.'
            : 'Changes apply at once.'}
        </p>
      </div>
    </div>
  )
}

function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: Array<{ value: T; label: string }>
  value: T
  onChange: (next: T) => void
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex flex-wrap gap-1.5"
    >
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={`motion-press rounded-full px-3.5 py-1.5 text-[12.5px] ${
              selected
                ? 'bg-lift/[0.12] text-foreground ring-1 ring-lift/25'
                : 'bg-lift/[0.05] text-ink-400 ring-1 ring-lift/10 hover:text-ink-200'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
