import { useState } from 'react'
import { useMutation } from 'convex/react'
import { Check, Clock, Eye, EqualNot, Loader2 } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { TickerLogo } from '@/components/finances/Logo'
import { Veiled } from '@/components/finances/Veil'
import { DAY, DAY_YEAR, Opt } from '@/components/finances/BulkParts'
import type { Review } from '@/components/finances/BulkParts'
import { sharesWords, timesWords } from '@/lib/sharesCheck'

type Shares = NonNullable<Review['accounts'][number]['shares']>
type Line = Shares['lines'][number]

/* A trading history against the shares in the account, before apply (11
   Oct, design/treasury-mockup/stocks-check.html): per company, what the
   file's buys and sales add up to beside the shares the last screenshot
   showed. A company that differs is not saved until he says; the rest
   are. Every number is the server's (convex/sharesCheck.ts). */

const TILES = 8
const short = (name: string) =>
  name.replace(/,? (Inc\.?|Corporation|Corp\.?|plc|N\.V\.|SE|AG)$/i, '')
const count = (n: number) =>
  (Math.round(n * 10000) / 10000).toLocaleString('en', {
    maximumFractionDigits: 4,
  })

/** The rows of the companies an apply leaves, and the open questions. */
export function sharesOpen(shares: Shares | null): {
  asked: Array<Line>
  left: Array<Line>
  rows: number
} {
  const differ = (shares?.lines ?? [])
    .filter((l) => !l.same)
    .map((l) => ({ ...l, name: short(l.name) }))
  const left = differ.filter((l) => l.answer !== 'save')
  return {
    asked: differ.filter((l) => l.answer === null),
    left,
    rows: left.reduce((n, l) => n + l.rows, 0),
  }
}

