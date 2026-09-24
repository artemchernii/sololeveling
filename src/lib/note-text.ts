import { videoId } from './youtube'

/* A note is plain text that behaves like Apple Notes — PLAN option C, chosen
   13 Sep over a rich-text editor.

   Plain text because it pastes from Notes unchanged, because the search index
   reads it as it is (a Ukrainian word in ⌘K finds the note it is in), and
   because it is the one format that stays readable wherever it ends up. The
   Notes feel comes from three behaviours, not from a document model: the first
   line is the title, a list continues itself, and the reading view draws
   bullets and headings instead of asterisks.

   Everything here is pure, so the editor and the page stay thin. */

/** First non-blank line is the title; everything after it is the body. */
export function splitNote(text: string): { title: string; body: string } {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const at = lines.findIndex((line) => line.trim().length > 0)
  if (at === -1) {
    return { title: '', body: '' }
  }
  const body = lines
    .slice(at + 1)
    .join('\n')
    .replace(/^\n+/, '')
    .trimEnd()
  return { title: lines[at].trim(), body }
}

/** The inverse, for editing a stored note as one piece of text. */
export function joinNote(title: string, body: string): string {
  return body.length > 0 ? `${title}\n${body}` : title
}

const LIST_LINE = /^(\s*)([*\-•]|\d+[.)])\s+(.*)$/

function lineAround(value: string, caret: number) {
  const start = value.lastIndexOf('\n', caret - 1) + 1
  const endAt = value.indexOf('\n', caret)
  const end = endAt === -1 ? value.length : endAt
  return { start, end, line: value.slice(start, end) }
}

/**
 * What Enter does on a list line: the next line starts with the same marker
 * (a number counts up), and Enter on an empty item ends the list — the way
 * Notes behaves, so a pasted list can be carried on without typing `* `.
 * Null when the caret is not on a list line, and Enter should just be Enter.
 */
export function continueList(
  value: string,
  caret: number,
): { value: string; caret: number } | null {
  const { start, end, line } = lineAround(value, caret)
  const match = LIST_LINE.exec(line)
  if (!match) return null
  const [, indent, marker, content] = match

  if (content.trim().length === 0) {
    const next = value.slice(0, start) + value.slice(end)
    return { value: next, caret: start }
  }

  const numbered = /^(\d+)([.)])$/.exec(marker)
  const nextMarker = numbered
    ? `${Number(numbered[1]) + 1}${numbered[2]}`
    : marker
  const insert = `\n${indent}${nextMarker} `
  return {
    value: value.slice(0, caret) + insert + value.slice(caret),
    caret: caret + insert.length,
  }
}

/** Tab and Shift+Tab: two spaces in or out at the start of the caret's line. */
export function indentLine(
  value: string,
  caret: number,
  outdent: boolean,
): { value: string; caret: number } {
  const { start } = lineAround(value, caret)
  if (!outdent) {
    return {
      value: `${value.slice(0, start)}  ${value.slice(start)}`,
      caret: caret + 2,
    }
  }
  const removable =
    value.slice(start, start + 2).match(/^ {1,2}/)?.[0].length ?? 0
  return {
    value: value.slice(0, start) + value.slice(start + removable),
    caret: Math.max(start, caret - removable),
  }
}

export type NoteBlock =
  /* 1–3 from `#`, `##`, `###` (24 Sep). A line in capitals is a 3: it is
     how a section is marked in a note that came from Notes, not a title. */
  | { type: 'heading'; text: string; level: 1 | 2 | 3 }
  | { type: 'item'; text: string; depth: number; ordered: string | null }
  | { type: 'paragraph'; text: string }
  /* A pasted prompt, kept byte for byte (R4). Nothing inside it is parsed:
     a `-` stays a hyphen and a `#` stays a hash, because a prompt copied back
     out has to be the prompt that went in. */
  | { type: 'fence'; text: string }
  /* A line that is only a YouTube link. It carries the id, not the url, so
     the view decides what to build from it and nothing else can be. */
  | { type: 'video'; id: string }
  | { type: 'gap' }

/** ``` on its own, optionally followed by a language nobody renders. */
const FENCE = /^\s*```\s*\S*\s*$/

/**
 * A pasted chunk, wrapped in fences — or null when it should paste as it is.
 *
 * Three lines is the threshold. A prompt is several lines; a sentence that
 * happens to wrap is one, and a line plus a trailing newline is still one, so
 * trailing blanks are not counted. A link is never wrapped, because a link on
 * its own line is a video.
 *
 * The wrap is written into the note's text rather than remembered somewhere,
 * so what is stored is what is shown — and ⌘Z takes it back, because it is an
 * ordinary edit like any other.
 */
export function fencePaste(text: string): string | null {
  const body = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '')
  if (body.trim().length === 0) return null
  if (FENCE.test(body.split('\n')[0])) return null
  if (videoId(body) !== null) return null
  if (body.split('\n').length < 3) return null
  return `\`\`\`\n${body}\n\`\`\``
}

/**
 * The body as blocks for the reading view.
 *
 * A heading is a markdown `#` line, or a line that opens on a word in capitals
 * — `ТЕХНІКА`, `ПОКУПКИ (~70-80€ на старті)` — because that is how headings
 * are written in a note that came from Notes, which has no `#`. A run of blank
 * lines is one gap, so spacing pasted from elsewhere does not grow the page.
 */
export function parseBlocks(body: string): Array<NoteBlock> {
  const blocks: Array<NoteBlock> = []
  const lines = body.replace(/\r\n?/g, '\n').split('\n')

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i]

    /* A fence swallows lines until it closes, so everything below this point
       — lists, headings, links — never sees them. An unclosed fence runs to
       the end of the note: dropping the rest would lose what was written, and
       rendering the ``` as a paragraph shows punctuation nobody typed. */
    if (FENCE.test(raw)) {
      const from = i + 1
      let to = from
      while (to < lines.length && !FENCE.test(lines[to])) to += 1
      const text = lines.slice(from, to).join('\n')
      if (text.trim().length > 0) blocks.push({ type: 'fence', text })
      i = to
      continue
    }

    if (raw.trim().length === 0) {
      if (blocks.length > 0 && blocks.at(-1)!.type !== 'gap') {
        blocks.push({ type: 'gap' })
      }
      continue
    }
    const list = LIST_LINE.exec(raw)
    if (list) {
      const [, indent, marker, text] = list
      blocks.push({
        type: 'item',
        text,
        depth: Math.floor(indent.replace(/\t/g, '  ').length / 2),
        ordered: /\d/.test(marker) ? marker : null,
      })
      continue
    }
    /* After the list check, so `- <link>` stays a bullet you can read, and
       before the heading check, so a link is never mistaken for a title. */
    const video = videoId(raw)
    if (video !== null) {
      blocks.push({ type: 'video', id: video })
      continue
    }
    const hashed = /^(#{1,6})\s+(.*)$/.exec(raw.trim())
    if (hashed) {
      const level = Math.min(hashed[1].length, 3) as 1 | 2 | 3
      blocks.push({ type: 'heading', text: hashed[2], level })
      continue
    }
    const firstWord = raw
      .trim()
      .split(/\s+/)[0]
      .replace(/[^\p{L}]/gu, '')
    if (
      firstWord.length >= 3 &&
      firstWord === firstWord.toUpperCase() &&
      firstWord !== firstWord.toLowerCase()
    ) {
      blocks.push({ type: 'heading', text: raw.trim(), level: 3 })
      continue
    }
    blocks.push({ type: 'paragraph', text: raw.trim() })
  }
  if (blocks.at(-1)?.type === 'gap') blocks.pop()
  return blocks
}
