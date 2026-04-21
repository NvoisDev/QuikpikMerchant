export type ContextualHelpPosition = 'top' | 'bottom' | 'left' | 'right';

export type BubblePlacement = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'left' | 'right';

export const CONTEXTUAL_HELP_BUBBLE_WIDTH_PX = 320;
export const CONTEXTUAL_HELP_FALLBACK_HEIGHT_PX = 340;
export const CONTEXTUAL_HELP_GAP_PX = 8;
export const CONTEXTUAL_HELP_EDGE_PADDING_PX = 16;

export interface ContextualHelpRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
}

export interface ContextualHelpPlacementInput {
  triggerRect: ContextualHelpRect;
  bubbleWidth?: number;
  bubbleHeight?: number;
  viewportWidth: number;
  viewportHeight: number;
  gap?: number;
  edgePadding?: number;
}

export interface ContextualHelpPlacementResult {
  placement: BubblePlacement;
  horizontalOffset: number;
  pointerOffset: number;
  maxHeight: number;
  gapOffset: number;
  safeBubbleWidth: number;
  left: number;
}

export function getContextualHelpOverridePlacement(position?: ContextualHelpPosition): BubblePlacement | null {
  if (!position) {
    return null;
  }

  if (position === 'top') {
    return 'top-right';
  }

  if (position === 'bottom') {
    return 'bottom-right';
  }

  return position;
}

export function resolveContextualHelpPlacement({
  triggerRect,
  bubbleWidth = CONTEXTUAL_HELP_BUBBLE_WIDTH_PX,
  bubbleHeight = CONTEXTUAL_HELP_FALLBACK_HEIGHT_PX,
  viewportWidth,
  viewportHeight,
  gap = CONTEXTUAL_HELP_GAP_PX,
  edgePadding = CONTEXTUAL_HELP_EDGE_PADDING_PX,
}: ContextualHelpPlacementInput): ContextualHelpPlacementResult {
  const availableBelow = viewportHeight - triggerRect.bottom;
  const availableAbove = triggerRect.top;
  const shouldOpenUpward = availableBelow < bubbleHeight + gap + edgePadding && availableAbove > availableBelow;
  const opensPastRightEdge = triggerRect.left + bubbleWidth > viewportWidth - edgePadding;
  const opensPastLeftEdge = triggerRect.right - bubbleWidth < edgePadding;
  const horizontalAlignment = opensPastRightEdge && !opensPastLeftEdge ? 'right' : 'left';
  const availableOnChosenSide = shouldOpenUpward ? availableAbove : availableBelow;
  const gapOnChosenSide = Math.min(gap, Math.max(0, availableOnChosenSide - 1));
  const paddingOnChosenSide = availableOnChosenSide > gapOnChosenSide + edgePadding + 1 ? edgePadding : 0;
  const maxHeightOnChosenSide = availableOnChosenSide - gapOnChosenSide - paddingOnChosenSide;
  const safeBubbleWidth = Math.max(1, Math.min(bubbleWidth, viewportWidth - edgePadding * 2));
  const preferredLeft = horizontalAlignment === 'right'
    ? triggerRect.right - safeBubbleWidth
    : triggerRect.left;
  const clampedLeft = Math.min(
    Math.max(preferredLeft, edgePadding),
    viewportWidth - safeBubbleWidth - edgePadding
  );
  const pointerOffset = triggerRect.left + triggerRect.width / 2 - clampedLeft - 8;

  return {
    placement: `${shouldOpenUpward ? 'top' : 'bottom'}-${horizontalAlignment}` as BubblePlacement,
    horizontalOffset: clampedLeft - triggerRect.left,
    pointerOffset: Math.min(Math.max(pointerOffset, 8), safeBubbleWidth - 16),
    maxHeight: Math.max(1, Math.min(bubbleHeight, maxHeightOnChosenSide)),
    gapOffset: gapOnChosenSide,
    safeBubbleWidth,
    left: clampedLeft,
  };
}