import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { NotFound, PageCrash } from './components/shell/RouteStates'

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    /* Every route gets these unless it names its own. An error is caught by
       the nearest route, so a crash in a page renders in the shell's outlet
       and the sidebar stays; see components/shell/RouteStates.tsx. */
    defaultErrorComponent: PageCrash,
    defaultNotFoundComponent: NotFound,
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
