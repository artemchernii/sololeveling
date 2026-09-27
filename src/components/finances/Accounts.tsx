import { useState } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { Pencil, Plus } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { FIELD, PILL_LOUD, PILL_QUIET, Panel } from '@/components/finances/bits'
import { DropFiles } from '@/components/finances/Add'
import { AccountLogo } from '@/components/finances/Logo'
import { Sheet } from '@/components/finances/Sheet'
import { Veiled } from '@/components/finances/Veil'
import { SkeletonRows } from '@/components/Skeleton'
import { useDayStarts } from '@/components/track/useDayStarts'
import { ACCOUNT_KINDS, CURRENCIES, money } from '@/lib/currency'
import type { AccountKind } from '@/lib/currency'
import { agoLabel } from '@/lib/format'
import { euros } from '@/lib/money'

/* Accounts, in the Overview room (Treasury, 27 Sep). His, not hard-coded:
   filter by what they are, add one, edit or delete one, update one. Each
   card shows what the account holds in all, a line per currency pocket
   (a USD pocket with the euros it is worth), what its shares are worth
   when it holds any, and how fresh it is. */

const KIND_STYLE: Record<AccountKind, string> = {
  bank: 'text-acct-bank ring-acct-bank/35 bg-acct-bank/8',
  broker: 'text-lav-300 ring-lav-400/40 bg-lav-400/10',
  cash: 'text-acct-cash ring-acct-cash/35 bg-acct-cash/8',
}

export function KindBadge({ kind }: { kind: AccountKind }) {
  return (
    <span
      className={`rounded-[6px] px-1.5 py-0.5 font-mono text-[9.5px] tracking-[0.14em] uppercase ring-1 ring-inset ${KIND_STYLE[kind]}`}
    >
      {kind}
    </span>
  )
}

