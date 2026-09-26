/* The Vault's reading (R7a, 26 Sep): what is sent to the model that reads a
   class sheet, and what is accepted back. Artem's sheets are mostly scans,
   so the reader has to see the page — Claude Haiku 4.5 reads PDFs and
   photos directly. One call returns everything, and it is stored: the
   sheet is never sent twice.

   Shared by convex/vault.ts (what may be read, the cap) and
   convex/ai/read.ts (the call), and tested here without either. */

export const READING_MODEL = 'claude-haiku-4-5'

/** On screen, beside every reading — who wrote it. */
export const READING_MODEL_NAME = 'Claude Haiku 4.5'

/** A sheet, not a textbook: 10 MB is a long scanned handout. */
export const MAX_READ_BYTES = 10 * 1024 * 1024

/* At most this many readings in any 30 days (his pick, 26 Sep: about 60¢
   at the most). Counted from `readings` rows, so a retry counts too — it
   is another call. */
export const READINGS_PER_WINDOW = 30
export const READING_WINDOW_MS = 30 * 86_400_000

export type ReadableKind =
  | { block: 'document'; mediaType: 'application/pdf' }
  | {
      block: 'image'
      mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
    }

/** What the model can be shown, or null for a file it cannot read. */
export function readableKind(contentType: string): ReadableKind | null {
  const type = contentType.toLowerCase().split(';')[0].trim()
  if (type === 'application/pdf') {
    return { block: 'document', mediaType: 'application/pdf' }
  }
  if (type === 'image/jpeg' || type === 'image/jpg') {
    return { block: 'image', mediaType: 'image/jpeg' }
  }
  if (type === 'image/png' || type === 'image/gif' || type === 'image/webp') {
    return { block: 'image', mediaType: type }
  }
  return null
}

/* What kind of sheet it is — one, picked by the reader. The Vault's
   filter chips, in this order. */
export const READING_KINDS = [
  'grammar',
  'vocabulary',
  'reading',
  'writing',
  'conversation',
  'exam',
  'other',
] as const
export type ReadingKind = (typeof READING_KINDS)[number]

export function isReadingKind(value: unknown): value is ReadingKind {
  return (READING_KINDS as ReadonlyArray<unknown>).includes(value)
}

export type Reading = {
  title: string
  kind: ReadingKind
  tags: Array<string>
  text: string
  summary: string
  conclusion: string
  words: Array<{ term: string; meaning: string }>
  examples: Array<{ sentence: string; meaning: string }>
  rules: Array<{
    name: string
    pattern: string
    explanation: string
    examples: Array<{ sentence: string; meaning: string }>
  }>
}

const EXAMPLE_SCHEMA = {
  type: 'object',
  properties: {
    sentence: { type: 'string' },
    meaning: { type: 'string' },
  },
  required: ['sentence', 'meaning'],
  additionalProperties: false,
} as const

/* The shape the model must answer in (structured outputs). Every object
   closed, every field required — the API's own rules for a schema. */
export const READING_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    kind: { type: 'string', enum: [...READING_KINDS] },
    tags: { type: 'array', items: { type: 'string' } },
    text: { type: 'string' },
    summary: { type: 'string' },
    conclusion: { type: 'string' },
    words: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          term: { type: 'string' },
          meaning: { type: 'string' },
        },
        required: ['term', 'meaning'],
        additionalProperties: false,
      },
    },
    examples: { type: 'array', items: EXAMPLE_SCHEMA },
    rules: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          pattern: { type: 'string' },
          explanation: { type: 'string' },
          examples: { type: 'array', items: EXAMPLE_SCHEMA },
        },
        required: ['name', 'pattern', 'explanation', 'examples'],
        additionalProperties: false,
      },
    },
  },
  required: [
    'title',
    'kind',
    'tags',
    'text',
    'summary',
    'conclusion',
    'words',
    'examples',
    'rules',
  ],
  additionalProperties: false,
} as const

