import { createFileRoute, redirect } from '@tanstack/react-router'

/* There is no marketing page. The root goes straight to the morning screen;
   /_app's beforeLoad bounces to /login when signed out. */
export const Route = createFileRoute('/')({
  beforeLoad: () => {
    throw redirect({ to: '/dashboard' })
  },
})
