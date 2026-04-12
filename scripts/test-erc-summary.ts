import { summarizeErcText } from "../src/lib/circuitron/erc-summary";

const clean = summarizeErcText(
  "ERC INFO: No errors or warnings found while running ERC.\n",
);
if (!clean.ercClean || clean.level !== "pass") {
  console.error("expected clean ERC", clean);
  process.exit(1);
}

const dirty = summarizeErcText(`Error: Pin not driven
Warning: Power pin on U1`);
if (dirty.level !== "fail" || dirty.errorCount < 1) {
  console.error("expected fail ERC", dirty);
  process.exit(1);
}

console.log("erc-summary: ok");
