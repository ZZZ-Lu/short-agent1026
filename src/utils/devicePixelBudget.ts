/**
 * Canvas backing-store pixel budgeting.
 *
 * Rendering a canvas at the raw `devicePixelRatio` is only affordable while the backing
 * store stays small. On a large, high-DPI viewport the same code can end up clearing and
 * painting tens of millions of pixels per frame — which is exactly what turns a cheap
 * interaction (selecting a card) into a multi-hundred-millisecond stall on 1.5x / 2x
 * displays, while looking perfectly fine in a small DPR-1 preview panel.
 *
 * These helpers keep a hard ceiling on total pixels instead of trusting DPR alone:
 * small canvases keep full sharpness, large ones trade a little resolution for frames.
 */

/** Upper bound for a single canvas backing store, in device pixels. ~4K area. */
export const MAX_CANVAS_PIXELS = 8_000_000;

function safeArea(width: number, height: number): number {
  return Math.max(1, Math.round(width) * Math.round(height));
}

/**
 * DPR for a canvas of the given CSS size, capped by both an explicit ceiling and a
 * total-pixel budget. Never returns less than 1.
 */
export function getCappedDpr(width: number, height: number, ceiling = 2): number {
  const raw = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
  const byArea = Math.sqrt(MAX_CANVAS_PIXELS / safeArea(width, height));
  return Math.max(1, Math.min(raw, ceiling, byArea));
}

/**
 * Clamp an already-computed DPR (e.g. one derived from canvas zoom level) so the
 * resulting backing store stays inside the pixel budget.
 */
export function capDprToBudget(dpr: number, width: number, height: number, budget = MAX_CANVAS_PIXELS): number {
  const byArea = Math.sqrt(budget / safeArea(width, height));
  return Math.max(1, Math.min(dpr, byArea));
}
