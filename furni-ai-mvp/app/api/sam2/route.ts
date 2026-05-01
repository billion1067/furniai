import { NextRequest, NextResponse } from 'next/server';
import { getReplicate, normalizeReplicateOutput } from '@/lib/replicate';

export async function POST(req: NextRequest) {
  try {
    const { imageDataUrl, pointsPerSide = 32 } = await req.json();
    if (!imageDataUrl) {
      return NextResponse.json({ error: 'imageDataUrl is required' }, { status: 400 });
    }

    const replicate = getReplicate();
    const model = process.env.REPLICATE_SAM2_MODEL || 'meta/sam-2';

    // Replicate meta/sam-2 image model is automatic mask generation-oriented.
    // User-assisted floor/foreground points are stored in the frontend as MVP layers.
    const output = await replicate.run(model as `${string}/${string}` | `${string}/${string}:${string}`, {
      input: {
        image: imageDataUrl,
        points_per_side: pointsPerSide,
        use_m2m: true
      }
    });

    const normalized = normalizeReplicateOutput(output);
    return NextResponse.json(normalized);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'SAM2 segmentation failed' },
      { status: 500 }
    );
  }
}
