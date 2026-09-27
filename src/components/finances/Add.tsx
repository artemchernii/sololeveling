import { useRef, useState } from 'react'
import { useMutation } from 'convex/react'
import { FileUp, Loader2, Plus } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { IntakeFlow } from '@/components/finances/Intake'
import { Sheet } from '@/components/finances/Sheet'
import { AddDrop } from '@/components/finances/AddDrop'
import { AddRows } from '@/components/finances/AddRows'
import { MAX_INTAKE_FILES, readableFile } from '@/lib/intake'

/* + (Treasury, 27 Sep; reworked the same day as "adding money"): two
   doors. DROP FILES — statements and screenshots, any bank or broker,
   several at once; the reader works out what each is and returns a list
   to check. BY HAND — a row per thing, of any kind, prefilled (AddRows,
   27 Sep: the text box is gone). Every step has a way back; nothing closes
   the whole sheet but close. */

type Step = { at: 'home' } | { at: 'intake'; id: Id<'intakes'> }

export function AddButton({
  className = '',
  label = 'add',
  cta = false,
  onOpen,
}: {
  className?: string
  label?: string
  /** The day-one call to action: solid, still, words instead of +. */
  cta?: boolean
  /** Opens something else instead of the + sheet — setup, before there is
      an account to add money to. */
  onOpen?: () => void
}) {
  const [step, setStep] = useState<Step | null>(null)
  const home = () => setStep({ at: 'home' })
  const title = step === null ? '' : step.at === 'home' ? 'add' : 'check it'
  return (
    <>
      <button
        type="button"
        onClick={onOpen ?? home}
        className={
          cta
            ? `motion-press inline-flex items-center justify-center gap-1.5 rounded-full bg-lav-400 px-4 py-2.5 font-mono text-[11px] font-medium tracking-[0.14em] text-background uppercase ${className}`
            : `add-live motion-press inline-flex items-center gap-1.5 rounded-full py-1.5 pr-4 pl-3 font-mono text-[11px] font-medium tracking-[0.14em] text-background uppercase ${className}`
        }
      >
        {cta ? null : <Plus className="add-plus size-3.5" strokeWidth={2.5} />}
        {label}
      </button>
      <Sheet
        open={step !== null}
        title={title}
        onClose={() => setStep(null)}
        onBack={step !== null && step.at !== 'home' ? home : undefined}
        wide
      >
        {step?.at === 'home' ? (
          <>
            <AddDrop onStarted={(id) => setStep({ at: 'intake', id })} />
            <AddRows />
          </>
        ) : step?.at === 'intake' ? (
          <IntakeFlow
            intakeId={step.id}
            onBack={home}
            onDone={() => setStep(null)}
          />
        ) : null}
      </Sheet>
    </>
  )
}

/**
 * Files up to storage and handed to the reader. One read for all of them
 * (a statement split over files), or `oneEach` — a read per file, so each
 * bank's statement becomes its own account in setup. Returns the reads
 * started, or throws a sentence for him.
 */
export function useIntakeUpload() {
  const uploadUrl = useMutation(api.attachments.generateUploadUrl)
  const start = useMutation(api.intake.start)
  return async function send(
    files: Array<File>,
    opts: { accountId?: Id<'accounts'>; oneEach?: boolean } = {},
  ): Promise<Array<Id<'intakes'>>> {
    if (files.length === 0) return []
    if (files.length > MAX_INTAKE_FILES) {
      throw new Error(`At most ${MAX_INTAKE_FILES} files at once.`)
    }
    const bad = files.find((f) => readableFile(f.type, f.name) === null)
    if (bad) throw new Error(`${bad.name} is not a PDF, a CSV or a screenshot.`)
    const stored = []
    for (const file of files) {
      const url = await uploadUrl({})
      const type =
        file.type ||
        (file.name.toLowerCase().endsWith('.csv')
          ? 'text/csv'
          : 'application/octet-stream')
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': type },
        body: file,
      })
      if (!res.ok) throw new Error('It did not upload — try again.')
      const { storageId } = (await res.json()) as {
        storageId: Id<'_storage'>
      }
      stored.push({
        storageId,
        contentType: type,
        name: file.name,
        size: file.size,
      })
    }
    const groups = opts.oneEach ? stored.map((f) => [f]) : [stored]
    const ids: Array<Id<'intakes'>> = []
    for (const g of groups) {
      const result = await start({ accountId: opts.accountId, files: g })
      if (!result.ok) throw new Error(result.error)
      ids.push(result.intakeId)
    }
    return ids
  }
}

/** Files in: uploaded, then handed to the reader. The account is optional
    — the reader names the bank, the review matches it. */
export function DropFiles({
  accountId,
  onStarted,
  oneEach = false,
  title = 'Drop statements or screenshots',
  hint = `PDF · CSV · PNG — any bank, any broker, up to ${MAX_INTAKE_FILES} at once. It works out what each one is.`,
  small = false,
}: {
  accountId?: Id<'accounts'>
  onStarted: (intakeId: Id<'intakes'>) => void
  oneEach?: boolean
  title?: string
  hint?: string
  small?: boolean
}) {
  const upload = useIntakeUpload()
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  async function send(files: Array<File>) {
    if (files.length === 0) return
    setBusy(true)
    setError(null)
    try {
      for (const id of await upload(files, { accountId, oneEach }))
        onStarted(id)
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'It did not upload — try again.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          void send([...e.dataTransfer.files])
        }}
        className={`motion-press flex flex-col items-center justify-center gap-2 rounded-[16px] border border-dashed px-4 text-center transition-colors ${small ? 'min-h-14 flex-row py-3' : 'min-h-36'} ${
          over
            ? 'border-lav-400 bg-lav-400/10'
            : 'border-lav-400/40 hover:bg-lav-400/6'
        }`}
      >
        {busy ? (
          <Loader2 className="size-6 animate-spin text-lav-400" />
        ) : (
          <FileUp className="size-6 text-area" />
        )}
        <span
          className={
            small ? 'text-[13.5px] text-ink-200' : 'text-[15px] text-foreground'
          }
        >
          {busy ? 'Uploading…' : title}
        </span>
        {small ? null : (
          <span className="font-mono text-[11px] text-ink-500">{hint}</span>
        )}
      </button>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        accept="application/pdf,text/csv,.csv,image/png,image/jpeg,image/webp"
        onChange={(e) => void send([...(e.target.files ?? [])])}
      />
      {error ? (
        <span className="font-mono text-[11px] text-state-warn">{error}</span>
      ) : null}
    </div>
  )
}
