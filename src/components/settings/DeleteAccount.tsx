import { useEffect, useRef, useState } from 'react'
import { useClerk, useUser } from '@clerk/tanstack-react-start'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { Loader2 } from 'lucide-react'

import { api } from '../../../convex/_generated/api'

/* R8 · S3b (27 Oct, mockup design/firstrun-mockup/delete.html): a guest's
   last Settings card. What it would delete, one press to arm it, DELETE
   ALL, the count going down, then their Clerk account and the sign-in page
   with what went. Artem never has it (convex/account.ts refuses him too). */

/** Read once by the sign-in page, to say what went. */
export const DELETED_KEY = 'sl-deleted'

type Phase = 'idle' | 'armed' | 'deleting'

export function DeleteAccount() {
  const counts = useQuery(api.account.counts, {})
  const deleteAll = useMutation(api.account.deleteAll)
  const { user } = useUser()
  const { signOut } = useClerk()
  const [phase, setPhase] = useState<Phase>('idle')
  const [failed, setFailed] = useState(false)
  const total = useRef<{
    rows: number
    files: number
    more: boolean
  } | null>(null)
  const finishing = useRef(false)

  /* Done when nothing of theirs is left: no rows, or no longer a guest
     (the profile goes last). Then the Clerk account, then sign-in. */
  useEffect(() => {
    if (phase !== 'deleting' || counts === undefined || finishing.current)
      return
    if (counts.guest && counts.rows > 0) return
    finishing.current = true
    try {
      sessionStorage.setItem(DELETED_KEY, JSON.stringify(total.current))
    } catch {
      /* The sign-in page then just does not say it. */
    }
    void (async () => {
      try {
        await user?.delete()
      } catch {
        await signOut()
      }
      window.location.assign('/login')
    })()
  }, [phase, counts, user, signOut])

  if (counts === undefined || (!counts.guest && phase !== 'deleting'))
    return null

  const shown = total.current ?? counts
  const done = total.current ? total.current.rows - counts.rows : 0

  async function go() {
    total.current = {
      rows: counts!.rows,
      files: counts!.files,
      more: counts!.more,
    }
    setFailed(false)
    setPhase('deleting')
    try {
      await deleteAll({})
    } catch {
      total.current = null
      setFailed(true)
      setPhase('armed')
    }
  }

  return (
    <section
      aria-label="Delete account"
      className={`glass flex flex-col gap-3 rounded-[22px] border border-state-danger/40 p-6 transition-shadow duration-300 ${phase === 'idle' ? '' : 'shadow-[0_0_34px_-12px_var(--color-state-danger)]'}`}
    >
      <div className="label-caps text-state-danger">Delete account</div>
      <div className="flex flex-wrap gap-1.5">
        <Badge>
          IN THE APP · <b data-testid="delete-rows">{shown.rows}</b>
          {shown.more ? '+' : ''} ROWS
        </Badge>
        <Badge>
          <b>{shown.files}</b> FILES
        </Badge>
        {user?.primaryEmailAddress ? (
          <Badge>
            ACCOUNT · <b>{user.primaryEmailAddress.emailAddress}</b>
          </Badge>
        ) : null}
      </div>

      {phase === 'idle' ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setPhase('armed')}
            className="h-[38px] rounded-full border border-state-danger px-4 font-mono text-[11px] tracking-[0.2em] text-state-danger transition-colors hover:bg-state-danger/10"
          >
            DELETE ACCOUNT
          </button>
        </div>
      ) : phase === 'armed' ? (
        <div className="motion-arrive flex flex-wrap items-center justify-between gap-3 border-t border-lift/10 pt-4">
          <span
            role="status"
            className="font-mono text-[10.5px] tracking-[0.2em] text-state-danger"
          >
            {failed ? 'NOT DELETED' : 'NO UNDO'}
          </span>
          <span className="flex gap-2">
            <button
              type="button"
              onClick={() => setPhase('idle')}
              className="h-[38px] rounded-full border border-lift/10 px-4 font-mono text-[11px] tracking-[0.2em] text-ink-300"
            >
              KEEP
            </button>
            <button
              type="button"
              onClick={() => void go()}
              className="h-[38px] rounded-full bg-state-danger px-4 font-mono text-[11px] font-medium tracking-[0.2em] text-ink-900 shadow-[0_0_22px_-6px_var(--color-state-danger)]"
            >
              DELETE ALL
            </button>
          </span>
        </div>
      ) : (
        <div className="motion-arrive border-t border-lift/10 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span
              role="status"
              className="font-mono text-[10.5px] tracking-[0.2em] text-state-danger"
            >
              DELETING · {Math.max(0, done)} OF {shown.rows}
              {shown.more ? '+' : ''}
            </span>
            <span className="inline-flex h-[38px] items-center gap-2 rounded-full bg-state-danger/70 px-4 font-mono text-[11px] tracking-[0.2em] text-ink-900">
              <Loader2 className="size-3.5 animate-spin" />
              DELETING
            </span>
          </div>
          <div className="mt-3.5 h-1 overflow-hidden rounded-full bg-lift/10">
            <i
              className="block h-full bg-state-danger transition-[width] duration-300"
              style={{
                width: `${shown.rows > 0 ? Math.round((Math.max(0, done) / shown.rows) * 100) : 100}%`,
              }}
            />
          </div>
        </div>
      )}
    </section>
  )
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-lift/10 px-[9px] py-[3px] font-mono text-[10px] tracking-[0.12em] text-ink-300 [&_b]:font-medium [&_b]:text-ink-100">
      {children}
    </span>
  )
}
