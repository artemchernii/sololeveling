# Notifications — journeys

Spec: `docs/specs/2026-10-15-n1-notifications.md` · mockup:
`design/notifications-mockup/index.html` (:3965).

| Journey                                         | Screen                                        | Functions                                                          | Test                                                         |
| ----------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------ |
| Put the app on the iPhone and allow             | `/phone` → `PhoneWindow` (`Taps`, `usePhone`) | `push.publicKey`, `push.subscribe`; `src/lib/push.ts` `phoneState` | `e2e/notifications.spec.ts` S1 S2 S4; `src/lib/push.test.ts` |
| Send a test                                     | `/phone` → SEND A TEST                        | `push.sendTest` → `push.notify` → `pushNode.send`                  | e2e S3; `convex/push.test.ts`                                |
| See today's in the bell, open one               | top bar `Bell`                                | `notifications.today`, `notifications.markRead`, `push.devices`    | e2e S5 S6 S7; `convex/push.test.ts`                          |
| Set up the iPhone from the Mac                  | `Bell` → QR of `/phone`                       | `push.devices`                                                     | e2e S7                                                       |
| A phone that let go                             | —                                             | `pushNode.send` → `push.drop` (404/410)                            | `convex/push.test.ts`, `src/lib/push.test.ts`                |
| N1b (next): 10 min before an event, a file read | —                                             | `events.*` scheduler, `intake.save`/`fail` → `push.notify`         | —                                                            |
