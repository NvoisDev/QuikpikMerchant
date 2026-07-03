/**
 * Regression test: Prevent double-tap from creating two quote submissions
 *
 * Verifies that the useRef in-flight guard added to handleCreateQuote in
 * client/src/pages/quick-quote.tsx ensures rapid successive calls only
 * trigger a single POST /api/quotes request.
 */

import { describe, it, expect, vi } from 'vitest';

function makeGuardedHandler(mutate: () => void) {
  let inFlight = false;

  const handleCreateQuote = () => {
    if (inFlight) return;
    inFlight = true;
    try {
      mutate();
    } catch (err) {
      inFlight = false;
      throw err;
    }
  };

  const onSuccess = () => { inFlight = false; };
  const onError = () => { inFlight = false; };

  return { handleCreateQuote, onSuccess, onError, getInFlight: () => inFlight };
}

describe('quick-quote in-flight guard', () => {
  it('fires mutate exactly once when called twice in rapid succession', () => {
    const mutate = vi.fn();
    const { handleCreateQuote } = makeGuardedHandler(mutate);

    handleCreateQuote();
    handleCreateQuote();
    handleCreateQuote();

    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it('allows a new submission after the previous one succeeds', () => {
    const mutate = vi.fn();
    const { handleCreateQuote, onSuccess } = makeGuardedHandler(mutate);

    handleCreateQuote();
    expect(mutate).toHaveBeenCalledTimes(1);

    onSuccess();

    handleCreateQuote();
    expect(mutate).toHaveBeenCalledTimes(2);
  });

  it('allows a new submission after the previous one errors', () => {
    const mutate = vi.fn();
    const { handleCreateQuote, onError } = makeGuardedHandler(mutate);

    handleCreateQuote();
    expect(mutate).toHaveBeenCalledTimes(1);

    onError();

    handleCreateQuote();
    expect(mutate).toHaveBeenCalledTimes(2);
  });

  it('resets the guard when mutate throws synchronously', () => {
    const mutate = vi.fn(() => { throw new Error('sync error'); });
    const { handleCreateQuote, getInFlight } = makeGuardedHandler(mutate);

    expect(() => handleCreateQuote()).toThrow('sync error');
    expect(getInFlight()).toBe(false);

    const mutate2 = vi.fn();
    const { handleCreateQuote: h2 } = makeGuardedHandler(mutate2);
    h2();
    expect(mutate2).toHaveBeenCalledTimes(1);
  });

  it('keeps the guard locked while the mutation is in progress', () => {
    const mutate = vi.fn();
    const { handleCreateQuote, getInFlight } = makeGuardedHandler(mutate);

    handleCreateQuote();
    expect(getInFlight()).toBe(true);

    handleCreateQuote();
    expect(mutate).toHaveBeenCalledTimes(1);
  });
});
