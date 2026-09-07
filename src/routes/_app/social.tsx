import { createFileRoute } from '@tanstack/react-router'

import { Placeholder } from '@/components/shell/Placeholder'

export const Route = createFileRoute('/_app/social')({
  component: () => <Placeholder title="Social" phase="Phase 7+" />,
})
