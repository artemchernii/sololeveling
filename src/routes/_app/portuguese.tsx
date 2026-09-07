import { createFileRoute } from '@tanstack/react-router'

import { Placeholder } from '@/components/shell/Placeholder'

export const Route = createFileRoute('/_app/portuguese')({
  component: () => <Placeholder title="Portuguese" phase="Phase 7+" />,
})
