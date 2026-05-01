# FurniAI MVP

FurniAI is a browser-based 3D room composition prototype. The current MVP focuses on the core development surface:

- Upload a room photo as the 2D background.
- Start from a bundled sample room image and sample generated chair.
- Show the planned furniture image-to-3D upload flow without running model generation yet.
- Match a Three.js camera to the photo perspective with FOV, pitch, yaw, roll, and camera-height controls.
- Load a `.glb` or `.gltf` furniture asset.
- Move, rotate, and scale the asset with Three.js transform controls.
- Render with depth buffer, soft shadows, a floor grid, and a perspective guide.
- Export the composed viewport as a PNG.

## Run

```bash
npm install --cache /tmp/furniai-npm-cache
npm run dev -- --port 5173
```

Open `http://localhost:5173/`.

## Build

```bash
npm run build
```

## Architecture

The MVP implements the frontend portion of the planned pipeline:

```text
Room image -> Camera calibration UI -> Three.js scene
Furniture GLB -> GLTFLoader -> TransformControls -> Renderer output
Furniture image -> Image-to-3D placeholder UI -> future backend GLB
```

The live "engine output" panel mirrors the API contract expected from future AI services:

```ts
type SceneContract = {
  cameraMatrix: {
    fov: number;
    pitch: number;
    yaw: number;
    roll: number;
    cameraHeightMeters: number;
  };
  roomBox: {
    floorDepthMeters: number;
    coordinateSystem: 'threejs-y-up-z-depth';
  };
  asset: {
    name: string;
    transform: {
      position: number[];
      rotation: number[];
      scale: number[];
    } | null;
  };
};
```

## Next Backend Hooks

Future AI endpoints can replace the manual controls without changing the renderer contract:

- `POST /scene/analyze`: return camera matrix, floor plane, room box, depth map metadata.
- `POST /asset/generate`: return a generated `.glb` from a segmented furniture image.
- `POST /compose/render`: perform high-quality server-side render or image export.

The frontend currently lives in [src/main.tsx](/Users/billionaire/Documents/Furni/src/main.tsx) and styling is in [src/styles.css](/Users/billionaire/Documents/Furni/src/styles.css).

## Preserved Remote Project

The previous GitHub project is preserved in `furni-ai-mvp/`.
