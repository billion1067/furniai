export type LayerKind = 'floor' | 'foreground' | 'preserve';

export type Placement = {
  x: number;
  y: number;
  scale: number;
  rotationY: number;
  rotationZ: number;
  shadowOpacity: number;
};

export type AiResult = {
  primaryUrl?: string;
  raw?: unknown;
  error?: string;
};

export type RoomLayerPoint = {
  id: string;
  kind: LayerKind;
  x: number;
  y: number;
};
