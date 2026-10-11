import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useAction } from 'convex/react'
import { ConvexError } from 'convex/values'
import {
  CalendarClock,
  Check,
  ExternalLink,
  Eye,
  KeyRound,
  Landmark,
  Loader2,
  Lock,
  Rows3,
} from 'lucide-react'
import type { FunctionReturnType } from 'convex/server'

import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { PILL_LOUD, PILL_QUIET } from '@/components/finances/bits'
import { AccountLogo } from '@/components/finances/Logo'
import { Sheet } from '@/components/finances/Sheet'
import { Sparks } from '@/components/track/Sparks'
import { useDayStarts } from '@/components/track/useDayStarts'
import { approvalDay } from '@/lib/bankLink'
import { leaveForBank } from '@/lib/bankReturn'
import type { BankBack } from '@/lib/bankReturn'
import { money } from '@/lib/currency'

type Link = FunctionReturnType<typeof api.bank.links>[number]
type Pocket = {
  currency: string
  value: number | null
  recordedAt: number | null
}

const DAY = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short' })
const said = (e: unknown) =>
  e instanceof ConvexError && typeof e.data === 'string'
    ? e.data
    : 'It did not work. Nothing changed.'

/* Connecting a bank, and approving it again: the same window (11 Oct,
   bank-connected.html). What is true of the connection, then the bank's own
   page — another site, so the app leaves and comes back through
   /bank/callback — then what came of it: connected, "which one is this
   card?" when the bank shows several, or not approved. */
