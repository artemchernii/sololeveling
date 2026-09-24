import {
  Dumbbell,
  Footprints,
  Mountain,
  PersonStanding,
  Pill,
  Sparkles,
  Swords,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { KIND_LABEL } from '@/lib/body/library'
import type { BodyKind } from '@/lib/body/library'

/* The words Body's logs are filed under, with an icon and a name each.
   `stretch` has always been the stored word; on screen it is Mobility,
   because that is what the routines are for. */

const ICONS: Record<string, LucideIcon> = {
  stretch: PersonStanding,
  gym: Dumbbell,
  boxing: Swords,
  hiking: Mountain,
  run: Footprints,
  supplements: Pill,
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
  return kind in KIND_LABEL ? KIND_LABEL[kind as BodyKind] : kind
}

/* Labels for CategoryChip: the stored word stays, the name shows. */
export const KIND_LABELS: Record<string, string> = { stretch: 'mobility' }

/* The picture behind the hero (25 Sep, his pick): Ronaldo, eyes closed,
   head up — portrait, so the crop sits on the face. One for every kind
   until he sends one per kind; a kind's own photo would go in PHOTOS. */
export type HeroPhoto = { src: string; focus: string }
export const HERO_PHOTO: HeroPhoto = {
  src: '/body/body.jpg',
  focus: '50% 66%',
}
export const PHOTOS: Partial<Record<BodyKind, HeroPhoto>> = {}