export function Accounts() {
  const data = useQuery(api.aggregate.balances, {})
  const worth = useQuery(api.aggregate.worth, {})
  const accounts = useQuery(api.accounts.list, {})
  const [kind, setKind] = useState<AccountKind | 'all'>('all')
  const [editing, setEditing] = useState<Doc<'accounts'> | 'new' | null>(null)
  const [updating, setUpdating] = useState<Doc<'accounts'> | null>(null)

  const list = (data?.accounts ?? []).filter(
    (a) => kind === 'all' || a.kinds.includes(kind),
  )

  return (
    <Panel
      title="accounts"
      aside={
        <>
          <div className="flex flex-wrap gap-1.5">
            {(['all', ...ACCOUNT_KINDS] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={kind === k ? PILL_LOUD : PILL_QUIET}
              >
                {k}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setEditing('new')}
            className={PILL_QUIET}
          >
            <Plus className="size-3" />
            account
          </button>
        </>
      }
    >
      {data === undefined || accounts === undefined ? (
        <SkeletonRows rows={3} twoLine rowClassName="py-4" />
      ) : data.accounts.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <p className="max-w-sm text-[13.5px] text-ink-400">
            Add where your money sits — a bank, a broker, the cash in your
            wallet. Then drop a statement or a screenshot on + and it fills
            itself.
          </p>
          <button
            type="button"
            onClick={() => setEditing('new')}
            className={PILL_LOUD}
          >
            <Plus className="size-3" />
            first account
          </button>
        </div>
      ) : list.length === 0 ? (
        <p className="py-4 text-center text-[13px] text-ink-500">
          No {kind} accounts.
        </p>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((a, i) => {
            const doc = accounts.find((x) => x._id === a.accountId)
            const w = worth?.byAccount.find((x) => x.accountId === a.accountId)
            const invested = w?.invested ?? null
            const readAt = a.pockets.reduce<number | null>(
              (m, p) =>
                p.recordedAt === null
                  ? m
                  : m === null
                    ? p.recordedAt
                    : Math.min(m, p.recordedAt),
              null,
            )
            const stale =
              readAt !== null && Date.now() - readAt > 14 * 86_400_000
            return (
              <div
                key={a.accountId}
                style={{ animationDelay: `${i * 40}ms` }}
                className="motion-land flex h-full flex-col gap-3 rounded-[16px] bg-lift/[0.035] p-3.5 ring-1 ring-lift/10 ring-inset"
              >
                <div className="flex items-center gap-2.5">
                  <AccountLogo name={a.name} domain={a.domain} />
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="truncate text-[15px] text-foreground">
                      {a.name}
                    </span>
                    <span className="flex gap-1">
                      {a.kinds.map((k) => (
                        <KindBadge key={k} kind={k} />
                      ))}
                    </span>
                  </span>
                  {doc ? (
                    <button
                      type="button"
                      onClick={() => setEditing(doc)}
                      aria-label={`Edit or delete ${a.name}`}
                      className={PILL_QUIET}
                    >
                      <Pencil className="size-3" />
                      edit
                    </button>
                  ) : null}
                </div>
                <span className="text-[26px] leading-none font-light text-foreground">
                  <Veiled>
                    {euros(
                      Math.round((a.cashEur + (invested ?? 0)) * 100) / 100,
                    )}
                  </Veiled>
                </span>
                <div className="flex flex-col gap-1 font-mono text-[11.5px]">
                  {a.pockets.map((p) => (
                    <span
                      key={p.currency}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="text-ink-500">
                        free cash{' '}
                        <span className="rounded-[4px] bg-lift/[0.06] px-1 text-[10px] text-ink-300">
                          {p.currency}
                        </span>
                      </span>
                      <span className="text-ink-100">
                        {p.value === null ? (
                          <span className="text-ink-600">not typed</span>
                        ) : (
                          <Veiled>
                            {money(p.value, p.currency)}
                            {p.currency !== 'EUR' && p.eur !== null ? (
                              <span className="text-ink-500">
                                {' '}
                                ≈ {euros(p.eur)}
                              </span>
                            ) : null}
                          </Veiled>
                        )}
                      </span>
                    </span>
                  ))}
                  {invested !== null ? (
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-ink-500">shares worth</span>
                      <Veiled>{euros(invested)}</Veiled>
                    </span>
                  ) : null}
                </div>
                <div className="mt-auto flex items-center justify-between gap-2 border-t border-lift/[0.06] pt-2.5">
                  <span
                    className={`font-mono text-[10.5px] ${stale ? 'text-state-warn' : 'text-ink-500'}`}
                  >
                    {readAt === null
                      ? 'nothing read yet'
                      : `read ${agoLabel(readAt)}`}
                  </span>
                  {doc ? (
                    <button
                      type="button"
                      onClick={() => setUpdating(doc)}
                      className={
                        stale || readAt === null ? PILL_LOUD : PILL_QUIET
                      }
                    >
                      update
                    </button>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <AccountSheet account={editing} onClose={() => setEditing(null)} />
      <UpdateSheet account={updating} onClose={() => setUpdating(null)} />
    </Panel>
  )
}

/* Add, edit, delete — one sheet. Delete asks first, and says what it means:
   gone from every list and total; what it paid and earned stays. */
function AccountSheet({
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

function AccountForm({
  account,
  onDone,
}: {
  account: Doc<'accounts'> | null
  onDone: () => void
}) {
  const create = useMutation(api.accounts.create)
  const update = useMutation(api.accounts.update)
  const remove = useMutation(api.accounts.remove)
  const [name, setName] = useState(account?.name ?? '')
  const [kinds, setKinds] = useState<Array<AccountKind>>(
    account?.kinds ?? ['bank'],
  )
  const [currencies, setCurrencies] = useState<Array<string>>(
    account?.currencies ?? ['EUR'],
  )
  const [domain, setDomain] = useState(account?.domain ?? '')
  const [more, setMore] = useState(false)
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggle = <T,>(list: Array<T>, x: T) =>
    list.includes(x) ? list.filter((y) => y !== x) : [...list, x]
  const shown = more ? CURRENCIES : CURRENCIES.slice(0, 6)

  async function save() {
    setError(null)
    try {
      const args = {
        name,
        kinds,
        currencies,
        domain: domain.trim() || undefined,
      }
      if (account) await update({ accountId: account._id, ...args })
      else await create(args)
      onDone()
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message.replace(/^.*?Uncaught ConvexError: /, '').split('\n')[0]
          : 'Not saved',
      )
    }
  }

  return (
    <>
      <div className="flex items-center gap-3">
        <AccountLogo name={name || '?'} domain={domain || null} size={40} />
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Revolut, BPI, Notes…"
          aria-label="Name"
          className={`${FIELD} min-w-0 flex-1`}
        />
      </div>
      <span className="label-caps">what it is — pick any</span>
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
      <label className={`${FIELD} flex items-center gap-2`}>
        <span className="shrink-0 font-mono text-[10.5px] text-ink-500">
          logo from
        </span>
        <input
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="revolut.com"
          aria-label="Website for the logo"
          className="w-full bg-transparent focus:outline-none"
        />
      </label>
      {error ? (
        <span className="font-mono text-[11px] text-state-warn">{error}</span>
      ) : null}
      <button
        type="button"
        onClick={() => void save()}
        className={`${PILL_LOUD} justify-center py-3`}
      >
        {account ? 'save' : 'add account'}
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

/* Update: type each currency, or drop a statement or screenshot of this
   account — the same reader as +, told which account it is. */
function UpdateSheet({
  account,
  onClose,
}: {
  account: Doc<'accounts'> | null
  onClose: () => void
}) {
  const [tab, setTab] = useState<'type' | 'file'>('type')
  return (
    <Sheet
      open={account !== null}
      title={account ? `update · ${account.name}` : 'update'}
      onClose={onClose}
    >
      {account ? (
        <>
          <div className="flex gap-1 rounded-[12px] bg-lift/[0.04] p-1">
            {(['type', 'file'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`flex-1 rounded-[9px] py-2 font-mono text-[11px] tracking-[0.12em] uppercase ${tab === t ? 'bg-lav-400/16 text-foreground ring-1 ring-lav-400/40 ring-inset' : 'text-ink-400'}`}
              >
                {t === 'type' ? 'type it' : 'statement or screenshot'}
              </button>
            ))}
          </div>
          {tab === 'type' ? (
            <TypeBalances
              key={account._id}
              account={account}
              onDone={onClose}
            />
          ) : (
            <DropFiles accountId={account._id} onStarted={onClose} />
          )}
        </>
      ) : null}
    </Sheet>
  )
}

function TypeBalances({
  account,
  onDone,
}: {
  account: Doc<'accounts'>
  onDone: () => void
}) {
  const today = useDayStarts(1).at(-1) as number
  const data = useQuery(api.aggregate.balances, {})
  const setBalance = useMutation(api.accounts.setBalance)
  const pockets =
    data?.accounts.find((a) => a.accountId === account._id)?.pockets ?? []
  const [values, setValues] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setError(null)
    try {
      for (const c of account.currencies) {
        if (!(c in values)) continue
        const raw = values[c]
        if (raw.trim() === '') continue
        const n = Number(raw.replace(/\s/g, '').replace(',', '.'))
        if (!Number.isFinite(n)) throw new Error(`${c}: not a number`)
        await setBalance({
          accountId: account._id,
          currency: c,
          value: n,
          dayStart: today,
        })
      }
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message.split('\n')[0] : 'Not saved')
    }
  }

  return (
    <>
      <span className="text-[12.5px] text-ink-400">
        The free cash the app shows now — shares are not in it.
      </span>
      {account.currencies.map((c) => {
        const p = pockets.find((x) => x.currency === c)
        return (
          <label key={c} className={`${FIELD} flex items-center gap-2`}>
            <span className="rounded-[4px] bg-lift/[0.06] px-1.5 font-mono text-[10.5px] text-ink-300">
              {c}
            </span>
            <input
              inputMode="decimal"
              value={
                values[c] ??
                (p?.value === null || p?.value === undefined
                  ? ''
                  : String(p.value))
              }
              onChange={(e) => setValues({ ...values, [c]: e.target.value })}
              placeholder="0"
              aria-label={`${account.name} ${c}`}
              className="w-full bg-transparent text-[18px] focus:outline-none"
            />
            {p?.recordedAt ? (
              <span className="shrink-0 font-mono text-[10.5px] text-ink-500">
                {agoLabel(p.recordedAt)}
              </span>
            ) : null}
          </label>
        )
      })}
      {error ? (
        <span className="font-mono text-[11px] text-state-warn">{error}</span>
      ) : null}
      <button
        type="button"
        onClick={() => void save()}
        className={`${PILL_LOUD} justify-center py-3`}
      >
        save
      </button>
    </>
  )
}
