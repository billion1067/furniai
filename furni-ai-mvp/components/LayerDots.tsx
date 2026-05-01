'use client';

import type { RoomLayerPoint } from '@/lib/types';

const colors: Record<RoomLayerPoint['kind'], string> = {
  floor: 'bg-emerald-400 border-emerald-100',
  foreground: 'bg-orange-400 border-orange-100',
  preserve: 'bg-sky-400 border-sky-100'
};

export function LayerDots({ points }: { points: RoomLayerPoint[] }) {
  return (
    <div className="pointer-events-none absolute inset-0">
      {points.map((p) => (
        <div
          key={p.id}
          className={`absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 shadow ${colors[p.kind]}`}
          style={{ left: p.x, top: p.y }}
          title={p.kind}
        />
      ))}
    </div>
  );
}
