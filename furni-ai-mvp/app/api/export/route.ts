import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  // This route is intentionally minimal. In production, upload the data URL to S3/R2/Supabase Storage.
  const { imageDataUrl } = await req.json();
  if (!imageDataUrl) return NextResponse.json({ error: 'imageDataUrl is required' }, { status: 400 });
  return NextResponse.json({ imageDataUrl });
}