/** What the reader is asked, for a sheet from a class in `language`. */
export function readingPrompt(language: string): string {
  return [
    `This is a page (or pages) from my ${language} class or homework — often a scan or a photo.`,
    'Fill in each field:',
    `- title: a short name for what it teaches, 3 to 8 words, in English with the ${language} term where it is the point — e.g. "Present subjunctive after impersonal expressions".`,
    `- kind: the one that fits best — grammar, vocabulary, reading, writing, conversation, exam, or other.`,
    '- tags: 2 to 5 short topic tags (the grammar points or themes), lowercase.',
    `- text: everything written on it, transcribed faithfully in the original language, keeping its lines and numbering. Where something cannot be read, write [unreadable].`,
    '- summary: in English, 1 or 2 short sentences — what the class covered. The rules below carry the detail.',
    `- rules: each rule or pattern the sheet teaches (up to 6), for someone revising it later. name: a short English name. pattern: the formula in ${language} with its parts, e.g. "É + adjetivo + que + presente do conjuntivo". explanation: one or two plain English sentences — when to use it and how it differs from what it is confused with. examples: 2 or 3 new ${language} sentences that use it, each with its English meaning. Empty if the sheet teaches no rule.`,
    '- conclusion: in English, one or two short sentences — what to practise next.',
    `- words: up to 20 ${language} words or phrases worth learning from it, each with its English meaning. Empty if there are none.`,
    `- examples: 3 new ${language} sentences of your own that use what the sheet teaches (its grammar or its topic) the way a native speaker would — not copied from the sheet — each with its English meaning. Simple, everyday situations.`,
  ].join('\n')
}

/**
 * The model's answer, checked. Structured outputs should guarantee the
 * shape; this is what makes a bad answer a failed reading and not a crash
 * or a half-written row.
 */
export function parseReading(
  raw: string,
): { ok: true; reading: Reading } | { ok: false; error: string } {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return { ok: false, error: 'The reader did not answer in JSON.' }
  }
  if (typeof value !== 'object' || value === null) {
    return { ok: false, error: 'The reader answered with something else.' }
  }
  const v = value as Record<string, unknown>
  for (const key of ['text', 'summary', 'conclusion'] as const) {
    if (typeof v[key] !== 'string') {
      return { ok: false, error: `The reader left out ${key}.` }
    }
  }
  if (!Array.isArray(v.words)) {
    return { ok: false, error: 'The reader left out words.' }
  }
  const words: Reading['words'] = []
  for (const w of v.words as Array<unknown>) {
    if (typeof w !== 'object' || w === null) continue
    const { term, meaning } = w as Record<string, unknown>
    if (
      typeof term === 'string' &&
      typeof meaning === 'string' &&
      term.trim()
    ) {
      words.push({ term: term.trim(), meaning: meaning.trim() })
    }
  }
  /* Examples, title, kind and tags came later (26 Sep); an answer without
     them is still a reading — it falls back rather than fails. */
  const title =
    typeof v.title === 'string' && v.title.trim() ? v.title.trim() : ''
  const kind: ReadingKind = isReadingKind(v.kind) ? v.kind : 'other'
  const tags = (Array.isArray(v.tags) ? (v.tags as Array<unknown>) : [])
    .filter((t): t is string => typeof t === 'string' && t.trim() !== '')
    .map((t) => t.trim().toLowerCase())
    .slice(0, 5)
  const examples: Reading['examples'] = []
  for (const e of Array.isArray(v.examples)
    ? (v.examples as Array<unknown>)
    : []) {
    if (typeof e !== 'object' || e === null) continue
    const { sentence, meaning } = e as Record<string, unknown>
    if (
      typeof sentence === 'string' &&
      typeof meaning === 'string' &&
      sentence.trim()
    ) {
      examples.push({ sentence: sentence.trim(), meaning: meaning.trim() })
    }
  }
  const pairs = (value: unknown): Reading['examples'] => {
    const out: Reading['examples'] = []
    for (const e of Array.isArray(value) ? (value as Array<unknown>) : []) {
      if (typeof e !== 'object' || e === null) continue
      const { sentence, meaning } = e as Record<string, unknown>
      if (
        typeof sentence === 'string' &&
        typeof meaning === 'string' &&
        sentence.trim()
      ) {
        out.push({ sentence: sentence.trim(), meaning: meaning.trim() })
      }
    }
    return out
  }
  const rules: Reading['rules'] = []
  for (const x of Array.isArray(v.rules) ? (v.rules as Array<unknown>) : []) {
    if (typeof x !== 'object' || x === null) continue
    const {
      name,
      pattern,
      explanation,
      examples: ex,
    } = x as Record<string, unknown>
    if (typeof name !== 'string' || !name.trim()) continue
    rules.push({
      name: name.trim(),
      pattern: typeof pattern === 'string' ? pattern.trim() : '',
      explanation: typeof explanation === 'string' ? explanation.trim() : '',
      examples: pairs(ex).slice(0, 3),
    })
  }
  return {
    ok: true,
    reading: {
      title: title.slice(0, 120),
      kind,
      tags,
      text: (v.text as string).trim(),
      summary: (v.summary as string).trim(),
      conclusion: (v.conclusion as string).trim(),
      words: words.slice(0, 20),
      examples: examples.slice(0, 5),
      rules: rules.slice(0, 6),
    },
  }
}
