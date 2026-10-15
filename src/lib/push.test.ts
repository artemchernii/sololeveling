import { describe, expect, test } from 'vitest'

import { deadEndpoints, deviceOf, keyBytes, phoneState } from './push'

const IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'

describe('phoneState: which step the [ IPHONE ] window shows', () => {
  test('an iPhone in Safari has to add it to the home screen first', () => {
    expect(
      phoneState({
        ua: IOS,
        standalone: false,
        permission: 'default',
        subscribed: false,
      }),
    ).toBe('in-safari')
  })

  test('opened from the icon, not asked yet', () => {
    expect(
      phoneState({
        ua: IOS,
        standalone: true,
        permission: 'default',
        subscribed: false,
      }),
    ).toBe('ask')
  })

  test('granted and subscribed is on', () => {
    expect(
      phoneState({
        ua: IOS,
        standalone: true,
        permission: 'granted',
        subscribed: true,
      }),
    ).toBe('on')
  })

  test('granted but the subscription is gone asks again', () => {
    expect(
      phoneState({
        ua: IOS,
        standalone: true,
        permission: 'granted',
        subscribed: false,
      }),
    ).toBe('ask')
  })

  test('denied is blocked', () => {
    expect(
      phoneState({
        ua: IOS,
        standalone: true,
        permission: 'denied',
        subscribed: false,
      }),
    ).toBe('blocked')
  })

  test('a browser with no push at all is unsupported', () => {
    expect(
      phoneState({
        ua: MAC,
        standalone: false,
        permission: 'unsupported',
        subscribed: false,
      }),
    ).toBe('unsupported')
  })

  test('a Mac browser skips the home screen step', () => {
    expect(
      phoneState({
        ua: MAC,
        standalone: false,
        permission: 'default',
        subscribed: false,
      }),
    ).toBe('ask')
  })
})

describe('deviceOf', () => {
  test('names the device from the browser', () => {
    expect(deviceOf(IOS)).toBe('iphone')
    expect(deviceOf(MAC)).toBe('mac')
    expect(deviceOf('Mozilla/5.0 (X11; Linux x86_64)')).toBe('other')
  })
})

describe('deadEndpoints: a 404 or 410 means the phone let it go', () => {
  test('only gone ones', () => {
    expect(
      deadEndpoints([
        { endpoint: 'a', status: 201 },
        { endpoint: 'b', status: 410 },
        { endpoint: 'c', status: 404 },
        { endpoint: 'd', status: 500 },
      ]),
    ).toEqual(['b', 'c'])
  })
})

describe('keyBytes', () => {
  test('a url-safe base64 key becomes its bytes', () => {
    expect(Array.from(keyBytes('AQID_-8'))).toEqual([1, 2, 3, 255, 239])
  })
})
