import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

/* A hairline written as `border-white/10` only means anything on a dark
   ground; on a light one it disappears. Components mix `lift` and `sink`
   instead (tokens.css, item 6), which a light theme redefines. This keeps a
   new white/black utility from quietly undoing that. */

function tsxFiles(dir: string): Array<string> {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return tsxFiles(path)
    return path.endsWith('.tsx') ? [path] : []
  })
}

const RAW =
  /(?<![\w-])(?:[a-z-]+:)*(?:bg|text|border|ring|from|to|via|divide|outline|shadow|fill|stroke)-(?:white|black)\b/g

describe('surfaces mix lift and sink, never white or black', () => {
  test('no component uses a white/black colour utility', () => {
    const src = new URL('..', import.meta.url).pathname
    const found = tsxFiles(src).flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(RAW)].map(
        (m) => `${file.replace(src, 'src/')}: ${m[0]}`,
      ),
    )
    expect(found).toEqual([])
  })
})
