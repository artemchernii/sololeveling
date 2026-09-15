import { createFileRoute } from '@tanstack/react-router'

import { Placeholder } from '@/components/shell/Placeholder'

/* Money until 15 Sep. Investments, balances and spending arrive in R6. */
export const Route = createFileRoute('/_app/finances')({
  component: () => <Placeholder title="Finances" phase="R6" />,
})
