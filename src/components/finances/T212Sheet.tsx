import { useEffect, useState } from 'react'
import { useAction } from 'convex/react'
import { ConvexError } from 'convex/values'
import { Check, Clock, Eye, Link2, Loader2, Lock } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { PILL_LOUD, PILL_QUIET } from '@/components/finances/bits'
import { Fact, Head, Nope } from '@/components/finances/BankSheet'
import { AccountLogo } from '@/components/finances/Logo'
import { Sheet } from '@/components/finances/Sheet'
import { Veiled } from '@/components/finances/Veil'
import { Sparks } from '@/components/track/Sparks'
import { useDayStarts } from '@/components/track/useDayStarts'
import { euros } from '@/lib/money'

const NO_KEY = 'The key is not on the backend yet. Nothing changed.'

/* Connecting Trading 212 (12 Oct, trading-212.html): no page to visit —
   three facts, one press, the answer. The key is made in the 212 app and
   put on the backend by him; this window never sees it. */
export function T212Sheet({
  account,
  total,
  read,
  onClose,
}: {
  account: Doc<'accounts'> | null
  /** What the card holds in all, in euros: before, and after it lands. */
  total: number
  /** How the card was last read ("csv read 6d ago"). */
  read: string
  onClose: () => void
}) {
  const connect = useAction(api.t212.connect)
  const today = useDayStarts(1).at(-1) as number
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ same: number; changed: number } | null>(
    null,
  )
  const [error, setError] = useState<string | null>(null)
  const id = account?._id
  useEffect(() => {
    setBusy(false)
    setDone(null)
    setError(null)
  }, [id])
  if (!account) return null
  const name = account.name

  async function go() {
    if (!account) return
    setBusy(true)
    setError(null)
    try {
      /* The press answers before the landing: "asking…" is always seen. */
      const [got] = await Promise.all([
        connect({ accountId: account._id, dayStart: today }),
        new Promise((r) => setTimeout(r, 600)),
      ])
      setDone(got)
    } catch (e) {
      setError(
        e instanceof ConvexError && typeof e.data === 'string'
          ? e.data
          : 'It did not work. Nothing changed.',
      )
    }
    setBusy(false)
  }

  return (
    <Sheet open title={`connect ${name}`} onClose={onClose} glide>
      {done ? (
        <div className="flex flex-col gap-4 py-2">
          <span
            className="motion-pop relative grid size-14 place-items-center self-center rounded-full bg-state-good/16 text-state-good shadow-[0_0_36px_-6px_var(--color-state-good)] ring-1 ring-state-good/45"
            style={
              { '--area': 'var(--color-state-good)' } as React.CSSProperties
            }
          >
            <Check className="size-[26px]" strokeWidth={2.5} />
            <Sparks count={14} reach={42} />
          </span>
          <span className="motion-land text-center text-[22px] font-light text-foreground">
            {name} is connected
          </span>
          <div className="motion-arrive flex flex-col gap-3 rounded-[18px] bg-lift/[0.035] p-3.5 ring-1 ring-lift/[0.07] ring-inset">
            <div className="flex flex-wrap items-center gap-3">
              <AccountLogo name={name} domain={account.domain} size={30} />
              <span className="flex min-w-[120px] flex-1 flex-col gap-0.5">
                <span className="text-[15px] font-medium text-foreground">
                  {name}
                </span>
                <span className="font-mono text-[10.5px] text-ink-500">
                  from {name}, now
                </span>
              </span>
              <span className="font-mono text-[15px] text-ink-100">
                <Veiled>{euros(total)}</Veiled>
              </span>
            </div>
            <div className="flex flex-wrap gap-2 font-mono text-[10.5px]">
              <span className="rounded-full bg-lift/[0.05] px-2.5 py-1 text-ink-300 ring-1 ring-lift/[0.1] ring-inset">
                {done.same} the same
              </span>
              {done.changed > 0 ? (
                <span className="rounded-full bg-state-good/10 px-2.5 py-1 text-state-good ring-1 ring-state-good/35 ring-inset">
                  {done.changed} changed
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex justify-center">
            <button
              type="button"
              onClick={onClose}
              className={`${PILL_LOUD} px-[30px]`}
            >
              Done
            </button>
          </div>
        </div>
      ) : (
        <>
          <Head
            logo={<AccountLogo name={name} domain={account.domain} size={40} />}
            title={name}
          >
            here now: {euros(total)} · {read}
          </Head>
          <div className="flex flex-col gap-3">
            <Fact
              Icon={Eye}
              small="Make the key with the read permissions only."
            >
              The app only reads: the cash and the positions.
            </Fact>
            <Fact Icon={Lock} small="Never in the browser, the repo or a chat.">
              The key stays on the backend.
            </Fact>
            <Fact
              Icon={Clock}
              small="When the last answer is over 4 hours old."
            >
              Asked when you open Finances.
            </Fact>
          </div>
          {error ? (
            <div className="flex flex-col gap-2">
              <Nope>{error}</Nope>
              {error === NO_KEY ? (
                <div className="flex flex-wrap gap-1.5 pl-[25px]">
                  {['TRADING212_KEY', 'TRADING212_SECRET'].map((k) => (
                    <code
                      key={k}
                      className="rounded-[7px] bg-sink/25 px-2 py-1 font-mono text-[11px] text-ink-200"
                    >
                      {k}
                    </code>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2.5 border-t border-lav-400/[0.12] pt-3.5">
            <p className="flex-1 text-[12.5px] text-ink-400 max-sm:basis-full">
              Trading 212’s own API.
            </p>
            <button type="button" onClick={onClose} className={PILL_QUIET}>
              later
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void go()}
              className="motion-press inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-br from-lav-300 to-lav-400 px-5 py-2.5 font-mono text-[12px] tracking-[0.14em] text-background uppercase disabled:opacity-85 max-sm:flex-1"
            >
              {busy ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  asking {name}…
                </>
              ) : (
                <>
                  <Link2 className="size-3.5" />
                  connect
                </>
              )}
            </button>
          </div>
        </>
      )}
    </Sheet>
  )
}
