type VercelRequest = {
  method?: string;
  body?: {
    image?: unknown;
  };
};

type VercelResponse = {
  status: (code: number) => VercelResponse;
  json: (body: unknown) => void;
};

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const image = request.body?.image;
  if (!image || typeof image !== 'string') {
    response.status(400).json({ error: 'image is required.' });
    return;
  }

  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    response.status(500).json({ error: 'REPLICATE_API_TOKEN is missing.' });
    return;
  }

  const version =
    process.env.REPLICATE_MODEL_VERSION ??
    'b239ea33cff32bb7abb5db39ffe9a09c14cbc2894331d1ef66fe096eed88ebd4';
  const modelSize = process.env.REPLICATE_MODEL_SIZE ?? 'Small';

  const replicateResponse = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'wait=60',
    },
    body: JSON.stringify({
      version,
      input: {
        image,
        model_size: modelSize,
      },
    }),
  });

  const prediction = await replicateResponse.json();
  if (!replicateResponse.ok) {
    response.status(replicateResponse.status).json({
      error: prediction.detail ?? prediction.error ?? 'Replicate request failed.',
    });
    return;
  }
  if (prediction.status === 'failed' || prediction.error) {
    response.status(502).json({
      error: prediction.error ?? 'Replicate prediction failed.',
      prediction,
    });
    return;
  }

  response.status(200).json({
    calibration: {
      fov: 52,
      pitch: -10,
      yaw: 0,
      roll: 0,
      cameraHeight: 1.55,
      floorDepth: 4.8,
    },
    depthMapUrl: prediction.output?.grey_depth ?? prediction.output?.color_depth ?? null,
    prediction,
  });
}
