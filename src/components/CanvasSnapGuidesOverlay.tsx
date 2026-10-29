import { useEffect, useRef, useState } from 'react';
import type { MotionValue } from 'motion/react';

interface SnapGuideDetail {
  x: number | null;
  y: number | null;
}

export function CanvasSnapGuidesOverlay({ tx, ty, scale }: {
  tx: MotionValue<number>;
  ty: MotionValue<number>;
  scale: MotionValue<number>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const guidesRef = useRef<SnapGuideDetail>({ x: null, y: null });
  const [active, setActive] = useState(false);

  useEffect(() => {
    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const width = window.innerWidth;
      const height = window.innerHeight;
      const pixelWidth = Math.round(width * dpr);
      const pixelHeight = Math.round(height * dpr);

      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }

      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const { x: snapX, y: snapY } = guidesRef.current;
      const currentScale = scale.get();
      const currentTx = tx.get();
      const currentTy = ty.get();

      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#3b82f6';
      ctx.shadowColor = 'rgba(59, 130, 246, 0.6)';
      ctx.shadowBlur = 6;

      if (snapX !== null) {
        const screenX = snapX * currentScale + currentTx;
        ctx.beginPath();
        ctx.setLineDash([5, 4]);
        ctx.moveTo(screenX, 0);
        ctx.lineTo(screenX, height);
        ctx.stroke();
      }

      if (snapY !== null) {
        const screenY = snapY * currentScale + currentTy;
        ctx.beginPath();
        ctx.setLineDash([5, 4]);
        ctx.moveTo(0, screenY);
        ctx.lineTo(width, screenY);
        ctx.stroke();
      }

      ctx.restore();
    };

    const handleSnapGuides = (e: CustomEvent<SnapGuideDetail>) => {
      guidesRef.current = e.detail || { x: null, y: null };
      const hasGuides = guidesRef.current.x !== null || guidesRef.current.y !== null;
      setActive(hasGuides);
      if (hasGuides) {
        requestAnimationFrame(draw);
      } else {
        const canvas = canvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext('2d');
          if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
    };

    window.addEventListener('canvas-snap-guides' as any, handleSnapGuides);
    const unsubs = [tx, ty, scale].map(v => v.on('change', () => {
      if (guidesRef.current.x !== null || guidesRef.current.y !== null) draw();
    }));

    return () => {
      window.removeEventListener('canvas-snap-guides' as any, handleSnapGuides);
      unsubs.forEach(u => u());
    };
  }, [tx, ty, scale]);

  if (!active) return null;

  return (
    <canvas
      ref={canvasRef}
      id="snap-guides-overlay"
      aria-hidden="true"
      className="fixed inset-0 h-screen w-screen pointer-events-none z-[80]"
    />
  );
}
