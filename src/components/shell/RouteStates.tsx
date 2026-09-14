import { useAuth } from '@clerk/tanstack-react-start'
import { Link, useRouter } from '@tanstack/react-router'
import type { ErrorComponentProps } from '@tanstack/react-router'
import { ArrowRight, RotateCw } from 'lucide-react'

import { isSignedOut } from '@/lib/convex-errors'

/* What a page shows when there is no page, and when the page broke. Both are
   rendered where the page would have been — inside the shell, under the
   sidebar — so one bad URL or one crashing query never takes navigation down
   with it.

   A missing *record* is neither of these. "No such chain" and "No such note"
   are ordinary answers from their own pages, and stay quiet there. */

/* Neutral, not lavender: the accent means live and focus (§3), and nothing
   here is either. */
const ACTION =
  'motion-press inline-flex items-center gap-1.5 rounded-[8px] border border-lift/10 px-3 py-1.5 text-[12.5px] text-ink-300 hover:border-lift/20 hover:text-foreground'

export function NotFound() {
  return (
    <div className="glass flex flex-col items-start gap-3 rounded-[22px] p-6">
      <div className="label-caps">Not found</div>
      <h1 className="text-[22px] font-light text-foreground">
        This page doesn&rsquo;t exist.
      </h1>
      <Link to="/dashboard" className={ACTION}>
        Go to Today
        <ArrowRight className="size-3.5" />
      </Link>
    </div>
  )
}

export function PageCrash({ error, reset }: ErrorComponentProps) {
  const router = useRouter()
  const { isSignedIn } = useAuth()

  /* A query refused because the session ended is not a broken page. The
     shell's SessionGuard is already on its way to /login; showing "Something
     broke" for the frame in between would be a false alarm. Only when Clerk
     agrees nobody is signed in — if it still thinks someone is, this is a real
     fault and says so. */
  if (isSignedOut(error) && isSignedIn === false) return null

  return (
    <div
      role="alert"
      className="glass flex flex-col items-start gap-3 rounded-[22px] p-6"
    >
      <div className="label-caps">Error</div>
      <h1 className="text-[22px] font-light text-foreground">
        Something broke on this page.
      </h1>
      <p className="text-[13px] text-ink-500">
        The rest of the app is fine. Nothing you had saved is lost.
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            /* Re-run the route's loading, then let the page mount again. A
               Convex query that failed for a passing reason subscribes afresh
               and usually comes back. */
            void router.invalidate()
            reset()
          }}
          className={ACTION}
        >
          <RotateCw className="size-3.5" />
          Try again
        </button>
        <Link to="/dashboard" className={ACTION}>
          Go to Today
        </Link>
      </div>

      {/* The words for whoever fixes it, folded away from whoever doesn't
          need them. */}
      <details className="w-full border-t border-lift/[0.07] pt-3">
        <summary className="label-caps cursor-pointer select-none hover:text-ink-300">
          What went wrong
        </summary>
        <pre className="mt-2 font-mono text-[11.5px] break-words whitespace-pre-wrap text-ink-500">
          {error instanceof Error ? error.message : String(error)}
        </pre>
      </details>
    </div>
  )
}
