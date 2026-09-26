/* The workouts Body brings (rebuilt 26 Sep). "I'm not sure if I gonna log
   all this … some of those exercises I never heard about."

   So: six workouts, each a short list of well-known moves, every one with
   a "watch how" link. Picking one on Body shows its list to tick through
   while training; the ticks are a guide and are not saved. What is saved is
   the session, one tap at the end — the row the hero and the Today tile
   count.

   Reference, not his data — the same standing as the language paths.
   General fitness content in plain words, not treatment; SAFETY sits under
   every list.

   No React and no Convex. */

/** The category a workout's session files under — the words capture
    already writes, so the hero's rows and the Today tile read one stream. */
export type BodyKind = 'stretch' | 'gym' | 'boxing' | 'hiking'

export type Exercise = {
  /** Unique within its workout: today's ticks are kept against it. */
  id: string
  name: string
  /** How much, short: "3 × 10", "30 s each side". */
  dose: string
  /** What it is for, in one line. */
  why: string
  steps: ReadonlyArray<string>
  /** The common mistake. */
  avoid: string
}

export type Workout = {
  id: string
  kind: BodyKind
  name: string
  /** How often and how long, in words: "daily · 8 min". */
  rhythm: string
  /** One or two sentences: what it is for and how to run it. */
  about: string
  exercises: ReadonlyArray<Exercise>
}

export const SAFETY =
  'General fitness guidance, not medical advice. Move within a comfortable range — mild stretch is fine, pain is not. If pain is sharp, spreads down a leg, or comes with numbness or tingling, stop and see a physio or doctor.'

export const KIND_LABEL: Record<BodyKind, string> = {
  stretch: 'Mobility',
  gym: 'Gym',
  boxing: 'Boxing',
  hiking: 'Hiking',
}

/** A session's name, on its button. */
export const SESSION_LABEL: Record<BodyKind, string> = {
  stretch: 'Mobility',
  gym: 'Gym',
  boxing: 'Boxing',
  hiking: 'Hike',
}

export const KINDS: ReadonlyArray<BodyKind> = [
  'stretch',
  'gym',
  'boxing',
  'hiking',
]

/* On the gym days a braced trunk and a flat back are the whole of back
   care: they are in the steps rather than a separate warning. */
