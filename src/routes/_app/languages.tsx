import { createFileRoute } from '@tanstack/react-router'

import { LanguageTabs } from '@/components/languages/LanguageTabs'

/* Languages (R6b-b). A tab per area ticked as a language in Settings, not a
   fixed Portuguese/English/German three — which is the whole reason this page
   waited for R6 to make areas data he edits. */
export const Route = createFileRoute('/_app/languages')({
  component: LanguageTabs,
})
