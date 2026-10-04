import { useState } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'

import { api } from '../../../../convex/_generated/api'
import type { Doc, Id } from '../../../../convex/_generated/dataModel'
import { AccountLogo } from '@/components/finances/Logo'
import { FIELD, PILL_LOUD } from '@/components/finances/bits'
import { failureMessage } from '@/lib/convex-errors'
import { SPEND_CATEGORIES } from '@/lib/money'
import { payeeKey } from '@/lib/payee'
import { bankPhrase, knownShop, payeeIdOf, siteFor } from '@/lib/payees'

/* Payees on the page (4 Oct; mockup design/treasury-mockup/payees.html).
   Who a row is: his name for it if he gave one, else a shop the app knows,
   else what the bank wrote — and the bank's words always kept, smaller,
   underneath ("I dont mind if we show as well original name … like
   subheading"). */

export type Who = {
  key: string
  /** The name shown. */
  name: string
  /** What the bank wrote, when the name is not it. */
  original: string | null
  domain: string | null
  partOf: string | null
  /** 'yours': he named it. 'known': a shop the app knows. */
  source: 'yours' | 'known' | null
}

export function usePayees() {
  const list = useQuery(api.payees.list, {})
  const byKey = new Map((list ?? []).map((p) => [p.key, p]))
  /** The "part of" names he uses — Mortgage, Insurance. */
  const parts = [
    ...new Set((list ?? []).flatMap((p) => (p.partOf ? [p.partOf] : []))),
  ]
  return { who, parts }
  function who(row: { raw?: string; name: string; payee?: string }): Who {
    const line = row.raw ?? row.name
    const key = payeeIdOf(line)
    /* A PayPal payment he named on its own (4 Oct). */
    if (row.payee) {
      return {
        key,
        name: row.payee,
        original: row.name !== row.payee ? row.name : null,
        domain: knownShop(payeeKey(row.payee))?.domain ?? siteFor(row.payee),
        partOf: null,
        source: 'yours',
      }
    }
    const mine = byKey.get(key)
    if (mine) {
      return {
        key,
        name: mine.name,
        original: row.name !== mine.name ? row.name : null,
        domain: mine.domain ?? null,
        partOf: mine.partOf ?? null,
        source: 'yours',
      }
    }
    /* A shop the app knows, or what a Portuguese bank's words mean (4 Oct:
       the box asking YES to seven names was a form he did not know how to
       use) — named straight away, the bank's words kept underneath, and
       his own name over it with one tap. */
    const paypal = key.startsWith('PAYPAL')
    const shop = paypal ? null : knownShop(payeeKey(line))
    const phrase = paypal ? null : bankPhrase(line)
    if (shop || phrase) {
      const name = phrase?.name ?? shop?.name ?? row.name
      return {
        key,
        name,
        original:
          row.name.toUpperCase() !== name.toUpperCase() ? row.name : null,
        domain: shop?.domain ?? null,
        partOf: phrase?.partOf ?? null,
        source: 'known',
      }
    }
    return {
      key,
      name: row.name,
      original: null,
      domain: null,
      partOf: null,
      source: null,
    }
  }
}

