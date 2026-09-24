/* The languages the app knows by name (25 Sep): a flag, what the language
   calls itself, and what you call it. Artem: "I see zero mentions that this
   is Portuguese, not even a Portuguese flag anywhere."

   Reference, not his data — the same standing as the capture verbs. A
   language area carries one of these codes in `areas.lang`; nothing here is
   written to the database on its own.

   No React and no Convex: `convex/areas.ts` imports it to check a code. */

export type LanguageCode = 'pt-PT' | 'en' | 'de'

export type Language = {
  code: LanguageCode
  /** What you call it. */
  name: string
  /** What it calls itself. */
  native: string
  flag: string
}

/* Three, his call (25 Sep): "for now Portuguese, English and German … we
   don't care about Brazil". Adding one is a line here and a path file. */
export const LANGUAGES: ReadonlyArray<Language> = [
  { code: 'pt-PT', name: 'Portuguese', native: 'Português', flag: '🇵🇹' },
  { code: 'en', name: 'English', native: 'English', flag: '🇬🇧' },
  { code: 'de', name: 'German', native: 'Deutsch', flag: '🇩🇪' },
]

export function languageByCode(code: string | undefined): Language | undefined {
  return LANGUAGES.find((l) => l.code === code)
}

/** The area label a new language gets: "English". */
export function areaLabelFor(language: Language): string {
  return language.name
}

/* ---------------------------------------------------------------------------
   CEFR — the ladder a level like "B1" sits on. What each rung means, in plain
   words (our own, after the Council of Europe's scale), and what the step to
   the next one asks of you. "B1" alone told him nothing: "when I see B1 I ask
   myself WTF is this and what is the value?"

   A rung is a place, not a grade: A2 is earlier than B1, not worse.
   ------------------------------------------------------------------------ */

export const CEFR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const
export type Cefr = (typeof CEFR)[number]

export const CEFR_MEANING: Record<
  Cefr,
  { name: string; can: string; next: string }
> = {
  A1: {
    name: 'Beginner',
    can: 'You can introduce yourself, ask and answer simple questions and get through a café or a shop — if people speak slowly and help you.',
    next: 'Talk about your routine, your work and your family in short exchanges, and cope with everyday errands on your own.',
  },
  A2: {
    name: 'Elementary',
    can: 'You handle routine things — shopping, directions, appointments, small talk about your day — in short, simple exchanges.',
    next: 'Tell what happened in the past, explain plans and give reasons, and keep a conversation going when it leaves the script.',
  },
  B1: {
    name: 'Intermediate',
    can: 'You get by in most situations of living in the country: you tell what happened, talk about plans and give opinions with reasons — with gaps and pauses.',
    next: 'Speak with natives without either side straining: follow a real discussion, argue a point, use the subjunctive without stopping to build it.',
  },
  B2: {
    name: 'Upper intermediate',
    can: 'You talk with natives fluently and on the spot, follow the news and complex discussions, and argue for a view with pros and cons.',
    next: 'Say exactly what you mean, catch what is implied, switch register at will, and work or study in the language.',
  },
  C1: {
    name: 'Advanced',
    can: 'You express yourself fluently and precisely, catch implicit meaning and irony, and use the language for work, study and anything social.',
    next: 'Understand virtually everything, from any speaker, and shade meaning as finely as a native.',
  },
  C2: {
    name: 'Proficient',
    can: 'You understand virtually everything you hear or read and express yourself with a native’s precision and nuance.',
    next: 'The top of the scale — from here it is living in the language.',
  },
}

/** "B1", "b1+", "B1 (almost B2)" → "B1". Anything else is not a rung. */
export function parseCefr(text: string | null | undefined): Cefr | null {
  const m = text
    ?.trim()
    .toUpperCase()
    .match(/^([ABC][12])/)
  return m ? (m[1] as Cefr) : null
}

/** The rung after this one, or null at the top. */
export function nextCefr(level: Cefr): Cefr | null {
  const i = CEFR.indexOf(level)
  return i < CEFR.length - 1 ? CEFR[i + 1] : null
}
