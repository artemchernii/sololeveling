import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useMutation } from 'convex/react'
import {
  CircleHelp,
  ImageIcon,
  RefreshCw,
  Repeat2,
  Sigma,
  Upload,
} from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { AccountLogo } from '@/components/finances/Logo'
import { Veiled } from '@/components/finances/Veil'
import { failureMessage } from '@/lib/convex-errors'
import type { productById } from '@/lib/institutions'
import { euros } from '@/lib/money'
import {
  DAY,
  MONTH_LONG,
  monthDate,
  signed,
  Opt,
  useBatchUpload,
} from '@/components/finances/BulkParts'
import type { Ask } from '@/components/finances/BulkParts'
import { Thumb, AnotherAccount } from '@/components/finances/BulkReview'

export function AskCard({
  ask,
  index,
  batchId,
  accounts,
  onCheck,
  onSolved,
}: {
  ask: Ask
  index: number
  batchId: Id<'batches'>
  accounts: ReadonlyArray<Doc<'accounts'>>
  onCheck: (id: Id<'intakes'>) => void
  onSolved: (text: string) => void
}) {
  const answer = useMutation(api.intake.batchAnswer)
  const create = useMutation(api.accounts.create)
  const readAgain = useMutation(api.intake.readAgain)
  const discard = useMutation(api.intake.discard)
  const { send, sent } = useBatchUpload()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const name = (id: Id<'accounts'>) =>
    accounts.find((a) => a._id === id)?.name ?? 'that account'

  function act(run: () => Promise<unknown>, text: string) {
    setBusy(true)
    setError(null)
    run()
      .then(() => onSolved(text))
      .catch((e: unknown) =>
        setError(failureMessage(e) ?? 'That did not save.'),
      )
      .finally(() => setBusy(false))
  }
  /* Into one of his accounts — and, for a screenshot, read again with the
     account named, so the reader knows whose screen it is. */
  const placeInto = (
    intakeId: Id<'intakes'>,
    accountId: Id<'accounts'>,
    again: boolean,
  ) =>
    answer({
      batchId,
      answer: { kind: 'place', intakeIds: [intakeId], accountId },
    }).then(() => (again ? readAgain({ intakeId }) : null))
  const makeAccount = (p: NonNullable<ReturnType<typeof productById>>) =>
    create({
      name: p.name,
      kinds: p.kinds,
      currencies: p.currencies,
      domain: p.domain,
      product: p.id,
    })
  const chips = (
    list: ReadonlyArray<Doc<'accounts'>>,
    pick: (a: Doc<'accounts'>) => void,
  ) =>
    list.map((a) => (
      <Opt key={a._id} disabled={busy} onClick={() => pick(a)}>
        <AccountLogo name={a.name} domain={a.domain} size={18} />
        {a.name}
      </Opt>
    ))
  const fits = (want: 'bank' | 'broker' | null) =>
    accounts.filter(
      (a) =>
        (want === null || a.kinds.includes(want)) &&
        (a.kinds.includes('bank') || a.kinds.includes('broker')),
    )

  let icon: ReactNode = <CircleHelp className="size-4" />
  let thumb: ReactNode = null
  let q: ReactNode = null
  let sub: ReactNode = null
  let opts: ReactNode = null
  switch (ask.kind) {
    case 'whose': {
      icon = <ImageIcon className="size-4" />
      thumb = ask.image ? <Thumb intakeId={ask.intakeId} /> : null
      const want = ask.what === 'transactions' ? null : 'broker'
      q =
        ask.what === 'holdings' ? (
          <>
            <b className="font-medium">{ask.name}</b> is a broker screen:{' '}
            {ask.rows} {ask.rows === 1 ? 'position' : 'positions'}
            {ask.investedEur ? (
              <>
                {' '}
                worth <Veiled>{euros(ask.investedEur)}</Veiled>
              </>
            ) : null}
            {ask.cashEur !== null ? (
              <>
                , cash <Veiled>{euros(ask.cashEur)}</Veiled>
              </>
            ) : null}
            . Which broker is it?
          </>
        ) : (
          <>
            <b className="font-medium">{ask.name}</b>: {ask.rows} rows
            {ask.from !== null && ask.to !== null
              ? `, ${DAY.format(ask.from)}–${DAY.format(ask.to)}`
              : ''}
            . Whose account is it?
          </>
        )
      sub = ask.seen
        ? `Nothing on it names the bank — the top reads "${ask.seen}".`
        : 'Nothing on it names the bank or broker.'
      opts = (
        <>
          {chips(fits(want), (a) =>
            act(
              () => placeInto(ask.intakeId, a._id, ask.image),
              ask.image
                ? `${ask.name} → ${a.name}, read again with that.`
                : `${ask.name} → ${a.name}.`,
            ),
          )}
          <AnotherAccount
            want={want}
            accounts={accounts}
            busy={busy}
            onPick={(p) =>
              act(async () => {
                const id = await makeAccount(p)
                await placeInto(ask.intakeId, id, ask.image)
              }, `${p.name} added — ${ask.name} is read again as its screen.`)
            }
          />
        </>
      )
      break
    }
    case 'hole': {
      const month = MONTH_LONG.format(monthDate(ask.month))
      q = (
        <>
          <b className="font-medium">{name(ask.accountId)}</b> has no rows in{' '}
          {month} — a statement is missing?
        </>
      )
      sub = `The months either side of ${month} have rows in this drop.`
      opts = (
        <>
          <Opt disabled={busy} onClick={() => file.current?.click()}>
            <Upload className="size-3.5" />
            {sent ? `uploading ${sent.done}/${sent.of}…` : `drop ${month}`}
          </Opt>
          <Opt
            disabled={busy}
            onClick={() =>
              act(
                () =>
                  answer({
                    batchId,
                    answer: {
                      kind: 'quiet',
                      accountId: ask.accountId,
                      month: ask.month,
                    },
                  }),
                `${month}: nothing that month.`,
              )
            }
          >
            there was nothing that month
          </Opt>
          <input
            ref={file}
            type="file"
            multiple
            hidden
            accept="application/pdf,text/csv,.csv,image/png,image/jpeg,image/webp"
            onChange={(e) => {
              const files = [...(e.target.files ?? [])]
              e.target.value = ''
              if (files.length)
                act(() => send(files, batchId), `${month} is being read.`)
            }}
          />
        </>
      )
      break
    }
    case 'oneSide': {
      icon = <Repeat2 className="size-4" />
      const into = ask.amount > 0
      q = (
        <>
          <b className="font-medium">
            <Veiled>{signed(ask.amount)}</Veiled>
          </b>{' '}
          {into ? 'into' : 'out of'} {name(ask.accountId)} on{' '}
          {DAY.format(ask.occurredAt)} — "{ask.merchant}".
        </>
      )
      /* A hint, not an answer (3 Oct: "likely BPI", pressed, was wrong —
         BPI's statement ended before the day). Said with its reason. */
      sub = `${
        into
          ? 'Your own money arriving — but no file in this drop shows it leaving anywhere. Which account did it leave?'
          : 'Your own money leaving — but no file in this drop shows it arriving anywhere. Where did it go?'
      }${
        ask.likely
          ? ` ${name(ask.likely)} is where ${name(ask.accountId)}'s other transfers ${into ? 'came from' : 'went'}, but nothing in this drop covers ${DAY.format(ask.occurredAt)} for it — answer only if you know.`
          : ''
      }`
      const pick = (otherAccountId: Id<'accounts'> | null, text: string) =>
        act(
          () =>
            answer({
              batchId,
              answer: {
                kind: 'move',
                intakeId: ask.intakeId,
                index: ask.index,
                otherAccountId,
              },
            }),
          text,
        )
      opts = (
        <>
          {/* The account it trades money with most, first (3 Oct: BPI is
              where ActivoBank's money comes from). */}
          {[...accounts]
            .filter((a) => a._id !== ask.accountId)
            .sort((a, b) =>
              a._id === ask.likely ? -1 : b._id === ask.likely ? 1 : 0,
            )
            .map((a) => (
              <Opt
                key={a._id}
                disabled={busy}
                onClick={() => pick(a._id, `${signed(ask.amount)}: ${a.name}.`)}
              >
                <AccountLogo name={a.name} domain={a.domain} size={18} />
                {a.name}
                {a._id === ask.likely ? (
                  <span className="font-mono text-[9.5px] tracking-[0.12em] text-lav-300 uppercase">
                    likely
                  </span>
                ) : null}
              </Opt>
            ))}
          <Opt
            disabled={busy}
            onClick={() =>
              pick(null, `${signed(ask.amount)}: an account outside the app.`)
            }
          >
            an account outside the app
          </Opt>
        </>
      )
      break
    }
    case 'gap': {
      icon = <Sigma className="size-4" />
      const short = ask.gap < 0
      q = (
        <>
          <b className="font-medium">{name(ask.accountId)}</b>: the balances say{' '}
          <Veiled>{euros(Math.abs(ask.gap))}</Veiled>{' '}
          {short ? 'more left' : 'more arrived'} between {DAY.format(ask.from)}{' '}
          and {DAY.format(ask.to)} than the rows show.
        </>
      )
      sub = short
        ? 'A row cut off a statement or a screenshot?'
        : 'A deposit missing from the rows?'
      opts = (
        <>
          <Opt
            disabled={busy}
            onClick={() =>
              act(
                () =>
                  answer({
                    batchId,
                    answer: {
                      kind: 'extra',
                      key: ask.key,
                      accountId: ask.accountId,
                      occurredAt: ask.to,
                      amount: ask.gap,
                    },
                  }),
                `${signed(ask.gap)} added on ${DAY.format(ask.to)}.`,
              )
            }
          >
            add the missing row on {DAY.format(ask.to)}
          </Opt>
          <Opt
            disabled={busy}
            onClick={() =>
              act(
                () =>
                  answer({
                    batchId,
                    answer: { kind: 'dismiss', key: ask.key },
                  }),
                'Left as it is.',
              )
            }
          >
            leave it
          </Opt>
        </>
      )
      break
    }
    case 'holdings': {
      icon = <ImageIcon className="size-4" />
      thumb = <Thumb intakeId={ask.intakeId} />
      q = (
        <>
          <b className="font-medium">{name(ask.accountId)}</b>: {ask.missing} of{' '}
          {ask.positions} positions on {ask.name} have no share count or ticker
          the app could find.
        </>
      )
      sub =
        'Read it again with the account named, or fill them in on the check screen.'
      opts = (
        <>
          <Opt
            disabled={busy}
            onClick={() =>
              act(
                () => readAgain({ intakeId: ask.intakeId }),
                `${ask.name} is being read again.`,
              )
            }
          >
            <RefreshCw className="size-3.5" />
            read again
          </Opt>
          <Opt loud onClick={() => onCheck(ask.intakeId)}>
            check it
          </Opt>
        </>
      )
      break
    }
    case 'failed': {
      thumb = ask.image ? <Thumb intakeId={ask.intakeId} /> : null
      q = (
        <>
          <b className="font-medium">{ask.name}</b> could not be used.
        </>
      )
      sub = ask.error
      opts = (
        <>
          <Opt
            disabled={busy}
            onClick={() =>
              act(
                () => readAgain({ intakeId: ask.intakeId }),
                `${ask.name} is being read again.`,
              )
            }
          >
            <RefreshCw className="size-3.5" />
            read again
          </Opt>
          {ask.image ? (
            <>
              {chips(fits(null), (a) =>
                act(
                  () => placeInto(ask.intakeId, a._id, true),
                  `${ask.name} is read again as ${a.name}'s.`,
                ),
              )}
              <AnotherAccount
                want={null}
                accounts={accounts}
                busy={busy}
                onPick={(p) =>
                  act(async () => {
                    const id = await makeAccount(p)
                    await placeInto(ask.intakeId, id, true)
                  }, `${p.name} added — ${ask.name} is read again as its screen.`)
                }
              />
            </>
          ) : null}
          <Opt
            disabled={busy}
            onClick={() =>
              act(() => discard({ intakeId: ask.intakeId }), 'Thrown away.')
            }
          >
            throw it away
          </Opt>
        </>
      )
      break
    }
  }

  return (
    <div
      style={{ animationDelay: `${index * 70}ms` }}
      className="motion-land flex flex-col gap-2.5 rounded-[16px] bg-state-warn/[0.06] px-3.5 py-3 ring-1 ring-state-warn/30 ring-inset"
    >
      <div className="flex items-start gap-3 text-[13.5px] leading-snug text-ink-100">
        {thumb ?? <span className="mt-0.5 text-state-warn">{icon}</span>}
        <div className="flex min-w-0 flex-col gap-1">
          <span>{q}</span>
          {sub ? <span className="text-[12px] text-ink-400">{sub}</span> : null}
          {error ? (
            <span className="text-[12px] text-state-danger">{error}</span>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 pl-7">{opts}</div>
    </div>
  )
}
