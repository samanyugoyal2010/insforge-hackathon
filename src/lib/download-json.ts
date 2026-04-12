/** Download a JSON-serializable value as a file in the browser. */
export function downloadJsonFile(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".json") ? filename : `${filename}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Download plain text as a file in the browser. */
export function downloadTextFile(
  filename: string,
  text: string,
  mimeType = "text/plain;charset=utf-8",
) {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function sanitizeExportSlug(raw: string | null | undefined) {
  const s = (raw ?? "draft").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return s || "draft";
}
