# Waiting → steps

**Done when:** a task in a goal's Waiting list, dragged into the gap between
step 1 and step 2, becomes step 2 — it spins in with sparks, leaves the
list, and one tap on Undo puts it back as it was.

Artem, 24 Sep: the Waiting list under a goal is "only short string … maybe
even add it as a milestone … drag and insert between milestones". He chose
**moved** (the task becomes the step; not linked under it).

## What gets built

1. **Richer Waiting rows.** Each row: the area dot, the title, how long it
   has waited (`agoLabel` of its creation, mono), its due date as the same
   chip a step's date is (amber the day before, red once passed), a Done
   tick (`tasks.complete` — writes `task_done` and nothing else), and a grip
   on the left. Still four rows and "more in the backlog →". No count of
   open tasks anywhere (CLAUDE.md).
2. **Drag a row onto the line (md+).** Grab the grip; a small glass chip of
   the title follows the pointer. Every + on the line lights as a drop
   target and the one under the pointer grows and turns its ring. Drop on a
   + → the task becomes a step there. Drop anywhere else → nothing happens,
   the chip flies back. Pointer events in a hook, no library (as R5 did).
3. **"Make it a step" without dragging (phone, keyboard).** A row's
   ⋯ → Make it a step puts the timeline into pick-a-gap mode: every + nods,
   a line under the timeline says "Tap where it goes · Cancel". Tap a + →
   same result as a drop.
4. **The move is one mutation.** `milestones.fromTask({ taskId, after })`:
   checks both are his, creates the step with the task's title and due date
   (or the gap's midpoint date when it has none), **archives** the task, and
   returns both ids. `milestones.backToTask({ milestoneId, taskId })` is the
   undo: deletes the step, unarchives the task.
5. **It lands like adding a step.** The new dot spins in with sparks and the
   line draws out (built today); the Waiting row leaves with `motion-leave`;
   `UndoLine` shows "Moved to the timeline · Undo" for five seconds.

## Files

- `convex/milestones.ts` — `fromTask`, `backToTask`; `convex/milestones.test.ts`
  — both, plus refusals: another owner's task or goal, a task filed under a
  different goal, a task on today's three, undo of a step that isn't his.
- `src/lib/drop-target.ts` (+ test) — which + a pointer is over, from the
  line's gap positions. Pure maths.
- `src/components/goals/GoalTimeline.tsx` — drop targets, pick-a-gap mode.
- `src/components/goals/GoalCard.tsx` — Waiting rows (probably out into
  `src/components/goals/WaitingList.tsx`), the drag hook, UndoLine.

## Open questions (my recommendation first)

1. **Archive or delete the task behind the move?** Archive. A task can hold
   notes and attached files a step cannot; archived, nothing is lost and
   it's still in the backlog's Archived tab. Delete would make Undo the only
   way back.
2. **A task on today's three:** can it be moved? No — the grip and the menu
   item are hidden for it, and `fromTask` refuses. Moving it would quietly
   free a slot, which only `dropFromToday` may do (CLAUDE.md).
3. **Its date:** the task's due date becomes the step's date; with none, the
   gap's midpoint (`gapDate`), same as the + form. A scheduled time is not
   carried — a step's time is a deadline, a task's is a booking.
4. **Done tick on the row:** yes, it's the one action people reach for on a
   waiting task. Anything else (pick for today, edit) stays on the backlog.
