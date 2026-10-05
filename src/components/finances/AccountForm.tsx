import { useEffect, useRef, useState } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { Loader2, Plus, Search } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { FIELD, PILL_LOUD, PILL_QUIET } from '@/components/finances/bits'
import { AccountLogo } from '@/components/finances/Logo'
import { Sheet } from '@/components/finances/Sheet'
import { useDayStarts } from '@/components/track/useDayStarts'
import { ACCOUNT_KINDS, CURRENCIES } from '@/lib/currency'
import type { AccountKind } from '@/lib/currency'
import { PRODUCTS, productIn, searchProducts } from '@/lib/institutions'
import type { Product } from '@/lib/institutions'
import { failureMessage } from '@/lib/convex-errors'
import { KindBadge, SavedNote } from '@/components/finances/AccountParts'

/* Add, edit, delete — one sheet. Delete asks first, and says what it means:
   gone from every list and total; what it paid and earned stays. */
export function AccountSheet({
  account,
  onClose,
}: {
  account: Doc<'accounts'> | 'new' | null
  onClose: () => void
}) {
  const editing = account !== null && account !== 'new' ? account : null
  return (
    <Sheet
      open={account !== null}
      title={editing ? `edit · ${editing.name}` : 'new account'}
      onClose={onClose}
    >
      {account !== null ? (
        <AccountForm
          key={editing?._id ?? 'new'}
          account={editing}
          onDone={onClose}
        />
      ) : null}
    </Sheet>
  )
}

export function AccountForm({
  account,
  onDone,
}: {
  account: Doc<'accounts'> | null
  onDone: () => void
}) {
  const [picked, setPicked] = useState<Product | 'other' | null>(
    account
      ? (PRODUCTS.find((p) => p.institution === account.institution) ??
          productIn(account.name) ??
          'other')
      : null,
  )
  if (picked === null) {
    return <PickBank onPick={setPicked} />
  }
  return (
    <AccountDetails
      account={account}
      product={picked === 'other' ? null : picked}
      onChangeBank={account ? undefined : () => setPicked(null)}
      onDone={onDone}
    />
  )
}

/* Step one: which bank. The ones he is likely to have, with their marks;
   a search for the rest; "other" for anything the app does not know. */
function PickBank({ onPick }: { onPick: (p: Product | 'other') => void }) {
  const [q, setQ] = useState('')
  const list = searchProducts(q)
  return (
    <>
      <label className={`${FIELD} flex items-center gap-2`}>
        <Search className="size-4 text-ink-500" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Which bank or broker?"
          aria-label="Find a bank or broker"
          className="w-full bg-transparent focus:outline-none"
        />
      </label>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {list.map((p, i) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onPick(p)}
            style={{ animationDelay: `${i * 20}ms` }}
            className="motion-land motion-press flex items-center gap-2.5 rounded-[14px] bg-lift/[0.035] p-2.5 text-left ring-1 ring-lift/10 ring-inset hover:ring-lav-400/45"
          >
            <AccountLogo name={p.name} domain={p.domain ?? null} size={30} />
            <span className="flex min-w-0 flex-col gap-1">
              <span className="truncate text-[13.5px] text-foreground">
                {p.name}
              </span>
              <span className="flex gap-1">
                {p.kinds.map((k) => (
                  <KindBadge key={k} kind={k} />
                ))}
              </span>
            </span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => onPick('other')}
          className="motion-press flex items-center gap-2.5 rounded-[14px] border border-dashed border-lift/20 p-2.5 text-left text-[13.5px] text-ink-300 hover:border-lav-400/45"
        >
          <Plus className="size-4" />
          {q.trim() ? `“${q.trim()}” — not listed` : 'another one'}
        </button>
      </div>
    </>
  )
}

/* Step two: what the bank did not already say — the name he calls it,
   currencies, the endings that let a statement find it, and what it holds
   today (or on the day he knows). */
