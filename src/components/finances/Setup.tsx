import { useRef, useState } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import {
  Check,
  FileUp,
  Landmark,
  Loader2,
  Plus,
  Search,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { FIELD, PILL_QUIET } from '@/components/finances/bits'
import { DropFiles, useIntakeUpload } from '@/components/finances/Add'
import { IntakeFlow } from '@/components/finances/Intake'
import { IntakeStrip } from '@/components/finances/Reading'
import { AccountLogo } from '@/components/finances/Logo'
import { Sheet } from '@/components/finances/Sheet'
import { useDayStarts } from '@/components/track/useDayStarts'
import { CURRENCIES, money } from '@/lib/currency'
import type { AccountKind } from '@/lib/currency'
import { searchProducts } from '@/lib/institutions'
import type { Product } from '@/lib/institutions'

/* Bringing accounts in (27 Sep), as mocked on :3950 and approved. Files
   first: each statement or screenshot is read on its own and becomes an
   account — its balance and its movements from that day on — in a list
   that fills as the reads finish. No file at hand: one account at a time,
   in three steps — what it is, what is in it, how much. */

type Step =
  | { at: 'home' }
  | { at: 'found' }
  | { at: 'intake'; id: Id<'intakes'> }
  | { at: 'pick' }
  | { at: 'account'; product: Product | null }

const SOLID =
  'motion-press inline-flex items-center justify-center gap-1.5 rounded-full bg-lav-400 px-4 py-2.5 font-mono text-[11px] font-medium tracking-[0.14em] text-background uppercase disabled:opacity-40'

export function SetupSheet({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [step, setStep] = useState<Step>({ at: 'home' })
  const [reads, setReads] = useState<Array<Id<'intakes'>>>([])
  const [made, setMade] = useState<Array<Id<'accounts'>>>([])
  const found = () => setStep({ at: 'found' })
  const list = () =>
    setStep(reads.length + made.length > 0 ? { at: 'found' } : { at: 'home' })
  const close = () => {
    setStep({ at: 'home' })
    onClose()
  }
  const back =
    step.at === 'home' || step.at === 'found'
      ? undefined
      : step.at === 'account'
        ? () => setStep({ at: 'pick' })
        : list

  return (
    <Sheet
      open={open}
      title="accounts"
      onClose={close}
      onBack={back}
      wide={step.at === 'intake'}
    >
      {step.at === 'home' ? (
        <>
          <Intro />
          <DropFiles
            oneEach
            onStarted={(id) => {
              setReads((r) => [...r, id])
              found()
            }}
          />
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-400">
            No file at hand?
            <button
              type="button"
              onClick={() => setStep({ at: 'pick' })}
              className={PILL_QUIET}
            >
              add an account by hand
            </button>
          </div>
        </>
      ) : step.at === 'found' ? (
        <Found
          reads={reads}
          onCheck={(id) => setStep({ at: 'intake', id })}
          onMore={(id) => setReads((r) => [...r, id])}
          onByHand={() => setStep({ at: 'pick' })}
          onDone={close}
        />
      ) : step.at === 'intake' ? (
        <IntakeFlow intakeId={step.id} onBack={found} onDone={found} />
      ) : step.at === 'pick' ? (
        <Pick onPick={(product) => setStep({ at: 'account', product })} />
      ) : (
        <AccountSetup
          key={step.product?.id ?? 'other'}
          product={step.product}
          onSaved={(accountId, intakeId) => {
            setMade((m) => [...m, accountId])
            if (intakeId) {
              setReads((r) => [...r, intakeId])
              setStep({ at: 'intake', id: intakeId })
            } else found()
          }}
        />
      )}
    </Sheet>
  )
}

function Intro() {
  return (
    <div className="flex flex-col gap-2">
      <span className="label-caps">set up</span>
      <span className="text-[28px] leading-tight font-light text-foreground">
        Bring in your accounts
      </span>
      <span className="text-[13.5px] text-ink-400">
        Drop a statement or a screenshot from each bank and broker — several at
        once. Each one becomes an account: its balance, and every movement from
        that day on.
      </span>
    </div>
  )
}

/* The reads started here, each on its way to an account, and the accounts
   made by hand. A read that is done has become its account. */
function Found({
  reads,
  onCheck,
  onMore,
  onByHand,
  onDone,
}: {
  reads: Array<Id<'intakes'>>
  onCheck: (id: Id<'intakes'>) => void
  onMore: (id: Id<'intakes'>) => void
  onByHand: () => void
  onDone: () => void
}) {
  const open = useQuery(api.intake.open, {})
  const balances = useQuery(api.aggregate.balances, {})
  const pending = reads.filter((id) => open?.some((i) => i._id === id))
  const readyCount = pending.filter(
    (id) => open?.find((i) => i._id === id)?.status === 'ready',
  ).length
  /* Everything he has: in setup, every account is one just brought in. */
  const accounts = balances?.accounts ?? []
  /* Nothing on its way and nothing made (a failed file removed): back to
     the start, not an empty list under a heading. */
  if (balances !== undefined && pending.length === 0 && accounts.length === 0) {
    return (
      <>
        <Intro />
        <DropFiles oneEach onStarted={onMore} />
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-400">
          No file at hand?
          <button type="button" onClick={onByHand} className={PILL_QUIET}>
            add an account by hand
          </button>
        </div>
      </>
    )
  }
  const reading = pending.some(
    (id) => open?.find((i) => i._id === id)?.status === 'reading',
  )
  return (
    <>
      <div className="flex flex-col gap-1">
        <span className="label-caps">
          set up · {accounts.length}{' '}
          {accounts.length === 1 ? 'account' : 'accounts'}
          {pending.length > 0 ? ` · ${pending.length} on the way` : ''}
        </span>
        <span className="text-[26px] leading-tight font-light text-foreground">
          {reading
            ? 'Reading your files…'
            : readyCount > 0
              ? `${readyCount} to check`
              : 'Your accounts'}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {pending.map((id) => {
          const intake = open?.find((x) => x._id === id)
          return intake ? (
            <IntakeStrip key={id} intake={intake} onOpen={() => onCheck(id)} />
          ) : null
        })}
        {accounts.map((a) => (
          <div
            key={a.accountId}
            className="motion-land flex items-center gap-3 rounded-[12px] bg-lift/[0.035] p-3 ring-1 ring-lift/10 ring-inset"
          >
            <AccountLogo name={a.name} domain={a.domain} size={28} />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-[14px] text-foreground">
                {a.name}
              </span>
              <span className="truncate font-mono text-[10.5px] text-ink-400">
                {a.kinds.join(' · ')} ·{' '}
                {a.pockets
                  .map((p) =>
                    p.value === null
                      ? `${p.currency} to read`
                      : money(p.value, p.currency),
                  )
                  .join(' · ')}
              </span>
            </span>
            <Check className="size-4 text-state-good" />
          </div>
        ))}
      </div>
      <DropFiles
        small
        oneEach
        title="drop more — another bank, another month"
        onStarted={onMore}
      />
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onDone} className={SOLID}>
          done
        </button>
        <button type="button" onClick={onByHand} className={PILL_QUIET}>
          add one by hand
        </button>
      </div>
    </>
  )
}

/* By hand, step zero: which bank. */
function Pick({ onPick }: { onPick: (p: Product | null) => void }) {
  const [q, setQ] = useState('')
  const list = searchProducts(q)
  return (
    <>
      <div className="flex flex-col gap-1">
        <span className="label-caps">set up · by hand</span>
        <span className="text-[26px] leading-tight font-light text-foreground">
          Which account?
        </span>
      </div>
      <label className={`${FIELD} flex items-center gap-2`}>
        <Search className="size-4 text-ink-500" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Find a bank or broker"
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
            className="motion-land motion-press flex items-center gap-2.5 rounded-[12px] bg-lift/[0.035] p-2.5 text-left text-[13.5px] text-foreground ring-1 ring-lift/10 ring-inset hover:ring-lav-400/45"
          >
            <AccountLogo name={p.name} domain={p.domain ?? null} size={26} />
            {p.name}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onPick(null)}
          className="motion-press flex items-center gap-2 rounded-[12px] border border-dashed border-lift/20 p-2.5 text-left text-[13.5px] text-ink-300 hover:border-lav-400/45"
        >
          <Plus className="size-4" />
          another one
        </button>
      </div>
    </>
  )
}

