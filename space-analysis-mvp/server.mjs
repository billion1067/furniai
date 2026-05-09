import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = join(root, "..");
const port = Number(process.env.PORT ?? 8791);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

const analysisJobs = new Map();

function createJobId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function publicJob(job) {
  return {
    id: job.id,
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    elapsedMs: Date.now() - job.createdAt,
    result: job.result ?? null,
    error: job.error ?? null,
  };
}

function startAnalysisJob(image) {
  const id = createJobId();
  const job = {
    id,
    status: "processing",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    result: null,
    error: null,
  };
  analysisJobs.set(id, job);

  analyze(image)
    .then((result) => {
      job.status = "succeeded";
      job.result = result;
      job.updatedAt = Date.now();
    })
    .catch((error) => {
      job.status = "failed";
      job.error = error.message ?? "Analysis failed.";
      job.updatedAt = Date.now();
    });

  return job;
}

function pruneAnalysisJobs() {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [id, job] of analysisJobs.entries()) {
    if (job.updatedAt < cutoff) analysisJobs.delete(id);
  }
}

function loadEnv() {
  const envPath = join(projectRoot, ".env.local");
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || match[1] in process.env) continue;
    process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 28_000_000) {
        reject(new Error("Image payload is too large."));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Request body must be valid JSON."));
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
}

function predictionSummary(prediction, elapsedMs) {
  return {
    id: prediction.id,
    status: prediction.status,
    createdAt: prediction.created_at,
    startedAt: prediction.started_at,
    completedAt: prediction.completed_at,
    elapsedMs,
  };
}

async function createPrediction(name, version, input) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error("REPLICATE_API_TOKEN is missing in .env.local.");
  const startedAt = Date.now();

  const response = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "wait=60",
    },
    body: JSON.stringify({ version, input }),
  });

  const prediction = await response.json();
  if (!response.ok) {
    throw new Error(prediction.detail ?? prediction.error ?? "Replicate request failed.");
  }

  const completed = await pollPrediction(token, prediction);
  return {
    prediction: completed,
    summary: {
      name,
      ...predictionSummary(completed, Date.now() - startedAt),
    },
  };
}

async function pollPrediction(token, prediction) {
  let current = prediction;
  const startedAt = Date.now();

  while (["starting", "processing"].includes(current.status)) {
    if (Date.now() - startedAt > 8 * 60 * 1000) {
      throw new Error("Replicate prediction timed out.");
    }

    await new Promise((resolve) => setTimeout(resolve, 3000));
    if (!current.urls?.get) break;

    const response = await fetch(current.urls.get, {
      headers: { Authorization: `Bearer ${token}` },
    });
    current = await response.json();
    if (!response.ok) {
      throw new Error(current.detail ?? current.error ?? "Replicate polling failed.");
    }
  }

  if (current.status === "failed" || current.error) {
    throw new Error(current.error ?? "Replicate prediction failed.");
  }

  return current;
}

function firstUrl(value) {
  if (!value) return null;
  if (typeof value === "string" && /^https?:\/\//.test(value)) return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstUrl(item);
      if (found) return found;
    }
  }
  if (typeof value === "object") {
    for (const key of [
      "grey_depth",
      "gray_depth",
      "color_depth",
      "depth",
      "depth_map",
      "combined_mask",
      "mask",
      "url",
      "image",
    ]) {
      const found = firstUrl(value[key]);
      if (found) return found;
    }
    for (const item of Object.values(value)) {
      const found = firstUrl(item);
      if (found) return found;
    }
  }
  return null;
}

function collectUrls(value, urls = []) {
  if (!value) return urls;
  if (typeof value === "string" && /^https?:\/\//.test(value)) {
    urls.push(value);
    return urls;
  }
  if (Array.isArray(value)) value.forEach((item) => collectUrls(item, urls));
  else if (typeof value === "object") Object.values(value).forEach((item) => collectUrls(item, urls));
  return urls;
}

function proxiedUrl(url) {
  return url ? `/api/proxy-image?url=${encodeURIComponent(url)}` : null;
}

