import { analysisResult, decodeJob, getPrediction, loadConfig } from "../../_replicate.mjs";

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.status(405).json({ error: "Method not allowed." });
    return;
  }

  try {
    const id = Array.isArray(request.query.id) ? request.query.id[0] : request.query.id;
    if (!id) {
      response.status(400).json({ error: "Analysis job id is required." });
      return;
    }

    const config = loadConfig();
    const job = decodeJob(id);
    if (!job.depth?.get || !job.segmentation?.get) {
      response.status(400).json({ error: "Invalid analysis job." });
      return;
    }

    const [depth, segmentation] = await Promise.all([
      getPrediction(config.token, job.depth.get),
      getPrediction(config.token, job.segmentation.get),
    ]);
    const failed = [depth, segmentation].find((prediction) => prediction.status === "failed" || prediction.error);
    if (failed) {
      response.status(200).json({
        id,
        status: "failed",
        createdAt: job.createdAt,
        updatedAt: Date.now(),
        elapsedMs: Date.now() - job.createdAt,
        result: null,
        error: failed.error ?? "Replicate prediction failed.",
      });
      return;
    }

    if ([depth.status, segmentation.status].some((status) => status === "starting" || status === "processing")) {
      response.status(200).json({
        id,
        status: "processing",
        createdAt: job.createdAt,
        updatedAt: Date.now(),
        elapsedMs: Date.now() - job.createdAt,
        result: null,
        error: null,
      });
      return;
    }

    response.status(200).json({
      id,
      status: "succeeded",
      createdAt: job.createdAt,
      updatedAt: Date.now(),
      elapsedMs: Date.now() - job.createdAt,
      result: analysisResult(job, depth, segmentation),
      error: null,
    });
  } catch (error) {
    response.status(500).json({ error: error.message ?? "Analysis job could not be checked." });
  }
}
