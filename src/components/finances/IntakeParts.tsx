import { useState } from 'react'
import { useMutation } from 'convex/react'
import { Plus, Search, X } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { FIELD, PILL_LOUD } from '@/components/finances/bits'
import { AccountLogo } from '@/components/finances/Logo'
import { failureMessage } from '@/lib/convex-errors'
import { productById, searchProducts } from '@/lib/institutions'

export function Section({
  title,
  aside,
  children,
}: {
  title: string
  aside?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-1 rounded-[14px] bg-lift/[0.02] p-3 ring-1 ring-lift/[0.07] ring-inset">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
        <span className="font-mono text-[10.5px] tracking-[0.14em] text-ink-400 uppercase">
          {title}
        </span>
        {typeof aside === 'string' ? (
          <span className="font-mono text-[10.5px] text-ink-500">{aside}</span>
        ) : (
          aside
        )}
      </div>
      {children}
    </section>
  )
}

/* "Create Revolut?" — a file from a bank the app knows and he has
   not added: one tap makes it, with its logo, kind and the ending the file
   printed, and the review carries on into it. */
export function CreateSuggested({
  suggest,
  onCreated,
}: {
  suggest: { product: string; name: string; accountTail: string | null }
  onCreated: (id: Id<'accounts'>) => void
}) {
  const create = useMutation(api.accounts.create)
  const [busy, setBusy] = useState(false)
  const product = productById(suggest.product)
  if (!product) return null
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        setBusy(true)
        void create({
          name: product.name,
          kinds: product.kinds,
          currencies: product.currencies,
          domain: product.domain,
          product: product.id,
          ibanTails: suggest.accountTail ? [suggest.accountTail] : undefined,
        })
          .then(onCreated)
          .finally(() => setBusy(false))
      }}
      className={`${PILL_LOUD} motion-land`}
    >
      <AccountLogo name={product.name} domain={product.domain} size={16} />
      create {product.name}?
    </button>
  )
}

/* "+ another" (27 Sep): the file is from somewhere he has no account for
   yet, and the reader could not say where (a Trade Republic screen reads
   only "Wealth"). The banks and brokers the app knows, searchable; a tap
   makes the account and puts the file into it. */
export function AnotherAccount({
  want,
  have,
  onCreated,
}: {
  want: 'bank' | 'broker'
  have: ReadonlyArray<Doc<'accounts'>>
  onCreated: (id: Id<'accounts'>) => void
}) {
  const create = useMutation(api.accounts.create)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const owned = new Set(have.map((a) => a.institution).filter(Boolean))
  const list = searchProducts(q)
    .filter((p) => p.kinds.includes(want) && !owned.has(p.institution))
    .slice(0, 9)

  async function make(args: Parameters<typeof create>[0]) {
    setBusy(true)
    setError(null)
    try {
      onCreated(await create(args))
      setOpen(false)
      setQ('')
    } catch (e) {
      setError(failureMessage(e) ?? 'Not added — try again.')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="motion-press inline-flex items-center gap-1.5 rounded-full border border-dashed border-lift/20 px-3 py-1.5 font-mono text-[10.5px] tracking-[0.12em] text-ink-400 uppercase hover:border-lav-400/45 hover:text-foreground"
      >
        <Plus className="size-3.5" />
        another
      </button>
    )
  }
  return (
    <div className="motion-arrive flex w-full flex-col gap-2 rounded-[14px] bg-lift/[0.03] p-2.5 ring-1 ring-lift/8 ring-inset">
      <div className="flex items-center gap-2">
        <label className={`${FIELD} flex flex-1 items-center gap-2`}>
          <Search className="size-4 text-ink-500" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false)
            }}
            placeholder={`Which ${want}?`}
            aria-label={`Find a ${want}`}
            className="w-full bg-transparent focus:outline-none"
          />
        </label>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close"
          className="grid size-9 place-items-center rounded-full text-ink-400 ring-1 ring-lift/12 ring-inset hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {list.map((p, i) => (
          <button
            key={p.id}
            type="button"
            disabled={busy}
            onClick={() =>
              void make({
                name: p.name,
                kinds: p.kinds,
                currencies: p.currencies,
                domain: p.domain,
                product: p.id,
              })
            }
            style={{ animationDelay: `${i * 20}ms` }}
            className="motion-land motion-press flex items-center gap-2 rounded-[12px] bg-lift/[0.035] p-2 text-left text-[13px] text-foreground ring-1 ring-lift/10 ring-inset hover:ring-lav-400/45"
          >
            <AccountLogo name={p.name} domain={p.domain ?? null} size={24} />
            <span className="truncate">{p.name}</span>
          </button>
        ))}
        {q.trim() ? (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void make({ name: q.trim(), kinds: [want], currencies: ['EUR'] })
            }
            className="motion-press flex items-center gap-2 rounded-[12px] border border-dashed border-lift/20 p-2 text-left text-[13px] text-ink-300 hover:border-lav-400/45"
          >
            <Plus className="size-4" />
            <span className="truncate">“{q.trim()}” — not listed</span>
          </button>
        ) : null}
      </div>
      {error ? (
        <span className="font-mono text-[11px] text-state-warn">{error}</span>
      ) : null}
    </div>
  )
}