type Part = 'cash' | 'stocks' | 'gold' | 'crypto'
const PARTS: Array<{ id: Part; label: string; hint: string; icon: string }> = [
  { id: 'cash', label: 'Cash', hint: 'any currencies', icon: '€' },
  {
    id: 'stocks',
    label: 'Stocks & ETFs',
    hint: 'from a screenshot',
    icon: '▲',
  },
  { id: 'gold', label: 'Gold', hint: 'ounces', icon: '◆' },
  { id: 'crypto', label: 'Crypto', hint: 'coins', icon: '₿' },
]
const IS: Array<{ id: AccountKind; label: string; Icon: typeof Landmark }> = [
  { id: 'bank', label: 'Bank', Icon: Landmark },
  { id: 'broker', label: 'Broker', Icon: TrendingUp },
  { id: 'cash', label: 'Cash in hand', Icon: Wallet },
]

const OPT = (on: boolean) =>
  `motion-press flex items-center gap-2 rounded-[12px] px-3 py-2.5 text-[13.5px] ring-1 ring-inset ${on ? 'bg-lav-400/14 text-foreground ring-lav-400/55' : 'bg-lift/[0.035] text-ink-200 ring-lift/10 hover:ring-lift/25'}`

/* One account in three steps: what it is, what is in it, how much. Every
   amount is optional — a file dropped later fills it — and there is no
   date: what he types is what it holds now. */
