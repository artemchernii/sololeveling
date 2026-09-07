import { createFileRoute } from '@tanstack/react-router'

import { Placeholder } from '@/components/shell/Placeholder'

export const Route = createFileRoute('/_app/calendar')({
  component: () => <Placeholder title="Calendar" phase="Phase 5" />,
})
