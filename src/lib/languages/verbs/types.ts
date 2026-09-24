/* Verbs with their conjugations (25 Sep): "maybe we need a list of verbs and
   conjugation + translation of those words."

   Reference content, like the paths. Regular verbs are built from their
   endings by the functions below — a table typed out by hand four hundred
   times is four hundred chances of a typo — and irregular ones are written
   out, tense by tense, where they break the pattern. */

export type Tense = {
  name: string
  /** What the tense is for, in English. */
  en: string
  /** [person or form label, the form]. */
  rows: ReadonlyArray<readonly [string, string]>
}

export type Verb = {
  verb: string
  /** The meaning: in English, or in Portuguese for English verbs. */
  meaning: string
  irregular: boolean
  tenses: ReadonlyArray<Tense>
}

const zip = (
  persons: ReadonlyArray<string>,
  forms: ReadonlyArray<string>,
): ReadonlyArray<readonly [string, string]> =>
  persons.map((p, i) => [p, forms[i]] as const)

/* ------------------------------------------------ European Portuguese */

export const PT_PERSONS = [
  'eu',
  'tu',
  'ele / ela / você',
  'nós',
  'eles / vocês',
]

export type PtTense = 'presente' | 'perfeito' | 'imperfeito' | 'conjuntivo'

const PT_TENSES: Record<PtTense, { name: string; en: string }> = {
  presente: { name: 'Presente', en: 'now, habits' },
  perfeito: { name: 'Pretérito perfeito', en: 'finished past' },
  imperfeito: { name: 'Imperfeito', en: 'used to, was doing' },
  conjuntivo: { name: 'Presente do conjuntivo', en: 'que… — wishes, doubt' },
}

const PT_ENDINGS: Record<'ar' | 'er' | 'ir', Record<PtTense, Array<string>>> = {
  ar: {
    presente: ['o', 'as', 'a', 'amos', 'am'],
    /* falámos, with the accent: in Portugal it tells the past from the
       present (falamos). */
    perfeito: ['ei', 'aste', 'ou', 'ámos', 'aram'],
    imperfeito: ['ava', 'avas', 'ava', 'ávamos', 'avam'],
    conjuntivo: ['e', 'es', 'e', 'emos', 'em'],
  },
  er: {
    presente: ['o', 'es', 'e', 'emos', 'em'],
    perfeito: ['i', 'este', 'eu', 'emos', 'eram'],
    imperfeito: ['ia', 'ias', 'ia', 'íamos', 'iam'],
    conjuntivo: ['a', 'as', 'a', 'amos', 'am'],
  },
  ir: {
    presente: ['o', 'es', 'e', 'imos', 'em'],
    perfeito: ['i', 'iste', 'iu', 'imos', 'iram'],
    imperfeito: ['ia', 'ias', 'ia', 'íamos', 'iam'],
    conjuntivo: ['a', 'as', 'a', 'amos', 'am'],
  },
}

/** One tense of a regular -ar / -er / -ir verb. */
export function ptRegular(verb: string, tense: PtTense): Array<string> {
  const ending = verb.slice(-2) as 'ar' | 'er' | 'ir'
  const stem = verb.slice(0, -2)
  return PT_ENDINGS[ending][tense].map((e) => stem + e)
}

/**
 * A Portuguese verb: regular unless a tense is given by hand. Irregular
 * verbs pass only the tenses that break the pattern.
 */
export function pt(
  verb: string,
  meaning: string,
  irregularTenses: Partial<Record<PtTense, Array<string>>> = {},
): Verb {
  const keys = Object.keys(PT_TENSES) as Array<PtTense>
  return {
    verb,
    meaning,
    irregular: Object.keys(irregularTenses).length > 0,
    tenses: keys.map((k) => ({
      ...PT_TENSES[k],
      rows: zip(PT_PERSONS, irregularTenses[k] ?? ptRegular(verb, k)),
    })),
  }
}

/* ------------------------------------------------------------ German */

