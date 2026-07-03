/**
 * Unit tests for the shared in-flight guard module.
 *
 * quick-quote.tsx uses createInFlightGuard() from @/lib/inflight-guard for
 * both the "Create & Send" button (createQuoteGuard) and the "Save Draft"
 * button (saveAsDraftGuard). Importing from the production module means these
 * tests catch regressions in the real guard logic, not in a mirror copy.
 *
 * For component-level click-through tests that render a UI harness and assert
 * only one fetch fires, see client/src/__tests__/quick-quote-inflight-guard.test.tsx.
 */

import { describe, it, expect } from 'vitest';
import { createInFlightGuard } from '@/lib/inflight-guard';

// ---------------------------------------------------------------------------
// acquire / release semantics
// ---------------------------------------------------------------------------
describe('createInFlightGuard — acquire / release', () => {
  it('returns true on the first acquire when the guard is free', () => {
    const guard = createInFlightGuard();
    expect(guard.acquire()).toBe(true);
  });

  it('returns false on a second acquire while the guard is locked', () => {
    const guard = createInFlightGuard();
    guard.acquire();
    expect(guard.acquire()).toBe(false);
  });

  it('returns true again after release is called', () => {
    const guard = createInFlightGuard();
    guard.acquire();
    guard.release();
    expect(guard.acquire()).toBe(true);
  });

  it('isLocked reflects the current state accurately', () => {
    const guard = createInFlightGuard();
    expect(guard.isLocked()).toBe(false);
    guard.acquire();
    expect(guard.isLocked()).toBe(true);
    guard.release();
    expect(guard.isLocked()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// "Create & Send" guard pattern — check-then-acquire (handleCreateQuote style)
// The component calls isLocked() early for validation bail-out, then acquire()
// just before mutate, and release() in onSuccess / onError / catch.
// ---------------------------------------------------------------------------
describe('Create & Send guard pattern (isLocked → acquire → release)', () => {
  it('blocks a second call while the first is in-flight', () => {
    const guard = createInFlightGuard();
    const calls: string[] = [];

    const handleCreateQuote = () => {
      if (guard.isLocked()) return;
      // ... validation would happen here ...
      guard.acquire();
      calls.push('mutate');
    };

    handleCreateQuote();
    handleCreateQuote();
    handleCreateQuote();

    expect(calls).toHaveLength(1);
  });

  it('allows a second submission after onSuccess releases the guard', () => {
    const guard = createInFlightGuard();
    const calls: string[] = [];

    const handleCreateQuote = () => {
      if (guard.isLocked()) return;
      guard.acquire();
      calls.push('mutate');
    };

    handleCreateQuote();
    guard.release(); // simulates onSuccess
    handleCreateQuote();

    expect(calls).toHaveLength(2);
  });

  it('allows a second submission after onError releases the guard', () => {
    const guard = createInFlightGuard();
    const calls: string[] = [];

    const handleCreateQuote = () => {
      if (guard.isLocked()) return;
      guard.acquire();
      calls.push('mutate');
    };

    handleCreateQuote();
    guard.release(); // simulates onError
    handleCreateQuote();

    expect(calls).toHaveLength(2);
  });

  it('releases via catch block when mutate throws synchronously', () => {
    const guard = createInFlightGuard();

    const handleCreateQuote = () => {
      if (guard.isLocked()) return;
      try {
        guard.acquire();
        throw new Error('sync error');
      } catch {
        guard.release();
      }
    };

    handleCreateQuote();
    expect(guard.isLocked()).toBe(false);
    // Can submit again immediately
    expect(guard.acquire()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// "Save Draft" guard pattern — single acquire (onClick inline style)
// The component calls acquire() as the very first statement; onSettled releases.
// ---------------------------------------------------------------------------
describe('Save Draft guard pattern (acquire at top → release in onSettled)', () => {
  it('blocks a second click while the first save is in-flight', () => {
    const guard = createInFlightGuard();
    const calls: string[] = [];

    const handleSaveDraft = () => {
      if (!guard.acquire()) return;
      calls.push('mutate');
    };

    handleSaveDraft();
    handleSaveDraft();
    handleSaveDraft();

    expect(calls).toHaveLength(1);
  });

  it('allows a second save after onSettled releases the guard (success path)', () => {
    const guard = createInFlightGuard();
    const calls: string[] = [];

    const handleSaveDraft = () => {
      if (!guard.acquire()) return;
      calls.push('mutate');
    };

    handleSaveDraft();
    guard.release(); // simulates onSettled
    handleSaveDraft();

    expect(calls).toHaveLength(2);
  });

  it('allows a second save after onSettled releases the guard (error path)', () => {
    const guard = createInFlightGuard();
    const calls: string[] = [];

    const handleSaveDraft = () => {
      if (!guard.acquire()) return;
      calls.push('mutate');
    };

    handleSaveDraft();
    guard.release(); // simulates onSettled after an error
    handleSaveDraft();

    expect(calls).toHaveLength(2);
  });

  it('guard stays locked between acquire and release', () => {
    const guard = createInFlightGuard();
    guard.acquire();
    expect(guard.isLocked()).toBe(true);
    guard.release();
    expect(guard.isLocked()).toBe(false);
  });
});
