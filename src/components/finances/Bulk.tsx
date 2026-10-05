import { useRef, useState } from 'react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { Files, Layers } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { PILL_QUIET } from '@/components/finances/bits'
import { IntakeFlow } from '@/components/finances/Intake'
import { AccountLogo } from '@/components/finances/Logo'
import { Sheet } from '@/components/finances/Sheet'
import { failureMessage } from '@/lib/convex-errors'
import { MAX_BATCH_FILES } from '@/lib/intake'
import { useBatchUpload } from '@/components/finances/BulkParts'
import {
  BulkReading,
  Applying,
  Applied,
} from '@/components/finances/BulkReading'
import { BulkReview } from '@/components/finances/BulkReview'

/* UPDATE ALL (3 Oct). Artem: "When I simply drag and drop multiple
   csv/pdf files, you read and analyze which bank, what to update, I can
   review it and update state of finances." Beside ADD, not instead of it
   — one statement still goes in the way it always did. Journey and spec:
   docs/specs/2026-10-03-bulk-update*.md; the mockup it is built to:
   design/treasury-mockup/bulk.html. */

/** The hero's second button, beside ADD. */
export function UpdateAllButton() {
  const waiting = useQuery(api.intake.openBatch, {})
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${PILL_QUIET} relative`}
      >
        <Layers className="size-3.5" />
        update all
        {waiting ? (
          <span
            aria-label="an update is waiting"
            className="motion-pulse absolute -top-0.5 -right-0.5 size-2 rounded-full bg-lav-400 shadow-[0_0_8px_var(--color-lav-400)]"
          />
        ) : null}
      </button>
      <Sheet open={open} title="update all" wide onClose={() => setOpen(false)}>
        {open ? (
          <BulkUpdate
            waiting={waiting ?? null}
            onClose={() => setOpen(false)}
          />
        ) : null}
      </Sheet>
    </>
  )
}

function BulkUpdate({
  waiting,
  onClose,
}: {
  waiting: Id<'batches'> | null
  onClose: () => void
}) {
  const [mine, setMine] = useState<Id<'batches'> | null>(null)
  const batchId = mine ?? waiting
  const view = useQuery(api.intake.batch, batchId ? { batchId } : 'skip')
  const [checking, setChecking] = useState<Id<'intakes'> | null>(null)
  /* Whether this sheet saw the apply through. */
  const [pressed, setPressed] = useState(false)

  if (checking) {
    return (
      <IntakeFlow
        intakeId={checking}
        onBack={() => setChecking(null)}
        onDone={() => setChecking(null)}
      />
    )
  }
  if (batchId === null) return <BulkDrop onStarted={setMine} />
  if (view === undefined) return <div className="min-h-[320px]" />

  const reading = view.files.some((f) => f.status === 'reading')
  if (view.status === 'applying') return <Applying view={view} />
  if (pressed && (view.status === 'done' || view.applied !== null)) {
    return (
      <Applied view={view} onClose={onClose} onMore={() => setPressed(false)} />
    )
  }
  if (view.status === 'done') return <BulkDrop onStarted={setMine} />
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

/* ---- Drop ------------------------------------------------------------ */

function BulkDrop({ onStarted }: { onStarted: (id: Id<'batches'>) => void }) {
  const { send, sent } = useBatchUpload()
  const [over, setOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const accounts = useQuery(api.accounts.list, {})
  /* Notes have no statement to drop. */
  const readable = (accounts ?? []).filter(
    (a) => a.kinds.includes('bank') || a.kinds.includes('broker'),
  )

  async function take(files: Array<File>) {
    if (files.length === 0) return
    setError(null)
    try {
      onStarted(await send(files))
    } catch (e) {
      setError(
        failureMessage(e) ??
          (e instanceof Error ? e.message : 'It did not upload.'),
      )
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        role="button"
        tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') input.current?.click()
        }}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null))
            setOver(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          void take([...e.dataTransfer.files])
        }}
        className={`relative flex cursor-pointer flex-col items-center gap-4 overflow-hidden rounded-[18px] px-5 py-8 text-center transition-colors ${
          over ? 'bg-lav-400/15' : 'bg-lav-400/[0.04]'
        }`}
      >
        <span
          aria-hidden
          className={`pointer-events-none absolute inset-0 rounded-[18px] border-[1.5px] ${
            over
              ? 'border-solid border-lav-400 shadow-[inset_0_0_40px_-10px_var(--color-lav-400)]'
              : 'motion-pulse border-dashed border-lav-400/40'
          }`}
        />
        <span
          className={`grid size-11 place-items-center rounded-[12px] bg-lav-400/10 text-lav-300 ring-1 ring-lav-400/35 transition-transform ring-inset ${
            over ? '-translate-y-1 scale-110' : ''
          }`}
        >
          <Files className="size-5" />
        </span>
        <span className="flex flex-col gap-1">
          <span className="text-[16px] text-foreground">
            {sent
              ? `uploading ${sent.done} of ${sent.of}…`
              : 'Drop every statement at once'}
          </span>
          <span className="font-mono text-[10.5px] text-ink-500">
            any bank, any month · PDF, CSV, screenshots · up to{' '}
            {MAX_BATCH_FILES}
          </span>
        </span>
        <span className="flex flex-wrap justify-center gap-1.5 font-mono text-[10.5px] tracking-[0.12em] text-ink-400 uppercase">
          {['drop', 'sorted per account', 'you check', 'one apply'].map(
            (s, i) => (
              <span
                key={s}
                style={{ animationDelay: `${60 + i * 90}ms` }}
                className="motion-land rounded-full bg-lift/[0.04] px-2.5 py-1"
              >
                {s}
              </span>
            ),
          )}
        </span>
        {readable.length > 0 ? (
          <span className="flex flex-wrap justify-center gap-2">
            {readable.map((a, i) => (
              <span
                key={a._id}
                style={{ animationDelay: `${360 + i * 70}ms` }}
                className="motion-land inline-flex items-center gap-2 rounded-full bg-lift/[0.04] py-1 pr-3 pl-1 text-[12.5px] text-ink-200 ring-1 ring-lift/8 ring-inset"
              >
                <AccountLogo name={a.name} domain={a.domain} size={22} />
                {a.name}
              </span>
            ))}
          </span>
        ) : null}
        <input
          ref={input}
          type="file"
          multiple
          hidden
          accept="application/pdf,text/csv,.csv,image/png,image/jpeg,image/webp"
          onChange={(e) => {
            void take([...(e.target.files ?? [])])
            e.target.value = ''
          }}
        />
      </div>
      {error ? (
        <p className="text-center text-[12.5px] text-state-danger">{error}</p>
      ) : (
        <p className="text-center text-[12.5px] text-ink-400">
          A new bank in the drop becomes its account. Nothing is saved until you
          press apply.
        </p>
      )}
    </div>
  )
}
