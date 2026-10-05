import { useEffect, useState } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'

import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import {
  HistoryReview,
  IntakeStrip,
  ReadingSheet,
} from '@/components/finances/Reading'
import { CryptoReview } from '@/components/finances/CryptoReview'
import { TransactionsReview } from '@/components/finances/TransactionsReview'
import { HoldingsReview } from '@/components/finances/HoldingsReview'
import { TradesReview } from '@/components/finances/TradesReview'

/* What he dropped, from reading to confirmed (Treasury, 27 Sep). The
   review is the product: the reader's guesses laid against what he has
   (intake.review), with the unsure ones first, one fix for every row of a
   merchant, his own money moving kept apart from spending, pending held
   back, duplicates skipped — and nothing written until he confirms.
   Discard goes back one step, as he asked. */

export function IntakeFlow({
  intakeId,
  onBack,
  onDone,
}: {
  intakeId: Id<'intakes'>
  onBack: () => void
  onDone: () => void
}) {
  const row = useQuery(api.intake.one, { intakeId })
  const discard = useMutation(api.intake.discard)
  const found = row && row.status !== 'done' ? row : undefined
  /* A confirmed one leaves the open list the moment it lands — keep
     showing it, so its review can say what landed (27 Sep: he got "done
     or gone" instead). */
  const [last, setLast] = useState<Doc<'intakes'> | null>(null)
  useEffect(() => {
    if (found) setLast(found)
  }, [found])
  const intake = found ?? (last?._id === intakeId ? last : undefined)
  const throwAway = () => void discard({ intakeId }).then(onBack)

  /* Loading holds the space quietly: a flash of "reading" for a few
     milliseconds is the flicker he kept seeing. */
  if (row === undefined) return <div className="min-h-[240px]" />
  if (intake === undefined) {
    return (
      <p className="py-6 text-center text-[13.5px] text-ink-400">
        This one is done or gone.
      </p>
    )
  }
  if (intake.status === 'reading' || intake.status === 'failed')
    return <ReadingSheet intake={intake} onBack={onBack} />
  if (intake.kind === 'trades' && intake.historyTrades !== undefined)
    return <HistoryReview intake={intake} onDiscard={throwAway} />
  return intake.kind === 'holdings' ? (
    <HoldingsReview intake={intake} onDiscard={throwAway} onDone={onDone} />
  ) : intake.kind === 'trades' &&
    (intake.trades ?? []).length > 0 &&
    (intake.trades ?? []).every((t) => t.crypto) ? (
    <CryptoReview intake={intake} onDiscard={throwAway} onDone={onDone} />
  ) : intake.kind === 'trades' ? (
    <TradesReview intake={intake} onDiscard={throwAway} onDone={onDone} />
  ) : (
    <TransactionsReview intake={intake} onDiscard={throwAway} onDone={onDone} />
  )
}

/** Open intakes on the page — for one he closed while it was reading. */
export function OpenIntakes({
  onOpen,
}: {
  onOpen: (id: Id<'intakes'>) => void
}) {
  const open = useQuery(api.intake.open, {})
  if (!open || open.length === 0) return null
  return (
    <div className="flex flex-col gap-2">
      {open.map((i) => (
        <IntakeStrip key={i._id} intake={i} onOpen={() => onOpen(i._id)} />
      ))}
    </div>
  )
}
