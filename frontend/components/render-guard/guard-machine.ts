// guard-machine.ts — the pure loss/restore/retry state machine (design.md,
// "the shared guard module's public API"). No DOM, no timers, no side
// effects: `reduceGuard` is a plain reducer over the transition table pinned
// in design.md, including its four IDENTITY rows (rows that must return the
// SAME object by reference, not merely an equal one — that is how "a second
// loss/retry changes nothing" is assertable rather than merely believed).

export type GuardStatus = 'live' | 'unsupported' | 'interrupted' | 'retrying'
export type FailureCause = 'creation' | 'lost' | 'restore-failed'

export interface GuardState {
  status: GuardStatus
  cause: FailureCause | null
}

export type GuardEvent =
  | { type: 'probed'; supported: boolean }
  | { type: 'contextLost' }
  | { type: 'contextRestored' }
  | { type: 'renderError'; cause: FailureCause }
  | { type: 'retryStarted' }
  | { type: 'retrySucceeded' }
  | { type: 'retryFailed' }

export function reduceGuard(state: GuardState, event: GuardEvent): GuardState {
  switch (event.type) {
    case 'probed':
      return event.supported ? { status: 'live', cause: null } : { status: 'unsupported', cause: 'creation' }

    case 'contextLost':
      if (state.status === 'live') return { status: 'interrupted', cause: 'lost' }
      // 'interrupted' + contextLost, and 'retrying' + contextLost, are both
      // identity — a second loss (or a loss mid-retry) changes nothing.
      return state

    case 'contextRestored':
      if (state.status === 'interrupted') return { status: 'live', cause: null }
      // 'unsupported' + contextRestored is identity — restore is meaningless
      // without a context that was ever live.
      return state

    case 'retryStarted':
      if (state.status === 'unsupported' || state.status === 'interrupted') {
        return { status: 'retrying', cause: state.cause }
      }
      // 'retrying' + retryStarted is identity — no duplicate concurrent
      // attempt starts.
      return state

    case 'retrySucceeded':
      return { status: 'live', cause: null }

    case 'retryFailed': {
      // Same partition as `renderError`: 'lost' -> interrupted, anything
      // else ('creation' | 'restore-failed') -> unsupported. Keeps the two
      // "what does this cause mean" rules in the machine consistent with
      // each other instead of ad hoc per-transition.
      const cause = state.cause ?? 'creation'
      return cause === 'lost' ? { status: 'interrupted', cause: 'lost' } : { status: 'unsupported', cause }
    }

    case 'renderError':
      return event.cause === 'lost'
        ? { status: 'interrupted', cause: 'lost' }
        : { status: 'unsupported', cause: event.cause }

    default:
      return state
  }
}
