/* Pulling a video id out of a pasted link, and the two urls built from it.

   Pure, and separate from note-text.ts because it is a different domain: one
   file knows how a note reads, this one knows what YouTube's links look like.

   Nothing here fetches anything. A title would mean asking YouTube for it on
   every render of the note, and the thumbnail plus a play triangle already
   says "this is a video" — which is the whole job. */

/* Exactly eleven characters of YouTube's id alphabet. The id is interpolated
   into a url, so this is not a nicety: it is what keeps a path, a query or a
   quote from ever reaching the src of an iframe. */
const ID = /^[A-Za-z0-9_-]{11}$/

/* The hosts a share link actually comes from — youtu.be from the share sheet,
   m.youtube.com from a phone, www or bare from a desktop address bar. */
const HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'www.youtu.be',
])

/**
 * The video id in a line that is **only** a YouTube link, or null.
 *
 * Only-a-link matters: the reading view replaces the whole line with a player,
 * so a link with words around it has to stay a sentence or the words vanish.
 */
export function videoId(line: string): string | null {
  const text = line.trim()
  if (text.length === 0 || /\s/.test(text)) return null

  let url: URL
  try {
    /* A pasted link often has no scheme. Adding one is how it parses; a
       string that is not a url at all still throws and is refused. */
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`)
  } catch {
    return null
  }

  if (!HOSTS.has(url.hostname.toLowerCase())) return null

  /* youtu.be/<id> and /embed/<id> and /shorts/<id> carry it in the path;
     /watch carries it in v. */
  const path = url.pathname.split('/').filter((part) => part.length > 0)
  const candidate =
    url.hostname.toLowerCase().endsWith('youtu.be') && path.length === 1
      ? path[0]
      : (path[0] === 'embed' || path[0] === 'shorts') && path.length === 2
        ? path[1]
        : (url.searchParams.get('v') ?? null)

  if (candidate === null) return null
  return ID.test(candidate) ? candidate : null
}

/** The poster frame. An image request, and nothing else, until it is clicked. */
export function thumbnailUrl(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
}

/** The player, loaded only after a click — hence autoplay, which continues it. */
export function watchUrl(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1`
}
