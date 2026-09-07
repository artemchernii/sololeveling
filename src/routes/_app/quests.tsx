import { createFileRoute } from '@tanstack/react-router'

import { Placeholder } from '@/components/shell/Placeholder'

export const Route = createFileRoute('/_app/quests')({
  component: () => <Placeholder title="Quests" phase="Phase 3" />,
})
