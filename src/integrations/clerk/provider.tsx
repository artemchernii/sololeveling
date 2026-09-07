import { ClerkProvider } from '@clerk/tanstack-react-start'

/* Must sit OUTSIDE the Convex provider: ConvexProviderWithClerk calls Clerk's
   useAuth(), which needs this context above it. */
export default function AppClerkProvider({
  children,
}: {
  children: React.ReactNode
}) {
  return <ClerkProvider>{children}</ClerkProvider>
}
