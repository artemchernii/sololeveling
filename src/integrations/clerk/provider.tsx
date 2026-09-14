import { ClerkProvider } from '@clerk/tanstack-react-start'
import { dark } from '@clerk/themes'

import { useTheme } from '@/integrations/theme/provider'
import type { LightPalette } from '@/lib/theme'

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

/* The light palettes' equivalents, per palette (tokens.css, 7), for the same
   reason as above: Clerk derives its variants from literal colours. */
const LIGHT: Record<LightPalette, typeof NOCTURNE> = {
  milky: {
    ground: '#f4f0e9',
    panel: '#fbf9f5',
    surface: '#ece8e1',
    text: '#26232f',
    accent: '#6e5bc8',
  },
  paper: {
    ground: '#eef0f4',
    panel: '#fdfdfe',
    surface: '#eff1f5',
    text: '#1f2330',
    accent: '#6e5bc8',
  },
  dusk: {
    ground: '#d6d2e0',
    panel: '#e8e5f0',
    surface: '#ddd9e7',
    text: '#27233a',
    accent: '#6e5bc8',
  },
}

export default function AppClerkProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const { resolved, palette } = useTheme()
  const colors = resolved === 'dark' ? NOCTURNE : LIGHT[palette]

  return (
    <ClerkProvider
      appearance={{
        /* Clerk's default is its light theme, so light needs no base. */
        theme: resolved === 'dark' ? dark : undefined,
        variables: {
          colorBackground: colors.panel,
          colorPrimary: colors.accent,
          colorForeground: colors.text,
          colorInput: colors.surface,
          colorInputForeground: colors.text,
          colorModalBackdrop: colors.ground,
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
