/* Reading a GitHub repo out of whatever gets pasted, as a module with no
   Convex imports in it (21 Sep).

   It lived in `convex/github.ts`, which the browser cannot import — that file
   pulls in `_generated/server`. The New project form wants the same answer
   the server will give, while he is still typing, so the rule moved somewhere
   both sides can reach. `github.ts` re-exports it, so nothing server-side
   changed. */

const REPO = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/

/** `owner/name` from what a person pastes: the pair itself or a github.com URL. */
export function parseRepo(input: string): string | null {
  const trimmed = input.trim()
  const url = trimmed.match(
    /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s]+)\/([^/\s]+)/i,
  )
  const candidate = url ? `${url[1]}/${url[2].replace(/\.git$/, '')}` : trimmed
  return REPO.test(candidate) ? candidate : null
}
