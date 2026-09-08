import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { auth } from '@clerk/tanstack-react-start/server'

import { Ambient } from '@/components/shell/Ambient'
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
    <div className="flex min-h-dvh flex-col">
      <Ambient />
      <TopBar />
      <div className="relative z-10 grid flex-1 gap-5 px-[18px] pt-5 pb-24 lg:grid-cols-[214px_minmax(0,1fr)] lg:px-6 lg:pb-[26px]">
        <SideNav />
        <main className="min-w-0">
          <Outlet />
        </main>
      </div>
      <MobileNav />
    </div>
  )
}
