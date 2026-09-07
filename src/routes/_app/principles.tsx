import { createFileRoute } from '@tanstack/react-router'

import { Placeholder } from '@/components/shell/Placeholder'

export const Route = createFileRoute('/_app/principles')({
  component: () => <Placeholder title="Principles" phase="Phase 6" />,
})
