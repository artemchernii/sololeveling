import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex-helpers/react/cache/hooks'

import { api } from '../../../convex/_generated/api'
import { SkeletonRows } from '@/components/Skeleton'
import { useArrived, useHeld } from '@/lib/loading'

export const Route = createFileRoute('/_app/principles')({
  component: Principles,
})

/* The six lines from the source brief §16, in order. Read-only on purpose
   (§3b.5): they are seeded once and they are the only fixture data this app
   has. A principle you can edit from a screen at 2am is a mood. */
function Principles() {
  const principles = useHeld(useQuery(api.principles.list, {}))
  const arrived = useArrived(principles)

  return (
    <div className="flex flex-col gap-[18px]">
      <div>
        <h1 className="text-[22px] text-foreground">Principles</h1>
        <p className="label-caps">Six lines. They do not change.</p>
      </div>

      {principles === undefined ? (
        /* Six is known: they are the six lines. */
        <div className="glass rounded-[22px] p-2">
          <SkeletonRows
            rows={6}
            rowClassName="px-4 py-4"
            line="h-[26px]"
            bar="h-3.5"
          />
        </div>
      ) : principles.length === 0 ? (
        <div className={`glass rounded-[22px] p-5 ${arrived}`}>
          <p className="text-[13px] text-ink-500">
            Nothing seeded yet. These six lines are written once from the CLI —
            <code className="mx-1 font-mono text-[12px] text-ink-400">
              npx convex run seed:run
            </code>
            with the ownerId shown on Settings.
          </p>
        </div>
      ) : (
        <div className={`glass flex flex-col rounded-[22px] p-2 ${arrived}`}>
          {principles.map((principle, index) => (
            <div
              key={principle._id}
              className="flex items-baseline gap-4 border-b border-white/[0.05] px-4 py-4 last:border-b-0"
            >
              <span className="font-mono text-[11px] text-ink-700">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="text-[17px] font-light text-foreground">
                {principle.text}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
