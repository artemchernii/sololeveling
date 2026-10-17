'use node'

import { v } from 'convex/values'
import webpush from 'web-push'

import { deadEndpoints } from '../src/lib/push'
import { internal } from './_generated/api'
import { internalAction } from './_generated/server'

/* N1 (15 Oct). Sends one notification to every browser he allowed. The
   VAPID keys sign it so Apple's and Google's push services accept it;
   they live in the deployment's env (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
   VAPID_SUBJECT), never in the repo. Without them nothing is sent — the
   bell's row is already written. */

export const send = internalAction({
  args: {
    ownerId: v.string(),
    title: v.string(),
    body: v.string(),
    url: v.string(),
    tag: v.optional(v.string()),
    badge: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const pub = process.env.VAPID_PUBLIC_KEY
    const priv = process.env.VAPID_PRIVATE_KEY
    const subject = process.env.VAPID_SUBJECT
    if (!pub || !priv || !subject) {
      console.warn('push: VAPID keys not set, nothing sent')
      return null
    }
    webpush.setVapidDetails(subject, pub, priv)
    const subs = await ctx.runQuery(internal.push.subscriptionsOf, {
      ownerId: args.ownerId,
    })
    const payload = JSON.stringify({
      title: args.title,
      body: args.body,
      url: args.url,
      tag: args.tag,
      badge: args.badge,
    })
    const results = await Promise.all(
      subs.map(async (s) => {
        try {
          const r = await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
            { TTL: 60 * 60 },
          )
          return { endpoint: s.endpoint, status: r.statusCode }
        } catch (e) {
          const status = e instanceof webpush.WebPushError ? e.statusCode : 0
          console.warn(`push: ${status} from ${new URL(s.endpoint).host}`)
          return { endpoint: s.endpoint, status }
        }
      }),
    )
    for (const endpoint of deadEndpoints(results)) {
      await ctx.runMutation(internal.push.drop, {
        ownerId: args.ownerId,
        endpoint,
      })
    }
    return null
  },
})
