import { useState } from 'react'
import { useAction } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'

/* The years before the loaded one, for the share "all" is pressed on
   (13 Oct: "i zoom out and see gaps like we never show older chart").
   Nothing is read or loaded until the press; then Yahoo is asked once
   (priceYears.read) and the stored years are loaded for this page. */
export function useOlderYears(instrumentId: Id<'instruments'>) {
  const read = useAction(api.priceYears.read)
  const [at, setAt] = useState<{
    id: Id<'instruments'>
    state: 'reading' | 'stored' | 'failed'
  } | null>(null)
  const state = at?.id === instrumentId ? at.state : 'idle'
  const older = useQuery(
    api.priceYears.line,
    state === 'stored' ? { instrumentId } : 'skip',
  )
  return {
    older,
    reading: state === 'reading' || (state === 'stored' && !older),
    failed: state === 'failed',
    /** True once the years are stored; false when Yahoo did not answer. */
    ask: async () => {
      if (state === 'stored') return true
      setAt({ id: instrumentId, state: 'reading' })
      const got = await read({ instrumentId }).catch(() => 'failed' as const)
      setAt({ id: instrumentId, state: got === 'failed' ? 'failed' : 'stored' })
      return got !== 'failed'
    },
  }
}
