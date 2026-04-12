/** Binary POST body for `/api/ar-handoff` (gzip JSON). */
export const HANDOFF_GZIP_CONTENT_TYPE = "application/x-node0-handoff-gzip";

export type HandoffPostPayload = { cad: unknown; circuitron: unknown };

/** Browser: gzip JSON for a smaller request body (SVG/CAD compress well). */
export async function gzipHandoffPayload(
  payload: HandoffPostPayload,
): Promise<ArrayBuffer> {
  const json = JSON.stringify(payload);
  if (typeof CompressionStream === "undefined") {
    throw new Error("CompressionStream unsupported");
  }
  const buf = new TextEncoder().encode(json);
  const stream = new Blob([buf]).stream().pipeThrough(
    new CompressionStream("gzip"),
  );
  return new Response(stream).arrayBuffer();
}