function AccountSetup({
  product,
  onSaved,
}: {
  product: Product | null
  onSaved: (accountId: Id<'accounts'>, intakeId?: Id<'intakes'>) => void
}) {
  const today = useDayStarts(1).at(-1) as number
  const create = useMutation(api.accounts.create)
  const setBalance = useMutation(api.accounts.setBalance)
  const upload = useIntakeUpload()
  const [name, setName] = useState(product?.name ?? '')
  const [is, setIs] = useState<Array<AccountKind>>(product?.kinds ?? ['bank'])
  const [parts, setParts] = useState<Array<Part>>(
    product?.kinds.includes('broker') ? ['cash', 'stocks'] : ['cash'],
  )
  const [cash, setCash] = useState<Array<{ c: string; v: string }>>(
    (product?.currencies ?? ['EUR']).map((c) => ({ c, v: '' })),
  )
  const [shot, setShot] = useState<File | null>(null)
  const [soon, setSoon] = useState<Part | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const file = useRef<HTMLInputElement>(null)

  const toggle = <T,>(list: Array<T>, x: T) =>
    list.includes(x) ? list.filter((y) => y !== x) : [...list, x]
  const offered = PARTS.filter(
    (p) => p.id !== 'stocks' || is.includes('broker'),
  )

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const currencies = parts.includes('cash') ? cash.map((x) => x.c) : ['EUR']
      const accountId = await create({
        name,
        kinds: is,
        currencies: currencies.length > 0 ? currencies : ['EUR'],
        domain: product?.domain,
        product: product?.id,
      })
      for (const x of parts.includes('cash') ? cash : []) {
        const t = x.v.trim()
        if (t === '') continue
        const n = Number(t.replace(/\s/g, '').replace(',', '.'))
        if (!Number.isFinite(n)) throw new Error(`${x.c}: not a number`)
        await setBalance({
          accountId,
          currency: x.c,
          value: n,
          dayStart: today,
        })
      }
      const [intakeId] =
        shot && parts.includes('stocks')
          ? await upload([shot], { accountId })
          : []
      onSaved(accountId, intakeId)
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message.replace(/^.*?ConvexError: /, '').split('\n')[0]
          : 'Not saved',
      )
      setSaving(false)
    }
  }

  return (
    <>
      <div className="flex items-center gap-3">
        <AccountLogo
          name={name || '?'}
          domain={product?.domain ?? null}
          size={36}
        />
        {product ? (
          <span className="text-[24px] font-light text-foreground">
            {product.name}
          </span>
        ) : (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="What you call it"
            aria-label="Name"
            className={`${FIELD} flex-1 text-[16px]`}
          />
        )}
      </div>

      <Step n="1" title="what it is">
        <div className="flex flex-wrap gap-2">
          {IS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              aria-pressed={is.includes(id)}
              onClick={() => {
                const next = toggle(is, id)
                if (next.length === 0) return
                setIs(next)
                if (!next.includes('broker'))
                  setParts((p) => p.filter((x) => x !== 'stocks'))
              }}
              className={OPT(is.includes(id))}
            >
              <Icon className="size-4 text-area" />
              {label}
            </button>
          ))}
        </div>
        {is.includes('bank') && is.includes('broker') ? (
          <span className="font-mono text-[10.5px] text-ink-500">
            Both — its cash and its investments, one account.
          </span>
        ) : null}
      </Step>

      <Step n="2" title="what's in it">
        <div className="flex flex-wrap gap-2">
          {offered.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={parts.includes(p.id)}
              onClick={() => {
                if (p.id === 'gold' || p.id === 'crypto') {
                  setSoon(soon === p.id ? null : p.id)
                  return
                }
                setParts((x) => toggle(x, p.id))
              }}
              className={OPT(parts.includes(p.id))}
            >
              <span className="w-4 text-center text-area">{p.icon}</span>
              {p.label}
              <span className="font-mono text-[10px] text-ink-500">
                {p.hint}
              </span>
            </button>
          ))}
        </div>
        {soon ? (
          <span className="motion-land font-mono text-[11px] text-state-warn">
            {soon === 'gold' ? 'Gold' : 'Crypto'} comes next — the app needs its
            daily price first, so it can say what it is worth.
          </span>
        ) : null}
      </Step>

      <Step n="3" title="how much">
        {parts.includes('cash') ? (
          <div className="flex flex-col gap-2 rounded-[12px] bg-lift/[0.03] p-3 ring-1 ring-lift/[0.07] ring-inset">
            <span className="flex items-center gap-2 text-[13.5px] text-foreground">
              <span className="text-area">€</span>Cash
              <span className="ml-auto font-mono text-[10px] text-ink-500">
                {is.includes('cash') && is.length === 1
                  ? 'counted'
                  : 'or drop a statement later — it reads every currency'}
              </span>
            </span>
            {cash.map((x, i) => (
              <div key={x.c} className="grid grid-cols-[64px_1fr_24px] gap-2">
                <span className="grid place-items-center rounded-[9px] bg-lift/[0.06] font-mono text-[12px] text-ink-200">
                  {x.c}
                </span>
                <input
                  inputMode="decimal"
                  value={x.v}
                  onChange={(e) =>
                    setCash(
                      cash.map((y, j) =>
                        j === i ? { ...y, v: e.target.value } : y,
                      ),
                    )
                  }
                  placeholder="how much, now"
                  aria-label={`${x.c} now`}
                  className={`${FIELD} font-mono`}
                />
                <button
                  type="button"
                  aria-label={`Remove ${x.c}`}
                  onClick={() => setCash(cash.filter((_, j) => j !== i))}
                  className="text-ink-500 hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}
            <div className="flex flex-wrap gap-1.5">
              {CURRENCIES.slice(0, 6)
                .filter((c) => !cash.some((x) => x.c === c))
                .map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCash([...cash, { c, v: '' }])}
                    className="rounded-full border border-dashed border-lift/20 px-2.5 py-1 font-mono text-[10.5px] text-ink-300 hover:border-lav-400/45"
                  >
                    + {c}
                  </button>
                ))}
            </div>
          </div>
        ) : null}
        {parts.includes('stocks') ? (
          <div className="flex flex-col gap-2 rounded-[12px] bg-lift/[0.03] p-3 ring-1 ring-lift/[0.07] ring-inset">
            <span className="flex items-center gap-2 text-[13.5px] text-foreground">
              <span className="text-area">▲</span>Stocks & ETFs
              <span className="ml-auto font-mono text-[10px] text-ink-500">
                each position matched to its ticker
              </span>
            </span>
            <button
              type="button"
              onClick={() => file.current?.click()}
              className={`motion-press flex items-center gap-2.5 rounded-[10px] border px-3 py-3 text-left text-[13px] ${shot ? 'border-state-good/40 text-foreground' : 'border-dashed border-lav-400/45 text-ink-300'}`}
            >
              {shot ? (
                <Check className="size-4 text-state-good" />
              ) : (
                <FileUp className="size-4 text-area" />
              )}
              {shot
                ? `${shot.name} — read when you save`
                : 'add a screenshot of the portfolio'}
            </button>
            <input
              ref={file}
              type="file"
              hidden
              accept="image/png,image/jpeg,image/webp,application/pdf"
              onChange={(e) => setShot(e.target.files?.[0] ?? null)}
            />
          </div>
        ) : null}
        <span className="font-mono text-[10.5px] text-ink-500">
          As of now. Anything left empty fills from the next file you drop.
        </span>
      </Step>

      {error ? (
        <span className="font-mono text-[11px] text-state-warn">{error}</span>
      ) : null}
      <button
        type="button"
        disabled={saving || name.trim() === ''}
        onClick={() => void save()}
        className={`${SOLID} self-start`}
      >
        {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
        save {name || 'account'}
      </button>
    </>
  )
}

function Step({
  n,
  title,
  children,
}: {
  n: string
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="motion-land flex flex-col gap-2.5 rounded-[14px] bg-sink/30 p-3.5 ring-1 ring-lift/[0.08] ring-inset">
      <span className="font-mono text-[10px] tracking-[0.16em] text-lav-300 uppercase">
        {n} · {title}
      </span>
      {children}
    </div>
  )
}
