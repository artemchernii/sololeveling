import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex/react'

import { api } from '../../../convex/_generated/api'

export const Route = createFileRoute('/_app/settings')({
  component: Settings,
})

/* Settings proper is Phase 6. The one thing it carries now is the ownerId,
   because it is the only place that value is observable: every row in the
   database is scoped by it, and seeding a deployment's principles needs it
   typed into the CLI. Convex documents the token identifier as opaque, so it
   is read here rather than assembled from an issuer and a Clerk user id. */
function Settings() {
  const ownerId = useQuery(api.auth.whoami)

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="glass flex flex-col gap-1 rounded-[22px] p-6">
        <div className="label-caps">Phase 6</div>
        <h1 className="text-[28px] font-light text-foreground">Settings</h1>
      </div>

      <div className="glass flex flex-col gap-2 rounded-[22px] p-6">
        <div className="label-caps">Owner ID</div>
        <code className="font-mono text-[12.5px] break-all text-ink-300">
          {ownerId === undefined ? 'Reading…' : (ownerId ?? 'Not signed in')}
        </code>
        <p className="text-[12.5px] text-ink-600">
          Every row you create is scoped to this. It is the argument{' '}
          <code className="font-mono">seed:run</code> takes.
        </p>
      </div>
    </div>
  )
}
