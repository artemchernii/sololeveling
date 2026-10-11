import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import path from 'node:path'

/* Each checkout runs its browser tests on its own three ports (11 Oct).
   Before, every worktree used :3210 and :3200: two chats' runs reached
   each other's backend, reset each other's test user, and a run had to
   wait for the other to end. The ports come from the checkout's folder,
   so they are the same on every run and differ between worktrees.
   E2E_PORT_BASE picks them by hand if two folders ever land on the same. */

export const SLOTS = 230
export const FIRST = 4300

const root = realpathSync(path.resolve(import.meta.dirname, '..'))

export type TestPorts = { backend: number; site: number; app: number }

/** Three ports in a row for a folder: 4300–4989, clear of the dev app
    (3000), the mockups (3950), TanStack devtools (4206) and macOS
    AirPlay (5000). */
export function portsFor(folder: string, asked?: string): TestPorts {
  const slot = createHash('sha1').update(folder).digest().readUInt32BE(0)
  const base = Number(asked) > 0 ? Number(asked) : FIRST + (slot % SLOTS) * 3
  return { backend: base, site: base + 1, app: base + 2 }
}

export const testPorts = () => portsFor(root, process.env.E2E_PORT_BASE)

/** The Convex CLI looks at the ports it saved last time before it reads
    its flags, and gives up when another checkout's backend answers
    there. Write this checkout's ports into its saved state first. */
export function claimPorts(ports = testPorts()): TestPorts {
  const saved = path.join(root, 'e2e/backend/.convex/local/default/config.json')
  if (existsSync(saved)) {
    const config = JSON.parse(readFileSync(saved, 'utf8')) as {
      ports?: { cloud: number; site: number }
    }
    if (
      config.ports?.cloud !== ports.backend ||
      config.ports.site !== ports.site
    ) {
      config.ports = { cloud: ports.backend, site: ports.site }
      writeFileSync(saved, JSON.stringify(config))
    }
  }
  return ports
}

/** Who listens on a port — "node, pid 123" — or null when it is free. */
function listener(port: number): string | null {
  try {
    const out = execFileSync(
      'lsof',
      ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fpc'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    )
    const pid = /^p(\d+)$/m.exec(out)?.[1]
    const name = /^c(.+)$/m.exec(out)?.[1]
    return pid ? `${name ?? 'a process'}, pid ${pid}` : null
  } catch {
    /* lsof exits 1 when nothing listens. */
    return null
  }
}

/** Nothing is reused, so a taken port is a server left from a killed run
    or a second run in this same folder. Say which, before anything starts. */
export function assertFree(ports = testPorts()): void {
  for (const port of [ports.backend, ports.site, ports.app]) {
    const who = listener(port)
    if (who)
      throw new Error(
        `Port ${port} is taken (${who}). This checkout's browser tests need ` +
          `${ports.backend}, ${ports.site} and ${ports.app} free: stop that ` +
          `process, or set E2E_PORT_BASE to another number.`,
      )
  }
}

/* `node e2e/ports.ts` — for scripts/e2e-setup.sh. */
if (process.argv[1] === import.meta.filename) {
  const { backend, site, app } = claimPorts()
  console.log(`${backend} ${site} ${app}`)
}
