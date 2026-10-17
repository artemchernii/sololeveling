import { useEffect } from 'react'
import { useMutation } from 'convex/react'

import { api } from '../../../convex/_generated/api'

const EVERY = 2 * 3_600_000

/* While Finances is open, prices are asked for again every 2 hours
   (13 Oct; half an hour until 17 Oct). The backend decides whether a
   reading is due; a hidden tab does not ask. */
export function useFreshPrices() {
  const refresh = useMutation(api.prices.refresh)
  useEffect(() => {
    const ask = () => {
      if (!document.hidden) void refresh({}).catch(() => undefined)
    }
    ask()
    const timer = setInterval(ask, EVERY)
    document.addEventListener('visibilitychange', ask)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', ask)
    }
  }, [refresh])
}
