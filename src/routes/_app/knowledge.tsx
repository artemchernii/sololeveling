import { createFileRoute } from '@tanstack/react-router'

import { Placeholder } from '@/components/shell/Placeholder'

export const Route = createFileRoute('/_app/knowledge')({
  component: () => <Placeholder title="Knowledge" phase="Phase 7+" />,
})
