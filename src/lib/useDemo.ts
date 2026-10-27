import { useQuery } from 'convex-helpers/react/cache/hooks'

import { api } from '../../convex/_generated/api'

/* The demo account (27 Oct, docs/specs/2026-10-27-demo-account.md): his
   rooms with made-up rows, nothing saved. False while loading. */
export function useDemo(): boolean {
  return useQuery(api.profiles.mine, {})?.demo === true
}
