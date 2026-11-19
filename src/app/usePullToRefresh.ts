import { useEffect, useState } from 'preact/hooks';
import { PULL_MAX_PX, pullArmed } from './phoneView';

/**
 * Pull down from the top of the page to refresh, on a phone. The gesture
 * only starts when the page is scrolled to the top and no dialog is open,
 * and it only refreshes when the finger lets go past the threshold.
 * Returns how far the page is pulled, for the hint.
 */
export function usePullToRefresh(enabled: boolean, onRefresh: () => void): number {
  const [pull, setPull] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let startY: number | null = null;
    let distance = 0;
    const onStart = (e: TouchEvent): void => {
      const atTop = window.scrollY <= 0;
      const dialogOpen = document.querySelector('dialog[open]') !== null;
      startY = atTop && !dialogOpen && e.touches.length === 1 ? e.touches[0]!.clientY : null;
      distance = 0;
    };
    const onMove = (e: TouchEvent): void => {
      if (startY === null) return;
      const dy = e.touches[0]!.clientY - startY;
      if (dy <= 0 || window.scrollY > 0) {
        distance = 0;
        setPull(0);
        return;
      }
      distance = Math.min(PULL_MAX_PX, dy);
      setPull(distance);
    };
    const onEnd = (): void => {
      if (startY !== null && pullArmed(distance)) onRefresh();
      startY = null;
      distance = 0;
      setPull(0);
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, [enabled, onRefresh]);
  return pull;
}
