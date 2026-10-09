import { useEffect } from 'react'
import {
  ClerkLoaded,
  ClerkLoading,
  SignIn,
  useAuth,
} from '@clerk/tanstack-react-start'
import { createFileRoute, useNavigate } from '@tanstack/react-router'

import { SystemWait } from '@/components/shell/SystemWait'

export const Route = createFileRoute('/login')({ component: Login })

/* Until Clerk has answered, the System window says what is happening (9
   Oct) — the logo alone on a dark page read as nothing going on. Signed in
   already: straight to Today. Not signed in: Clerk's form. */
function Login() {
  const { isLoaded, isSignedIn } = useAuth()
  const navigate = useNavigate()
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
                <span
                  className="size-3.5 rounded-[4px] bg-lav-500"
                  aria-hidden
                />
                <span className="text-[11px] font-medium tracking-[0.2em]">
                  SOLO LEVELING
                </span>
              </div>
              <SignIn routing="hash" />
            </div>
          </ClerkLoaded>
        </>
      )}
    </div>
  )
}
