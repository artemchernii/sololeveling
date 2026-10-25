/* A language session's three kinds, as Languages stores and counts them
   (category words), with the words Today shows (25 Oct, his "+ PT / + ENG
   open CLASS · HOMEWORK · PRACTICE, one tap"). `practice` is "at home" on
   screen, as on Languages. A class is 50 minutes, as `pt` has always said;
   the other two carry no minutes rather than a guess. */
export const SESSION_KINDS = [
  {
    category: 'class',
    label: 'CLASS',
    extra: { value: 50, unit: 'min', text: 'class' },
  },
  { category: 'homework', label: 'HOMEWORK', extra: {} },
  { category: 'practice', label: 'AT HOME', extra: {} },
] as const

export type SessionKind = (typeof SESSION_KINDS)[number]
