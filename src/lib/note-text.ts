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
  | { type: 'heading'; text: string }
  | { type: 'item'; text: string; depth: number; ordered: string | null }
  | { type: 'paragraph'; text: string }
  | { type: 'gap' }

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
  for (const raw of body.replace(/\r\n?/g, '\n').split('\n')) {
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
    const hashed = /^#{1,6}\s+(.*)$/.exec(raw.trim())
    if (hashed) {
      blocks.push({ type: 'heading', text: hashed[1] })
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
      blocks.push({ type: 'heading', text: raw.trim() })
      continue
    }
    blocks.push({ type: 'paragraph', text: raw.trim() })
  }
  if (blocks.at(-1)?.type === 'gap') blocks.pop()
  return blocks
}
