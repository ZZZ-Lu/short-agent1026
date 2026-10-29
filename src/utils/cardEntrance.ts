// Renderer-only group state: all members share one world-space pivot and clock.
type EntryGroup = { start: number | null; x: number; y: number; individual?: boolean; mediaImport?: boolean; revealStart?: number };
const entries = new Map<string, EntryGroup>();
// Staged import cards stay at their opening pose independently of viewport registration.
const stagedEntries = new Map<string, Omit<EntryGroup, 'start'>>();
const awaitingEntryDom = new Set<string>();
let project: string | null = null;
let known = new Set<string>();
// Only creation/import commands may authorize individual entrances. Never persist.
const requested = new Map<string, string>();
export function requestCardEntries(
  projectId: string, 
  items: (string | { id: string; x: number; y: number; width: number; height: number })[]
) {
  const now = performance.now();
  for (const item of items) {
    if (typeof item === 'string') {
      requested.set(item, projectId);
    } else {
      requested.set(item.id, projectId);
      awaitingEntryDom.add(item.id);
      entries.set(item.id, { start: now, x: item.x + item.width / 2, y: item.y + item.height / 2, individual: true });
    }
  }
}
export const CARD_ENTRY_MS = 820;
export const MEDIA_REVEAL_MS = 600;
export function startMediaReveal(id: string) {
  const staged = stagedEntries.get(id);
  if (staged && staged.revealStart === undefined) staged.revealStart = performance.now();
}
export function mediaRevealProgress(id: string, now = performance.now()) {
  const staged = stagedEntries.get(id);
  if (!staged || staged.revealStart === undefined) return 1;
  return Math.max(0, Math.min(1, (now - staged.revealStart) / MEDIA_REVEAL_MS));
}
export function isStagedMediaEntry(id: string) { return stagedEntries.has(id); }
// Imported cards can be mounted in their opening pose while their media is prepared.
export function stageCardEntry(projectId: string, item: { id: string; x: number; y: number; width: number; height: number }) {
  requested.set(item.id, projectId);
  awaitingEntryDom.add(item.id);
  stagedEntries.set(item.id, { x: item.x + item.width / 2, y: item.y + item.height / 2, individual: true, mediaImport: true });
}
export function startCardEntry(id: string) {
  const staged = stagedEntries.get(id);
  if (!staged) return;
  stagedEntries.delete(id);
  entries.set(id, { ...staged, start: performance.now() });
}
export function registerCardEntries(projectId: string, cards: { id: string; x: number; y: number; width: number; height: number }[], visible: Set<string>, now: number, reduced: boolean, pivot: { x: number; y: number }) {
  const isProjectEntry = project !== projectId;
  if (isProjectEntry) { project = projectId; known = new Set(); entries.clear(); awaitingEntryDom.clear(); }
  const next = new Set(cards.map(card => card.id));
  const added = reduced ? [] : cards.filter(card => !known.has(card.id) && visible.has(card.id) && (isProjectEntry || requested.get(card.id) === projectId));
  if (added.length) {
    const group: EntryGroup = { start: now, x: pivot.x, y: pivot.y };
    for (const card of added) {
      if (!isProjectEntry) awaitingEntryDom.add(card.id);
      // Preserve a staged import's held opening pose until its preprocessing completes.
      if (!stagedEntries.has(card.id)) {
        entries.set(card.id, isProjectEntry ? group : { start: now, x: card.x + card.width / 2, y: card.y + card.height / 2, individual: true });
      }
    }
  }
  for (const [id, group] of entries) if (!next.has(id) || (group.start !== null && now >= group.start + CARD_ENTRY_MS)) entries.delete(id);
  for (const id of awaitingEntryDom) if (!next.has(id)) awaitingEntryDom.delete(id);
  // Consume even offscreen/reduced-motion requests; a later viewport change is not entry.
  for (const [id, owner] of requested) if (next.has(id) || owner !== projectId) requested.delete(id);
  for (const id of next) known.add(id);
  // Only whole-project entrances trigger the shared blur overlay.
  // New cards retain their individual entry animation without blurring the page.
  return isProjectEntry && added.length > 0;
}
// 3-Phase Physical Rhythm (820ms Total):
// Stage 1 (0 <= t < 0.20, ~164ms): High-speed crash drop from 2.40x to 1.15x
// Stage 2 (0.20 <= t < 0.88, ~558ms): Long deceleration hover to elevated 1.050x height (105% of rest size)
// Stage 3 (0.88 <= t <= 1.00, ~98ms): Crisp touchdown & snap lock (starts at exactly 1.050x / 105% -> 0.992x impact -> 1.000x solid rest)
export function sampleCardEntry(progress: number, isSelected = false, initialScale = 2.4) {
  let t = Math.max(0, Math.min(1, progress));
  if (isSelected && t > 0.88) {
    t = 0.88; // Hold at Stage 2 ending / Stage 3 opening height (1.050x) while selected
  }
  let scale: number;

  if (t < 0.20) {
    // Stage 1: Short Time (164ms), Long Distance (2.40x -> 1.15x)
    const p1 = t / 0.20;
    scale = initialScale - (initialScale - 1.15) * Math.pow(p1, 1.6);
  } else if (t < 0.88) {
    // Stage 2: Long Time (558ms), Decelerates to elevated 1.050x (105% size) pre-touchdown height
    const p2 = (t - 0.20) / 0.68;
    scale = 1.050 + 0.100 * Math.pow(1 - p2, 2.6);
  } else {
    // Stage 3: Touchdown landing process starting at exactly 1.050x (105% of rest size)
    const p3 = (t - 0.88) / 0.12;
    if (p3 < 0.5) {
      const sub = p3 / 0.5;
      scale = 1.050 - 0.058 * (sub * sub); // 1.050x -> 0.992x impact compression
    } else {
      const sub = (p3 - 0.5) / 0.5;
      scale = 0.992 + 0.008 * (1 - (1 - sub) * (1 - sub)); // 0.992x -> 1.000x solid rest
    }
  }

  const opacity = Math.min(1, t / 0.10);
  return { scale, opacity };
}
export function cardEntryFrame(id: string, now = performance.now(), keyframes = false, isSelected = false) {
  const staged = stagedEntries.get(id);
  if (staged) {
    const openingPose = sampleCardEntry(0, isSelected, staged.mediaImport ? 1.5 : 2.4);
    if (isSelected && staged.individual) openingPose.scale /= 1.05;
    return { pivotX: staged.x, pivotY: staged.y, ...openingPose, opacity: 1, scales: [openingPose.scale], opacities: [1], delay: 0, duration: 0, held: true };
  }
  const group = entries.get(id);
  if (!group) return null;
  const start = group.start;
  const stopAtSecondStage = Boolean(group.individual && isSelected);
  const endProgress = stopAtSecondStage ? 0.88 : 1;
  if (now >= start + CARD_ENTRY_MS * endProgress) { entries.delete(id); return null; }
  const progress = Math.max(0, (now - start) / CARD_ENTRY_MS);
  const sample = (point: number) => {
    const frame = sampleCardEntry(point, stopAtSecondStage, group.mediaImport ? 1.5 : 2.4);
    // The selected-card renderer already supplies the 1.05 scale.
    return stopAtSecondStage ? { ...frame, scale: frame.scale / 1.05 } : frame;
  };
  const samples = keyframes ? Array.from({ length: 41 }, (_, i) => sample(progress + (endProgress - progress) * i / 40)) : [];
  return { pivotX: group.x, pivotY: group.y, ...sample(progress), scales: samples.map(frame => frame.scale), opacities: samples.map(frame => frame.opacity), delay: Math.max(0, start - now) / 1000, duration: (endProgress - progress) * CARD_ENTRY_MS / 1000 };
}

// New cards at DOM scale wait for that renderer rather than showing a nano placeholder.
// Retire this one-time guard only after the normal painted/panel-ready handshake.
export function waitForEntryDom(id: string, ready: boolean) {
  if (!awaitingEntryDom.has(id)) return false;
  if (ready) awaitingEntryDom.delete(id);
  return true;
}
export function isNewCardAwaitingLod(id: string) { return awaitingEntryDom.has(id); }
