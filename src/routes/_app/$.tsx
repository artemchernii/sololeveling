import { createFileRoute } from '@tanstack/react-router'

import { NotFound } from '@/components/shell/RouteStates'

/* Any URL no other page claims. It lives under _app, not at the root, so an
   unknown address still gets the sidebar — and still goes through the sign-in
   guard, so a signed-out visitor is sent to /login rather than told about
   pages they cannot see. */
export const Route = createFileRoute('/_app/$')({
  component: NotFound,
})
