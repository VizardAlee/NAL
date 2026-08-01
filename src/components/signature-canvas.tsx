'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Eraser, MousePointer2, PenTool } from 'lucide-react';

type Point = { x: number; y: number; pressure: number };
type Stroke = Point[];

export type SignatureCanvasHandle = {
  clear: () => void;
  exportPng: () => string | null;
};

export const SignatureCanvas = forwardRef<SignatureCanvasHandle, {
  onChange?: (hasSignature: boolean) => void;
  disabled?: boolean;
}>(function SignatureCanvas({ onChange, disabled = false }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const activeStrokeRef = useRef<Stroke | null>(null);

  const render = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const ratio = window.devicePixelRatio || 1;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.save();
    context.scale(ratio, ratio);
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = '#0f172a';
    for (const stroke of strokesRef.current) {
      if (stroke.length === 1) {
        const point = stroke[0];
        context.beginPath();
        context.arc(point.x, point.y, 1.4, 0, Math.PI * 2);
        context.fillStyle = '#0f172a';
        context.fill();
        continue;
      }
      for (let index = 1; index < stroke.length; index += 1) {
        const previous = stroke[index - 1];
        const current = stroke[index];
        context.beginPath();
        context.moveTo(previous.x, previous.y);
        context.lineTo(current.x, current.y);
        context.lineWidth = 1.8 + Math.max(previous.pressure, current.pressure) * 1.8;
        context.stroke();
      }
    }
    context.restore();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(bounds.width * ratio));
      canvas.height = Math.max(1, Math.round(bounds.height * ratio));
      render();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    return () => observer.disconnect();
  }, []);

  const clear = () => {
    strokesRef.current = [];
    activeStrokeRef.current = null;
    render();
    onChange?.(false);
  };

  useImperativeHandle(ref, () => ({
    clear,
    exportPng: () => {
      const canvas = canvasRef.current;
      const pointCount = strokesRef.current.reduce((total, stroke) => total + stroke.length, 0);
      if (!canvas || pointCount < 8) return null;
      return canvas.toDataURL('image/png');
    },
  }));

  const pointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>): Point => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
      pressure: event.pressure > 0 ? event.pressure : 0.5,
    };
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><PenTool className="h-3.5 w-3.5" /> Touch or stylus</span>
        <span className="inline-flex items-center gap-1.5"><MousePointer2 className="h-3.5 w-3.5" /> Trackpad or mouse: press and drag</span>
      </div>
      <div className="overflow-hidden rounded-xl border-2 border-dashed border-primary/35 bg-white shadow-inner">
        <canvas
          ref={canvasRef}
          aria-label="Signature drawing area. Press and drag with a trackpad or mouse, or draw with touch or a stylus."
          className="h-44 w-full cursor-crosshair touch-none select-none sm:h-48"
          onPointerDown={(event) => {
            if (disabled) return;
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            const stroke = [pointFromEvent(event)];
            strokesRef.current = [...strokesRef.current, stroke];
            activeStrokeRef.current = stroke;
            render();
          }}
          onPointerMove={(event) => {
            if (disabled || !activeStrokeRef.current) return;
            event.preventDefault();
            activeStrokeRef.current.push(pointFromEvent(event));
            render();
          }}
          onPointerUp={(event) => {
            if (!activeStrokeRef.current) return;
            event.preventDefault();
            activeStrokeRef.current.push(pointFromEvent(event));
            activeStrokeRef.current = null;
            render();
            onChange?.(true);
          }}
          onPointerCancel={() => { activeStrokeRef.current = null; }}
        />
      </div>
      <Button type="button" size="sm" variant="outline" onClick={clear} disabled={disabled}>
        <Eraser className="mr-2 h-4 w-4" /> Clear signature
      </Button>
    </div>
  );
});
