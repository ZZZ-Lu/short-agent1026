import { useEffect, useRef } from 'react';
import type { MotionValue } from 'motion/react';
import { getCappedDpr } from '../utils/devicePixelBudget';

/** A repeating texture keeps the number of draw calls constant at every zoom. */
export function CanvasGridBackground({ tx, ty, scale }: {
  tx: MotionValue<number>;
  ty: MotionValue<number>;
  scale: MotionValue<number>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const tile = document.createElement('canvas');
    tile.width = tile.height = 128;
    const tileCtx = tile.getContext('2d');
    if (!ctx || !tileCtx) return;
    let pattern: CanvasPattern | null = null;
    let raf: number | null = null;
    let lastSpacing = -1;

    const draw = () => {
      raf = null;
      const width = window.innerWidth;
      const height = window.innerHeight;
      // Decorative grid: cap the backing store so a large high-DPI window does not pay
      // for millions of extra pixels on every redraw.
      const dpr = getCappedDpr(width, height, 1.5);
      const pixelWidth = Math.round(width * dpr);
      const pixelHeight = Math.round(height * dpr);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      const spacing = Math.max(0.01, scale.get() * 48);
      if (spacing !== lastSpacing) {
        tileCtx.clearRect(0, 0, 128, 128);
        tileCtx.fillStyle = '#a1a1aa';
        tileCtx.beginPath();
        tileCtx.arc(64, 64, 2 * 128 / spacing, 0, Math.PI * 2);
        tileCtx.fill();
        pattern = ctx.createPattern(tile, 'repeat');
        lastSpacing = spacing;
      }
      if (!pattern) return;
      const offsetX = ((tx.get() % spacing) + spacing) % spacing;
      const offsetY = ((ty.get() % spacing) + spacing) % spacing;
      pattern.setTransform(new DOMMatrix([spacing / 128, 0, 0, spacing / 128, offsetX, offsetY]));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, width, height);
    };
    const schedule = () => {
      if (raf === null) raf = requestAnimationFrame(draw);
    };
    const unsubs = [tx, ty, scale].map(value => value.on('change', schedule));
    window.addEventListener('resize', schedule);
    schedule();
    return () => {
      unsubs.forEach(unsub => unsub());
      window.removeEventListener('resize', schedule);
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, [tx, ty, scale]);

  return <canvas ref={canvasRef} id="grid-bg-overlay" aria-hidden="true" className="fixed inset-0 h-screen w-screen pointer-events-none opacity-30 dark:opacity-15 z-0" />;
}