/** A payee's mark: its logo (or letters), the bank small in the corner. */
export function PayeeMark({
  who,
  account,
}: {
  who: Who
  account?: Doc<'accounts'>
}) {
  const [failed, setFailed] = useState(false)
  return (
    <span className="relative size-8 shrink-0">
      {who.domain && !failed ? (
        <img
          src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(who.domain)}&sz=64`}
          alt=""
          aria-hidden
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="size-8 rounded-[9px] bg-mark-ground object-contain p-1"
        />
      ) : account ? (
        <AccountLogo name={account.name} domain={account.domain} size={32} />
      ) : (
        <span className="grid size-8 place-items-center rounded-[9px] bg-lav-400/14 font-mono text-[11px] text-lav-300">
          {who.name.slice(0, 2).toUpperCase()}
        </span>
      )}
      {who.domain && !failed && account ? (
        <span className="absolute -right-1 -bottom-1 rounded-[5px] ring-2 ring-background">
          <AccountLogo name={account.name} domain={account.domain} size={15} />
        </span>
      ) : null}
    </span>
  )
}

/** The name, his tag, and the bank's words underneath. */
export function PayeeName({ who, onName }: { who: Who; onName?: () => void }) {
  const tag =
    who.source === 'yours' ? (
      <span className="rounded-[5px] bg-lav-400/10 px-1.5 py-px font-mono text-[9px] tracking-[0.12em] text-lav-300 uppercase ring-1 ring-lav-400/25 ring-inset">
        your name
      </span>
    ) : who.source === 'known' ? (
      <span className="rounded-[5px] bg-state-good/10 px-1.5 py-px font-mono text-[9px] tracking-[0.12em] text-state-good uppercase ring-1 ring-state-good/25 ring-inset">
        known
      </span>
    ) : who.key.startsWith('PAYPAL') ? (
      /* PayPal is many shops: an unnamed one asks, quietly. */
      <span className="rounded-[5px] bg-state-warn/10 px-1.5 py-px font-mono text-[9px] tracking-[0.12em] text-state-warn uppercase ring-1 ring-state-warn/25 ring-inset">
        what was it?
      </span>
    ) : null
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-2">
      {onName ? (
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation()
            onName()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onName()
          }}
          title="Who is this?"
          className="cursor-pointer truncate border-b border-dashed border-lift/25 text-[14px] hover:text-lav-300"
        >
          {who.name}
        </span>
      ) : (
        <span className="truncate text-[14px]">{who.name}</span>
      )}
      {tag}
    </span>
  )
}

/**
 * "Who is this?" — his name for a payee, the logo found from it, its
 * group, and what it is part of. Saves for every row of the payee.
 */
export function WhoIsThis({
  row,
  who,
  category,
  parts,
  onDone,
}: {
  row: { id: Id<'logs'>; raw?: string; name: string }
  who: Who
  category: string | null
  /** The "part of" names he already uses (Mortgage …). */
  parts: ReadonlyArray<string>
  onDone: (n: number, name: string) => void
}) {
  const set = useMutation(api.payees.set)
  const [name, setName] = useState(
    who.source === 'yours'
      ? who.name
      : (knownShop(payeeKey(row.raw ?? row.name))?.name ?? ''),
  )
  const [site, setSite] = useState<string | null>(who.domain)
  const [siteTouched, setSiteTouched] = useState(false)
  const [group, setGroup] = useState<string | null>(category)
  const [partOf, setPartOf] = useState<string | null>(who.partOf)
  const [newPart, setNewPart] = useState('')
  const [error, setError] = useState<string | null>(null)
  const domain = siteTouched ? site : (site ?? (name ? siteFor(name) : null))
  const paypal = who.key.startsWith('PAYPAL')
  const earlier = useQuery(api.payees.paypalNames, paypal ? {} : 'skip')

  async function save() {
    try {
      const n = await set({
        logId: row.id,
        name,
        domain: domain || null,
        category: group,
        partOf: partOf === '+' ? newPart.trim() || null : partOf,
      })
      onDone(n, name)
    } catch (e) {
      setError(failureMessage(e) ?? 'It did not save.')
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <span className="font-mono text-[11px] text-ink-500">
        the bank wrote: {row.raw ?? row.name}
      </span>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={
          paypal
            ? 'What was this one? Preply, Zalando…'
            : 'Who is it? Preply, Mango, Condominium…'
        }
        aria-label="Payee name"
        className={`${FIELD} text-[15px]`}
      />
      {paypal && earlier?.length ? (
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="label-caps">earlier through PayPal</span>
          {earlier.map((e) => (
            <Chip
              key={e.name}
              on={name === e.name}
              onClick={() => {
                setName(e.name)
                if (e.category) setGroup(e.category)
              }}
            >
              {e.name}
            </Chip>
          ))}
        </span>
      ) : null}
      <div className="flex items-center gap-3 rounded-[12px] bg-lift/[0.03] p-2.5">
        <PayeeMark
          who={{ ...who, name: name || '?', domain: domain ?? null }}
        />
        <span className="flex min-w-0 flex-1 flex-col">
          <input
            value={domain ?? ''}
            onChange={(e) => {
              setSiteTouched(true)
              setSite(e.target.value)
            }}
            placeholder="no site — its letters will do"
            aria-label="Site for the logo"
            className="bg-transparent font-mono text-[13px] text-foreground focus:outline-none"
          />
          <span className="font-mono text-[10.5px] text-ink-500">
            {domain
              ? 'logo from this site · change it if wrong'
              : 'type a site for a logo'}
          </span>
        </span>
      </div>

      <span className="label-caps">group</span>
      <span className="flex flex-wrap gap-1.5">
        {SPEND_CATEGORIES.map((c) => (
          <Chip key={c.id} on={group === c.id} onClick={() => setGroup(c.id)}>
            {c.label}
          </Chip>
        ))}
      </span>

      {paypal ? null : (
        <>
          <span className="label-caps">part of</span>
          <span className="flex flex-wrap items-center gap-1.5">
            <Chip on={partOf === null} onClick={() => setPartOf(null)}>
              nothing
            </Chip>
            {parts.map((p) => (
              <Chip key={p} on={partOf === p} onClick={() => setPartOf(p)}>
                {p}
              </Chip>
            ))}
            <Chip on={partOf === '+'} onClick={() => setPartOf('+')} dashed>
              + new
            </Chip>
            {partOf === '+' ? (
              <input
                value={newPart}
                onChange={(e) => setNewPart(e.target.value)}
                placeholder="Mortgage, Insurance…"
                aria-label="Part of"
                className={`${FIELD} py-1 text-[13px]`}
              />
            ) : null}
          </span>
        </>
      )}

      <span className="label-caps leading-relaxed">
        {paypal
          ? 'names this payment only — PayPal is Preply one day and a shop the next.'
          : 'applies to every row from this payee — and the next ones.'}
      </span>
      <button
        type="button"
        onClick={() => void save()}
        disabled={!name.trim()}
        className={`${PILL_LOUD} self-start disabled:opacity-40`}
      >
        save
      </button>
      {error ? (
        <span className="text-[12.5px] text-state-danger">{error}</span>
      ) : null}
    </div>
  )
}

function Chip({
  on,
  onClick,
  dashed,
  children,
}: {
  on: boolean
  onClick: () => void
  dashed?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 text-[12.5px] ring-1 ring-inset transition-colors ${dashed && !on ? 'border border-dashed border-lift/30 ring-0' : ''} ${
        on
          ? 'bg-lav-400/14 text-foreground ring-lav-400/45'
          : 'text-ink-300 ring-lift/12 hover:text-foreground hover:ring-lift/25'
      }`}
    >
      {children}
    </button>
  )
}
