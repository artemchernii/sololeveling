import { createFileRoute } from '@tanstack/react-router'

import { Placeholder } from '@/components/shell/Placeholder'

export const Route = createFileRoute('/_app/settings')({
  component: () => <Placeholder title="Settings" phase="Phase 6" />,
})
