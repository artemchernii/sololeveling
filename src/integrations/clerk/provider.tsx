import { ClerkProvider } from '@clerk/tanstack-react-start'
import { dark } from '@clerk/themes'

/* Must sit OUTSIDE the Convex provider: ConvexProviderWithClerk calls Clerk's
   useAuth(), which needs this context above it.

   `@clerk/themes` is here for one reason: without a theme, every surface
   Clerk renders — the user popover, the sign-in card — uses its default light
   theme. On a near-black app that shows up as a grey card flashing in when the
   avatar is hovered, and as a white sign-in box on /login.

   The values below are literals rather than `var(--color-…)` because Clerk
   derives hover, border and alpha variants from each colour, and it cannot do
   that arithmetic on a CSS variable. They are copied from src/styles/tokens.css
   and are the only place in the app that repeats a token's value — if a token
   moves, this moves with it. */
const NOCTURNE = {
  ground: '#07070b', // --color-ground
  panel: '#161826', // --color-bg
  surface: '#232532', // --color-surface
  text: '#e9e9ed', // --color-text
  accent: '#968ae0', // --color-accent-500
}

export default function AppClerkProvider({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ClerkProvider
      appearance={{
        theme: dark,
        variables: {
          colorBackground: NOCTURNE.panel,
          colorPrimary: NOCTURNE.accent,
          colorForeground: NOCTURNE.text,
          colorInput: NOCTURNE.surface,
          colorInputForeground: NOCTURNE.text,
          colorModalBackdrop: NOCTURNE.ground,
          borderRadius: '10px',
        },
        elements: {
          /* The popover is a panel like any other panel in §3, so it gets the
             same corner radius as a card rather than Clerk's default. */
          userButtonPopoverCard: 'rounded-[18px]',
          card: 'rounded-[22px]',
        },
      }}
    >
      {children}
    </ClerkProvider>
  )
}
