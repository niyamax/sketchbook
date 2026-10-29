// A leaf uses the same timing when it is turned forward or backward.
export const COVER_TURN_SECONDS = 1.85;
export const RAPID_TURN_SECONDS = 0.72;
export const HOLD_START_DELAY_MS = 180;
export const HOLD_REPEAT_DELAY_MS = 60;

export function pageTurnDuration(leaf: number): number {
  if (leaf <= 0) return COVER_TURN_SECONDS;
  // Multiplicative hashing distributes nearby pages across the small range.
  // This is stable for a leaf: no random sampling or direction dependence.
  const fraction = (Math.imul(leaf, 0x9e3779b1) >>> 0) / 0x100000000;
  return 1.5 + fraction * 0.2;
}

// Gather a burst before peeling a packet of sheets away from the stack.
export const RAPID_CLICK_WINDOW_MS = 120;

export function packetTarget(
  from: number,
  direction: 1 | -1,
  count: number,
  lastPage: number,
): number {
  if (direction === 1)
    return Math.min(lastPage, from === 0 ? 1 : from + count);
  return Math.max(from > 1 ? 1 : 0, from - count);
}
