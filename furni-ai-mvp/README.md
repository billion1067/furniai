# Furni AI MVP

This is a working MVP scaffold for Furni AI:

- Upload a 2D interior image
- Run Replicate `depth-anything-v3-metric`
- Run Replicate `SAM2`
- Display depth/SAM overlays as analysis layers
- Place a GLB sofa model over the image with Three.js
- Adjust sofa position, uniform scale, Y rotation, Z rotation, shadow opacity
- Add manual layer hint points: floor / foreground / preserve
- Export the composed image as PNG

## Important MVP constraints

- The room is **not converted to 3D**.
- The sofa is a **GLB 3D model** layered over the 2D room image.
- Sofa scaling is **uniform only**. Do not implement `scaleX`/`scaleY` independently.
- SAM2 is used as an analysis/mask layer. The Replicate `meta/sam-2` image model is automatic-mask oriented, so this MVP also stores manual floor/foreground/preserve points as product-layer hints.

## Setup

```bash
cp .env.example .env.local
# Add your Replicate token
npm install
npm run dev
```

Open http://localhost:3000.

## Environment

```bash
REPLICATE_API_TOKEN=r8_your_token_here
REPLICATE_DEPTH_MODEL=vufinder/depth-anything-v3-metric
REPLICATE_SAM2_MODEL=meta/sam-2
```

## Replace the sofa model

A placeholder GLB sofa is included at:

```text
public/models/sofa.glb
```

Replace it with your real sofa GLB while keeping the same filename, or update `modelUrl` in `app/page.tsx`.

## Recommended next engineering steps

1. Store uploads/results in Supabase Storage or Cloudflare R2.
2. Replace manual layer points with real SAM2 mask selection UI.
3. Add floor-anchor validation using the selected floor mask.
4. Use the depth map to recommend sofa scale based on anchor depth.
5. Add foreground occlusion: selected foreground masks should render above the sofa.
6. Add final photorealistic rendering later with an image edit model if needed.
