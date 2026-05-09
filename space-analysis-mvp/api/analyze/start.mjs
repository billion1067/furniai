import { createPrediction, encodeJob, loadConfig, readBody } from "../_replicate.mjs";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.status(405).json({ error: "Method not allowed." });
    return;
  }

  try {
    const body = await readBody(request);
    if (!body.image || typeof body.image !== "string") {
      response.status(400).json({ error: "image is required." });
      return;
    }

    const config = loadConfig();
    const createdAt = Date.now();
    const [depth, segmentation] = await Promise.all([
      createPrediction(config.token, config.depthVersion, {
        image: body.image,
        model_size: process.env.REPLICATE_MODEL_SIZE ?? "Small",
      }),
      createPrediction(config.token, config.sam2Version, {
        image: body.image,
        points_per_side: Number(process.env.REPLICATE_SAM2_POINTS_PER_SIDE ?? 32),
        pred_iou_thresh: Number(process.env.REPLICATE_SAM2_IOU_THRESH ?? 0.88),
        stability_score_thresh: Number(process.env.REPLICATE_SAM2_STABILITY_THRESH ?? 0.95),
        use_m2m: true,
      }),
    ]);

    const id = encodeJob({
      createdAt,
      depth: {
        id: depth.id,
        get: depth.urls?.get,
        version: config.depthVersion,
      },
      segmentation: {
        id: segmentation.id,
        get: segmentation.urls?.get,
        version: config.sam2Version,
      },
    });

    response.status(202).json({
      id,
      status: "processing",
      createdAt,
      updatedAt: Date.now(),
      elapsedMs: Date.now() - createdAt,
      result: null,
      error: null,
    });
  } catch (error) {
    response.status(500).json({ error: error.message ?? "Analysis job could not be started." });
  }
}
