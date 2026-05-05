import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const port = Number(process.env.PORT ?? 8787);

function loadLocalEnv() {
  const envPath = join(process.cwd(), '.env.local');
  if (!existsSync(envPath)) return;

  const text = readFileSync(envPath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const rawValue = trimmed.slice(separator + 1).trim();
    if (!process.env[key]) {
      process.env[key] = rawValue.replace(/^['"]|['"]$/g, '');
    }
  }
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 12_000_000) {
        request.destroy();
        reject(new Error('Image payload is too large.'));
      }
    });
    request.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Request body must be valid JSON.'));
      }
    });
    request.on('error', reject);
  });
}

async function analyzeWithReplicate(image) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    return {
      ok: false,
      status: 500,
      body: { error: 'REPLICATE_API_TOKEN is missing. Add it to .env.local.' },
    };
  }

  const version =
    process.env.REPLICATE_MODEL_VERSION ??
    'b239ea33cff32bb7abb5db39ffe9a09c14cbc2894331d1ef66fe096eed88ebd4';
  const modelSize = process.env.REPLICATE_MODEL_SIZE ?? 'Small';

  const response = await fetch('https://api.replicate.com/v1/predictions', {
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

  const prediction = await response.json();
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      body: { error: prediction.detail ?? prediction.error ?? 'Replicate request failed.' },
    };
  }
  if (prediction.status === 'failed' || prediction.error) {
    return {
      ok: false,
      status: 502,
      body: { error: prediction.error ?? 'Replicate prediction failed.', prediction },
    };
  }

  return {
    ok: true,
    status: 200,
    body: {
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
    },
  };
}

loadLocalEnv();

const server = createServer(async (request, response) => {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.url !== '/api/scene-analyze' || request.method !== 'POST') {
    response.writeHead(404, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  try {
    const { image } = await readJsonBody(request);
    if (!image || typeof image !== 'string') {
      response.writeHead(400, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'image is required.' }));
      return;
    }

    const result = await analyzeWithReplicate(image);
    response.writeHead(result.status, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(result.body));
  } catch (error) {
    response.writeHead(500, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }));
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Replicate API server listening on http://127.0.0.1:${port}`);
});
