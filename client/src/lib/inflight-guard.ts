/**
 * createInFlightGuard
 *
 * Factory that returns a simple boolean guard used to prevent duplicate
 * submissions when a button is tapped rapidly before the first request
 * completes.  Both the "Create & Send" and "Save Draft" flows in
 * quick-quote.tsx use this pattern.
 *
 * Typical usage in a React component:
 *
 *   const guard = useRef(createInFlightGuard());
 *
 *   // Inside the onClick handler:
 *   if (!guard.current.acquire()) return;
 *   mutation.mutate(data, { onSettled: guard.current.release });
 *
 *   // Or with separate onSuccess / onError callbacks:
 *   mutation.mutate(data, {
 *     onSuccess: () => { guard.current.release(); /* … *\/ },
 *     onError:   () => { guard.current.release(); /* … *\/ },
 *   });
 */
export function createInFlightGuard() {
  let inFlight = false;

  return {
    /**
     * Attempts to acquire the lock.
     * Returns true (and locks) when the guard was free.
     * Returns false without locking when a request is already in-flight.
     */
    acquire(): boolean {
      if (inFlight) return false;
      inFlight = true;
      return true;
    },

    /** Releases the lock so the next request can proceed. */
    release(): void {
      inFlight = false;
    },

    /** Reads the current lock state without modifying it. */
    isLocked(): boolean {
      return inFlight;
    },
  };
}

export type InFlightGuard = ReturnType<typeof createInFlightGuard>;
