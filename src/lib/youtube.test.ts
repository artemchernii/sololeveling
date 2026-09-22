import { describe, expect, test } from 'vitest'

import { thumbnailUrl, videoId, watchUrl } from './youtube'

describe('videoId', () => {
  test('a watch link', () => {
    expect(videoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
      'dQw4w9WgXcQ',
    )
  })

  test('a short link', () => {
    expect(videoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  test('an embed link', () => {
    expect(videoId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe(
      'dQw4w9WgXcQ',
    )
  })

  test('the timestamp and the other junk a share link carries', () => {
    /* What Telegram actually hands you. */
    expect(videoId('https://youtu.be/dQw4w9WgXcQ?t=42')).toBe('dQw4w9WgXcQ')
    expect(
      videoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL9&index=2'),
    ).toBe('dQw4w9WgXcQ')
  })

  test('without a scheme, and with the mobile host', () => {
    expect(videoId('youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(videoId('https://m.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
      'dQw4w9WgXcQ',
    )
  })

  test('surrounding whitespace is not part of the line', () => {
    expect(videoId('  https://youtu.be/dQw4w9WgXcQ  ')).toBe('dQw4w9WgXcQ')
  })

  test('a line with words around the link is not a video', () => {
    /* The block replaces the whole line, so a link inside a sentence has to
       stay a sentence — otherwise the words disappear. */
    expect(videoId('watch this https://youtu.be/dQw4w9WgXcQ')).toBeNull()
    expect(videoId('https://youtu.be/dQw4w9WgXcQ is the one')).toBeNull()
  })

  test('another site is not a video', () => {
    expect(videoId('https://vimeo.com/12345678')).toBeNull()
    expect(videoId('https://example.com/watch?v=dQw4w9WgXcQ')).toBeNull()
  })

  test('a youtube link that names no video', () => {
    expect(videoId('https://www.youtube.com/')).toBeNull()
    expect(videoId('https://www.youtube.com/watch?list=PL9')).toBeNull()
  })

  test('an id of the wrong shape is refused', () => {
    /* Eleven characters of the id alphabet, or it is not an id — the value is
       interpolated into a URL, so this is what keeps anything else out. */
    expect(videoId('https://youtu.be/short')).toBeNull()
    expect(videoId('https://youtu.be/dQw4w9WgXcQtoolong')).toBeNull()
    expect(videoId('https://youtu.be/dQw4w9WgX!Q')).toBeNull()
  })

  test('nothing, and not a link at all', () => {
    expect(videoId('')).toBeNull()
    expect(videoId('just some words')).toBeNull()
  })
})

describe('the urls built from an id', () => {
  test('the thumbnail comes from the image host', () => {
    expect(thumbnailUrl('dQw4w9WgXcQ')).toBe(
      'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    )
  })

  test('the player is the no-cookie host, and starts when asked for', () => {
    /* Only ever loaded after a click, so autoplay is the click continuing
       rather than a page that starts talking at you. */
    expect(watchUrl('dQw4w9WgXcQ')).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1',
    )
  })
})
