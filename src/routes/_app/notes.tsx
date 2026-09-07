import { createFileRoute } from '@tanstack/react-router'

import { Placeholder } from '@/components/shell/Placeholder'

export const Route = createFileRoute('/_app/notes')({
  component: () => <Placeholder title="Notes" phase="Phase 6" />,
})
