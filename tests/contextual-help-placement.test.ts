import { describe, expect, it } from 'vitest';
import {
  CONTEXTUAL_HELP_BUBBLE_WIDTH_PX,
  CONTEXTUAL_HELP_EDGE_PADDING_PX,
  getContextualHelpOverridePlacement,
  resolveContextualHelpPlacement,
  type ContextualHelpRect,
} from '../client/src/lib/contextual-help-placement';

const trigger = (left: number, top: number, width = 24, height = 24): ContextualHelpRect => ({
  left,
  top,
  width,
  right: left + width,
  bottom: top + height,
});

describe('resolveContextualHelpPlacement', () => {
  it('keeps a desktop popup below the trigger when there is enough space', () => {
    const result = resolveContextualHelpPlacement({
      triggerRect: trigger(120, 100),
      viewportWidth: 1280,
      viewportHeight: 800,
      bubbleHeight: 300,
    });

    expect(result.placement).toBe('bottom-left');
    expect(result.left).toBe(120);
    expect(result.left + result.safeBubbleWidth).toBeLessThanOrEqual(1264);
    expect(result.safeBubbleWidth).toBe(CONTEXTUAL_HELP_BUBBLE_WIDTH_PX);
    expect(result.maxHeight).toBe(300);
  });

  it('right-aligns and clamps a tablet popup near the right edge', () => {
    const result = resolveContextualHelpPlacement({
      triggerRect: trigger(720, 140),
      viewportWidth: 768,
      viewportHeight: 700,
      bubbleHeight: 320,
    });

    expect(result.placement).toBe('bottom-right');
    expect(result.left).toBe(424);
    expect(result.left + result.safeBubbleWidth).toBeLessThanOrEqual(752);
    expect(result.pointerOffset).toBeGreaterThanOrEqual(8);
    expect(result.pointerOffset).toBeLessThanOrEqual(result.safeBubbleWidth - 16);
  });

  it('keeps a mobile popup inside narrow viewport edges', () => {
    const result = resolveContextualHelpPlacement({
      triggerRect: trigger(180, 80),
      viewportWidth: 300,
      viewportHeight: 640,
      bubbleHeight: 340,
    });

    expect(result.safeBubbleWidth).toBe(300 - CONTEXTUAL_HELP_EDGE_PADDING_PX * 2);
    expect(result.left).toBe(CONTEXTUAL_HELP_EDGE_PADDING_PX);
    expect(result.left + result.safeBubbleWidth).toBe(284);
    expect(result.pointerOffset).toBeGreaterThanOrEqual(8);
    expect(result.pointerOffset).toBeLessThanOrEqual(252);
  });

  it('opens upward and limits height when there is more room above than below', () => {
    const result = resolveContextualHelpPlacement({
      triggerRect: trigger(240, 520),
      viewportWidth: 900,
      viewportHeight: 600,
      bubbleHeight: 340,
    });

    expect(result.placement).toBe('top-left');
    expect(result.maxHeight).toBe(340);
    expect(result.gapOffset).toBe(8);
  });

  it('limits height when a very small viewport cannot fit the full popup', () => {
    const result = resolveContextualHelpPlacement({
      triggerRect: trigger(40, 80),
      viewportWidth: 320,
      viewportHeight: 180,
      bubbleHeight: 340,
    });

    expect(result.placement).toBe('top-left');
    expect(result.maxHeight).toBeLessThan(340);
    expect(result.maxHeight).toBeGreaterThan(0);
  });
});

describe('getContextualHelpOverridePlacement', () => {
  it('maps top and bottom overrides to existing corner placements', () => {
    expect(getContextualHelpOverridePlacement('top')).toBe('top-right');
    expect(getContextualHelpOverridePlacement('bottom')).toBe('bottom-right');
  });

  it('preserves explicit side overrides', () => {
    expect(getContextualHelpOverridePlacement('left')).toBe('left');
    expect(getContextualHelpOverridePlacement('right')).toBe('right');
  });

  it('returns null when automatic placement should be used', () => {
    expect(getContextualHelpOverridePlacement()).toBeNull();
  });
});