export const DE_PERSONS = [
  'ich',
  'du',
  'er / sie / es',
  'wir',
  'ihr',
  'sie / Sie',
]

const HABEN = ['habe', 'hast', 'hat', 'haben', 'habt', 'haben']
const SEIN = ['bin', 'bist', 'ist', 'sind', 'seid', 'sind']

/* arbeiten → du arbeitest: a stem ending in -t or -d (or a consonant + m/n)
   takes an extra e before -st, -t. */
function needsE(stem: string): boolean {
  return /[td]$/.test(stem) || /[^aeioulrh][mn]$/.test(stem)
}

/** Weak-verb present: machen → mache, machst, macht… */
export function dePresent(verb: string): Array<string> {
  const stem = verb.replace(/e?n$/, '')
  const e = needsE(stem) ? 'e' : ''
  return [
    stem + 'e',
    stem + e + 'st',
    stem + e + 't',
    verb,
    stem + e + 't',
    verb,
  ]
}

/** Weak-verb Präteritum: machen → machte, machtest… */
export function deWeakPast(verb: string): Array<string> {
  const stem = verb.replace(/e?n$/, '')
  const t = (needsE(stem) ? 'e' : '') + 't'
  return ['e', 'est', 'e', 'en', 'et', 'en'].map((x) => stem + t + x)
}

/** Strong-verb Präteritum from its past stem: ging → ging, gingst… */
export function deStrongPast(stem: string): Array<string> {
  const e = /[td]$/.test(stem) ? 'e' : ''
  /* aß → du aßest: a stem ending in s, ß or z also takes the e. */
  const s = /[sßz]$/.test(stem) ? 'e' : e
  return [stem, stem + s + 'st', stem, stem + 'en', stem + e + 't', stem + 'en']
}

function perfekt(participle: string, aux: 'haben' | 'sein'): Array<string> {
  return (aux === 'sein' ? SEIN : HABEN).map((a) => `${a} ${participle}`)
}

/**
 * A German verb. Weak verbs need only the infinitive; strong and mixed ones
 * give their present (when it changes), their past and their participle.
 */
export function de(
  verb: string,
  meaning: string,
  irregular?: {
    present?: Array<string>
    past: Array<string>
    participle: string
    aux?: 'haben' | 'sein'
  },
): Verb {
  const stem = verb.replace(/e?n$/, '')
  const participle =
    irregular?.participle ?? `ge${stem}${needsE(stem) ? 'e' : ''}t`
  return {
    verb,
    meaning,
    irregular: irregular !== undefined,
    tenses: [
      {
        name: 'Präsens',
        en: 'now, habits, near future',
        rows: zip(DE_PERSONS, irregular?.present ?? dePresent(verb)),
      },
      {
        name: 'Präteritum',
        en: 'past, mostly written',
        rows: zip(DE_PERSONS, irregular?.past ?? deWeakPast(verb)),
      },
      {
        name: 'Perfekt',
        en: 'past, as you say it',
        rows: zip(DE_PERSONS, perfekt(participle, irregular?.aux ?? 'haben')),
      },
    ],
  }
}

/* ----------------------------------------------------------- English */

/** he / she / it: go → goes, study → studies, have → has. */
export function enThird(base: string): string {
  if (base === 'have') return 'has'
  if (base === 'be') return 'is'
  if (/(s|sh|ch|x|z|o)$/.test(base)) return base + 'es'
  if (/[^aeiou]y$/.test(base)) return base.slice(0, -1) + 'ies'
  return base + 's'
}

/** An irregular English verb: its three forms, with the Portuguese. */
export function en(
  base: string,
  past: string,
  participle: string,
  meaning: string,
): Verb {
  return {
    verb: base,
    meaning,
    irregular: true,
    tenses: [
      {
        name: 'Forms',
        en: 'the three to know by heart',
        rows: [
          ['base', base],
          ['past simple', past],
          ['past participle', participle],
          ['he / she / it', enThird(base)],
        ],
      },
    ],
  }
}
