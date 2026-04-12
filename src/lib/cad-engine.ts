export type CadEngine = "cadam" | "cadium";

export const CAD_ENGINE_STORAGE_KEY = "cad_engine_preference";

export function parseCadEngine(raw: unknown): CadEngine {
  if (typeof raw === "string") {
    const s = raw.toLowerCase().trim();
    if (s === "cadium") return "cadium";
    if (s === "cadam") return "cadam";
  }
  return "cadam";
}
