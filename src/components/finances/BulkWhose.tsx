import { useState } from 'react'
import { useMutation } from 'convex/react'
import { AlertTriangle, CircleHelp, FileText, Loader2 } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { PILL_QUIET } from '@/components/finances/bits'
import { DAY } from '@/components/finances/BulkParts'
import type { BatchView } from '@/components/finances/BulkParts'
import { AccountLogo } from '@/components/finances/Logo'
import { failureMessage } from '@/lib/convex-errors'
import { matchAccount } from '@/lib/intake'

type File = BatchView['files'][number]

/** The account a file names, when that is not the one UPDATE was pressed
    on (12 Oct): an ActivoBank statement dropped on Revolut's UPDATE was
    saved into Revolut, with no word. Null when the file names no account
    of his, or names this one. */
export function namedElsewhere(
  file: File,
  forAccount: Id<'accounts'>,
  accounts: ReadonlyArray<Doc<'accounts'>>,
): Doc<'accounts'> | null {
  if (file.accountId !== forAccount || !file.institution) return null
  const id = matchAccount(
    file.institution,
    accounts.map((a) => ({ id: a._id, name: a.name, domain: a.domain })),
  )
  return id === null || id === forAccount
    ? null
    : (accounts.find((a) => a._id === id) ?? null)
}

/* The question, in place of the check: nothing of this file is saved
   until the account is picked (design/treasury-mockup/update-account.html,
   "another account's file"). */
export function WhoseFile({
  file,
  named,
  opened,
  batchId,
  only,
  onPicked,
  onClose,
}: {
  file: File
  /** The account the file names. */
  named: Doc<'accounts'>
  /** The account UPDATE was pressed on. */
  opened: Doc<'accounts'>
  batchId: Id<'batches'>
  /** It is the update's only file: leaving it out ends the update. */
  only: boolean
  onPicked: (account: Doc<'accounts'>) => void
  onClose: () => void
}) {
  const setAccount = useMutation(api.intake.setAccount)
  const discard = useMutation(api.intake.discard)
  const discardBatch = useMutation(api.intake.discardBatch)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const run = (key: string, work: () => Promise<unknown>) => {
    setBusy(key)
    setError(null)
    work()
      .catch((e: unknown) => setError(failureMessage(e) ?? 'Not saved.'))
      .finally(() => setBusy(null))
  }
  const pick = (a: Doc<'accounts'>) =>
    run(a._id, async () => {
      if (a._id !== opened._id)
        await setAccount({ intakeId: file.intakeId, accountId: a._id })
      onPicked(a)
    })
  return (
    <div className="flex flex-col gap-4">
      <div
        data-testid="whose-file"
        className="motion-land flex gap-3 rounded-[16px] bg-state-warn/[0.05] p-3.5 ring-1 ring-state-warn/35 ring-inset"
      >
        <CircleHelp className="mt-0.5 size-4 shrink-0 text-state-warn" />
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-[14.5px] text-foreground">
            Which account is this file for?
          </span>
          <span className="text-[12.5px] leading-normal text-ink-400">
            <span className="text-ink-200">{file.name}</span> ·{' '}
            <span>
              the file names {named.name} · UPDATE was opened on {opened.name}
            </span>
          </span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {[named, opened].map((a) => (
              <button
                key={a._id}
                type="button"
                disabled={busy !== null}
                onClick={() => pick(a)}
                className="motion-press inline-flex h-[34px] items-center gap-2 rounded-full bg-lift/[0.03] pr-3.5 pl-1.5 text-[13px] text-ink-200 ring-1 ring-lift/14 ring-inset hover:bg-lav-400/10 hover:ring-lav-400/55"
              >
                {busy === a._id ? (
                  <Loader2 className="mx-1 size-4 animate-spin" />
                ) : (
                  <AccountLogo name={a.name} domain={a.domain} size={24} />
                )}
                {a.name}
              </button>
            ))}
            <button
              type="button"
              disabled={busy !== null}
              onClick={() =>
                run('out', () =>
                  only
                    ? discardBatch({ batchId }).then(onClose)
                    : discard({ intakeId: file.intakeId }),
                )
              }
              className="motion-press inline-flex h-[34px] items-center gap-2 rounded-full px-3.5 text-[13px] text-ink-300 ring-1 ring-lift/14 ring-inset hover:text-foreground"
            >
              {busy === 'out' ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              leave it out
            </button>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3 rounded-[18px] bg-lift/[0.035] p-3.5 ring-1 ring-state-warn/40 ring-inset">
        <span className="grid size-[30px] shrink-0 place-items-center rounded-[10px] bg-lift/[0.06] text-ink-300">
          <FileText className="size-4" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[15px] font-medium">{file.name}</span>
          <span className="font-mono text-[10.5px] text-ink-500">
            {file.rows} {file.rows === 1 ? 'row' : 'rows'}
            {file.from !== null && file.to !== null
              ? ` · ${DAY.format(file.from)} to ${DAY.format(file.to)}`
              : ''}
          </span>
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-state-warn/12 px-2 py-[3px] font-mono text-[10px] tracking-[0.12em] whitespace-nowrap text-state-warn uppercase">
          <AlertTriangle className="size-3" />
          not saved
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-lav-400/12 pt-3.5">
        <span className="min-w-[200px] flex-1 text-[12.5px] text-ink-400">
          {error ? (
            <span className="text-state-danger">{error}</span>
          ) : (
            'Not saved — 1 question open.'
          )}
        </span>
        <button type="button" onClick={onClose} className={PILL_QUIET}>
          later
        </button>
      </div>
    </div>
  )
}
