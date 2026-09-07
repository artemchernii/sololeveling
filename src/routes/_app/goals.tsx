import { createFileRoute } from '@tanstack/react-router'

import { Placeholder } from '@/components/shell/Placeholder'

export const Route = createFileRoute('/_app/goals')({
  component: () => <Placeholder title="Goals" phase="Phase 4" />,
})
