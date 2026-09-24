/* 24 Sep. Formatting for a note that stays plain text (note-text.ts, option C
   of 13 Sep). The toolbar and ⌘B / ⌘I write the same markdown anyone would
   type — `## `, `**bold**`, `*italic*`, `- `, a backtick, `[text](url)` — and
   the reading view draws it. So a note still pastes from Notes unchanged,
   search still reads its words, and copied out it is still readable.

   Every edit takes the text and the selection and returns both, so the
   editor only has to apply the result. */

export type Edit = { value: string; from: number; to: number }

function lineBounds(value: string, from: number, to: number) {
  const start = value.lastIndexOf('\n', from - 1) + 1
  const endAt = value.indexOf('\n', to)
  return { start, end: endAt === -1 ? value.length : endAt }
}

/**
 * `# `, `## ` or `### ` on the caret's line. The same level again takes it
 * off; another level replaces it. Whatever list marker was there goes.
 */
export function toggleHeading(
  value: string,
  from: number,
  to: number,
  level: 1 | 2 | 3,
): Edit {
  const { start, end } = lineBounds(value, from, from)
  const line = value.slice(start, end)
  const current = /^(#{1,6})\s+/.exec(line)
  const bare = line
    .replace(/^(#{1,6})\s+/, '')
    .replace(/^\s*([*\-•]|\d+[.)])\s+/, '')
  const prefix =
    current && current[1].length === level ? '' : `${'#'.repeat(level)} `
  const next = prefix + bare
  const shift = next.length - line.length
  return {
    value: value.slice(0, start) + next + value.slice(end),
    from: Math.max(start, from + shift),
    to: Math.max(start, to + shift),
  }
}

/**
 * Wraps the selection in `mark` — `**`, `*` or a backtick — or unwraps it if
 * it is already wrapped. With nothing selected, the pair goes in with the
 * caret between, ready to type into.
 */
export function toggleWrap(
  value: string,
  from: number,
  to: number,
  mark: string,
): Edit {
  const n = mark.length
  const before = value.slice(from - n, from)
  const after = value.slice(to, to + n)
  /* `**x**` must not read as `*` around `*x*`: italic only unwraps when the
     marks around it are single. */
  const doubled =
    mark === '*' && (value[from - n - 1] === '*' || value[to + n] === '*')
  if (from >= n && before === mark && after === mark && !doubled) {
    return {
      value:
        value.slice(0, from - n) + value.slice(from, to) + value.slice(to + n),
      from: from - n,
      to: to - n,
    }
  }
  return {
    value:
      value.slice(0, from) +
      mark +
      value.slice(from, to) +
      mark +
      value.slice(to),
    from: from + n,
    to: to + n,
  }
}

const LIST_MARK = /^(\s*)[*\-•]\s+/

/** `- ` at the start of every selected line, or off them all if all have one. */
export function toggleList(value: string, from: number, to: number): Edit {
  const { start, end } = lineBounds(value, from, to)
  const lines = value.slice(start, end).split('\n')
  const allListed = lines.every((l) => LIST_MARK.test(l) || l.trim() === '')
  const next = lines
    .map((l) => {
      if (l.trim() === '') return l
      return allListed
        ? l.replace(LIST_MARK, '$1')
        : `- ${l.replace(/^#{1,6}\s+/, '')}`
    })
    .join('\n')
  const block = value.slice(0, start) + next + value.slice(end)
  return { value: block, from: start, to: start + next.length }
}

/**
 * Code: a backtick pair around a selection on one line; a fenced block
 * around one that spans lines — which the reading view shows as a prompt
 * block with its Copy button (R4).
 */
export function toggleCode(value: string, from: number, to: number): Edit {
  if (!value.slice(from, to).includes('\n')) {
    return toggleWrap(value, from, to, '`')
  }
  const { start, end } = lineBounds(value, from, to)
  const inner = value.slice(start, end)
  const block = `\`\`\`\n${inner}\n\`\`\``
  return {
    value: value.slice(0, start) + block + value.slice(end),
    from: start + 4,
    to: start + 4 + inner.length,
  }
}

/**
 * `[text](url)`. The selection becomes the text — or the url, if what was
 * selected is already an address. The part still to fill in is left selected.
 */
export function insertLink(value: string, from: number, to: number): Edit {
  const selected = value.slice(from, to)
  if (/^https?:\/\/\S+$/.test(selected)) {
    const link = `[](${selected})`
    return {
      value: value.slice(0, from) + link + value.slice(to),
      from: from + 1,
      to: from + 1,
    }
  }
  const text = selected || 'link'
  const link = `[${text}](https://)`
  const urlAt = from + text.length + 3
  return {
    value: value.slice(0, from) + link + value.slice(to),
    from: urlAt,
    to: urlAt + 'https://'.length,
  }
}

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'bold'; text: string }
  | { type: 'italic'; text: string }
  | { type: 'code'; text: string }
  | { type: 'link'; text: string; href: string }

/* One pass, earliest match first. Code before everything, so a `*` inside
   backticks stays an asterisk; a bare address last, so the one inside a
   `[text](url)` is not found twice. Trailing punctuation is left out of a
   bare address — "see https://x.com." ends the sentence, not the link. */
const INLINE =
  /`([^`\n]+)`|\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*\n]+)\*\*|\*([^*\s][^*\n]*?)\*|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g

/** A line of a note as runs of text, bold, italic, code and links. */
export function parseInline(text: string): Array<Inline> {
  const out: Array<Inline> = []
  let at = 0
  for (const m of text.matchAll(INLINE)) {
    const i = m.index
    if (i > at) out.push({ type: 'text', text: text.slice(at, i) })
    /* Unmatched groups are undefined at runtime, whatever the types say. */
    const [, code, linkText, linkHref, bold, italic, bare] =
      m as unknown as Array<string | undefined>
    if (code !== undefined) out.push({ type: 'code', text: code })
    else if (linkText !== undefined && linkHref !== undefined)
      out.push({ type: 'link', text: linkText, href: linkHref })
    else if (bold !== undefined) out.push({ type: 'bold', text: bold })
    else if (italic !== undefined) out.push({ type: 'italic', text: italic })
    else if (bare !== undefined)
      out.push({ type: 'link', text: bare, href: bare })
    at = i + m[0].length
  }
  if (at < text.length) out.push({ type: 'text', text: text.slice(at) })
  return out
}

/** Every address in a note, once, in the order written — for the Links row. */
export function linksIn(body: string): Array<{ href: string; host: string }> {
  const seen = new Set<string>()
  const out: Array<{ href: string; host: string }> = []
  for (const line of body.split('\n')) {
    for (const run of parseInline(line)) {
      if (run.type !== 'link' || seen.has(run.href)) continue
      seen.add(run.href)
      let host = run.href
      try {
        host = new URL(run.href).hostname.replace(/^www\./, '')
      } catch {
        /* Not a URL the browser can read; show it as written. */
      }
      out.push({ href: run.href, host })
    }
  }
  return out
}
