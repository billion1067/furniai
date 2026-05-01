'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { Download, Eye, EyeOff, Loader2, ScanLine, Trash2, Upload } from 'lucide-react';
import { fileToDataUrl, getImageSize, loadImage } from '@/lib/image';
import type { AiResult, LayerKind, Placement, RoomLayerPoint } from '@/lib/types';
import { SofaScene } from '@/components/SofaScene';
import { LayerDots } from '@/components/LayerDots';
import { Button, LayerModeSelector, PlacementControls } from '@/components/Controls';

type ImageSize = { width: number; height: number };

type VisibleLayers = {
  depth: boolean;
  sam2: boolean;
  points: boolean;
};

const initialPlacement: Placement = {
  x: 520,
  y: 520,
  scale: 1,
  rotationY: 25,
  rotationZ: 0,
  shadowOpacity: 0.22
};

export default function Home() {
  const [roomImage, setRoomImage] = useState<string | null>(null);
  const [roomSize, setRoomSize] = useState<ImageSize | null>(null);
  const [depthResult, setDepthResult] = useState<AiResult | null>(null);
  const [sam2Result, setSam2Result] = useState<AiResult | null>(null);
  const [placement, setPlacement] = useState<Placement>(initialPlacement);
  const [layerKind, setLayerKind] = useState<LayerKind>('floor');
  const [points, setPoints] = useState<RoomLayerPoint[]>([]);
  const [visible, setVisible] = useState<VisibleLayers>({ depth: true, sam2: true, points: true });
  const [isDepthLoading, setDepthLoading] = useState(false);
  const [isSamLoading, setSamLoading] = useState(false);
  const [isExporting, setExporting] = useState(false);
  const [exported, setExported] = useState<string | null>(null);
  const roomRef = useRef<HTMLDivElement | null>(null);

  const displaySize = useMemo(() => {
    if (!roomSize) return null;
    const maxW = 1080;
    const ratio = Math.min(maxW / roomSize.width, 1);
    return { width: Math.round(roomSize.width * ratio), height: Math.round(roomSize.height * ratio), ratio };
  }, [roomSize]);

  async function handleRoomUpload(file?: File) {
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    const size = await getImageSize(dataUrl);
    setRoomImage(dataUrl);
    setRoomSize(size);
    setPlacement({ ...initialPlacement, x: Math.round(size.width * 0.5), y: Math.round(size.height * 0.72) });
    setDepthResult(null);
    setSam2Result(null);
    setExported(null);
    setPoints([]);
  }

  async function runDepth() {
    if (!roomImage) return;
    setDepthLoading(true);
    setDepthResult(null);
    try {
      const res = await fetch('/api/depth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageDataUrl: roomImage })
      });
      const json = await res.json();
      setDepthResult(res.ok ? json : { error: json.error || 'Depth failed' });
    } catch (e) {
      setDepthResult({ error: e instanceof Error ? e.message : 'Depth failed' });
    } finally {
      setDepthLoading(false);
    }
  }

  async function runSam2() {
    if (!roomImage) return;
    setSamLoading(true);
    setSam2Result(null);
    try {
      const res = await fetch('/api/sam2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageDataUrl: roomImage, pointsPerSide: 32 })
      });
      const json = await res.json();
      setSam2Result(res.ok ? json : { error: json.error || 'SAM2 failed' });
    } catch (e) {
      setSam2Result({ error: e instanceof Error ? e.message : 'SAM2 failed' });
    } finally {
      setSamLoading(false);
    }
  }

  const addLayerPoint = useCallback((clientX: number, clientY: number) => {
    if (!roomRef.current || !displaySize) return;
    const rect = roomRef.current.getBoundingClientRect();
    const x = (clientX - rect.left) / displaySize.ratio;
    const y = (clientY - rect.top) / displaySize.ratio;
    setPoints((prev) => [...prev, { id: crypto.randomUUID(), kind: layerKind, x, y }]);
  }, [displaySize, layerKind]);

  async function exportComposite() {
    if (!roomImage || !roomSize) return;
    setExporting(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = roomSize.width;
      canvas.height = roomSize.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas unavailable');

      const bg = await loadImage(roomImage);
      ctx.drawImage(bg, 0, 0, roomSize.width, roomSize.height);

      const threeCanvas = document.querySelector('#sofa-three-canvas canvas') as HTMLCanvasElement | null;
      if (threeCanvas) {
        ctx.drawImage(threeCanvas, 0, 0, roomSize.width, roomSize.height);
      }

      // MVP debug export: include layer points so placement/analysis context is visible.
      for (const p of points) {
        const color = p.kind === 'floor' ? '#34d399' : p.kind === 'foreground' ? '#fb923c' : '#38bdf8';
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
        ctx.fill();
      }

      const dataUrl = canvas.toDataURL('image/png');
      setExported(dataUrl);

      await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageDataUrl: dataUrl })
      });
    } finally {
      setExporting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#27272a,transparent_35%),#09090b] p-6 text-zinc-100">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="mb-2 text-sm font-medium text-zinc-400">Furni AI MVP</p>
            <h1 className="text-3xl font-semibold tracking-tight md:text-5xl">2D room + SAM2/depth layers + GLB sofa placement</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
              Upload an interior image, analyze it with Replicate depth-anything-v3-metric and SAM2, then place a GLB sofa on top with uniform scale and 3D rotation.
            </p>
          </div>
          <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-zinc-50 px-5 py-3 text-sm font-semibold text-zinc-950 hover:bg-white">
            <Upload className="h-4 w-4" /> Upload room image
            <input className="hidden" type="file" accept="image/*" onChange={(e) => handleRoomUpload(e.target.files?.[0])} />
          </label>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <section className="rounded-3xl border border-zinc-800 bg-zinc-950/50 p-4 shadow-2xl">
            {!roomImage || !displaySize ? (
              <div className="flex h-[560px] flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/50 text-center">
                <Upload className="mb-4 h-10 w-10 text-zinc-500" />
                <p className="font-medium text-zinc-200">Upload an interior image to start.</p>
                <p className="mt-2 max-w-md text-sm text-zinc-500">This MVP keeps the room as a 2D image and overlays a GLB sofa model as a 3D layer.</p>
              </div>
            ) : (
              <div className="overflow-auto rounded-2xl bg-zinc-900 p-3">
                <div
                  ref={roomRef}
                  className="relative mx-auto overflow-hidden rounded-xl border border-zinc-800 bg-black"
                  style={{ width: displaySize.width, height: displaySize.height }}
                  onClick={(e) => addLayerPoint(e.clientX, e.clientY)}
                >
                  <img
                    src={roomImage}
                    alt="Room"
                    className="absolute inset-0 h-full w-full select-none object-fill"
                    draggable={false}
                  />

                  {visible.depth && depthResult?.primaryUrl && (
                    <img
                      src={depthResult.primaryUrl}
                      alt="Depth map"
                      className="absolute inset-0 h-full w-full object-fill opacity-40 mix-blend-screen"
                      draggable={false}
                    />
                  )}

                  {visible.sam2 && sam2Result?.primaryUrl && (
                    <img
                      src={sam2Result.primaryUrl}
                      alt="SAM2 mask"
                      className="absolute inset-0 h-full w-full object-fill opacity-35 mix-blend-lighten"
                      draggable={false}
                    />
                  )}

                  <div className="absolute inset-0" style={{ transform: `scale(${displaySize.ratio})`, transformOrigin: 'top left', width: roomSize.width, height: roomSize.height }}>
                    <SofaScene width={roomSize.width} height={roomSize.height} placement={placement} modelUrl="/models/sofa.glb" />
                    {visible.points && <LayerDots points={points} />}
                  </div>
                </div>
              </div>
            )}
          </section>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-200">
                <ScanLine className="h-4 w-4" /> Replicate analysis
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={runDepth} disabled={!roomImage || isDepthLoading} variant="secondary">
                  {isDepthLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />} Depth
                </Button>
                <Button onClick={runSam2} disabled={!roomImage || isSamLoading} variant="secondary">
                  {isSamLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />} SAM2
                </Button>
              </div>
              <Status label="Depth" result={depthResult} />
              <Status label="SAM2" result={sam2Result} />
            </div>

            <LayerModeSelector value={layerKind} onChange={setLayerKind} />

            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
              <div className="mb-3 text-sm font-semibold text-zinc-200">Layer visibility</div>
              <Toggle label="Depth overlay" checked={visible.depth} onChange={() => setVisible((v) => ({ ...v, depth: !v.depth }))} />
              <Toggle label="SAM2 overlay" checked={visible.sam2} onChange={() => setVisible((v) => ({ ...v, sam2: !v.sam2 }))} />
              <Toggle label="Layer points" checked={visible.points} onChange={() => setVisible((v) => ({ ...v, points: !v.points }))} />
              <Button variant="danger" onClick={() => setPoints([])}>
                <Trash2 className="h-4 w-4" /> Clear points
              </Button>
            </div>

            <PlacementControls placement={placement} setPlacement={setPlacement} />

            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
              <Button onClick={exportComposite} disabled={!roomImage || isExporting}>
                {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Export PNG
              </Button>
              {exported && (
                <a className="mt-3 block rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-center text-sm hover:bg-zinc-800" href={exported} download="furni-ai-mvp-export.png">
                  Download exported image
                </a>
              )}
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

function Status({ label, result }: { label: string; result: AiResult | null }) {
  if (!result) return <p className="mt-2 text-xs text-zinc-500">{label}: not run yet</p>;
  if (result.error) return <p className="mt-2 text-xs text-red-300">{label}: {result.error}</p>;
  return <p className="mt-2 truncate text-xs text-emerald-300">{label}: output ready</p>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <button className="mb-2 flex w-full items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800" onClick={onChange}>
      <span>{label}</span>
      {checked ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
    </button>
  );
}
