import { createFileRoute } from '@tanstack/react-router'

import { Placeholder } from '@/components/shell/Placeholder'

export const Route = createFileRoute('/_app/body')({
  component: () => <Placeholder title="Body" phase="Phase 7+" />,
})