async function analyze(image) {
  const depthVersion =
    process.env.REPLICATE_DEPTH_VERSION ??
    process.env.REPLICATE_MODEL_VERSION ??
    "b239ea33cff32bb7abb5db39ffe9a09c14cbc2894331d1ef66fe096eed88ebd4";
  const sam2Version =
    process.env.REPLICATE_SAM2_VERSION ??
    "b88dc2ea8f814e5f4af2bac79f2414079800b5035b065d4eab99c857ab67e125";

  const analysisStartedAt = Date.now();
  const [depthResult, segmentResult] = await Promise.all([
    createPrediction("Depth Anything", depthVersion, {
      image,
      model_size: process.env.REPLICATE_MODEL_SIZE ?? "Small",
    }),
    createPrediction("SAM2", sam2Version, {
      image,
      points_per_side: Number(process.env.REPLICATE_SAM2_POINTS_PER_SIDE ?? 32),
      pred_iou_thresh: Number(process.env.REPLICATE_SAM2_IOU_THRESH ?? 0.88),
      stability_score_thresh: Number(process.env.REPLICATE_SAM2_STABILITY_THRESH ?? 0.95),
      use_m2m: true,
    }),
  ]);

  const depthPrediction = depthResult.prediction;
  const segmentPrediction = segmentResult.prediction;
  const depthMapUrl = firstUrl(depthPrediction.output);
  const maskUrl =
    firstUrl(segmentPrediction.output?.combined_mask) ??
    firstUrl(segmentPrediction.output?.mask) ??
    firstUrl(segmentPrediction.output);
  const maskUrls = collectUrls(segmentPrediction.output);

  return {
    depthMapUrl,
    proxiedDepthMapUrl: proxiedUrl(depthMapUrl),
    maskUrl,
    proxiedMaskUrl: proxiedUrl(maskUrl),
    maskUrls,
    proxiedMaskUrls: maskUrls.map(proxiedUrl),
    models: {
      depth: {
        name: "Depth Anything",
        version: depthVersion,
      },
      segmentation: {
        name: "SAM2",
        version: sam2Version,
      },
    },
    diagnostics: {
      elapsedMs: Date.now() - analysisStartedAt,
      predictions: {
        depth: depthResult.summary,
        segmentation: segmentResult.summary,
      },
    },
  };
}

async function handleProxyImage(request, response) {
  const url = new URL(request.url, `http://localhost:${port}`);
  const imageUrl = url.searchParams.get("url");
  if (!imageUrl || !/^https?:\/\//.test(imageUrl)) {
    response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Invalid image URL");
    return;
  }

  const upstream = await fetch(imageUrl);
  if (!upstream.ok) {
    response.writeHead(upstream.status, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Image fetch failed");
    return;
  }

  const contentType = upstream.headers.get("content-type") ?? "image/png";
  const bytes = Buffer.from(await upstream.arrayBuffer());
  response.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
  });
  response.end(bytes);
}

async function handleStatic(request, response) {
  const url = new URL(request.url, `http://localhost:${port}`);
  const requestedPath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = normalize(join(root, requestedPath));

  if (!filePath.startsWith(root) || !existsSync(filePath)) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  const ext = extname(filePath);
  response.writeHead(200, {
    "Content-Type": mimeTypes[ext] ?? "application/octet-stream",
    "Cache-Control": "no-store",
  });
  response.end(readFileSync(filePath));
}

loadEnv();

createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://localhost:${port}`);

    if (request.method === "POST" && url.pathname === "/api/analyze") {
      const body = await readJson(request);
      if (!body.image || typeof body.image !== "string") {
        sendJson(response, 400, { error: "image is required." });
        return;
      }

      const result = await analyze(body.image);
      sendJson(response, 200, result);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/analyze/start") {
      const body = await readJson(request);
      if (!body.image || typeof body.image !== "string") {
        sendJson(response, 400, { error: "image is required." });
        return;
      }

      pruneAnalysisJobs();
      const job = startAnalysisJob(body.image);
      sendJson(response, 202, publicJob(job));
      return;
    }

    if (request.method === "GET" && url.pathname.startsWith("/api/analyze/jobs/")) {
      const id = decodeURIComponent(url.pathname.slice("/api/analyze/jobs/".length));
      const job = analysisJobs.get(id);
      if (!job) {
        sendJson(response, 404, { error: "Analysis job not found. Start a new analysis." });
        return;
      }
      sendJson(response, 200, publicJob(job));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/proxy-image") {
      await handleProxyImage(request, response);
      return;
    }

    if (request.method === "GET" && url.pathname === "/favicon.ico") {
      response.writeHead(204, { "Cache-Control": "no-store" });
      response.end();
      return;
    }

    if (request.method === "GET") {
      await handleStatic(request, response);
      return;
    }

    sendJson(response, 405, { error: "Method not allowed." });
  } catch (error) {
    sendJson(response, 500, { error: error.message ?? "Unexpected server error." });
  }
}).listen(port, () => {
  console.log(`Furni AI Space Analysis MVP: http://localhost:${port}`);
});
