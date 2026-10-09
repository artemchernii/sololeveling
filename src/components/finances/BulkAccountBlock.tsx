import { useState } from 'react'
import { useMutation } from 'convex/react'
import {
  Check,
  FileText,
  ImageIcon,
  Plus,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { AccountLogo } from '@/components/finances/Logo'
import { Veiled } from '@/components/finances/Veil'
import { productById } from '@/lib/institutions'
import { euros } from '@/lib/money'
import {
  DAY,
  DAY_YEAR,
  MONTH_NARROW,
  MONTH_YEAR,
  monthDate,
  signed,
  Tag,
  Opt,
} from '@/components/finances/BulkParts'
import type { Review } from '@/components/finances/BulkParts'

export function AccountBlock({
  block,
  account,
  accounts,
  months,
  index,
  batchId,
  nowEur,
  holes,
  onCheck,
}: {
  block: Review['accounts'][number]
  account: Doc<'accounts'> | null
  accounts: ReadonlyArray<Doc<'accounts'>>
  months: ReadonlyArray<string>
  index: number
  batchId: Id<'batches'>
  /* What the app shows for it now — the change this drop makes. */
  nowEur: number | null
  holes: boolean
  onCheck: (id: Id<'intakes'>) => void
}) {
  const answer = useMutation(api.intake.batchAnswer)
  const create = useMutation(api.accounts.create)
  const readAgain = useMutation(api.intake.readAgain)
  const [rows, setRows] = useState(false)
  const [mine, setMine] = useState(false)
  const [busy, setBusy] = useState(false)
  const product = block.product ? productById(block.product.id) : undefined
  const title = account?.name ?? block.product?.name ?? ''
  const domain = account?.domain ?? product?.domain ?? null
  const kinds = account?.kinds ?? product?.kinds ?? []
  const { first, last, holdings } = block
  const twoReadings =
    first !== null && last !== null && first.asOf !== last.asOf
  const change =
    last !== null && nowEur !== null
      ? Math.round((last.value - nowEur) * 100) / 100
      : null
  const intakeIds = block.files.map((f) => f.intakeId)

  async function keep(into?: Id<'accounts'>) {
    if (!product && !into) return
    setBusy(true)
    try {
      const accountId =
        into ??
        (await create({
          name: product?.name ?? title,
          kinds: product?.kinds ?? ['bank'],
          currencies: product?.currencies ?? ['EUR'],
          domain: product?.domain,
          product: product?.id,
          ibanTails: block.product?.accountTail
            ? [block.product.accountTail]
            : undefined,
        }))
      await answer({
        batchId,
        answer: { kind: 'place', intakeIds, accountId },
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      style={{ animationDelay: `${120 + index * 80}ms` }}
      className={`motion-land flex flex-col gap-3 rounded-[18px] p-3.5 ring-1 transition-opacity ring-inset ${
        account === null
          ? 'bg-lav-400/[0.05] ring-lav-400/30'
          : 'bg-lift/[0.035] ring-lift/[0.07]'
      } ${block.leftOut ? 'opacity-40' : ''}`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <AccountLogo name={title} domain={domain} size={30} />
        <div className="flex min-w-[140px] flex-1 flex-col gap-0.5">
          <b className="flex items-center gap-2 text-[15px] font-medium">
            {title}
            {account === null ? <Tag tone="new">new</Tag> : null}
          </b>
          <span className="font-mono text-[10.5px] text-ink-500">
            {kinds.join(' · ')} · {block.files.length}{' '}
            {block.files.length === 1 ? 'file' : 'files'}
          </span>
        </div>
        {last === null && holdings?.totalEur != null ? (
          <div className="flex items-baseline gap-2 font-mono text-[15px] text-foreground">
            <Veiled>{euros(holdings.totalEur)}</Veiled>
            <small className="text-[10px] text-ink-500">account total</small>
          </div>
        ) : null}
        {last !== null ? (
          <div className="flex flex-wrap items-center justify-end gap-2 font-mono text-[13px] text-ink-300">
            {nowEur !== null && change !== null && change !== 0 ? (
              <>
                <small className="text-[10px] text-ink-500">now</small>
                <Veiled>{euros(nowEur)}</Veiled>
                <span className="text-ink-600">→</span>
              </>
            ) : twoReadings ? (
              <>
                <small className="text-[10px] text-ink-500">
                  {DAY_YEAR.format(first.asOf)}
                </small>
                <Veiled>{euros(first.value)}</Veiled>
                <span className="text-ink-600">→</span>
              </>
            ) : null}
            <span className="text-[15px] text-foreground">
              <Veiled>{euros(last.value)}</Veiled>
            </span>
            <small className="text-[10px] text-ink-500">
              {DAY.format(last.asOf)}
            </small>
            {change !== null && change !== 0 ? (
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${
                  change > 0
                    ? 'bg-state-good/12 text-state-good'
                    : 'bg-state-danger/12 text-state-danger'
                }`}
              >
                {change > 0 ? (
                  <TrendingUp className="size-3.5" />
                ) : (
                  <TrendingDown className="size-3.5" />
                )}
                <Veiled>{signed(change)}</Veiled>
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {account === null && block.product ? (
        <div className="flex flex-col gap-2 rounded-[12px] bg-lift/[0.03] px-3 py-2.5 text-[12.5px] text-ink-300">
          <span>
            A {kinds[0] ?? 'bank'} you haven't added yet — found on{' '}
            {block.files.map((f) => f.name).join(', ')}
            {block.product.accountTail
              ? `, account ending …${block.product.accountTail}`
              : ''}
            {block.product.holder
              ? `, in the name of ${block.product.holder}`
              : ''}
            . Its rows and balance go in once you add it.
          </span>
          <div className="flex flex-wrap gap-1.5">
            {mine ? (
              accounts
                .filter((a) => kinds.some((k) => a.kinds.includes(k)))
                .map((a) => (
                  <Opt
                    key={a._id}
                    disabled={busy}
                    onClick={() => void keep(a._id)}
                  >
                    <AccountLogo name={a.name} domain={a.domain} size={18} />
                    {a.name}
                  </Opt>
                ))
            ) : (
              <>
                <Opt loud disabled={busy} onClick={() => void keep()}>
                  <Plus className="size-3.5" />
                  add {title}
                </Opt>
                <Opt disabled={busy} onClick={() => setMine(true)}>
                  it's one I have…
                </Opt>
              </>
            )}
          </div>
        </div>
      ) : null}

      {months.length > 0 && holdings === null ? (
        <div
          className="grid gap-1"
          style={{ gridTemplateColumns: `repeat(${months.length}, 1fr)` }}
        >
          {months.map((m, j) => {
            const state = block.months[j]
            return (
              <div
                key={m}
                className="flex flex-col gap-1"
                title={MONTH_YEAR.format(monthDate(m))}
              >
                <i
                  style={{ animationDelay: `${200 + j * 35}ms` }}
                  className={`block h-2.5 rounded-[4px] ${
                    state === 'add'
                      ? 'motion-land bg-lav-400 shadow-[0_0_10px_-2px_var(--color-lav-400)]'
                      : state === 'had'
                        ? 'bg-lav-400/25'
                        : state === 'hole'
                          ? 'hatch-warn ring-1 ring-state-warn/50 ring-inset'
                          : 'bg-lift/[0.05]'
                  }`}
                />
                <span className="text-center font-mono text-[9px] text-ink-600">
                  {MONTH_NARROW.format(monthDate(m))}
                </span>
              </div>
            )
          })}
        </div>
      ) : null}

      {holdings !== null ? (
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-[12.5px] text-ink-400">
          <span>
            <b className="font-normal text-foreground">{holdings.positions}</b>{' '}
            {holdings.positions === 1 ? 'position' : 'positions'} ·{' '}
            <b className="font-normal text-foreground">
              <Veiled>{euros(holdings.investedEur)}</Veiled>
            </b>{' '}
            invested
          </span>
          {holdings.cashEur !== null ? (
            <span>
              cash{' '}
              <b className="font-normal text-foreground">
                <Veiled>{euros(holdings.cashEur)}</Veiled>
              </b>
            </span>
          ) : null}
          {holdings.complete ? (
            <Tag tone="good">
              <Check className="size-3" />
              every position known
            </Tag>
          ) : (
            <button
              type="button"
              onClick={() => onCheck(block.files[0].intakeId)}
              className="font-mono text-[10.5px] tracking-[0.12em] text-state-warn uppercase"
            >
              check positions
            </button>
          )}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-ink-400">
        {block.fresh > 0 ||
        block.had > 0 ||
        (holdings === null && block.trades === 0) ? (
          <span>
            <b className="font-normal text-foreground">{block.fresh}</b> new
            rows
          </span>
        ) : null}
        {block.trades > 0 ? (
          <span>
            <b className="font-normal text-foreground">{block.trades}</b> trades
          </span>
        ) : null}
        {block.had > 0 ? (
          <span>
            <b className="font-normal text-foreground">{block.had}</b> already
            had
          </span>
        ) : null}
        {block.gaps > 0 ? (
          <Tag tone="warn">doesn't add up</Tag>
        ) : twoReadings ? (
          <Tag tone="good">
            <Check className="size-3" />
            adds up
          </Tag>
        ) : null}
        {block.pending !== 0 ? (
          <Tag>
            <Veiled>{euros(Math.abs(block.pending))}</Veiled> pending
          </Tag>
        ) : null}
        {holes ? <Tag tone="warn">a month missing</Tag> : null}
        <span className="flex-1" />
        {block.rows.length > 0 ? (
          <button
            type="button"
            onClick={() => setRows((r) => !r)}
            className="font-mono text-[10.5px] tracking-[0.12em] text-lav-400 uppercase hover:[text-shadow:0_0_10px_var(--color-lav-400)]"
          >
            {rows ? 'hide rows' : 'rows'}
          </button>
        ) : null}
        {account !== null ? (
          <button
            type="button"
            onClick={() =>
              void answer({
                batchId,
                answer: {
                  kind: 'leaveOut',
                  accountId: account._id,
                  out: !block.leftOut,
                },
              })
            }
            className={`rounded-full px-2.5 py-1 font-mono text-[10px] tracking-[0.12em] uppercase ring-1 ring-inset ${
              block.leftOut
                ? 'text-lav-300 ring-lav-400/40'
                : 'text-ink-500 ring-lift/10 hover:text-ink-300'
            }`}
          >
            {block.leftOut ? 'left out · undo' : 'leave out'}
          </button>
        ) : null}
      </div>

      {rows ? (
        <div className="flex flex-col border-t border-lift/[0.06] pt-2">
          <div className="flex flex-wrap gap-1.5 pb-2">
            {block.files.map((f) => (
              <span
                key={f.intakeId}
                className="inline-flex items-center gap-1.5 rounded-full bg-lift/[0.04] py-0.5 pr-1 pl-2.5 text-[11.5px] text-ink-300"
              >
                {f.image ? (
                  <ImageIcon className="size-3" />
                ) : (
                  <FileText className="size-3" />
                )}
                {f.name}
                <button
                  type="button"
                  title="read it again"
                  onClick={() => void readAgain({ intakeId: f.intakeId })}
                  className="grid size-5 place-items-center rounded-full text-ink-500 hover:bg-lav-400/15 hover:text-lav-300"
                >
                  <RefreshCw className="size-3" />
                </button>
              </span>
            ))}
          </div>
          {block.rows.map((r, j) => (
            <div
              key={`${r.occurredAt}${r.merchant}${j}`}
              className={`grid grid-cols-[52px_1fr_auto] items-center gap-2.5 py-1.5 text-[12.5px] text-ink-200 sm:grid-cols-[52px_1fr_auto_auto] ${
                r.had || r.pending ? 'opacity-45' : ''
              }`}
            >
              <span className="font-mono text-[10.5px] text-ink-500">
                {DAY.format(r.occurredAt)}
              </span>
              <span className="truncate">{r.merchant}</span>
              <span className="hidden sm:inline">
                <Tag>
                  {r.pending
                    ? 'pending'
                    : r.had
                      ? 'already had'
                      : (r.category ?? r.kind)}
                </Tag>
              </span>
              <span
                className={`font-mono ${r.kind === 'income' ? 'text-state-good' : ''}`}
              >
                <Veiled>{signed(r.amount)}</Veiled>
              </span>
            </div>
          ))}
          {block.rows.length >= 300 ? (
            <span className="label-caps pt-1 pl-[62px]">first 300 shown</span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
