import { createFileRoute } from '@tanstack/react-router'

import { Placeholder } from '@/components/shell/Placeholder'

export const Route = createFileRoute('/_app/dashboard')({
  component: () => <Placeholder title="Dashboard" phase="Phase 2" />,
})
