import { useState } from 'react'
import { Plus } from 'lucide-react'

import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { PILL_LOUD } from '@/components/finances/bits'
import { UpdateSheet } from '@/components/finances/UpdateSheet'

/* ADD BUYS on one position's page (13 Oct: "a button to update
   particular asset (stock/metal/crypto) like this screenshot of
   transactions"; mockup add-buys.html). It opens the update window of
   the account the thing is in, named for the thing, with the drop area
   alone: the broker's own list of its buys goes in, the same reading
   and the same check as ADD. In two accounts: a button each. */
export function AddBuys({
  owned,
  accountOf,
}: {
  owned: { name: string; at: ReadonlyArray<{ accountId: Id<'accounts'> }> }
  accountOf: (id: Id<'accounts'>) => Doc<'accounts'> | undefined
}) {
  const [adding, setAdding] = useState<Doc<'accounts'> | null>(null)
  const accounts = [...new Set(owned.at.map((r) => r.accountId))].flatMap(
    (id) => accountOf(id) ?? [],
  )
  return (
    <>
      <div data-testid="add-buys" className="flex flex-wrap gap-1.5">
        {accounts.map((a) => (
          <button
            key={a._id}
            type="button"
            onClick={() => setAdding(a)}
            className={`${PILL_LOUD} inline-flex items-center gap-1.5`}
          >
            <Plus className="size-3.5" />
            add buys
            {accounts.length > 1 ? ` · ${a.name}` : ''}
          </button>
        ))}
      </div>
      <UpdateSheet
        account={adding}
        onClose={() => setAdding(null)}
        title={`add buys · ${owned.name}`}
        fileOnly
      />
    </>
  )
}
