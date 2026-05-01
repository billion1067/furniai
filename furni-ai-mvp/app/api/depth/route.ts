import { NextRequest, NextResponse } from 'next/server';
import { getReplicate, normalizeReplicateOutput } from '@/lib/replicate';

export async function POST(req: NextRequest) {
  try {
    const { imageDataUrl } = await req.json();
    if (!imageDataUrl) {
      return NextResponse.json({ error: 'imageDataUrl is required' }, { status: 400 });
    }

    const replicate = getReplicate();
    const model = process.env.REPLICATE_DEPTH_MODEL || 'vufinder/depth-anything-v3-metric';

    // vufinder/depth-anything-v3-metric expects an array named `images`.
    // It can also accept additional optional settings. Keep this minimal for MVP stability.
    const output = await replicate.run(model as `${string}/${string}` | `${string}/${string}:${string}`, {
      input: {
        images: [imageDataUrl],
        return_depth: true
      }
    });

    const normalized = normalizeReplicateOutput(output);
    return NextResponse.json(normalized);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Depth estimation failed' },
      { status: 500 }
    );
  }
}
