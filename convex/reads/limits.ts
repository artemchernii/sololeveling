/* Row caps shared by aggregate.ts and the reads beside it. */

export const MAX_ROWS = 500

/* A month of money rows, generously: ten a day is more than capture is
   ever used for. Its own bound because a sum that silently dropped rows
   would read as a smaller month, not a missing one. */
export const MONEY_ROWS = 1000
