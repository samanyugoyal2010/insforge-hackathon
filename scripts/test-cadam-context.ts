/**
 * Pure unit checks for CADAM-style CAD context formatting (no API calls).
 * Run: npm run test:cadam:context
 */

import {
  formatCadGenerationContextBlock,
  pcbHintsFromToolArgs,
} from "../src/lib/cadam/context";
import { EMPTY_BOM, createBomLine } from "../src/lib/bom";
import { DEFAULT_SHELL } from "../src/lib/cad-shell";

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("ASSERT FAIL:", msg);
    process.exit(1);
  }
}

function main() {
  const hints = pcbHintsFromToolArgs({
    widthMm: 80,
    heightMm: 50,
    layerCount: 2,
  });
  assert(hints.widthMm === 80 && hints.heightMm === 50, "pcb hints");

  const bom = {
    lines: [
      createBomLine({
        designators: "U1",
        description: "MCU",
        mpn: "ESP32",
        footprint: "QFN48",
        qty: 1,
      }),
    ],
  };

  const block = formatCadGenerationContextBlock({
    bom,
    shell: DEFAULT_SHELL,
    pcbHints: hints,
    conversationContext: "USB-powered sensor gadget",
  });

  assert(block.includes("80") && block.includes("50"), "board size in block");
  assert(block.includes("ESP32") || block.includes("MCU"), "BOM in block");
  assert(block.includes("Enclosure target"), "shell line");
  assert(block.includes("USB-powered"), "conversation in block");

  const empty = formatCadGenerationContextBlock({
    bom: EMPTY_BOM,
    shell: DEFAULT_SHELL,
  });
  assert(empty.includes("no BOM lines"), "empty BOM summary");

  console.log("test-cadam-context: OK");
}

main();
