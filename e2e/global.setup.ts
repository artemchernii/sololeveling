import { clerkSetup } from '@clerk/testing/playwright'

/* A Clerk testing token, so the test user signs in without a bot check. */
export default async function setup() {
  await clerkSetup()
}
