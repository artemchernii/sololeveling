import { useCallback, useEffect, useState } from 'react'
import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { auth } from '@clerk/tanstack-react-start/server'

import { Ambient } from '@/components/shell/Ambient'
import { MobileActions } from '@/components/shell/MobileActions'
import { MobileNav } from '@/components/shell/MobileNav'
import { QuickCapture } from '@/components/shell/QuickCapture'
import { SearchPalette } from '@/components/shell/SearchPalette'
import { SideNav } from '@/components/shell/SideNav'
import { TopBar } from '@/components/shell/TopBar'

/* Guard runs on the server (PLAN.md §1: "Clerk guard in beforeLoad"), so an
   unauthenticated request never renders the shell at all. This checks only
   that *someone* is signed in — deciding whose rows they may touch is the
   backend's job, via requireUser() in convex/auth.ts on every function. */
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

/* One overlay, not two booleans. Search and Log are separate modals with
   opposite Enter keys, but only ever one of them is on screen: two independent
   flags is how you end up with both open, stacked, and two Escapes deep.

   The shortcut lives here for the same reason it always did — the topbar's
   button and the mobile pill must not each own a copy that listens for ⌘K and
   cancels the other out. ⌘K now opens Search, whose first row is Log, so
   capture is still two keystrokes away. */
type Overlay = 'search' | 'capture' | null

function AppShell() {
  const [overlay, setOverlay] = useState<Overlay>(null)
  const [capturePrefill, setCapturePrefill] = useState('')

  /* `/log workout 60` hands the rest of the line over, so capture opens with
     it already typed and the parser stays the only one in the app. */
  const openCapture = useCallback((prefill = '') => {
    setCapturePrefill(prefill)
    setOverlay('capture')
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOverlay((current) => (current === null ? 'search' : null))
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="flex min-h-dvh flex-col">
      <Ambient />
      <TopBar
        onLog={() => openCapture()}
        onSearch={() => setOverlay('search')}
      />
      <div className="relative z-10 grid flex-1 gap-5 px-[18px] pt-5 pb-[calc(150px+env(safe-area-inset-bottom))] md:pb-24 lg:grid-cols-[214px_minmax(0,1fr)] lg:px-6 lg:pb-[26px]">
        <SideNav />
        <main className="min-w-0">
          <Outlet />
        </main>
      </div>
      <MobileActions
        onLog={() => openCapture()}
        onSearch={() => setOverlay('search')}
      />
      <MobileNav />
      <SearchPalette
        open={overlay === 'search'}
        onOpenChange={(next) => setOverlay(next ? 'search' : null)}
        onLog={openCapture}
      />
      <QuickCapture
        open={overlay === 'capture'}
        onOpenChange={(next) => setOverlay(next ? 'capture' : null)}
        initialInput={capturePrefill}
      />
    </div>
  )
}
