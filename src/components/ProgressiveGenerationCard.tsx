import { isNewCardAwaitingLod } from '../utils/cardEntrance';
import { getNanoLodThreshold } from '../utils/viewportCulling';
import { getCanvasLoadingMode } from '../utils/canvasPerformance';
import React, { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import { GenerationCard } from './GenerationCard';

// Renderer-local admission state, separate from serializable card/project data.
export function createCardMountStore() {
  const ids = new Set<string>();
  const listeners = new Map<string, Set<() => void>>();
  return {
    ids,
    subscribe(id: string, listener: () => void) {
      let subscribers = listeners.get(id);
      if (!subscribers) { subscribers = new Set(); listeners.set(id, subscribers); }
      subscribers.add(listener);
      return () => { subscribers!.delete(listener); if (!subscribers!.size) listeners.delete(id); };
    },
    replace(next: Set<string>) {
      if (next === ids) return;
      const changed = new Set<string>();
      for (const id of ids) if (!next.has(id)) changed.add(id);
      for (const id of next) if (!ids.has(id)) changed.add(id);
      ids.clear(); for (const id of next) ids.add(id);
      for (const id of changed) listeners.get(id)?.forEach(listener => listener());
    },
  };
}
export const ProgressiveGenerationCard = React.memo(function ProgressiveGenerationCard({ mountStore, ...props }:
  React.ComponentProps<typeof GenerationCard> & { mountStore: ReturnType<typeof createCardMountStore> }) {
  const id = props.data.id;
  const isSelected = Boolean(props.isSelected);
  // Only newly created cards bypass the deferred global LOD state. Existing cards
  // retain their painted-frame handoff while the camera crosses the threshold.
  const [newCard] = useState(() => isNewCardAwaitingLod(id));
  const subscribeScale = useCallback((listener: () => void) => newCard ? props.scale.on('change', listener) : () => {}, [newCard, props.scale]);
  const getDomLod = useCallback(() => !newCard || props.scale.get() >= getNanoLodThreshold(), [newCard, props.scale]);
  const useDomLod = useSyncExternalStore(subscribeScale, getDomLod, getDomLod);
  const admittedDom = useRef(false);
  const subscribe = useCallback((listener: () => void) => {
    const unsubscribe = mountStore.subscribe(id, listener);
    if (isSelected) window.addEventListener('canvas-styles-restored', listener);
    return () => { unsubscribe(); if (isSelected) window.removeEventListener('canvas-styles-restored', listener); };
  }, [id, isSelected, mountStore]);
  const snapshot = useCallback(() => {
    const workspace = document.getElementById('canvas-workspace');
    const paused = getCanvasLoadingMode() === 'lazy' &&
      ['data-gesture', 'data-panning', 'data-zooming'].some(name => workspace?.getAttribute(name) === 'true');
    if (paused && isSelected && !admittedDom.current) return false;
    return Boolean(mountStore.ids.has(id) || (isSelected && (admittedDom.current || !paused)));
  }, [id, isSelected, mountStore]);
  const mounted = useSyncExternalStore(subscribe, snapshot, snapshot);
  if (useDomLod && mounted) admittedDom.current = true;
  return (admittedDom.current || useDomLod) && mounted ? <GenerationCard {...props} /> : null;
});
