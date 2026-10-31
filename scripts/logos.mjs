/* Saves each site logo the app knows into public/logos once (31 Oct: "icons
   disappear … we need to go search for icon and save it in public"). The
   domains come from the code only — the shops (payeeSites), the banks
   (institutions) and the fund issuers (logo) — never from the database or
   a bank. Run `pnpm logos` after adding a line to one of those lists. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
const found = new Set()
for (const m of read('src/lib/payeeSites.ts').matchAll(
  /'([a-z0-9.-]+\.[a-z]{2,})'\]/g,
))
  found.add(m[1])
for (const m of read('src/lib/institutions.ts').matchAll(
  /domain: '([a-z0-9.-]+)'/g,
))
  found.add(m[1])
for (const m of read('src/lib/logo.ts').matchAll(
  /, '([a-z0-9.-]+\.[a-z]{2,})'\]/g,
))
  found.add(m[1])

mkdirSync(new URL('../public/logos/', import.meta.url), { recursive: true })
const saved = []
for (const d of [...found].sort()) {
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
console.log(`saved ${saved.length} of ${found.size}`)
