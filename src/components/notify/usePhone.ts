import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { useCallback, useEffect, useState } from 'react'

import { api } from '../../../convex/_generated/api'
import { deviceOf, keyBytes, phoneState } from '@/lib/push'
import type { Permission, PhoneState } from '@/lib/push'

/* N1 (15 Oct). Where this browser is on the way to notifications, and
   ALLOW. The permission is asked first, inside the tap — iOS refuses a
   prompt that comes after an await — and the worker registered after. */

function standalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true
  )
}

function permission(): Permission {
  if (
    typeof Notification === 'undefined' ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window)
  ) {
    return 'unsupported'
  }
  return Notification.permission
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator)) return null
  const reg = await navigator.serviceWorker.getRegistration('/')
  return (await reg?.pushManager.getSubscription()) ?? null
}

export function usePhone() {
  const key = useQuery(api.push.publicKey)
  const save = useMutation(api.push.subscribe)
  const [state, setState] = useState<PhoneState | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  const refresh = useCallback(async () => {
    const subscribed = (await currentSubscription()) !== null
    setState(
      phoneState({
        ua: navigator.userAgent,
        standalone: standalone(),
        permission: permission(),
        subscribed,
      }),
    )
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const allow = useCallback(async () => {
    setBusy(true)
    setFailed(false)
    try {
      const answer = await Notification.requestPermission()
      if (answer === 'granted' && key) {
        const reg = await navigator.serviceWorker.register('/sw.js')
        await navigator.serviceWorker.ready
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: keyBytes(key),
        })
        const json = sub.toJSON()
        await save({
          endpoint: sub.endpoint,
          p256dh: json.keys?.p256dh ?? '',
          auth: json.keys?.auth ?? '',
          device: deviceOf(navigator.userAgent),
        })
      } else if (answer === 'granted') {
        setFailed(true)
      }
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
      await refresh()
    }
  }, [key, save, refresh])

  return { state, busy, failed, allow, keyMissing: key === null }
}
