export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.status(405).send("Method not allowed.");
    return;
  }

  const imageUrl = request.query.url;
  if (!imageUrl || Array.isArray(imageUrl) || !/^https?:\/\//.test(imageUrl)) {
    response.status(400).send("Invalid image URL");
    return;
  }

  try {
    const upstream = await fetch(imageUrl);
    if (!upstream.ok) {
      response.status(upstream.status).send("Image fetch failed");
      return;
    }

    const contentType = upstream.headers.get("content-type") ?? "image/png";
    const bytes = Buffer.from(await upstream.arrayBuffer());
    response.setHeader("Content-Type", contentType);
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.status(200).send(bytes);
  } catch (error) {
    response.status(500).send(error.message ?? "Image proxy failed");
  }
}
