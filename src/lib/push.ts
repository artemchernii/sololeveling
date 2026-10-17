/* N1 (15 Oct). Which step of the [ IPHONE ] window to show, and the small
   pure parts of push. An iPhone only gets notifications from the app on
   its home screen (iOS 16.4+), so Safari's tab is a step of its own; a
   Mac's browser goes straight to ALLOW. */

export type PhoneState = 'in-safari' | 'ask' | 'on' | 'blocked' | 'unsupported'

export type Permission = NotificationPermission | 'unsupported'

export type Device = 'iphone' | 'mac' | 'other'

const isIos = (ua: string) => /iPhone|iPad|iPod/.test(ua)

export function phoneState(s: {
  ua: string
  standalone: boolean
  permission: Permission
  subscribed: boolean
}): PhoneState {
  if (isIos(s.ua) && !s.standalone) return 'in-safari'
  if (s.permission === 'unsupported') return 'unsupported'
  if (s.permission === 'denied') return 'blocked'
  if (s.permission === 'granted' && s.subscribed) return 'on'
  return 'ask'
}

export function deviceOf(ua: string): Device {
  if (isIos(ua)) return 'iphone'
  if (/Macintosh|Mac OS X/.test(ua)) return 'mac'
  return 'other'
}

/** A push service answers 404 or 410 for a subscription the phone let go. */
export function deadEndpoints(
  results: Array<{ endpoint: string; status: number }>,
): Array<string> {
  return results
    .filter((r) => r.status === 404 || r.status === 410)
    .map((r) => r.endpoint)
}

/** The VAPID public key, url-safe base64, as the bytes subscribe() wants. */
export function keyBytes(key: string): Uint8Array<ArrayBuffer> {
  const base64 = (key + '='.repeat((4 - (key.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  const raw = atob(base64)
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}
