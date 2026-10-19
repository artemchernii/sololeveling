import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'

import { claudeRead } from './vite/claudeRead'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    /* Before the Cloudflare plugin, so its route answers in Node. */
    claudeRead(),
    devtools(),
    cloudflare({
      viteEnvironment: { name: 'ssr' },
      /* Browser-test runs need no debugger, and two starting together
         both reached for :9229 — one died (11 Oct). */
      inspectorPort: process.env.E2E_RUN ? false : undefined,
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})

export default config
