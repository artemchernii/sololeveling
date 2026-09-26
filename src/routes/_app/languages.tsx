import { createFileRoute } from '@tanstack/react-router'

import { LanguageTabs } from '@/components/languages/LanguageTabs'
import { LANGUAGE_TABS } from '@/components/languages/LanguagePanel'
import type { LanguageTab } from '@/components/languages/LanguagePanel'

/* Languages (R6b-b). A tab per area ticked as a language in Settings, not a
   fixed Portuguese/English/German three — which is the whole reason this page
   waited for R6 to make areas data he edits. */
export const Route = createFileRoute('/_app/languages')({
  /* The panel's tab — Today, Learn, History — in the URL, like Body's, so
     a refresh keeps it. Today is the bare URL. */
  validateSearch: (search: Record<string, unknown>): { tab?: LanguageTab } =>
    typeof search.tab === 'string' &&
    search.tab !== 'today' &&
    LANGUAGE_TABS.includes(search.tab)
      ? { tab: search.tab as LanguageTab }
      : {},
  component: LanguageTabs,
})
