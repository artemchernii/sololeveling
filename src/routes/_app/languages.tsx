import { createFileRoute } from '@tanstack/react-router'

import { Placeholder } from '@/components/shell/Placeholder'

/* Portuguese until 15 Sep. Portuguese · English · German arrive in R6, with
   the `languages` area and its migration. */
export const Route = createFileRoute('/_app/languages')({
  component: () => <Placeholder title="Languages" phase="R6" />,
})
