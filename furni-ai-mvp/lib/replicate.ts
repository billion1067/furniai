import Replicate from 'replicate';

export function getReplicate() {
  if (!process.env.REPLICATE_API_TOKEN) {
    throw new Error('Missing REPLICATE_API_TOKEN. Add it to .env.local.');
  }
  return new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
}

export function normalizeReplicateOutput(output: unknown) {
  // Replicate outputs vary by model: string URL, array of URLs, or object with depth_images/data.
  if (typeof output === 'string') return { primaryUrl: output, raw: output };
  if (Array.isArray(output)) {
    return { primaryUrl: output.find((x) => typeof x === 'string') as string | undefined, raw: output };
  }
  if (output && typeof output === 'object') {
    const obj = output as Record<string, unknown>;
    const depthImages = obj.depth_images;
    const data = obj.data;
    const image = obj.image;
    const mask = obj.mask;
    const outputValue = obj.output;
    const candidates = [depthImages, data, image, mask, outputValue];
    for (const candidate of candidates) {
      if (typeof candidate === 'string') return { primaryUrl: candidate, raw: output };
      if (Array.isArray(candidate)) {
        const url = candidate.find((x) => typeof x === 'string') as string | undefined;
        if (url) return { primaryUrl: url, raw: output };
      }
    }
  }
  return { primaryUrl: undefined, raw: output };
}
