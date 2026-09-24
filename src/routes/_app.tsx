import { useCallback, useEffect, useState } from 'react'
import {
  Outlet,
  createFileRoute,
  redirect,
  useRouterState,
} from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { auth } from '@clerk/tanstack-react-start/server'

import { Ambient } from '@/components/shell/Ambient'
import { AreaStyles } from '@/components/shell/AreaStyles'
import { MobileActions } from '@/components/shell/MobileActions'
import { MobileNav } from '@/components/shell/MobileNav'
import { QuickCapture } from '@/components/shell/QuickCapture'
import { SearchPalette } from '@/components/shell/SearchPalette'
import { SessionGuard } from '@/components/shell/SessionGuard'
import { SideNav } from '@/components/shell/SideNav'
import { TopBar } from '@/components/shell/TopBar'
import { WriteFailureNotice } from '@/components/shell/WriteFailureNotice'
import { ReminderWatcher } from '@/components/shell/ReminderWatcher'

/* Guard runs on the server (PLAN.md §1: "Clerk guard in beforeLoad"), so an
   unauthenticated request never renders the shell at all. This checks only
   that *someone* is signed in — deciding whose rows they may touch is the
   backend's job, via requireUser() in convex/auth.ts on every function. */
const getAuthState = createServerFn({ method: 'GET' }).handler(async () => {
  const { userId } = await auth()
  return { userId }
})

/* The Clerk instance the browser already holds, typed only as far as this
   guard reads it. */
type LoadedClerk = { loaded: boolean; user: { id: string } | null | undefined }

/* beforeLoad runs on every navigation between the app's pages, not only the
   first. Asking the server each time held the old page on screen for a round
   trip (40–100ms locally, more from a Worker) before the new one snapped in —
   the jump on every sidebar click. Once Clerk has loaded in the browser it
   already knows who is signed in, so the server is asked only when it has
   not: the first, server-rendered request. */
function signedInLocally(): { userId: string | null } | null {
  if (typeof window === 'undefined') return null
  const clerk = (window as { Clerk?: LoadedClerk }).Clerk
  if (!clerk?.loaded) return null
  return { userId: clerk.user?.id ?? null }
}

export const Route = createFileRoute('/_app')({
  /* The app's pages are not rendered on the server (20 Sep). The server does
     not know what time it is where you are, and behind Clerk it does not know
     who you are either: it rendered "Good evening, YOU." and SAT, SEP 19 while
     the browser rendered "Good morning, ARTEM." and SUN, SEP 20. Three
     mismatched strings and React throws the whole server tree away and builds
     the page again — that is the blink on refresh, and it comes and goes with
     the hour because it needs the two clocks to straddle a boundary.

     'data-only' rather than false: beforeLoad still runs on the server, so the
     Clerk guard below keeps deciding before a byte of shell is sent (PLAN.md
     §1). Only the rendering moves to the browser. Nothing is lost by that —
     every number on these pages arrives over a Convex socket that does not
     exist during SSR, so the server could only ever paint skeletons. It now
     sends the skeletons as the shell, and the client fills them exactly as it
     always did. Child routes inherit this; a route may narrow it to false,
     never widen it. */
  ssr: 'data-only',
  beforeLoad: async () => {
    const { userId } = signedInLocally() ?? (await getAuthState())
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
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const [capturePrefill, setCapturePrefill] = useState('')

  /* `/log workout 60` hands the rest of the line over, so capture opens with
     it already typed and the parser stays the only one in the app. */
  const openCapture = useCallback((prefill = '') => {
    setCapturePrefill(prefill)
    setOverlay('capture')
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return
      const key = e.key.toLowerCase()
      if (key === 'k') {
        e.preventDefault()
        setOverlay((current) => (current === null ? 'search' : null))
      }
      /* ⌘L opens Log, chosen over a bare L (13 Sep). It is the browser's
         "jump to the address bar", so on this app that is given up — a page
         can take it in Chromium, and in the installed PWA there is no address
         bar to lose. From Search it switches straight to Log rather than
         stacking; pressed again inside Log, it closes, the way ⌘K does. */
      if (key === 'l') {
        e.preventDefault()
        setCapturePrefill('')
        setOverlay((current) => (current === 'capture' ? null : 'capture'))
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Declares --area-<slug> for every area (R6). Everything below that
          calls areaVars() reads one of them, so it goes first. */}
      <AreaStyles />
      <Ambient />
      <TopBar
        onLog={() => openCapture()}
        onSearch={() => setOverlay('search')}
      />
      <div className="relative z-10 grid flex-1 gap-5 px-[18px] pt-5 pb-[calc(150px+env(safe-area-inset-bottom))] md:pb-24 lg:grid-cols-[214px_minmax(0,1fr)] lg:px-6 lg:pb-[26px]">
        <SideNav />
        <main className="min-w-0">
          {/* Every page arrives the same way: a short fade, keyed by the
              path. Without it a page you had visited cut in on one frame while
              a first visit faded in after its skeleton — the same page
              arriving two ways, which read as a flicker. A page switch is
              something you caused (§3d.1), so it may move; only opacity does,
              so nothing reflows. */}
          <div key={pathname} className="motion-fade">
            <Outlet />
          </div>
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
      <WriteFailureNotice />
      <ReminderWatcher />
      <SessionGuard />
    </div>
  )
}
