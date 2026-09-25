/* The built-in routine library (25 Sep): "I need a helper, not an empty
   list". Programs he can pick from — lower-back mobility first, because
   that is what his back needs — each exercise with what it is for, how to
   do it, how much, and the mistake to avoid.

   Reference, not his data — the same standing as the language paths.
   Picking a program makes his own `drills` rows (drills.addProgram), found
   again by `ref`; his progress is his exercise logs against those rows.
   Nothing here is written to the database on its own.

   General fitness content in plain words, not treatment. Every program
   carries SAFETY.

   No React and no Convex: `convex/drills.ts` imports it to check a pick. */

/** The category a program's logs file under — the words capture already
    writes, so the hero's rows and the Today tile read the same stream. */
export type BodyKind = 'stretch' | 'gym' | 'boxing' | 'hiking'

export type Exercise = {
  /** Permanent within its day: his progress is stored against it. */
  id: string
  name: string
  /** How much, short: "2 × 12", "30 s each side". */
  dose: string
  /** What it is for, in one line. */
  why: string
  steps: ReadonlyArray<string>
  /** The common mistake. */
  avoid: string
}

export type RoutineDay = {
  /** Permanent: part of every ref under it. */
  id: string
  name: string
  exercises: ReadonlyArray<Exercise>
}

export type Program = {
  id: string
  kind: BodyKind
  name: string
  /** One line under the name. */
  tagline: string
  /** How often and how long, in words: "daily · 12 min". */
  rhythm: string
  /** A paragraph: who it is for and how to run it. */
  about: string
  days: ReadonlyArray<RoutineDay>
}

export const SAFETY =
  'General fitness guidance, not medical advice. Move within a comfortable range — mild stretch is fine, pain is not. If pain is sharp, spreads down a leg, or comes with numbness or tingling, stop and see a physio or doctor.'

export const KIND_LABEL: Record<BodyKind, string> = {
  stretch: 'Mobility',
  gym: 'Gym',
  boxing: 'Boxing',
  hiking: 'Hiking',
}

/** A session's name, on its button and in the log DID ALL writes. */
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

