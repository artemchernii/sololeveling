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

export type Reading = {
  text: string
  summary: string
  conclusion: string
  words: Array<{ term: string; meaning: string }>
}

/* The shape the model must answer in (structured outputs). Every object
   closed, every field required — the API's own rules for a schema. */
export const READING_SCHEMA = {
  type: 'object',
  properties: {
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
  },
  required: ['text', 'summary', 'conclusion', 'words'],
  additionalProperties: false,
} as const

/** What the reader is asked, for a sheet from a class in `language`. */
export function readingPrompt(language: string): string {
  return [
    `This is a page (or pages) from my ${language} class or homework — often a scan or a photo.`,
    'Fill in each field:',
    `- text: everything written on it, transcribed faithfully in the original language, keeping its lines and numbering. Where something cannot be read, write [unreadable].`,
    '- summary: in English, 3 to 6 sentences — what the class covered: the grammar, the topic, the kind of exercises.',
    '- conclusion: in English, 1 to 3 sentences — what to take away and what to practise next.',
    `- words: up to 20 ${language} words or phrases worth learning from it, each with its English meaning. Empty if there are none.`,
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
  return {
    ok: true,
    reading: {
      text: (v.text as string).trim(),
      summary: (v.summary as string).trim(),
      conclusion: (v.conclusion as string).trim(),
      words: words.slice(0, 20),
    },
  }
}
