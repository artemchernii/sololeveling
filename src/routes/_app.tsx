import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { auth } from '@clerk/tanstack-react-start/server'

import { MobileNav } from '@/components/shell/MobileNav'
import { SideNav } from '@/components/shell/SideNav'
import { TopBar } from '@/components/shell/TopBar'

/* Guard runs on the server (PLAN.md §1: "Clerk guard in beforeLoad"), so an
   unauthenticated request never renders the shell at all. This checks only
   that *someone* is signed in — proving it is the owner is the backend's job,
   via requireOwner() in convex/auth.ts on every mutation and private query. */
const getAuthState = createServerFn({ method: 'GET' }).handler(async () => {
  const { userId } = await auth()
  return { userId }
})

export const Route = createFileRoute('/_app')({
  beforeLoad: async () => {
    const { userId } = await getAuthState()
    if (!userId) {
      throw redirect({ to: '/login' })
    }
    return { userId }
  },
  component: AppShell,
})

function AppShell() {
  return (
    <div className="flex min-h-dvh gap-[18px] p-[18px] pb-20 lg:pb-[18px]">
      <SideNav />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
      <MobileNav />
    </div>
  )
}
