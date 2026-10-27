import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import {
  ClerkLoaded,
  ClerkLoading,
  SignIn,
  useAuth,
} from '@clerk/tanstack-react-start'
import { createFileRoute, useNavigate } from '@tanstack/react-router'

import { DELETED_KEY } from '@/components/settings/DeleteAccount'
import { SystemWait } from '@/components/shell/SystemWait'

export const Route = createFileRoute('/login')({ component: Login })

/* Until Clerk has answered, the System window says what is happening (9
   Oct) — the logo alone on a dark page read as nothing going on. Signed in
   already: straight to Today. Not signed in: Clerk's form. */
function Login() {
  const { isLoaded, isSignedIn } = useAuth()
  const navigate = useNavigate()
  /* R8 · S3b: after a guest's DELETE ALL, once, what went. */
  const [deleted, setDeleted] = useState<{
    rows: number
    files: number
    more?: boolean
  } | null>(null)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DELETED_KEY)
      if (raw === null) return
      sessionStorage.removeItem(DELETED_KEY)
      setDeleted(JSON.parse(raw))
    } catch {
      /* Nothing to say then. */
    }
  }, [])
  useEffect(() => {
    if (isLoaded && isSignedIn)
      void navigate({ to: '/dashboard', replace: true })
  }, [isLoaded, isSignedIn, navigate])

  /* The server already says whether he is signed in; Clerk's form needs
     its own script too, and until that arrives the form is empty. */
  return (
    <div className="grid min-h-dvh place-items-center p-6">
      {isLoaded && isSignedIn ? (
        <SystemWait
          title="signing in"
          lines={[
            { text: 'found your session', done: true },
            { text: 'opening Today', done: false },
          ]}
        />
      ) : (
        <>
          <ClerkLoading>
            <SystemWait
              title="signing in"
              lines={[{ text: 'checking your session', done: false }]}
            />
          </ClerkLoading>
          <ClerkLoaded>
            <div className="motion-arrive flex flex-col items-center gap-8">
              <div className="flex items-center gap-[9px]">
                <img
                  src="/logo.svg"
                  alt=""
                  aria-hidden
                  className="size-6 rounded-[6px]"
                />
                <span className="text-[11px] font-medium tracking-[0.2em]">
                  SOLO LEVELING
                </span>
              </div>
              {deleted ? (
                <div
                  role="status"
                  className="flex items-center gap-2 font-mono text-[11px] tracking-[0.14em] text-state-good"
                >
                  <span className="motion-pop grid size-5 place-items-center rounded-full bg-state-good text-ink-900">
                    <Check className="size-3" strokeWidth={3} />
                  </span>
                  DELETED · {deleted.rows}
                  {deleted.more ? '+' : ''} ROWS · {deleted.files} FILES ·
                  ACCOUNT
                </div>
              ) : null}
              <SignIn routing="hash" />
            </div>
          </ClerkLoaded>
        </>
      )}
    </div>
  )
}
