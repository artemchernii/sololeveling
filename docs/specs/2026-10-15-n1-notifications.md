# N1 — notifications on the iPhone

Journey (his words, 15 Oct): "if I schedule stretch or run or class you
send me reminder 10 min before" · "I drop statement and it was analyzing
→ I lock phone → we get it done → get notification". Once: open the app's
address on the iPhone, add it to the home screen, allow. Then every day:
a locked phone rings 10 min before anything on the calendar, and says when
a dropped file is read. On the Mac the bell lists today's.

Mockup: `design/notifications-mockup/index.html` on :3965 ("it looks
good" … "GO", 15 Oct). Plan row N.

Two PRs, both off master:

- **N1a — the pipe.** Push subscriptions, the service worker, the sender,
  the PHONE screen (in Safari · from the icon · on · blocked · test), the
  bell (today's list, devices, QR when no iPhone). The logo icons are in.
- **N1b — the sources.** Calendar reminders sent by the server (10 min by
  default on a new event), and a file read / not read.

## Screens and files

- `public/sw.js` — push → `showNotification(title, {body, icon, data.url})`;
  `notificationclick` → focus or open `data.url`.
- `src/lib/push.ts` — `phoneState()`: `in-safari` (iOS, not standalone) ·
  `ask` (standalone, permission default) · `on` (granted and subscribed) ·
  `blocked` (denied) · `desktop`; `subscribe()` registers the worker, asks,
  saves the subscription. Pure parts unit-tested.
- `src/routes/_app/phone.tsx` — the [ IPHONE ] window, as the mockup: three
  segments HOME SCREEN · ALLOW · TEST, the three taps drawn, ALLOW, the two
  sources with switches, SEND A TEST, the Settings path when blocked.
- `src/components/shell/Bell.tsx` — the top-bar bell: count of unread
  today, [ TODAY ] with NOW / EARLIER TODAY, a row opens its `url` and
  marks it read, devices iPhone · Mac with ON, no iPhone → QR of
  `<origin>/phone`.
- `convex/push.ts` — `subscribe`, `unsubscribe`, `devices`, `sendTest`;
  internal `notify(ownerId, kind, title, body, url)` writes a
  `notifications` row and schedules `pushNode.send`.
- `convex/pushNode.ts` (`'use node'`) — `send`: `web-push` to each of the
  owner's subscriptions; a 404/410 deletes that subscription.
- `convex/notifications.ts` — `today` (bell list), `markRead`.
- N1b: `convex/events.ts` create/update/remove schedule, move or cancel
  the reminder (`ctx.scheduler.runAt`, job id on the event); the fired job
  notifies and schedules a recurring event's next occurrence.
  `intake.save` / `intake.fail` notify `file_read` / `file_failed`.
  `EventDialog` opens a new event at **10 min**.
- Journey map: `docs/journeys/notifications.md`.

Schema: `pushSubscriptions {ownerId, endpoint, p256dh, auth, device:
'iphone'|'mac'|'other', createdAt}` by_owner, by_endpoint;
`notifications {ownerId, kind: 'reminder'|'file_read'|'file_failed'|'test',
title, body, url, sentAt, readAt?}` by_owner_sent; `events.remindJob?:
Id<'_scheduled_functions'>`.

Why the scheduler and not a cron: a cron each minute would read events
for every owner 43 000 times a month (the 1 GB read limit, 4 Oct); a job
per reminder reads only when it fires.

## Scenarios

- S1 iPhone in Safari → [ IPHONE ] · IN SAFARI, the three taps playing,
  HOME SCREEN segment live. (e2e, iOS user agent, not standalone)
- S2 from the icon, not allowed → ALLOW → "allowing…" at once → ON, the
  sources, SEND A TEST. (e2e: standalone + permission stubbed; subscribe
  stubbed to a fake endpoint)
- S3 SEND A TEST → "sending…" → SENT tick; a `test` notification row.
  (e2e + convex-test)
- S4 blocked → BLOCKED, the Settings path. (e2e, permission denied)
- S5 bell, two unread today → count 2, NOW / EARLIER TODAY, a row opens
  its screen and its dot goes. (e2e from rows an e2e helper writes)
- S6 bell, nothing today → NOTHING TODAY. (e2e)
- S7 bell, no iPhone subscribed → QR and NO IPHONE. (e2e)
- S8 subscribe twice from one phone → one subscription (by endpoint).
  (convex-test)
- S9 another user's subscription, notification or markRead → refused.
  (convex-test)
- S10 a dead subscription (410) → deleted, the others still sent.
  (convex-test on the pure part)
- N1b S11 new event at 21:00 → 10 min chosen → saved → a job at 20:50;
  moved to 22:00 → job at 21:50, the old one cancelled; removed → none.
  (convex-test with fake timers)
- N1b S12 a weekly series → after firing, next week's job is scheduled.
  (convex-test)
- N1b S13 a statement read → `file_read` "Statement read · ActivoBank ·
  34 rows"; a failure → `file_failed`. (convex-test)
- Phone width and dark: S1, S2, S5 screenshots.

## Data

No number is derived. Rows in the bell are `notifications` rows (an
entity count of today's unread, source 3). "34 rows" is the count of the
intake's rows (source 1). Times are the event's own.

## Out of scope

Finances alerts (N2), investments (N3), AI replies (N4); buttons on a
notification (an iPhone web app shows none); a quiet-hours setting;
reminders for events created before N1b unless edited.

## Questions (with my pick)

1. Events made before N1b — give them 10 min too? Pick: no, only new and
   edited ones; old ones keep what they had.
2. The Mac's own notifications (browser) — also sent? Pick: yes, the Mac
   subscribes the same way when he presses ALLOW on the bell.
