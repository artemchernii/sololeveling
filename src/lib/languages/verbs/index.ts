import { DE_VERBS } from './de'
import { EN_VERBS } from './en'
import { PT_PT_VERBS } from './pt-PT'
import type { Verb } from './types'

const VERBS: Record<string, ReadonlyArray<Verb>> = {
  'pt-PT': PT_PT_VERBS,
  en: EN_VERBS,
  de: DE_VERBS,
}

export function verbsFor(code: string | undefined): ReadonlyArray<Verb> {
  return (code && VERBS[code]) || []
}
