import { createFileRoute } from '@tanstack/react-router'

import { Placeholder } from '@/components/shell/Placeholder'

export const Route = createFileRoute('/_app/reviews')({
  component: () => <Placeholder title="Weekly review" phase="Phase 6" />,
})