export const WORKOUTS: ReadonlyArray<Workout> = [
  {
    id: 'back',
    kind: 'stretch',
    name: 'Back mobility',
    rhythm: 'daily · 8 min',
    about:
      'The one to do every day — in the morning or after sitting for long. Easy movement for the spine, glutes switched on, the deep core holding still. Slow beats more reps.',
    exercises: [
      {
        id: 'cat-cow',
        name: 'Cat-cow',
        dose: '10 slow reps',
        why: 'Moves every segment of the spine through flexion and extension.',
        steps: [
          'On hands and knees, hands under shoulders, knees under hips.',
          'Breathe in: let the belly drop and lift the chest and tailbone.',
          'Breathe out: round the back up, tuck chin and tailbone.',
          'Move slowly, one vertebra at a time.',
        ],
        avoid:
          'Rushing or forcing the end range — it should feel easy, not strained.',
      },
      {
        id: 'knee-to-chest',
        name: 'Knee-to-chest',
        dose: '30 s each side',
        why: 'Eases tension in the lower back and glutes.',
        steps: [
          'Lie on your back, both knees bent.',
          'Hug one knee toward your chest with both hands.',
          'Keep the other foot on the floor. Breathe slowly, then switch.',
        ],
        avoid: 'Pulling hard or lifting your head — relax the neck.',
      },
      {
        id: 'glute-bridge',
        name: 'Glute bridge',
        dose: '2 × 12',
        why: 'Strong glutes take load off the lower back.',
        steps: [
          'On your back, knees bent, feet hip-width, arms by your sides.',
          'Squeeze the glutes and lift the hips until knees, hips and shoulders line up.',
          'Hold 2 s at the top, lower slowly.',
        ],
        avoid:
          'Arching the lower back at the top — stop where the glutes, not the back, are working.',
      },
      {
        id: 'bird-dog',
        name: 'Bird-dog',
        dose: '2 × 8 each side',
        why: 'Trains the core to keep the spine still while the limbs move.',
        steps: [
          'On hands and knees, back flat.',
          'Reach one arm forward and the opposite leg back until level with the body.',
          'Hold 3 s without the hips rotating, return, switch sides.',
        ],
        avoid: 'Lifting the leg too high so the back arches or hips tip.',
      },
      {
        id: 'dead-bug',
        name: 'Dead bug',
        dose: '2 × 8 each side',
        why: 'Deep core control with the back supported by the floor.',
        steps: [
          'On your back, arms up to the ceiling, knees bent at 90° above the hips.',
          'Press the lower back gently into the floor.',
          'Lower one arm and the opposite leg toward the floor, slowly, then return.',
        ],
        avoid:
          'Letting the lower back peel off the floor — make the movement smaller.',
      },
      {
        id: 'childs-pose',
        name: "Child's pose",
        dose: '45 s',
        why: 'A calm stretch to finish, lengthening the back.',
        steps: [
          'Kneel, big toes together, knees apart.',
          'Sit back toward your heels and walk your hands forward.',
          'Rest the forehead down and breathe into the back.',
        ],
        avoid: 'Forcing the hips to the heels — go as far as is comfortable.',
      },
    ],
  },
  {
    id: 'gym-back',
    kind: 'gym',
    name: 'Back day',
    rhythm: '1× a week · 45 min',
    about:
      'Pulling: the back and the biceps. Warm up with a light first set of each. Pick a weight you could lift two more times than the reps asked.',
    exercises: [
      {
        id: 'lat-pulldown',
        name: 'Lat pulldown',
        dose: '3 × 10',
        why: 'The width of the back — the pull-up, with the weight you choose.',
        steps: [
          'Sit with the thighs under the pads, hands a bit wider than the shoulders.',
          'Pull the bar to the top of the chest, leading with the elbows.',
          'Let it rise slowly until the arms are straight.',
        ],
        avoid: 'Leaning far back and swinging the weight down.',
      },
      {
        id: 'cable-row',
        name: 'Seated cable row',
        dose: '3 × 10',
        why: 'The middle of the back, which holds the shoulders back.',
        steps: [
          'Sit tall, knees soft, chest up, back flat.',
          'Pull the handle to the belly, squeezing the shoulder blades together.',
          'Return slowly without rounding forward.',
        ],
        avoid: 'Rocking the torso to move the weight.',
      },
      {
        id: 'db-row',
        name: 'One-arm dumbbell row',
        dose: '3 × 10 each side',
        why: 'Each side of the back on its own, with the trunk supported.',
        steps: [
          'One hand and knee on a bench, back flat like a table.',
          'Pull the dumbbell up toward the hip, elbow close to the body.',
          'Lower it all the way down, slowly.',
        ],
        avoid: 'Twisting the torso open to lift it higher.',
      },
      {
        id: 'face-pull',
        name: 'Face pull',
        dose: '3 × 15',
        why: 'The back of the shoulders — good posture after a day at a desk.',
        steps: [
          'Rope on a cable at head height.',
          'Pull the rope toward the face, hands ending beside the ears.',
          'Pause, then return slowly.',
        ],
        avoid: 'Going heavy and turning it into a row.',
      },
      {
        id: 'curl',
        name: 'Biceps curl',
        dose: '3 × 12',
        why: 'The arms, to finish the pulling day.',
        steps: [
          'Stand tall with dumbbells, palms forward, elbows at your sides.',
          'Curl up without the elbows moving forward.',
          'Lower slowly all the way.',
        ],
        avoid: 'Swinging the body to lift the weight.',
      },
    ],
  },
  {
    id: 'gym-push',
    kind: 'gym',
    name: 'Chest & shoulders',
    rhythm: '1× a week · 45 min',
    about:
      'Pushing: chest, shoulders and triceps. A light first set of each to warm up. Keep the shoulder blades pulled back on every press.',
    exercises: [
      {
        id: 'bench',
        name: 'Bench press',
        dose: '3 × 8',
        why: 'The main chest lift. Dumbbells are fine and kinder to the shoulders.',
        steps: [
          'Lie on the bench, feet flat, shoulder blades squeezed together.',
          'Lower the bar or dumbbells to the middle of the chest.',
          'Press up until the arms are straight.',
        ],
        avoid: 'Bouncing off the chest or flaring the elbows straight out.',
      },
      {
        id: 'incline-press',
        name: 'Incline dumbbell press',
        dose: '3 × 10',
        why: 'The upper chest.',
        steps: [
          'Bench at a low incline, about 30°.',
          'Lower the dumbbells beside the upper chest.',
          'Press up and slightly together.',
        ],
        avoid: 'Setting the bench too steep — it becomes a shoulder press.',
      },
      {
        id: 'shoulder-press',
        name: 'Seated shoulder press',
        dose: '3 × 10',
        why: 'The shoulders. Seated with a back rest keeps the lower back out of it.',
        steps: [
          'Sit against the upright bench, dumbbells at shoulder height.',
          'Press up until the arms are straight.',
          'Lower back to the shoulders, slowly.',
        ],
        avoid: 'Arching the lower back off the bench to press.',
      },
      {
        id: 'lateral-raise',
        name: 'Lateral raise',
        dose: '3 × 15',
        why: 'The side of the shoulders.',
        steps: [
          'Stand with light dumbbells at your sides, elbows slightly bent.',
          'Raise the arms out to the sides up to shoulder height.',
          'Lower slowly.',
        ],
        avoid: 'Shrugging or swinging — go lighter.',
      },
      {
        id: 'pushdown',
        name: 'Triceps pushdown',
        dose: '3 × 12',
        why: 'The back of the arms, to finish the pushing day.',
        steps: [
          'Cable at the top, rope or bar in the hands, elbows at your sides.',
          'Push down until the arms are straight.',
          'Let it rise to just above 90°, elbows still.',
        ],
        avoid: 'Elbows drifting forward and the shoulders taking over.',
      },
    ],
  },
  {
    id: 'gym-legs',
    kind: 'gym',
    name: 'Leg day',
    rhythm: '1× a week · 45 min',
    about:
      'Legs and glutes. Brace the stomach before every rep — that protects the back. Start lighter than you think; add weight when every rep looks the same.',
    exercises: [
      {
        id: 'squat',
        name: 'Squat',
        dose: '3 × 8',
        why: 'The main leg lift. A dumbbell at the chest (goblet) is a good start.',
        steps: [
          'Feet shoulder-width, toes slightly out, stomach braced.',
          'Sit down between the heels, chest up, knees following the toes.',
          'Stand up through the whole foot.',
        ],
        avoid: 'The lower back rounding at the bottom — stop just above it.',
      },
      {
        id: 'rdl',
        name: 'Romanian deadlift',
        dose: '3 × 10',
        why: 'Hamstrings and glutes — the hinge that protects the back when you lift.',
        steps: [
          'Stand with the weight in front of the thighs, knees soft.',
          'Push the hips back and slide the weight down the legs, back flat.',
          'Stop when the hamstrings stretch, then stand by squeezing the glutes.',
        ],
        avoid: 'Rounding the back to reach lower. Start light.',
      },
      {
        id: 'leg-press',
        name: 'Leg press',
        dose: '3 × 12',
        why: 'Heavy leg work with the back supported.',
        steps: [
          'Feet shoulder-width in the middle of the platform.',
          'Lower until the knees are near 90°.',
          'Press up without locking the knees.',
        ],
        avoid: 'Going so deep the lower back lifts off the seat.',
      },
      {
        id: 'lunge',
        name: 'Walking lunges',
        dose: '2 × 10 each side',
        why: 'Each leg on its own, and balance.',
        steps: [
          'Step forward and lower until both knees are near 90°.',
          'Keep the chest tall and the front knee over the foot.',
          'Push through the front foot into the next step.',
        ],
        avoid: 'The front knee caving in.',
      },
      {
        id: 'calf-raise',
        name: 'Calf raises',
        dose: '3 × 15',
        why: 'Calves and ankles.',
        steps: [
          'Stand with the balls of the feet on a step or the machine.',
          'Rise as high as you can, pause.',
          'Lower the heels slowly below the step.',
        ],
        avoid: 'Bouncing at the bottom.',
      },
    ],
  },
  {
    id: 'boxing',
    kind: 'boxing',
    name: 'Boxing at home',
    rhythm: '2× a week · 25 min',
    about:
      'Keeps the skill and the engine alive with no bag and no partner. Rounds of 3 minutes with 1 minute rest, hands up the whole round.',
    exercises: [
      {
        id: 'skip',
        name: 'Skipping rope',
        dose: '3 × 2 min',
        why: 'Warms up and trains footwork rhythm.',
        steps: [
          'Small jumps on the balls of the feet.',
          'Turn the rope from the wrists, elbows close.',
          'No rope? Skip in place with the same rhythm.',
        ],
        avoid: 'Jumping high or landing on the heels.',
      },
      {
        id: 'footwork',
        name: 'Stance & footwork',
        dose: '2 rounds × 3 min',
        why: 'Movement is where defence starts.',
        steps: [
          'Stand in your stance, hands up, weight on the balls of the feet.',
          'Step forward, back, left and right — lead foot first when going its way.',
          'Never cross the feet; stay the same width.',
        ],
        avoid: 'Feet coming together or crossing.',
      },
      {
        id: 'shadow',
        name: 'Shadowboxing',
        dose: '3 rounds × 3 min',
        why: 'Technique and conditioning at once.',
        steps: [
          'Throw combinations (1-2, 1-2-3, 1-1-2) at an imagined opponent.',
          'Move after every combination; return the hands to the face.',
          'Breathe out sharply with each punch.',
        ],
        avoid: 'Dropping the hands between punches or standing still.',
      },
      {
        id: 'slip-roll',
        name: 'Slips & rolls',
        dose: '2 × 1 min',
        why: 'Head movement — defence you can drill alone.',
        steps: [
          'Slip: bend the knees slightly and move the head just off the centre line.',
          'Roll: dip under an imagined hook in a U shape.',
          'Keep the eyes forward and the hands up.',
        ],
        avoid: 'Bending at the waist instead of the knees.',
      },
      {
        id: 'push-ups',
        name: 'Push-ups',
        dose: '3 × 10',
        why: 'Punching muscles and a braced trunk.',
        steps: [
          'Hands under shoulders, body in one straight line.',
          'Lower the chest to just above the floor.',
          'Press up. From the knees is fine.',
        ],
        avoid: 'Hips sagging.',
      },
    ],
  },
  {
    id: 'hiking',
    kind: 'hiking',
    name: 'Hiking legs',
    rhythm: '2× a week · 25 min',
    about:
      'Keeps the legs ready for the next hike. The descent is what tires the knees, so take 2–3 seconds on every way down.',
    exercises: [
      {
        id: 'step-up',
        name: 'Step-ups',
        dose: '3 × 10 each side',
        why: 'The climbing movement itself.',
        steps: [
          'Face a box or step at knee height or lower.',
          'Drive up through the whole top foot, stand tall.',
          'Step down slowly with the other foot.',
        ],
        avoid: 'Pushing off the bottom foot to cheat up.',
      },
      {
        id: 'reverse-lunge',
        name: 'Reverse lunge',
        dose: '3 × 8 each side',
        why: 'Legs and balance, gentler on the knees than forward lunges.',
        steps: [
          'Step one foot back and lower until both knees are near 90°.',
          'Keep the chest tall and the front knee over the foot.',
          'Push through the front foot to stand.',
        ],
        avoid: 'The front knee caving in.',
      },
      {
        id: 'calf-raise',
        name: 'Calf raises',
        dose: '3 × 15',
        why: 'Calves and ankles for long climbs.',
        steps: [
          'Stand with the balls of the feet on a step.',
          'Rise as high as you can, pause.',
          'Lower the heels slowly below the step.',
        ],
        avoid: 'Bouncing at the bottom.',
      },
      {
        id: 'wall-sit',
        name: 'Wall sit',
        dose: '3 × 30 s',
        why: 'Endurance for long descents.',
        steps: [
          'Back against a wall, slide down until the thighs are near level.',
          'Knees over the ankles, weight in the heels.',
          'Hold, breathing normally.',
        ],
        avoid: 'Knees drifting past the toes.',
      },
      {
        id: 'incline-walk',
        name: 'Incline walk',
        dose: '20 min',
        why: 'Builds the engine for climbs.',
        steps: [
          'Treadmill on a steep incline, or a hill outside.',
          'A pace where you can talk in short sentences.',
          'Don’t hold the rails.',
        ],
        avoid: 'Leaning on the handrails, which takes the work away.',
      },
    ],
  },
]

export function workoutById(
  id: string | null | undefined,
): Workout | undefined {
  return WORKOUTS.find((w) => w.id === id)
}

/** "Watch how": a video search for the move, since a name alone means
    nothing if you have never seen it done (26 Sep). A search, not a
    chosen video, so it never goes dead. */
export function howToLink(exercise: Pick<Exercise, 'name'>): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(
    `${exercise.name} exercise how to`,
  )}`
}

/**
 * The text of the one session Finish saves: the workout, then the moves
 * ticked, in the workout's order — "Back day — Lat pulldown, Face pull".
 * One row still, but it says what was done (26 Sep: "0 exercises
 * registered?"). Nothing ticked is just the workout's name.
 */
export function sessionText(
  workout: Workout,
  ticked: ReadonlyArray<string>,
): string {
  const moves = workout.exercises
    .filter((e) => ticked.includes(e.id))
    .map((e) => e.name)
  return moves.length === 0
    ? workout.name
    : `${workout.name} — ${moves.join(', ')}`
}
