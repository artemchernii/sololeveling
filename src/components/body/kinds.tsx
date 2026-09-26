import {
  CupSoda,
  Dumbbell,
  Footprints,
  Mountain,
  Sparkles,
  Swords,
  Waves,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { KIND_LABEL } from '@/lib/body/library'
import type { BodyKind } from '@/lib/body/library'

/* The words Body's logs are filed under, with an icon and a name each.
   `stretch` has always been the stored word; on screen it is Mobility,
   because that is what the routines are for. */

const ICONS: Record<string, LucideIcon> = {
  /* Waves, not a stick figure (26 Sep: "a bit weird"): mobility is
     smooth movement. */
  stretch: Waves,
  gym: Dumbbell,
  boxing: Swords,
  hiking: Mountain,
  run: Footprints,
  supplements: CupSoda,
}

export function KindIcon({
  kind,
  className = 'size-4',
}: {
  kind: string | null | undefined
  className?: string
}) {
  const Icon = (kind && ICONS[kind]) || Sparkles
  return <Icon className={className} />
}

export function kindName(kind: string | null | undefined): string {
  if (!kind) return 'unsorted'
  if (kind === 'supplements') return 'Shake'
  return kind in KIND_LABEL ? KIND_LABEL[kind as BodyKind] : kind
}

/* Labels for CategoryChip: the stored word stays, the name shows. */
export const KIND_LABELS: Record<string, string> = {
  stretch: 'mobility',
  supplements: 'shake',
}
