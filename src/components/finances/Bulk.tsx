import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useQuery } from 'convex-helpers/react/cache/hooks'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { IntakeFlow } from '@/components/finances/Intake'
import type { SheetGuard } from '@/components/finances/Sheet'
import { BulkReading } from '@/components/finances/BulkReading'
import { Applying, Applied } from '@/components/finances/BulkSaving'
import { BulkReview } from '@/components/finances/BulkReview'

/* An update (3 Oct, as UPDATE ALL; since 10 Oct what every drop on ADD
   runs as). Artem: "When I simply drag and drop multiple csv/pdf files,
   you read and analyze which bank, what to update, I can review it and
   update state of finances." Journey and spec:
   docs/specs/2026-10-03-bulk-update*.md and 2026-10-10-one-update.md;
   mockups design/treasury-mockup/bulk.html and update.html. */

export type Flight = 'reading' | 'saving'

/* What closing would take out of sight (10 Oct). Reading and saving go on
   without the window; he is told so before it shuts. */
export const GUARD: Record<Flight, SheetGuard> = {
  reading: {
    title: 'Still reading',
    text: 'If you close it, reading goes on. ADD will show it is waiting, and it opens right here again.',
  },
  saving: {
    title: 'Still saving',
    text: 'If you close it, the save finishes by itself.',
  },
}

/* An update from its files to what landed. The drop area is its host's:
   ADD brings its own (10 Oct — one door), a history opened from the
   Overview strip has none. */
export function BulkUpdate({
  waiting,
  onClose,
  onFlight,
  dropArea,
}: {
  waiting: Id<'batches'> | null
  onClose: () => void
  /** Told what is in flight, so the sheet around it can ask before closing. */
  onFlight?: (flight: Flight | null) => void
  /** What shows when no update is open: where files are dropped. */
  dropArea?: (
    onStarted: (id: Id<'batches'>) => void,
    onBusy: (busy: boolean) => void,
  ) => ReactNode
}) {
  const [mine, setMine] = useState<Id<'batches'> | null>(null)
  const batchId = mine ?? waiting
  const view = useQuery(api.intake.batch, batchId ? { batchId } : 'skip')
  const [checking, setChecking] = useState<Id<'intakes'> | null>(null)
  /* Whether this sheet saw the apply through. */
  const [pressed, setPressed] = useState(false)
  const [uploading, setUploading] = useState(false)
  const reading = view?.files.some((f) => f.status === 'reading') ?? false
  const flight: Flight | null =
    view?.status === 'applying'
      ? 'saving'
      : uploading || reading
        ? 'reading'
        : null
  useEffect(() => {
    onFlight?.(flight)
    return () => onFlight?.(null)
  }, [flight, onFlight])
  /* A save watched to its end lands here, whoever pressed apply — this
     window or one closed since (10 Oct: he came back to a bare drop
     area, with no word on what was saved). */
  const applying = view?.status === 'applying'
  useEffect(() => {
    if (!applying || batchId === null) return
    setPressed(true)
    setMine(batchId)
  }, [applying, batchId])
  const drop = dropArea ? (
    dropArea(setMine, setUploading)
  ) : (
    <p className="py-6 text-center text-[13.5px] text-ink-400">
      Nothing is waiting here.
    </p>
  )

  if (checking) {
    return (
      <IntakeFlow
        intakeId={checking}
        onBack={() => setChecking(null)}
        onDone={() => setChecking(null)}
      />
    )
  }
  if (batchId === null) return drop
  if (view === undefined) return <div className="min-h-[320px]" />

  if (view.status === 'applying')
    return <Applying view={view} batchId={batchId} onClose={onClose} />
  if (pressed && (view.status === 'done' || view.applied !== null)) {
    return (
      <Applied view={view} onClose={onClose} onMore={() => setPressed(false)} />
    )
  }
  if (view.status === 'done') return drop
  if (reading) return <BulkReading view={view} />
  return (
    <BulkReview
      batchId={batchId}
      onCheck={setChecking}
      onClose={onClose}
      onApplied={() => {
        setPressed(true)
        /* Once applied it is no longer the one waiting — hold on to it
           here, so its applied screen still has it. */
        setMine(batchId)
      }}
    />
  )
}
