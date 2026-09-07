import { createFileRoute } from '@tanstack/react-router'

import { Placeholder } from '@/components/shell/Placeholder'

export const Route = createFileRoute('/_app/projects')({
  component: () => <Placeholder title="Projects" phase="Phase 4" />,
})
