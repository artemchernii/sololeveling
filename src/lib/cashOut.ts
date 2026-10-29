/* Cash out of a machine, or into his wallet from one (1 Oct: a typed
   "withdraw +€20" in Cash was counted as income). Split from intake.ts
   on 29 Oct, when the account sheet started to read it too. */
export const WITHDRAWAL = /\b(atm|withdraw(al)?|levantamento|cash out)\b/i

/** Cash out of a machine: "LEV ATM 2789 BCP Lisboa" (29 Oct: it read as
    "transfer · own account"). */
export const cashOut = (text: string): boolean => WITHDRAWAL.test(text)
