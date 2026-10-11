import { useEffect, useState } from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useAction, useConvexAuth, useMutation } from 'convex/react'
import { ConvexError } from 'convex/values'
import { KeyRound, Loader2 } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import { PILL_LOUD } from '@/components/finances/bits'
import { useDayStarts } from '@/components/track/useDayStarts'
import { cameBack, tripBack } from '@/lib/bankReturn'

/* Back from the bank's own page (docs/specs/2026-10-11-bank-connections.md).
   The bank hands over a code and the one-time word the app gave it; the
   balance is read and stored, then Finances opens on what happened. A code
   works once, so a word is handled once however often this renders. */
const handled = new Set<string>()

function BankCallback() {
  const { code, state, error } = Route.useSearch()
  const { isAuthenticated } = useConvexAuth()
  const finish = useAction(api.bank.finish)
  const cancel = useMutation(api.bank.cancel)
  const navigate = useNavigate()
  const today = useDayStarts(1).at(-1) as number
  const [failed, setFailed] = useState<string | null>(null)

  useEffect(() => {
    if (!isAuthenticated) return
    if (state === undefined) return setFailed('This approval is not open.')
    if (handled.has(state)) return
    handled.add(state)
    const trip = tripBack()
    const home = () => navigate({ to: '/finances', replace: true })
    if (code === undefined || error !== undefined) {
      void cancel({ state })
        .catch(() => null)
        .then(() => {
          if (trip) cameBack({ ...trip, back: 'refused' })
          return home()
        })
      return
    }
    finish({ code, state, dayStart: today })
      .then((r) => {
        cameBack({
          accountId: r.accountId,
          again: trip?.again ?? false,
          back: r.status,
        })
        return home()
      })
      .catch((e: unknown) =>
        setFailed(
          e instanceof ConvexError && typeof e.data === 'string'
            ? e.data
            : 'The bank could not be read. Nothing was saved.',
        ),
      )
  }, [isAuthenticated, code, state, error, today, finish, cancel, navigate])

  return (
    <div className="grid min-h-[50vh] place-items-center">
      {failed === null ? (
        <div className="system-frame motion-arrive flex items-center gap-3 rounded-[14px] px-5 py-4 text-[13.5px] text-ink-200">
          <Loader2 className="size-4 animate-spin text-lav-300" />
          Reading the bank…
        </div>
      ) : (
        <div className="motion-land flex max-w-sm flex-col items-center gap-3 text-center">
          <span className="flex items-center gap-2 text-[14px] text-state-warn">
            <KeyRound className="size-4 shrink-0" />
            {failed}
          </span>
          <Link to="/finances" replace className={PILL_LOUD}>
            back to Finances
          </Link>
        </div>
      )}
    </div>
  )
}

const text = (v: unknown) => (typeof v === 'string' && v !== '' ? v : undefined)

export const Route = createFileRoute('/_app/bank/callback')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { code?: string; state?: string; error?: string } => ({
    code: text(search.code),
    state: text(search.state),
    error: text(search.error),
  }),
  component: BankCallback,
})