function AccountDetails({
  account,
  product,
  onChangeBank,
  onDone,
}: {
  account: Doc<'accounts'> | null
  product: Product | null
  onChangeBank?: () => void
  onDone: () => void
}) {
  const today = useDayStarts(1).at(-1) as number
  const create = useMutation(api.accounts.create)
  const update = useMutation(api.accounts.update)
  const remove = useMutation(api.accounts.remove)
  const erase = useMutation(api.accounts.erase)
  const setBalance = useMutation(api.accounts.setBalance)
  const [name, setName] = useState(account?.name ?? product?.name ?? '')
  const [kinds, setKinds] = useState<Array<AccountKind>>(
    account?.kinds ?? (product ? product.kinds : ['bank']),
  )
  const [currencies, setCurrencies] = useState<Array<string>>(
    account?.currencies ?? product?.currencies ?? ['EUR'],
  )
  const [domain, setDomain] = useState(account?.domain ?? product?.domain ?? '')
  const [iban, setIban] = useState((account?.ibanTails ?? []).join(', '))
  const [cards, setCards] = useState((account?.cardTails ?? []).join(', '))
  const [opening, setOpening] = useState<Record<string, string>>({})
  const [asOf, setAsOf] = useState(() => new Date().toISOString().slice(0, 10))
  const [more, setMore] = useState(false)
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /* Adding "Cash" when there is a Cash already means more notes in the same
     wallet, not a second wallet: the new currencies join the one he has. */
  const others = useQuery(api.accounts.list, account ? 'skip' : {})
  const twin = account
    ? undefined
    : others?.find((a) => a.name.toLowerCase() === name.trim().toLowerCase())

  const toggle = <T,>(list: Array<T>, x: T) =>
    list.includes(x) ? list.filter((y) => y !== x) : [...list, x]
  const shown = more
    ? CURRENCIES
    : [...new Set([...CURRENCIES.slice(0, 6), ...currencies])]
  const tails = (s: string) =>
    s
      .split(/[,\s]+/)
      .map((x) => x.trim())
      .filter(Boolean)

  /* Seen to land (5 Oct, every press answers): "adding" at once, then a
     tick and the words, then the sheet closes. */
  const [busy, setBusy] = useState(false)
  /* The words are fixed when he presses: once the new account exists it
     is its own "twin", and "Added to Trading 212" would be wrong. */
  const [saved, setSaved] = useState<string | null>(null)
  const close = useRef(onDone)
  close.current = onDone
  useEffect(() => {
    if (saved === null) return
    const t = setTimeout(() => close.current(), 1400)
    return () => clearTimeout(t)
  }, [saved])

  async function save() {
    setError(null)
    setBusy(true)
    const title = account
      ? `${name} saved`
      : twin
        ? `Added to ${twin.name}`
        : `${name} added`
    try {
      const args = {
        name,
        kinds,
        currencies,
        domain: domain.trim() || undefined,
        product: product?.id,
        ibanTails: tails(iban),
        cardTails: tails(cards),
      }
      let id = account?._id ?? twin?._id
      if (account) await update({ accountId: account._id, ...args })
      else if (twin) {
        await update({
          accountId: twin._id,
          name: twin.name,
          kinds: twin.kinds,
          currencies: [...new Set([...twin.currencies, ...currencies])],
          domain: twin.domain,
        })
      } else id = await create(args)
      /* A day in the past is true at its end; today is true now. */
      const day = new Date(`${asOf}T23:59:59`).getTime()
      for (const c of currencies) {
        const raw = (opening[c] as string | undefined)?.trim()
        if (!raw || !id) continue
        const n = Number(raw.replace(/\s/g, '').replace(',', '.'))
        if (!Number.isFinite(n)) throw new Error(`${c}: not a number`)
        await setBalance({
          accountId: id,
          currency: c,
          value: n,
          dayStart: today,
          asOf: day >= Date.now() ? undefined : day,
        })
      }
      setSaved(title)
    } catch (e) {
      setError(
        failureMessage(e) ?? (e instanceof Error ? e.message : 'Not saved'),
      )
    } finally {
      setBusy(false)
    }
  }

  if (saved !== null)
    return (
      <SavedNote
        name={name}
        title={saved}
        note={account ? 'saved' : 'in your accounts now'}
      />
    )

  return (
    <>
      <div className="flex items-center gap-3">
        <AccountLogo name={name || '?'} domain={domain || null} size={40} />
        <input
          autoFocus={!product}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="What you call it"
          aria-label="Name"
          className={`${FIELD} min-w-0 flex-1`}
        />
        {onChangeBank ? (
          <button type="button" onClick={onChangeBank} className={PILL_QUIET}>
            change
          </button>
        ) : null}
      </div>
      {product ? (
        <span className="flex items-center gap-2 text-[12.5px] text-ink-400">
          {product.kinds.map((k) => (
            <KindBadge key={k} kind={k} />
          ))}
          {product.kinds.length > 1
            ? 'Its cash and its investments, in one account.'
            : product.kinds[0] === 'broker'
              ? 'Its free cash, and its investments from a screenshot.'
              : product.kinds[0] === 'cash'
                ? 'The notes in your wallet — counted, not read.'
                : 'Its statements fill it; transfers to your other accounts are matched.'}
        </span>
      ) : (
        <>
          <span className="label-caps">what it is</span>
          <div className="flex flex-wrap gap-1.5">
            {ACCOUNT_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={kinds.includes(k)}
                onClick={() => setKinds((ks) => toggle(ks, k))}
                className={kinds.includes(k) ? PILL_LOUD : PILL_QUIET}
              >
                {k}
              </button>
            ))}
          </div>
          <label className={`${FIELD} flex items-center gap-2`}>
            <span className="shrink-0 font-mono text-[10.5px] text-ink-500">
              logo from
            </span>
            <input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="mybank.com"
              aria-label="Website for the logo"
              className="w-full bg-transparent focus:outline-none"
            />
          </label>
        </>
      )}
      <span className="label-caps">currencies it holds</span>
      <div className="flex flex-wrap gap-1.5">
        {shown.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={currencies.includes(c)}
            onClick={() => setCurrencies((cs) => toggle(cs, c))}
            className={currencies.includes(c) ? PILL_LOUD : PILL_QUIET}
          >
            {c}
          </button>
        ))}
        {!more ? (
          <button
            type="button"
            onClick={() => setMore(true)}
            className={PILL_QUIET}
          >
            more…
          </button>
        ) : null}
      </div>
      {kinds.includes('cash') && kinds.length === 1 ? null : (
        <>
          <span className="label-caps">how statements show it · optional</span>
          <div className="grid grid-cols-2 gap-2">
            <label className={`${FIELD} flex items-center gap-2`}>
              <span className="shrink-0 font-mono text-[10.5px] text-ink-500">
                IBAN …
              </span>
              <input
                inputMode="numeric"
                value={iban}
                onChange={(e) => setIban(e.target.value)}
                placeholder="0120"
                aria-label="Last four digits of the IBAN"
                className="w-full bg-transparent font-mono focus:outline-none"
              />
            </label>
            <label className={`${FIELD} flex items-center gap-2`}>
              <span className="shrink-0 font-mono text-[10.5px] text-ink-500">
                card ••
              </span>
              <input
                inputMode="numeric"
                value={cards}
                onChange={(e) => setCards(e.target.value)}
                placeholder="2789"
                aria-label="Last four digits of its cards"
                className="w-full bg-transparent font-mono focus:outline-none"
              />
            </label>
          </div>
          <span className="text-[12px] text-ink-500">
            The last four digits. A transfer from PT50…0120 then lands on this
            account by itself.
          </span>
        </>
      )}
      {account ? null : (
        <>
          <span className="label-caps">what it holds · optional</span>
          {currencies.map((c) => (
            <label key={c} className={`${FIELD} flex items-center gap-2`}>
              <span className="rounded-[4px] bg-lift/[0.06] px-1.5 font-mono text-[10.5px] text-ink-300">
                {c}
              </span>
              <input
                inputMode="decimal"
                value={opening[c] ?? ''}
                onChange={(e) =>
                  setOpening({ ...opening, [c]: e.target.value })
                }
                placeholder={
                  kinds.includes('broker') ? 'free cash, not investments' : '0'
                }
                aria-label={`${name} ${c} now`}
                className="w-full bg-transparent text-[16px] focus:outline-none"
              />
            </label>
          ))}
          <label className={`${FIELD} flex items-center gap-2`}>
            <span className="shrink-0 font-mono text-[10.5px] text-ink-500">
              as of
            </span>
            <input
              type="date"
              value={asOf}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setAsOf(e.target.value)}
              className="w-full bg-transparent focus:outline-none"
            />
          </label>
          <span className="text-[12px] text-ink-500">
            Or leave it — drop a statement or a screenshot on + and it is read
            from there, with the day it is true.
          </span>
        </>
      )}
      {twin ? (
        <span className="text-[12.5px] text-ink-300">
          You already have {twin.name} ({twin.currencies.join(', ')}). This adds
          to it — a currency left blank keeps what it holds.
        </span>
      ) : null}
      {error ? (
        <span className="font-mono text-[11px] text-state-warn">{error}</span>
      ) : null}
      <button
        type="button"
        disabled={busy}
        onClick={() => void save()}
        className={`${PILL_LOUD} justify-center gap-2 py-3 disabled:opacity-70`}
      >
        {busy ? (
          <>
            <Loader2 className="size-3.5 animate-spin" />
            {account ? 'saving' : 'adding'}
          </>
        ) : account ? (
          'save'
        ) : twin ? (
          `add to ${twin.name}`
        ) : (
          `add ${name || 'account'}`
        )}
      </button>
      {account ? (
        <div className="flex flex-col gap-2 border-t border-lift/[0.07] pt-4">
          {asking ? (
            <>
              <span className="text-[14px] text-foreground">
                Delete {account.name}?
              </span>
              <span className="text-[12.5px] text-ink-500">
                It leaves every list and total. What it paid and earned stays in
                your history — those things happened. If only the name is wrong,
                edit it instead.
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAsking(false)}
                  className={`${PILL_QUIET} flex-1 justify-center py-2.5`}
                >
                  keep it
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void remove({ accountId: account._id }).then(onDone)
                  }
                  className="motion-press inline-flex flex-1 items-center justify-center rounded-full bg-state-danger/14 py-2.5 font-mono text-[10.5px] tracking-[0.12em] text-state-danger uppercase ring-1 ring-state-danger/45 ring-inset"
                >
                  delete
                </button>
              </div>
              <button
                type="button"
                onClick={() =>
                  void erase({ accountId: account._id }).then(onDone)
                }
                className="self-center font-mono text-[10.5px] tracking-[0.1em] text-ink-500 uppercase underline-offset-4 hover:text-state-danger hover:underline"
              >
                a test, or read twice? erase it with its history
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setAsking(true)}
              className="motion-press inline-flex items-center justify-center rounded-full bg-state-danger/10 py-2.5 font-mono text-[10.5px] tracking-[0.12em] text-state-danger uppercase ring-1 ring-state-danger/40 ring-inset"
            >
              delete {account.name}
            </button>
          )}
        </div>
      ) : null}
    </>
  )
}
