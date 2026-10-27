import { useState } from 'react'
import { ConvexReactClient } from 'convex/react'
import { ConvexProviderWithClerk } from 'convex/react-clerk'
import { ConvexQueryCacheProvider } from 'convex-helpers/react/cache/provider'
import { useAuth } from '@clerk/tanstack-react-start'

import { announceDemo } from '@/lib/demoRefused'

/* ConvexProviderWithClerk — not the bare ConvexProvider the scaffold ships.
   It hands Clerk's JWT to every Convex call, which is what makes
   ctx.auth.getUserIdentity() return anything at all. With the bare provider the
   UI looks signed in while every requireUser() check on the backend sees an
   anonymous caller: a hole that stays invisible until someone else finds the
   deployment URL.

   The client is built lazily at render, not at module load, so a build never
   depends on a secret being present. Missing config fails loudly here rather
   than degrading to an unauthenticated client. */

function createClient() {
  const url = import.meta.env.VITE_CONVEX_URL as string | undefined
  if (!url) {
    throw new Error(
      'VITE_CONVEX_URL is not set. Run `npx convex dev` to create the ' +
        'deployment, which writes it into .env.local.',
    )
  }
  const client = new ConvexReactClient(url)
  /* The demo account's refusals are announced wherever they are caught
     (src/lib/demoRefused.ts). */
  type Call = (...args: Array<unknown>) => Promise<unknown>
  const announced =
    (call: Call): Call =>
    (...args) =>
      call(...args).catch((e: unknown) => {
        announceDemo(e)
        throw e
      })
  client.mutation = announced(client.mutation.bind(client) as Call)
  client.action = announced(client.action.bind(client) as Call)
  return client
}

export default function AppConvexProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [convex] = useState(createClient)

  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      {/* Keeps a page's query subscriptions open for a while after you leave
          it. Convex's own useQuery unsubscribes on unmount, so every sidebar
          click started from nothing: skeleton, then the page snapping in
          ~60ms later. With the subscription still live, going back renders
          the data on the first frame — and it is still reactive, not a
          stale copy. Screens import useQuery from
          convex-helpers/react/cache/hooks; eslint enforces it. */}
      <ConvexQueryCacheProvider>{children}</ConvexQueryCacheProvider>
    </ConvexProviderWithClerk>
  )
}