export const PROGRAMS: ReadonlyArray<Program> = [
  {
    id: 'back',
    kind: 'stretch',
    name: 'Lower-back mobility',
    tagline: 'Gentle movement and core control for a stiff, achy lower back',
    rhythm: 'daily · 12 min',
    about:
      'The routine to do every day, ideally in the morning or after sitting for long. It moves the spine through easy ranges, wakes up the glutes and trains the deep core to hold the spine steady — the three things a desk-stiff back usually lacks. Slow and controlled beats more reps.',
    days: [
      {
        id: 'back',
        name: 'Lower-back mobility',
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
            id: 'pelvic-tilt',
            name: 'Pelvic tilts',
            dose: '15 reps',
            why: 'Teaches the lower back and pelvis to move on their own, gently.',
            steps: [
              'Lie on your back, knees bent, feet flat.',
              'Flatten your lower back into the floor by tilting the pelvis back.',
              'Release to a small arch. That is one rep.',
            ],
            avoid: 'Lifting the hips off the floor — the motion is small.',
          },
          {
            id: 'knee-to-chest',
            name: 'Single knee-to-chest',
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
            dose: '2 × 8 each side, 3 s hold',
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
            id: 'side-plank',
            name: 'Side plank (from the knees)',
            dose: '2 × 20 s each side',
            why: 'Builds the side core muscles that brace the spine.',
            steps: [
              'Lie on your side, elbow under shoulder, knees bent.',
              'Lift the hips so knees, hips and head line up.',
              'Hold, breathing normally, then switch sides.',
            ],
            avoid: 'Hips sagging or rolling forward.',
          },
          {
            id: 'curl-up',
            name: 'Modified curl-up',
            dose: '5 × 10 s holds',
            why: 'Front core work without bending the lower back.',
            steps: [
              'On your back, one knee bent, the other leg straight.',
              'Hands under the small of your back to keep its natural curve.',
              'Lift head and shoulders just off the floor, hold 10 s, lower.',
            ],
            avoid: 'Tucking the chin or curling up like a sit-up.',
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
            avoid:
              'Forcing the hips to the heels — go as far as is comfortable.',
          },
        ],
      },
    ],
  },
  {
    id: 'hips',
    kind: 'stretch',
    name: 'Hips & hamstrings',
    tagline: 'Opens the tight hips and hamstrings that pull on the back',
    rhythm: '3–5× a week · 10 min',
    about:
      'Hours of sitting shorten the hip flexors and hamstrings, and both tug on the pelvis and lower back. Do this after the back routine or after the gym. Hold stretches with slow breathing; switch sides evenly.',
    days: [
      {
        id: 'hips',
        name: 'Hips & hamstrings',
        exercises: [
          {
            id: 'hip-flexor',
            name: 'Half-kneeling hip-flexor stretch',
            dose: '40 s each side',
            why: 'Lengthens the front of the hip, shortened by sitting.',
            steps: [
              'Kneel on one knee, other foot flat in front.',
              'Squeeze the glute of the kneeling side and tuck the pelvis slightly.',
              'Shift forward until you feel the front of that hip stretch.',
            ],
            avoid: 'Arching the lower back to go further — tuck, don’t lean.',
          },
          {
            id: 'figure-4',
            name: 'Figure-4 stretch',
            dose: '40 s each side',
            why: 'Stretches the deep glute muscles around the hip.',
            steps: [
              'On your back, cross one ankle over the opposite knee.',
              'Pull the uncrossed thigh gently toward you.',
              'Feel it in the buttock of the crossed leg.',
            ],
            avoid: 'Twisting the knee — keep the crossed foot flexed.',
          },
          {
            id: 'hamstring-floss',
            name: 'Hamstring floss',
            dose: '10 each side',
            why: 'Mobilises the hamstrings without long static pulling.',
            steps: [
              'On your back, hold one thigh behind the knee, hip at 90°.',
              'Straighten the knee until you feel a stretch, then bend it again.',
              'Keep it rhythmic and gentle.',
            ],
            avoid: 'Locking the knee hard or bouncing.',
          },
          {
            id: '90-90',
            name: '90/90 switches',
            dose: '10 switches',
            why: 'Rotates both hips in and out — the range sitting never uses.',
            steps: [
              'Sit with both knees bent at 90°, one leg in front, one to the side.',
              'Hands behind you for support, chest tall.',
              'Rotate both knees to the other side, slowly. That is one switch.',
            ],
            avoid: 'Slumping — lean on your hands if the hips are tight.',
          },
          {
            id: 'adductor-rock',
            name: 'Adductor rock-back',
            dose: '10 each side',
            why: 'Opens the inner thigh and groin.',
            steps: [
              'On hands and knees, straighten one leg out to the side.',
              'Rock your hips back toward the bent-leg heel, back flat.',
              'Return and repeat, then switch sides.',
            ],
            avoid: 'Rounding the back to go further.',
          },
          {
            id: 'supine-twist',
            name: 'Lying twist',
            dose: '30 s each side',
            why: 'A gentle rotation for the lower back and hips.',
            steps: [
              'On your back, arms out wide, knees bent together.',
              'Let both knees fall to one side, shoulders stay down.',
              'Breathe, then switch.',
            ],
            avoid: 'Forcing the knees to the floor.',
          },
          {
            id: 'squat-hold',
            name: 'Supported deep squat hold',
            dose: '2 × 30 s',
            why: 'Opens hips, ankles and the lower back together.',
            steps: [
              'Hold a doorframe or post, feet a bit wider than hips.',
              'Sit down into a deep squat, heels down if you can.',
              'Use the support to stay tall and relaxed.',
            ],
            avoid: 'Heels lifting a lot — put a small plate under them.',
          },
        ],
      },
    ],
  },
  {
    id: 'gym-ab',
    kind: 'gym',
    name: 'Full-body A/B',
    tagline: 'Two full-body gym days, alternated, back-friendly choices',
    rhythm: '3× a week · 50 min',
    about:
      'Alternate A and B — A, B, A one week, B, A, B the next — with a rest day between. Start with 5 minutes of the back routine as a warm-up. Pick a weight you could lift 2 more times at the end of each set; when every set feels that way, add a little weight next time.',
    days: [
      {
        id: 'gym-a',
        name: 'Gym A',
        exercises: [
          {
            id: 'goblet-squat',
            name: 'Goblet squat',
            dose: '3 × 8–10',
            why: 'Legs and core, with the weight in front keeping the back upright.',
            steps: [
              'Hold a dumbbell at your chest, feet shoulder-width.',
              'Sit down between your heels, chest tall, knees tracking the toes.',
              'Stand by pushing the floor away.',
            ],
            avoid:
              'Rounding the lower back at the bottom — squat only as deep as you stay flat.',
          },
          {
            id: 'rdl',
            name: 'Dumbbell Romanian deadlift',
            dose: '3 × 8',
            why: 'Hamstrings and glutes; teaches the hip hinge that protects the back.',
            steps: [
              'Stand with dumbbells in front of the thighs, knees soft.',
              'Push the hips back, sliding the weights down the legs, back flat.',
              'Stop when the hamstrings are stretched, then drive the hips forward.',
            ],
            avoid: 'Rounding the back to reach lower. Start light.',
          },
          {
            id: 'db-bench',
            name: 'Dumbbell bench press',
            dose: '3 × 8–10',
            why: 'Chest, shoulders and triceps.',
            steps: [
              'Lie on a bench, feet flat, dumbbells above the chest.',
              'Lower them to the sides of the chest, elbows about 45° from the body.',
              'Press back up.',
            ],
            avoid: 'Bouncing the weights or flaring the elbows straight out.',
          },
          {
            id: 'chest-row',
            name: 'Chest-supported row',
            dose: '3 × 10',
            why: 'Upper back, with the chest supported so the lower back rests.',
            steps: [
              'Lie face down on an incline bench, a dumbbell in each hand.',
              'Row the elbows back toward the hips, squeeze the shoulder blades.',
              'Lower with control.',
            ],
            avoid: 'Shrugging the shoulders up to the ears.',
          },
          {
            id: 'pallof',
            name: 'Pallof press',
            dose: '3 × 10 each side',
            why: 'Anti-rotation core strength — the core’s real job for the back.',
            steps: [
              'Stand side-on to a cable or band at chest height, handle at your chest.',
              'Press it straight out, resisting the pull to rotate.',
              'Hold 2 s, bring it back.',
            ],
            avoid: 'Letting the torso twist toward the anchor.',
          },
          {
            id: 'farmer-carry',
            name: 'Farmer carry',
            dose: '3 × 30 m',
            why: 'Grip, shoulders and a braced trunk under load.',
            steps: [
              'Pick up two heavy dumbbells with a flat back.',
              'Walk tall, shoulders down, short steps.',
              'Set them down the same way you picked them up.',
            ],
            avoid: 'Leaning to one side or rounding to pick them up.',
          },
        ],
      },
      {
        id: 'gym-b',
        name: 'Gym B',
        exercises: [
          {
            id: 'leg-press',
            name: 'Leg press',
            dose: '3 × 10',
            why: 'Legs with the back supported.',
            steps: [
              'Sit with the back flat on the pad, feet hip-width mid-platform.',
              'Lower until knees are near 90° without the hips curling off the pad.',
              'Press back up without locking the knees.',
            ],
            avoid: 'Going so deep the lower back lifts off the seat.',
          },
          {
            id: 'hip-thrust',
            name: 'Hip thrust',
            dose: '3 × 10',
            why: 'The strongest glute builder — glutes carry load the back would.',
            steps: [
              'Upper back against a bench, bar or dumbbell over the hips.',
              'Feet flat, drive the hips up until the body is level.',
              'Squeeze 1 s, lower.',
            ],
            avoid: 'Over-arching the back at the top — ribs down.',
          },
          {
            id: 'lat-pulldown',
            name: 'Lat pulldown',
            dose: '3 × 10',
            why: 'Back and biceps; the lats also help stabilise the spine.',
            steps: [
              'Grip the bar a bit wider than shoulders, sit with thighs locked in.',
              'Pull the bar to the upper chest, elbows down and back.',
              'Let it rise with control.',
            ],
            avoid: 'Leaning far back and yanking with the body.',
          },
          {
            id: 'db-press',
            name: 'Seated dumbbell shoulder press',
            dose: '3 × 8–10',
            why: 'Shoulders, with the bench back supporting the spine.',
            steps: [
              'Sit on an upright bench, back against it, dumbbells at the shoulders.',
              'Press overhead until the arms are straight.',
              'Lower to the shoulders.',
            ],
            avoid: 'Arching the lower back off the pad.',
          },
          {
            id: 'split-squat',
            name: 'Split squat',
            dose: '2 × 8 each side',
            why: 'One leg at a time — balance, glutes and knees.',
            steps: [
              'Stand in a long stride, back heel up.',
              'Lower straight down until the back knee nearly touches the floor.',
              'Push up through the front foot.',
            ],
            avoid: 'The front knee caving inward.',
          },
          {
            id: 'side-plank',
            name: 'Side plank',
            dose: '3 × 30 s each side',
            why: 'Side core strength that braces the spine.',
            steps: [
              'Elbow under shoulder, legs straight and stacked.',
              'Lift the hips into one straight line.',
              'Hold, breathe, switch.',
            ],
            avoid: 'Hips dropping — go back to the knees if they do.',
          },
        ],
      },
    ],
  },
  {
    id: 'boxing',
    kind: 'boxing',
    name: 'Boxing at home',
    tagline: 'Conditioning and technique with no bag and no partner',
    rhythm: '2× a week · 25 min',
    about:
      'Keeps the skill and the engine alive while boxing is on pause. Rounds of 3 minutes with 1 minute rest, like the real thing. Stay light on your feet and keep your hands up the whole round.',
    days: [
      {
        id: 'boxing',
        name: 'Boxing at home',
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
    ],
  },
  {
    id: 'hiking',
    kind: 'hiking',
    name: 'Hiking legs',
    tagline: 'Strength for climbs and descents, and knees that last the day',
    rhythm: '2× a week · 25 min',
    about:
      'Keeps the legs ready for a hike when the season comes. The descent is what tires the knees, so the slow lowering parts matter most — take 2–3 seconds on the way down.',
    days: [
      {
        id: 'hiking',
        name: 'Hiking legs',
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
            id: 'sl-rdl',
            name: 'Single-leg Romanian deadlift',
            dose: '3 × 8 each side',
            why: 'Hamstrings, glutes and the ankle balance uneven ground needs.',
            steps: [
              'Stand on one leg, knee soft, hold a wall if needed.',
              'Hinge forward as the free leg reaches back, back flat.',
              'Return to standing by squeezing the glute.',
            ],
            avoid: 'Rounding the back or the hips twisting open.',
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
    ],
  },
]

/** The ref his drill carries for one exercise in one day. */
export function refFor(dayId: string, exerciseId: string): string {
  return `${dayId}--${exerciseId}`
}

export function programById(id: string): Program | undefined {
  return PROGRAMS.find((p) => p.id === id)
}

export function dayById(id: string): RoutineDay | undefined {
  return PROGRAMS.flatMap((p) => p.days).find((d) => d.id === id)
}

export type RefHit = { program: Program; day: RoutineDay; exercise: Exercise }

/** What a drill's ref points at, or undefined for one he typed himself. */
export function lookupRef(ref: string | undefined): RefHit | undefined {
  if (!ref) return undefined
  for (const program of PROGRAMS) {
    for (const day of program.days) {
      for (const exercise of day.exercises) {
        if (refFor(day.id, exercise.id) === ref) {
          return { program, day, exercise }
        }
      }
    }
  }
  return undefined
}

/** Every ref a program makes. */
export function programRefs(program: Program): Array<string> {
  return program.days.flatMap((d) => d.exercises.map((e) => refFor(d.id, e.id)))
}
