import { useEffect } from 'react'
import { useAuth } from '@clerk/tanstack-react-start'
import { useNavigate } from '@tanstack/react-router'

/* _app's beforeLoad checks the session when you navigate, not while you sit on
   a page. A session that ends in between — signed out in another tab, or
   lapsed overnight on the phone — left the page mounted with every query now
   refused by requireUser(), and each one rendering as a crash.

   Clerk knows the moment it happens, so the shell listens and goes to /login.
   Renders nothing. */
export function SessionGuard() {
  const { isLoaded, isSignedIn } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      void navigate({ to: '/login', replace: true })
    }
  }, [isLoaded, isSignedIn, navigate])

  return null
}