export function BankSheet({
  account,
  link,
  pockets,
  back,
  again,
  onClose,
}: {
  account: Doc<'accounts'> | null
  link: Link | null
  pockets: ReadonlyArray<Pocket>
  /** How the trip to the bank ended, when this opens on the way back. */
  back: BankBack | null
  /** An approval again, not a first connect. */
  again: boolean
  onClose: () => void
}) {
  const connect = useAction(api.bank.connect)
  const choose = useAction(api.bank.choose)
  const today = useDayStarts(1).at(-1) as number
  const [busy, setBusy] = useState<'opening' | 'reading' | null>(null)
  const [picked, setPicked] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const id = account?._id
  useEffect(() => {
    setBusy(null)
    setPicked(false)
    setError(null)
  }, [id])
  if (!account) return null
  const name = account.name
  const linked = link?.status === 'linked'
  const step =
    busy === 'reading'
      ? 'reading'
      : linked && (back === 'linked' || picked)
        ? 'landed'
        : link?.status === 'choose' && back === 'choose'
          ? 'which'
          : 'intro'

  async function go() {
    if (!account) return
    setBusy('opening')
    setError(null)
    try {
      const url = await connect({ accountId: account._id })
      leaveForBank({ accountId: account._id, again })
      window.location.assign(url)
    } catch (e) {
      setError(said(e))
      setBusy(null)
    }
  }

  async function pick(uid: string) {
    if (!account) return
    setBusy('reading')
    setError(null)
    try {
      await choose({ accountId: account._id, uid, dayStart: today })
      setPicked(true)
    } catch (e) {
      setError(said(e))
    }
    setBusy(null)
  }

  const logo = <AccountLogo name={name} domain={account.domain} size={40} />
  const held = pockets.find((p) => p.value !== null)
  return (
    <Sheet
      open
      title={again ? 'approve again' : `connect ${name}`}
      onClose={onClose}
    >
      {step === 'reading' ? (
        <div className="system-pulse flex items-center gap-3 rounded-[14px] bg-lift/[0.035] p-3.5 text-[13.5px] text-ink-200 ring-1 ring-lav-400/25 ring-inset">
          <Loader2 className="size-4 animate-spin text-lav-300" />
          Reading {name}…
        </div>
      ) : step === 'landed' ? (
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
            {name} is {again ? 'approved' : 'connected'}
          </span>
          <div className="motion-arrive flex flex-col gap-3 rounded-[18px] bg-lift/[0.035] p-3.5 ring-1 ring-lift/[0.07] ring-inset">
            <div className="flex flex-wrap items-center gap-3">
              <AccountLogo name={name} domain={account.domain} size={30} />
              <span className="flex min-w-[120px] flex-1 flex-col gap-0.5">
                <span className="text-[15px] font-medium text-foreground">
                  {name}
                </span>
                <span className="font-mono text-[10.5px] text-ink-500">
                  from the bank, now
                </span>
              </span>
              <span className="font-mono text-[15px] text-ink-100">
                {pockets
                  .filter((p) => p.value !== null)
                  .map((p) => money(p.value as number, p.currency))
                  .join(' · ')}
              </span>
            </div>
            {link?.validUntil ? (
              <span className="flex items-center gap-[7px] font-mono text-[10.5px] text-ink-400">
                <CalendarClock className="size-3" />
                approved until {approvalDay(link.validUntil)}
              </span>
            ) : null}
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
      ) : step === 'which' ? (
        <>
          <Head logo={logo} title="Which one is this card?">
            {name} shows {link?.choices.length} accounts
          </Head>
          {link?.choices.map((c) => (
            <button
              key={c.uid}
              type="button"
              onClick={() => void pick(c.uid)}
              className="motion-press flex w-full items-center gap-3 rounded-[14px] bg-lift/[0.035] px-3.5 py-3 text-left ring-1 ring-lift/10 transition-colors ring-inset hover:bg-lav-400/[0.08] hover:ring-lav-400/50"
            >
              <span className="grid size-[34px] shrink-0 place-items-center rounded-[11px] bg-money-cash/10 text-money-cash">
                <Landmark className="size-4" />
              </span>
              <span className="min-w-0 flex-1 text-[14px] text-foreground">
                {c.name ?? 'Account'}
                {c.tail ? (
                  <span className="mt-0.5 block font-mono text-[10.5px] text-ink-500">
                    ···· {c.tail}
                  </span>
                ) : null}
              </span>
            </button>
          ))}
          <Fact Icon={Rows3} small="Add it as an account, any time.">
            The other one can be its own account.
          </Fact>
          {error ? <Nope>{error}</Nope> : null}
        </>
      ) : (
        <>
          <Head logo={logo} title={name}>
            {again && link?.validUntil
              ? `approval ended ${DAY.format(link.validUntil)}`
              : held?.recordedAt
                ? `balance here: ${money(held.value as number, held.currency)} · ${DAY.format(held.recordedAt)}`
                : 'no balance here yet'}
          </Head>
          <div className="flex flex-col gap-3">
            <Fact Icon={Eye} small="Nothing can be paid or moved from here.">
              Read only: the balance and the movements.
            </Fact>
            <Fact Icon={Lock} small="It never reaches this app.">
              The password is typed on {name}’s own page.
            </Fact>
            <Fact
              Icon={CalendarClock}
              small="The card says so when it is time."
            >
              {name} asks again every few months.
            </Fact>
          </div>
          {back === 'refused' && busy === null && error === null ? (
            <Nope>Not approved. Nothing changed.</Nope>
          ) : null}
          {error ? <Nope>{error}</Nope> : null}
          <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2.5 border-t border-lav-400/[0.12] pt-3.5">
            <p className="flex-1 text-[12.5px] text-ink-400 max-sm:basis-full">
              Through Enable Banking.
            </p>
            <button type="button" onClick={onClose} className={PILL_QUIET}>
              later
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void go()}
              className="motion-press inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-br from-lav-300 to-lav-400 px-5 py-2.5 font-mono text-[12px] tracking-[0.14em] text-background uppercase disabled:opacity-85 max-sm:flex-1"
            >
              {busy === 'opening' ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  opening {name}…
                </>
              ) : (
                <>
                  continue at {name}
                  <ExternalLink className="size-3.5" />
                </>
              )}
            </button>
          </div>
        </>
      )}
    </Sheet>
  )
}

function Head({
  logo,
  title,
  children,
}: {
  logo: ReactNode
  title: string
  children: ReactNode
}) {
  return (
    <div className="flex items-center gap-3">
      {logo}
      <div className="min-w-0">
        <span className="block text-[19px] leading-tight text-foreground">
          {title}
        </span>
        <span className="mt-[3px] block font-mono text-[10.5px] text-ink-500">
          {children}
        </span>
      </div>
    </div>
  )
}

function Fact({
  Icon,
  small,
  children,
}: {
  Icon: typeof Eye
  small: string
  children: ReactNode
}) {
  return (
    <div className="motion-arrive flex items-center gap-3 text-[13.5px] leading-[1.45] text-ink-200">
      <span className="grid size-[34px] shrink-0 place-items-center rounded-[11px] bg-lav-400/10 text-lav-300 ring-1 ring-lav-400/25 ring-inset">
        <Icon className="size-4" />
      </span>
      <div>
        {children}
        <span className="block text-[12px] text-ink-400">{small}</span>
      </div>
    </div>
  )
}

function Nope({ children }: { children: ReactNode }) {
  return (
    <div className="motion-land flex items-center gap-[9px] text-[12.5px] text-state-warn">
      <KeyRound className="size-4 shrink-0" />
      {children}
    </div>
  )
}
