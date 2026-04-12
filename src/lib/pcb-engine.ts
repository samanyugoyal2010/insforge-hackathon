/** Active backend for `update_pcb` tool execution. Circuitron retired. */
export type PcbEngine = "pcbflow";

export const PCB_ENGINE_STORAGE_KEY = "node0-pcb-engine";

export function parsePcbEngine(raw: unknown): PcbEngine {
  return "pcbflow";
}
