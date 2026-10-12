import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { Check } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { IntakeFlow } from '@/components/finances/Intake'
import type { SheetGuard } from '@/components/finances/Sheet'
import { BulkReading } from '@/components/finances/BulkReading'
import { Applying, Applied } from '@/components/finances/BulkSaving'
import { BulkReview } from '@/components/finances/BulkReview'
import { WhoseFile, namedElsewhere } from '@/components/finances/BulkWhose'

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
    text: 'Closing does not stop the reading. ADD shows a dot and opens here again.',
  },
  saving: {
    title: 'Still saving',
    text: 'Closing does not stop the save. It finishes either way.',
  },
}

/* An update from its files to what landed. The drop area is its host's:
   ADD brings its own (10 Oct — one door), a history opened from the
   Overview strip has none. */
export function BulkUpdate({
  waiting,
  onClose,
  onFlight,
  onStep,
  dropArea,
  forAccount,
}: {
  waiting: Id<'batches'> | null
  onClose: () => void
  /** The account UPDATE was pressed on: a file that names another one is
      asked about before anything of it is saved. */
  forAccount?: Id<'accounts'>
  /** Told what is in flight, so the sheet around it can ask before closing. */
  onFlight?: (flight: Flight | null) => void
  /** Told which of the four steps it is on (1 read, 2 check, 3 saving,
      4 landed), null while there is only the drop area. */
  onStep?: (step: number | null) => void
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
  const accounts = useQuery(api.accounts.list, forAccount ? {} : 'skip')
  /* Files kept on the account UPDATE was pressed on, and what was
     answered — remembered while the window is open. */
  const [kept, setKept] = useState<ReadonlySet<Id<'intakes'>>>(new Set())
  const [answered, setAnswered] = useState<Array<string>>([])
  /* Whether this sheet saw the apply through. */
  const [pressed, setPressed] = useState(false)
  /* "saving…" stays long enough to be read: a small file is written
     before the screen would ever show it (every press answers). */
  const [justPressed, setJustPressed] = useState(false)
  useEffect(() => {
    if (!justPressed) return
    const t = setTimeout(() => setJustPressed(false), 600)
    return () => clearTimeout(t)
  }, [justPressed])
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
  const landed = pressed && (view?.status === 'done' || view?.applied != null)
  const step =
    batchId === null || view === undefined || checking
      ? null
      : view.status === 'applying' || justPressed
        ? 3
        : landed
          ? 4
          : view.status === 'done'
            ? null
            : reading
              ? 1
              : 2
  useEffect(() => {
    onStep?.(step)
    return () => onStep?.(null)
  }, [step, onStep])
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

  if (view.status === 'applying' || justPressed)
    return <Applying view={view} batchId={batchId} onClose={onClose} />
  if (landed) {
    return (
      <Applied
        view={view}
        batchId={batchId}
        onClose={onClose}
        onMore={() => setPressed(false)}
      />
    )
  }
  if (view.status === 'done') return drop
  if (reading) return <BulkReading view={view} />
  if (forAccount) {
    if (accounts === undefined) return <div className="min-h-[320px]" />
    const opened = accounts.find((a) => a._id === forAccount)
    for (const file of view.files) {
      if (file.status !== 'ready' || kept.has(file.intakeId) || !opened)
        continue
      const named = namedElsewhere(file, forAccount, accounts)
      if (named)
        return (
          <WhoseFile
            file={file}
            named={named}
            opened={opened}
            batchId={batchId}
            only={view.files.length === 1}
            onClose={onClose}
            onPicked={(a) => {
              setKept((was) => new Set([...was, file.intakeId]))
              setAnswered((was) => [...was, `${file.name} → ${a.name}.`])
            }}
          />
        )
    }
  }
  return (
    <>
      {answered.map((text) => (
        <div
          key={text}
          className="motion-land flex items-center gap-2.5 rounded-[16px] bg-state-good/[0.06] px-3.5 py-3 text-[13px] text-ink-200 ring-1 ring-state-good/30 ring-inset"
        >
          <Check className="size-4 text-state-good" />
          {text}
        </div>
      ))}
      <BulkReview
        batchId={batchId}
        onCheck={setChecking}
        onClose={onClose}
        onApplied={() => {
          setPressed(true)
          setJustPressed(true)
          /* Once applied it is no longer the one waiting — hold on to it
           here, so its applied screen still has it. */
          setMine(batchId)
        }}
      />
    </>
  )
}
