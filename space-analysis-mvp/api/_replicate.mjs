export function loadConfig() {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error("REPLICATE_API_TOKEN is missing.");

  return {
    token,
    depthVersion:
      process.env.REPLICATE_DEPTH_VERSION ??
      process.env.REPLICATE_MODEL_VERSION ??
      "b239ea33cff32bb7abb5db39ffe9a09c14cbc2894331d1ef66fe096eed88ebd4",
    sam2Version:
      process.env.REPLICATE_SAM2_VERSION ??
      "b88dc2ea8f814e5f4af2bac79f2414079800b5035b065d4eab99c857ab67e125",
  };
}

export async function readBody(request) {
  if (request.body && typeof request.body === "object") return request.body;
  if (typeof request.body === "string") return JSON.parse(request.body || "{}");

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

export async function createPrediction(token, version, input) {
  const response = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ version, input }),
  });

  const prediction = await response.json();
  if (!response.ok) {
    throw new Error(prediction.detail ?? prediction.error ?? "Replicate request failed.");
  }
  return prediction;
}

export async function getPrediction(token, getUrl) {
  const response = await fetch(getUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const prediction = await response.json();
  if (!response.ok) {
    throw new Error(prediction.detail ?? prediction.error ?? "Replicate polling failed.");
  }
  return prediction;
}

export function encodeJob(payload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeJob(id) {
  return JSON.parse(Buffer.from(id, "base64url").toString("utf8"));
}

export function firstUrl(value) {
  if (!value) return null;
  if (typeof value === "string" && /^https?:\/\//.test(value)) return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstUrl(item);
      if (found) return found;
    }
  }
  if (typeof value === "object") {
    for (const key of ["grey_depth", "gray_depth", "color_depth", "depth", "depth_map", "combined_mask", "mask", "url", "image"]) {
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

export function collectUrls(value, urls = []) {
  if (!value) return urls;
  if (typeof value === "string" && /^https?:\/\//.test(value)) {
    urls.push(value);
    return urls;
  }
  if (Array.isArray(value)) value.forEach((item) => collectUrls(item, urls));
  else if (typeof value === "object") Object.values(value).forEach((item) => collectUrls(item, urls));
  return urls;
}

export function proxiedUrl(url) {
  return url ? `/api/proxy-image?url=${encodeURIComponent(url)}` : null;
}

export function predictionSummary(name, prediction, startedAt) {
  return {
    name,
    id: prediction.id,
    status: prediction.status,
    createdAt: prediction.created_at,
    startedAt: prediction.started_at,
    completedAt: prediction.completed_at,
    elapsedMs: Date.now() - startedAt,
  };
}

export function analysisResult(job, depthPrediction, segmentPrediction) {
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
        version: job.depth.version,
      },
      segmentation: {
        name: "SAM2",
        version: job.segmentation.version,
      },
    },
    diagnostics: {
      elapsedMs: Date.now() - job.createdAt,
      predictions: {
        depth: predictionSummary("Depth Anything", depthPrediction, job.createdAt),
        segmentation: predictionSummary("SAM2", segmentPrediction, job.createdAt),
      },
    },
  };
}
