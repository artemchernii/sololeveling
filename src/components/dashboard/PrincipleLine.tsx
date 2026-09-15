import { useQuery } from 'convex-helpers/react/cache/hooks'

import { api } from '../../../convex/_generated/api'
import { principleIndex } from '@/lib/principle-of-day'

/* One of the six lines, under the greeting. Read-only, like the page it
   replaced (§3b.5): they are seeded once and never edited from a screen.
   Renders nothing while loading or when nothing is seeded — a missing line
   is not worth a skeleton, and a fresh deployment says nothing rather than
   "no principles yet" on the morning screen. */
export function PrincipleLine({ date }: { date: Date }) {
  const principles = useQuery(api.principles.list, {})
  if (!principles || principles.length === 0) return null
  const line = principles[principleIndex(date, principles.length)]
  return <p className="text-[15px] font-light text-ink-300">{line.text}</p>
}