export function SharesCheck({
  shares,
  batchId,
}: {
  shares: Shares
  batchId: Id<'batches'>
}) {
  const answer = useMutation(api.intake.batchAnswer)
  const [busy, setBusy] = useState<number | null>(null)
  const [all, setAll] = useState(false)
  /* "saving…" stays long enough to be read (every press answers), and the
     box keeps its place until then. */
  const say = (l: Line, save: boolean, on = true) => {
    setBusy(l.n)
    void Promise.allSettled([
      answer({
        batchId,
        answer: {
          kind: 'sum',
          key: `${save ? 'shares' : 'noshares'}:${shares.intakeId}:${l.n}`,
          on,
        },
      }),
      new Promise((done) => setTimeout(done, 450)),
    ]).finally(() => setBusy(null))
  }

  if (shares.state !== 'checked')
    return (
      <div
        data-shares={shares.state}
        className="flex items-start gap-2 text-[12.5px] leading-normal text-ink-300"
      >
        <Eye className="mt-0.5 size-3.5 shrink-0 text-lav-400" />
        <span>
          <span className="text-foreground">
            {shares.state === 'none'
              ? 'Not checked: no screenshot of the shares yet.'
              : `Not checked: the last screenshot of the shares is from ${DAY_YEAR.format(shares.lookAt ?? 0)}.`}
          </span>{' '}
          Checked after a newer screenshot.
        </span>
      </div>
    )

  const day = DAY.format(shares.lookAt ?? 0)
  const differ = shares.lines.filter((l) => !l.same)
  const same = shares.lines.length - differ.length
  const shown = all ? shares.lines : shares.lines.slice(0, TILES)
  const name = (l: Line) => short(l.name)

  return (
    <div
      data-shares={differ.some((l) => l.answer === null) ? 'asked' : 'same'}
      className="flex flex-col gap-3"
    >
      {differ.map((l) =>
        l.answer === null || busy === l.n ? (
          <div
            key={l.n}
            data-testid="shares-differ"
            className="motion-land flex flex-col gap-2.5 rounded-[14px] bg-state-warn/[0.06] p-3 ring-1 ring-state-warn/30 ring-inset"
          >
            <div className="flex items-start gap-2 text-[13.5px] leading-normal">
              <EqualNot className="mt-1 size-3.5 shrink-0 text-state-warn" />
              <div>
                <b className="font-medium">
                  {name(l)}: <Veiled>{sharesWords(l.file)}</Veiled> in the file,{' '}
                  <Veiled>{count(l.account)}</Veiled> in the account.
                </b>
                <small className="block text-[12px] text-ink-400">
                  {l.file < l.account
                    ? `A buy is missing from the file.${shares.fileFrom === null ? '' : ` The file starts on ${DAY_YEAR.format(shares.fileFrom)}.`}`
                    : 'A sale is missing from the file, or the same buy is in it twice.'}
                </small>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:ml-[23px]">
              <Box
                label="in the file"
                value={sharesWords(l.file)}
                under={timesWords(l.buys, l.sells)}
              />
              <Box
                label="in the account"
                value={sharesWords(l.account)}
                under={`screenshot of ${day}`}
              />
            </div>
            <div className="flex min-h-[30px] flex-wrap items-center gap-1.5 sm:pl-[23px]">
              {busy === l.n ? (
                <span className="flex items-center gap-2 font-mono text-[10.5px] tracking-[0.12em] text-lav-300 uppercase">
                  <Loader2 className="save-spinner size-3.5" />
                  saving…
                </span>
              ) : (
                <>
                  <Opt loud onClick={() => say(l, false)}>
                    <span className="pl-1.5">do not save {name(l)}</span>
                  </Opt>
                  <Opt onClick={() => say(l, true)}>
                    <span className="pl-1.5">save {name(l)} anyway</span>
                  </Opt>
                </>
              )}
            </div>
          </div>
        ) : (
          <div
            key={l.n}
            role="status"
            className="motion-land flex items-center gap-2.5 rounded-[14px] bg-state-good/[0.06] px-3 py-2.5 text-[13px] text-ink-200 ring-1 ring-state-good/30 ring-inset"
          >
            <Check
              className="motion-pop size-3.5 shrink-0 text-state-good"
              strokeWidth={3}
            />
            <span className="flex-1">
              {name(l)}{' '}
              {l.answer === 'save' ? 'saved as the file says' : 'not saved'}.
              Still <Veiled>{sharesWords(l.account)}</Veiled> in the account.
            </span>
            <button
              type="button"
              onClick={() => say(l, l.answer === 'save', false)}
              className="font-mono text-[10.5px] tracking-[0.12em] text-lav-400 uppercase"
            >
              undo
            </button>
          </div>
        ),
      )}

      {same > 0 ? (
        <div className="flex items-start gap-2 text-[13.5px] leading-normal text-ink-200">
          <Check
            className="motion-pop mt-1 size-3.5 shrink-0 text-state-good"
            strokeWidth={3}
          />
          <span>
            {differ.length === 0
              ? same === 1
                ? '1 company'
                : `All ${same} companies`
              : `The other ${same === 1 ? 'company' : `${same} companies`}`}
            : same shares in the file and in the account.{' '}
            <small className="text-[12px] text-ink-400">
              Screenshot of {day}
              {shares.sold > 0 ? ` · ${shares.sold} more sold completely` : ''}
            </small>
          </span>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((l, i) => (
          <div
            key={l.n}
            style={{ animationDelay: `${Math.min(i, 12) * 18}ms` }}
            className={`motion-land flex min-w-0 items-center gap-2 rounded-[10px] px-2.5 py-[7px] ${
              l.same
                ? 'bg-sink/[0.22]'
                : 'bg-state-warn/[0.08] ring-1 ring-state-warn/40 ring-inset'
            }`}
          >
            {l.symbol ? (
              <TickerLogo symbol={l.symbol} name={l.name} size={22} />
            ) : (
              <span className="grid size-[22px] shrink-0 place-items-center rounded-[7px] bg-lav-400/14 font-mono text-[8.5px] text-lav-300">
                {l.name.slice(0, 2).toUpperCase()}
              </span>
            )}
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-foreground">
              {name(l)}
            </span>
            <span
              className={`font-mono text-[11px] whitespace-nowrap ${l.same ? 'text-ink-300' : 'text-state-warn'}`}
            >
              <Veiled>
                {l.same
                  ? count(l.account)
                  : `${sharesWords(l.file)} · ${count(l.account)}`}
              </Veiled>
            </span>
            {l.same ? (
              <Check className="size-3 text-state-good" strokeWidth={3} />
            ) : (
              <EqualNot className="size-3 text-state-warn" />
            )}
          </div>
        ))}
        {shares.lines.length > TILES ? (
          <button
            type="button"
            onClick={() => setAll(!all)}
            className="motion-press rounded-[10px] px-2.5 py-[7px] font-mono text-[10.5px] tracking-[0.08em] text-ink-400 ring-1 ring-lift/[0.08] ring-inset hover:text-foreground"
          >
            {all ? 'fewer' : `${shares.lines.length - TILES} more`}
          </button>
        ) : null}
      </div>

      {shares.after.map((a) => (
        <div
          key={`${a.name}-${a.at}`}
          className="flex items-start gap-2 text-[12.5px] leading-normal text-ink-300"
        >
          <Clock className="mt-0.5 size-3.5 shrink-0 text-lav-400" />
          <span>
            <span className="text-foreground">
              <Veiled>{count(Math.abs(a.shares))}</Veiled> {a.name}{' '}
              {a.shares < 0 ? 'sold' : 'bought'} on {DAY.format(a.at)}
            </span>
            , after the last screenshot. Saved.
          </span>
        </div>
      ))}
    </div>
  )
}

function Box({
  label,
  value,
  under,
}: {
  label: string
  value: string
  under: string
}) {
  return (
    <span className="flex min-w-0 flex-col gap-1 rounded-[12px] bg-sink/[0.22] px-3 py-2.5 ring-1 ring-lift/[0.12] ring-inset">
      <span className="truncate font-mono text-[9.5px] tracking-[0.14em] text-ink-500 uppercase">
        {label}
      </span>
      <span className="text-[16px] text-foreground">
        <Veiled>{value}</Veiled>
      </span>
      <span className="font-mono text-[9.5px] text-ink-500">{under}</span>
    </span>
  )
}
