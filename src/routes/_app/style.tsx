import { createFileRoute } from '@tanstack/react-router'

import { Placeholder } from '@/components/shell/Placeholder'

export const Route = createFileRoute('/_app/style')({
  component: () => <Placeholder title="Style" phase="Phase 7+" />,
})
