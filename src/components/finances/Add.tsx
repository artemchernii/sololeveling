import { useRef, useState } from 'react'
import { useMutation } from 'convex/react'
import { FileUp, Loader2, Plus } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { PILL_QUIET } from '@/components/finances/bits'
import { AccountForm } from '@/components/finances/Accounts'
import { IntakeFlow } from '@/components/finances/Intake'
import { Sheet } from '@/components/finances/Sheet'
import { TypeLines } from '@/components/finances/TypeLines'
import { MAX_INTAKE_FILES, readableFile } from '@/lib/intake'

/* + (Treasury, 27 Sep; reworked the same day as "adding money"): two
   doors. DROP FILES — statements and screenshots, any bank or broker,
   several at once; the reader works out what each is and returns a list
   to check. TYPE IT — money in, money out, a transfer, a buy or a sell, a
   line each, read back as rows to check (TypeLines). Every step has a way
   back; nothing closes the whole sheet but close. */

type Step =
  { at: 'home' } | { at: 'account' } | { at: 'intake'; id: Id<'intakes'> }

export function AddButton({
  className = '',
  label = 'add',
  cta = false,
}: {
  className?: string
  label?: string
  /** The day-one call to action: solid, still, words instead of +. */
  cta?: boolean
}) {
  const [step, setStep] = useState<Step | null>(null)
  const home = () => setStep({ at: 'home' })
  const title =
    step === null
      ? ''
      : step.at === 'home'
        ? 'add'
        : step.at === 'account'
          ? 'new account'
          : 'check it'
  return (
    <>
      <button
        type="button"
        onClick={home}
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
        wide={step?.at === 'intake'}
      >
        {step?.at === 'home' ? (
          <>
            <DropFiles onStarted={(id) => setStep({ at: 'intake', id })} />
            <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-400">
              No file at hand?
              <button
                type="button"
                onClick={() => setStep({ at: 'account' })}
                className={PILL_QUIET}
              >
                add an account by hand
              </button>
            </div>
            <div className="border-t border-lift/[0.07] pt-4">
              <TypeLines />
            </div>
          </>
        ) : step?.at === 'account' ? (
          <AccountForm account={null} onDone={home} />
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

/** Files in: uploaded, then handed to the reader. The account is optional
    — the reader names the bank, the review matches it. */
export function DropFiles({
  accountId,
  onStarted,
}: {
  accountId?: Id<'accounts'>
  onStarted: (intakeId: Id<'intakes'>) => void
}) {
  const uploadUrl = useMutation(api.attachments.generateUploadUrl)
  const start = useMutation(api.intake.start)
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  async function send(files: Array<File>) {
    if (files.length === 0) return
    if (files.length > MAX_INTAKE_FILES) {
      setError(`At most ${MAX_INTAKE_FILES} files at once.`)
      return
    }
    const bad = files.find((f) => readableFile(f.type, f.name) === null)
    if (bad) {
      setError(`${bad.name} is not a PDF, a CSV or a screenshot.`)
      return
    }
    setBusy(true)
    setError(null)
    try {
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
      const result = await start({ accountId, files: stored })
      if (!result.ok) setError(result.error)
      else onStarted(result.intakeId)
    } catch {
      setError('It did not upload — try again.')
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
        className={`motion-press flex min-h-36 flex-col items-center justify-center gap-2 rounded-[16px] border border-dashed px-4 text-center transition-colors ${
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
        <span className="text-[15px] text-foreground">
          {busy ? 'Uploading…' : 'Drop statements or screenshots'}
        </span>
        <span className="font-mono text-[11px] text-ink-500">
          PDF · CSV · PNG — any bank, any broker, up to {MAX_INTAKE_FILES} at
          once. It works out what each one is.
        </span>
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
