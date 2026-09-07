import { createFileRoute } from '@tanstack/react-router'

import { Placeholder } from '@/components/shell/Placeholder'

export const Route = createFileRoute('/_app/money')({
  component: () => <Placeholder title="Money" phase="Phase 7+" />,
})
