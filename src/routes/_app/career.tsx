import { createFileRoute } from '@tanstack/react-router'

import { Placeholder } from '@/components/shell/Placeholder'

export const Route = createFileRoute('/_app/career')({
  component: () => <Placeholder title="Career" phase="Phase 7+" />,
})
