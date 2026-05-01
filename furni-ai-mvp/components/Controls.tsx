'use client';

import { Download, Layers, Loader2, RotateCcw, ScanLine, Sofa, Upload } from 'lucide-react';
import type { LayerKind, Placement } from '@/lib/types';

export function Button({ children, onClick, disabled, variant = 'primary' }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; variant?: 'primary' | 'secondary' | 'danger' }) {
  const cls = {
    primary: 'bg-zinc-50 text-zinc-950 hover:bg-white',
    secondary: 'bg-zinc-800 text-zinc-100 hover:bg-zinc-700 border border-zinc-700',
    danger: 'bg-red-500/20 text-red-100 hover:bg-red-500/30 border border-red-500/30'
  }[variant];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${cls}`}
    >
      {children}
    </button>
  );
}

export function PlacementControls({ placement, setPlacement }: { placement: Placement; setPlacement: (p: Placement) => void }) {
  const update = (patch: Partial<Placement>) => setPlacement({ ...placement, ...patch });
  return (
    <div className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
        <Sofa className="h-4 w-4" /> Sofa placement
      </div>
      <Range label="X" value={placement.x} min={0} max={1400} step={1} onChange={(x) => update({ x })} />
      <Range label="Y" value={placement.y} min={0} max={1000} step={1} onChange={(y) => update({ y })} />
      <Range label="Uniform scale" value={placement.scale} min={0.05} max={8} step={0.01} onChange={(scale) => update({ scale })} />
      <Range label="Y rotation" value={placement.rotationY} min={-180} max={180} step={1} onChange={(rotationY) => update({ rotationY })} />
      <Range label="Z rotation" value={placement.rotationZ} min={-20} max={20} step={1} onChange={(rotationZ) => update({ rotationZ })} />
      <Range label="Shadow opacity" value={placement.shadowOpacity} min={0} max={0.8} step={0.01} onChange={(shadowOpacity) => update({ shadowOpacity })} />
      <Button variant="secondary" onClick={() => setPlacement({ ...placement, scale: 1, rotationY: 0, rotationZ: 0, shadowOpacity: 0.22 })}>
        <RotateCcw className="h-4 w-4" /> Reset transform
      </Button>
    </div>
  );
}

function Range({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
  return (
    <label className="block space-y-1">
      <div className="flex justify-between text-xs text-zinc-400">
        <span>{label}</span>
        <span>{Number(value).toFixed(step < 1 ? 2 : 0)}</span>
      </div>
      <input className="w-full accent-zinc-100" type="range" value={value} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

export function LayerModeSelector({ value, onChange }: { value: LayerKind; onChange: (v: LayerKind) => void }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-200">
        <Layers className="h-4 w-4" /> Layer point mode
      </div>
      <select className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm" value={value} onChange={(e) => onChange(e.target.value as LayerKind)}>
        <option value="floor">Floor point</option>
        <option value="foreground">Foreground/occlusion point</option>
        <option value="preserve">Preserve/protected point</option>
      </select>
      <p className="mt-2 text-xs leading-5 text-zinc-500">Click the room image to add points. These points are saved as MVP layer hints while SAM2 automatic masks are also generated.</p>
    </div>
  );
}

export function IconLabels() {
  return { Upload, ScanLine, Download, Loader2 };
}
