/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accounts from "../accounts.js";
import type * as aggregate from "../aggregate.js";
import type * as ai_portfolio from "../ai/portfolio.js";
import type * as ai_read from "../ai/read.js";
import type * as areas from "../areas.js";
import type * as attachments from "../attachments.js";
import type * as auth from "../auth.js";
import type * as crons from "../crons.js";
import type * as drills from "../drills.js";
import type * as events from "../events.js";
import type * as github from "../github.js";
import type * as goals from "../goals.js";
import type * as invest from "../invest.js";
import type * as logs from "../logs.js";
import type * as market from "../market.js";
import type * as milestones from "../milestones.js";
import type * as notes from "../notes.js";
import type * as principles from "../principles.js";
import type * as projects from "../projects.js";
import type * as recurring from "../recurring.js";
import type * as repo from "../repo.js";
import type * as reviews from "../reviews.js";
import type * as search from "../search.js";
import type * as seed from "../seed.js";
import type * as state from "../state.js";
import type * as tasks from "../tasks.js";
import type * as vault from "../vault.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accounts: typeof accounts;
  aggregate: typeof aggregate;
  "ai/portfolio": typeof ai_portfolio;
  "ai/read": typeof ai_read;
  areas: typeof areas;
  attachments: typeof attachments;
  auth: typeof auth;
  crons: typeof crons;
  drills: typeof drills;
  events: typeof events;
  github: typeof github;
  goals: typeof goals;
  invest: typeof invest;
  logs: typeof logs;
  market: typeof market;
  milestones: typeof milestones;
  notes: typeof notes;
  principles: typeof principles;
  projects: typeof projects;
  recurring: typeof recurring;
  repo: typeof repo;
  reviews: typeof reviews;
  search: typeof search;
  seed: typeof seed;
  state: typeof state;
  tasks: typeof tasks;
  vault: typeof vault;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
