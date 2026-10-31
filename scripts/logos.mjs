/* Saves each site logo the app knows into public/logos once (31 Oct: "icons
   disappear … we need to go search for icon and save it in public"). The
   domains come from the code only — the shops (payeeSites), the banks
   (institutions) and the fund issuers (logo) — never from the database or
   a bank. Run `pnpm logos` after adding a line to one of those lists. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
const all = new Set()
for (const m of read('src/lib/payeeSites.ts').matchAll(
  /'([a-z0-9.-]+\.[a-z]{2,})'\]/g,
))
  all.add(m[1])
for (const m of read('src/lib/institutions.ts').matchAll(
  /domain: '([a-z0-9.-]+)'/g,
))
  all.add(m[1])
for (const m of read('src/lib/logo.ts').matchAll(
  /, '([a-z0-9.-]+\.[a-z]{2,})'\]/g,
))
  all.add(m[1])

/* --payees (31 Oct, "still no icons"): his payees nobody listed — read
   from the dev database (read only) — each asked of Clearbit's company
   search once. Kept only when its name is the payee's own, whole: Watashi
   is not WATASHINO, Bnp Toc is not BNP Paribas. */
const found = []
if (process.argv.includes('--payees')) {
  const { execSync } = await import('node:child_process')
  const { payeeSite } = await import('../src/lib/payeeSites.ts')
  const lines = execSync(
    'npx convex data logs --limit 20000 --format jsonLines',
    {
      encoding: 'utf8',
      maxBuffer: 1 << 28,
      stdio: ['ignore', 'pipe', 'ignore'],
    },
  ).split('\n')
  const count = new Map()
  for (const l of lines) {
    if (!l.trim()) continue
    const d = JSON.parse(l)
    if (d.kind !== 'expense' || typeof d.text !== 'string') continue
    /* The shop's words: no card codes, no city after them. */
    const name = d.text
      .replace(/[*#].*$/, '')
      .replace(/\b(compra|pagamento|dd|trf|lev|mb way)\b/gi, '')
      .replace(/\d{3,}.*$/, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (name.length < 3 || payeeSite(name) !== null) continue
    count.set(name, (count.get(name) ?? 0) + 1)
  }
  const plainOf = (x) =>
    x
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
  const names = [...count]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 200)
    .map(([n]) => n)
  for (const n of names) {
    await new Promise((r) => setTimeout(r, 150))
    try {
      const res = await fetch(
        `https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(n)}`,
      )
      const hit = res.ok ? (await res.json())[0] : undefined
      if (
        hit &&
        plainOf(hit.name) === plainOf(n) &&
        typeof hit.domain === 'string'
      ) {
        found.push([plainOf(n), hit.domain])
        console.log('found', n, '→', hit.domain)
      }
    } catch {
      /* no answer: the payee keeps its group's tile */
    }
  }
  for (const [, d] of found) all.add(d)
}

mkdirSync(new URL('../public/logos/', import.meta.url), { recursive: true })
const saved = []
for (const d of [...all].sort()) {
  try {
    const res = await fetch(
      `https://www.google.com/s2/favicons?domain=${encodeURIComponent(d)}&sz=128`,
    )
    /* Google answers an unknown site with 404 and a grey globe: not kept. */
    if (!res.ok || !res.headers.get('content-type')?.startsWith('image/')) {
      console.log('none ', d)
      continue
    }
    writeFileSync(
      new URL(`../public/logos/${d}.png`, import.meta.url),
      Buffer.from(await res.arrayBuffer()),
    )
    saved.push(d)
  } catch {
    console.log('fail ', d)
  }
}
writeFileSync(
  new URL('../src/lib/logoFiles.ts', import.meta.url),
  `/* Written by scripts/logos.mjs (\`pnpm logos\`): the site logos saved in
   public/logos. A site here is shown from the app itself; any other from
   Google's icon service, as before. */

export const SAVED_LOGOS: ReadonlySet<string> = new Set([
${saved.map((d) => `  '${d}',`).join('\n')}
])

const GOOGLE = 'https://www.google.com/s2/favicons?domain='

/** A site's logo: the saved file, else Google's. */
export const siteIcon = (domain: string, size = 128): string =>
  SAVED_LOGOS.has(domain)
    ? \`/logos/\${domain}.png\`
    : \`\${GOOGLE}\${encodeURIComponent(domain)}&sz=\${size}\`
`,
)
if (process.argv.includes('--payees'))
  writeFileSync(
    new URL('../src/lib/payeeSitesFound.ts', import.meta.url),
    `/* Written by \`pnpm logos --payees\` (scripts/logos.mjs): payees no one
   listed in payeeSites.ts whose whole name Clearbit's company search knows,
   with that company's site. Read with SITES, longest name first. */

export const FOUND: ReadonlyArray<readonly [string, string]> = [
${found.map(([n, d]) => `  ['${n}', '${d}'],`).join('\n')}
]
`,
  )
console.log(`saved ${saved.length} of ${all.size}`)
