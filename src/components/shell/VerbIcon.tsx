import {
  Briefcase,
  Building2,
  Dumbbell,
  Folder,
  Footprints,
  Heart,
  Languages,
  ListTodo,
  PartyPopper,
  Receipt,
  Scale,
  Shirt,
  StickyNote,
  Swords,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import type { VerbIcon } from '@/lib/capture-parser'

export const VERB_ICONS: Record<VerbIcon, LucideIcon> = {
  dumbbell: Dumbbell,
  footprints: Footprints,
  swords: Swords,
  languages: Languages,
  scale: Scale,
  receipt: Receipt,
  'trending-up': TrendingUp,
  wallet: Wallet,
  briefcase: Briefcase,
  building: Building2,
  folder: Folder,
  party: PartyPopper,
  heart: Heart,
  users: Users,
  shirt: Shirt,
  'sticky-note': StickyNote,
  'list-todo': ListTodo,
}

/* A verb's icon on a small tile of its area's colour — what the dot in the
   recent list and the / list used to be. A dot said "some colour"; the tile
   says "gym" before the word is read. Expects `--area` from an ancestor. */
export function VerbTile({
  icon,
  size = 'md',
}: {
  icon: VerbIcon
  size?: 'sm' | 'md'
}) {
  const Icon = VERB_ICONS[icon]
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-[8px] bg-(--area)/16 text-area ring-1 ring-(--area)/25 ring-inset ${
        size === 'sm' ? 'size-6' : 'size-7'
      }`}
    >
      <Icon
        className={size === 'sm' ? 'size-3.5' : 'size-4'}
        strokeWidth={2.2}
      />
    </span>
  )
}
