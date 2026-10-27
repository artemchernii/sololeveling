import { useQuery } from 'convex-helpers/react/cache/hooks'

import { api } from '../../convex/_generated/api'

/* R8 · S3a (27 Oct, his "guest = did the first run"): someone with a
   profile row is a guest, and the pieces that are Artem's — Finances, his
   LEVEL, his shake/post/commits/worth, his Body photo, spent and worth on
   Review — stay off their screens (mockup design/firstrun-mockup/guest.html).
   False while loading, so his own screens never wait on it. */
export function useGuest(): boolean {
  return useQuery(api.profiles.mine, {})?.guest === true
}
