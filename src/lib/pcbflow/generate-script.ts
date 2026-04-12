import { randomUUID } from "node:crypto";
import type OpenAI from "openai";
import type { PcbAssemblyStagePlan } from "@/lib/pcbflow/plan-assembly-stages";

/**
 * Names that exist after `from pcbflow import *` (pcbflow 0.2 footprints + importers).
 * Do not invent ESP32_*, STM32_*, etc. — they cause NameError at runtime.
 */
const ALLOWED_PART_CLASSES = new Set([
  // smd_discrete
  "C0402",
  "C0603",
  "C0805",
  "C1206",
  "R0402",
  "R0603",
  "R0805",
  "R1206",
  "L0402",
  "L0603",
  "L0805",
  "L1206",
  // sot
  "SOT23",
  "SOT223",
  "SOT764",
  // soic / tssop (never bare SOIC/TSSOP — pcbflow base classes lack geometry)
  "SOIC8",
  // TSSOP: upstream pcbflow only implements body map for N=14 and N=20 — TSSOP16/24/28 raise KeyError at runtime
  "TSSOP14",
  "TSSOP20",
  // pin_header (do NOT use PTH — it requires diameter= and crashes if misused; use SIL / SIL_2mm)
  // Do NOT use DIP* with brd.add_part — Board.add_part always passes val=None, which collides with
  // DIP8/DIP16 fixed val= pin count → TypeError: multiple values for keyword argument 'val'.
  "SIL",
  "SIL_2mm",
  // qfn / bga
  "QFN64",
  "FTG256",
  // xtal / special
  "SMD_3225_4P",
  "HDMI",
  "Castellation",
  // importers (need libraryfile=… for Eagle/KiCad)
  "EaglePart",
  "KiCadPart",
  "SkiPart",
]);

const ALLOWLIST_DOC = Array.from(ALLOWED_PART_CLASSES).sort().join(", ");

/** Verified patterns — follow this structure and ordering. */
const PCBFLOW_EXAMPLE_A = `from pcbflow import *

if __name__ == "__main__":
    # 1) Board size in mm (must match spec width × height)
    brd = Board((50, 30))
    # 2) Place parts: passives use val="..." string; SIL uses val=<int> pin count (NOT a description string)
    brd.add_part((10, 15), R1206, val="330", side="top")
    brd.add_part((22, 15), C0603, val="100n", side="top")
    brd.add_part((38, 15), SIL, val=2, side="top")  # 2-pin = soil sensor / 2PTH / screw terminal stand-in
    # 3) Mechanical + copper
    brd.add_outline()
    brd.fill_layer("GTL", "GND")
    brd.fill_layer("GBL", "GND")
    # 4) Exports (basename "out", subfolder ./out/)
    brd.save_svg("out", in_subdir=True)
    brd.save("out", in_subdir=True, gerber=True, pdf=False, bom=True, centroids=True, povray=False)`;

const PCBFLOW_EXAMPLE_B = `from pcbflow import *

if __name__ == "__main__":
    brd = Board((60, 35))
    # "ESP32" / MCU from spec → QFN64 placeholder + silk label (no ESP32_* class exists)
    brd.add_part((15, 20), QFN64, side="top")
    brd.add_text((4, 6), "MCU (e.g. ESP32-class)", side="top", justify="left", scale=0.45)
    # LED + resistor: 1206-size → R1206
    brd.add_part((42, 12), R1206, val="LED", side="top")
    brd.add_part((48, 12), R1206, val="330R", side="top")
    # USB-C / buzzer / odd connectors → SIL + text (no USB-C class in pcbflow)
    brd.add_part((52, 22), SIL_2mm, val=2, side="top")
    brd.add_text((40, 26), "USB / power / buzzer area", side="top", justify="left", scale=0.35)
    brd.add_outline()
    brd.fill_layer("GTL", "GND")
    brd.fill_layer("GBL", "GND")
    brd.save_svg("out", in_subdir=True)
    brd.save("out", in_subdir=True, gerber=True, pdf=False, bom=True, centroids=True, povray=False)`;

/** Multi-stage example: 3 stages (cumulative) then final full board. */
const PCBFLOW_EXAMPLE_MULTISTAGE = `from pcbflow import *

if __name__ == "__main__":
    BOARD_SIZE = (60, 35)

    # --- Part registry (same coords/footprint/ref for every board that includes them) ---
    PARTS = {
        "R1": {"xy": (10, 12), "cls": R0805, "val": "10k",  "side": "top"},
        "C1": {"xy": (10, 22), "cls": C0603, "val": "100n", "side": "top"},
        "U1": {"xy": (30, 18), "cls": QFN64, "val": None,   "side": "top"},
        "J1": {"xy": (54, 18), "cls": SIL,   "val": 4,      "side": "top"},
    }

    STAGES = [
        ["R1", "C1"],                  # stage 0 — passives only
        ["R1", "C1", "U1"],            # stage 1 — add MCU
        ["R1", "C1", "U1", "J1"],      # stage 2 — add connector (= full board)
    ]

    def build_board(refs):
        brd = Board(BOARD_SIZE)
        for ref in refs:
            p = PARTS[ref]
            kwargs = {"side": p["side"], "ref": ref}
            if p["val"] is not None:
                kwargs["val"] = p["val"]
            brd.add_part(p["xy"], p["cls"], **kwargs)
        brd.add_outline()
        brd.fill_layer("GTL", "GND")
        brd.fill_layer("GBL", "GND")
        return brd

    # Stage exports
    for i, refs in enumerate(STAGES):
        brd = build_board(refs)
        brd.save_svg(f"stage_{i}", in_subdir=True)

    # Final full board
    brd = build_board(list(PARTS.keys()))
    brd.add_text((4, 4), "My Board v1", side="top", justify="left", scale=0.4)
    brd.save_svg("out", in_subdir=True)
    brd.save("out", in_subdir=True, gerber=True, pdf=False, bom=True, centroids=True, povray=False)`;

/**
 * pcbflow reference for the model (michaelgale/pcbflow). Runtime: shapely>=2.0.1, pcbflow installed
 * (e.g. git clone + pip install ., or npm run setup:pcbflow in this repo).
 */
const PCBFLOW_REFERENCE = `
## Install / runtime (for operators, not your script)
- From source: \`git clone https://github.com/michaelgale/pcbflow.git && cd pcbflow && pip install .\`
- Requires **shapely >= 2.0.1** only.
- This repo: \`npm run setup:pcbflow\` creates \`.venv-pcbflow\` with pcbflow.

## Detailed build order (follow every time)
1. \`from pcbflow import *\` then \`if __name__ == "__main__":\`
2. \`brd = Board((width_mm, height_mm))\` — **width and height must match the specification** (numbers only).
3. Place **all** parts with \`brd.add_part((x_mm, y_mm), Class, ...)\` or \`Class(brd.DC((x,y)), ...)\`:
   - **R0603 / R0805 / R1206 / C0603 / …**: always pass \`val="330"\`, \`val="100n"\`, etc. (string).
   - **SIL** or **SIL_2mm**: pass \`val=<integer>\` = **number of pins** (e.g. 2 for 2-wire sensor, 4 for 1×4). **Never** pass a human description as \`val\` for SIL.
   - **Never use DIP8 / DIP14 / DIP16 / … with \`brd.add_part\`** — pcbflow's \`add_part\` injects \`val=None\`, which conflicts with DIP classes that set their own \`val\` → \`TypeError: multiple values for keyword argument 'val'\`. For multi-pin IC placeholders use **QFN64** + \`brd.add_text\`, not DIP*.
   - **Never use PTH** as a footprint class in \`add_part\` — it requires \`diameter=\` and raises ValueError if wrong. Use **SIL** / **SIL_2mm** instead for through-hole patterns.
4. Optional: \`brd.add_text(...)\` for silkscreen labels (connectors, MCU name, sensor).
5. \`brd.add_outline()\`
6. Pours: \`brd.fill_layer("GTL", "GND")\` and usually \`brd.fill_layer("GBL", "GND")\` for 2-layer.
7. **Must** call \`brd.save_svg("out", in_subdir=True)\` then \`brd.save("out", in_subdir=True, gerber=True, pdf=False, bom=True, centroids=True, povray=False)\` — **centroids=True is required** so the app can place 3D parts at real pcbflow coordinates (silk is vector art, not SVG \`<text>\`).

## CRITICAL: pcbflow footprint bugs (violating this crashes Python)
- **TSSOP:** In the shipped pcbflow library, \`TSSOP.place\` uses \`{14: 5.0, 20: 6.5}[N]\` only. **Only TSSOP14 and TSSOP20 are safe.** Do **not** use **TSSOP16**, **TSSOP24**, or **TSSOP28** — they raise \`KeyError\` (e.g. KeyError: 16) as soon as the part is placed.
- **16-pin / 24-pin / 28-pin TSSOP or SOIC-style ICs:** Use **QFN64** + \`brd.add_text(...)\` for the part name — **never** TSSOP16/TSSOP24/TSSOP28, and **never \`brd.add_part(..., DIP16, ...)\`** (see DIP note above).
- **Linear regulators (LM1117, AMS1117, XC6206, “3.3V LDO”, SOT-223 footprint):** Use **SOT223** — not TSSOP16. Example: \`brd.add_part((x, y), SOT223, side="top")\` plus \`add_text\` if you need the voltage on silk.

## CRITICAL: allowed footprint classes only
After \`from pcbflow import *\`, use **ONLY** these class names:
${ALLOWLIST_DOC}

**Mapping spec → pcbflow (no invented names):**
- ESP32 / MCU / module → **QFN64** + \`brd.add_text\` with the part name (do not use TSSOP28 — it crashes in pcbflow).
- **SOIC / TSSOP ICs:** **SOIC8** for 8-pin only. **TSSOP14** or **TSSOP20** only when pin count matches (14 or 20). For 16-pin ICs / drivers: **QFN64** + \`add_text\`, or **SOT223** for SOT-223 LDOs — **never TSSOP16**, **never DIP\*** via \`add_part\`. **Never** bare \`SOIC\` or bare \`TSSOP\`.
- LED_1206 / LED → **R1206** (same 1206 land pattern) with \`val="LED"\` or value string.
- R_1206 → **R1206**; R_0805 → **R0805**.
- USB-C / buzzer / custom connector → **SIL** or **SIL_2mm** with appropriate \`val=<pins>\` + \`add_text\` label.
- 2PTH / 2-pin sensor / screw terminal → **SIL, val=2** or **SIL_2mm, val=2**.

## CRITICAL: reference designator format (pcbflow save_bom bug)
pcbflow's \`pretty_parts\` does \`int(name[1:])\` — only **single-letter prefix + digits** are valid: R1, C2, U1, J3, L1, D1, Q1, S1, X1, M1, etc.
**Never** use multi-letter prefixes (SW1 → crashes as int("W1"), LED1 → crashes as int("ED1"), MOT1, BZ1). Map:
- Switch/sensor → **S1, S2** (not SW1)
- LED → **D1, D2** (not LED1)
- Motor/actuator → **M1** (not MOT1)
- Buzzer → **B1** (not BZ1)

## Runnable examples (structure to imitate)

### Example A — minimal board
\`\`\`python
${PCBFLOW_EXAMPLE_A}
\`\`\`

### Example B — MCU + LED + connector placeholders (common real spec)
\`\`\`python
${PCBFLOW_EXAMPLE_B}
\`\`\`

## Core API reminders (mm; or MILS(x), INCHES(x), MICRONS(x))
- Holes: \`brd.add_hole((x, y), d)\`, \`brd.add_drill((x, y), d)\`
- Copper: \`brd.add_named_rect((x1,y1), (x2,y2), "GTL", "VCC")\`
- Layers: GTL top copper, GBL bottom, GND pours as above.

## SKiDL (avoid unless necessary)
Prefer allowlisted parts only; \`SkiPart\` needs a working KiCad/SKiDL env.

## Saving (required)
Same as step 7 above; files under \`./out/\` for the final full board.

## Multi-stage assembly export (only when the user message includes **ASSEMBLY STAGE PLAN**)
When a JSON stage plan is provided with cumulative ref lists, you MUST export **one SVG bundle per stage** plus the final board.
The app renders AR assembly steps from these per-stage SVGs — this is **required**.

**Follow Example C exactly** — use a PARTS dict, a STAGES list, and a \`build_board(refs)\` helper so the structure is mechanical.

1. Use **fixed reference designators** on every placed part via \`ref="R1"\` kwarg.
2. Build a \`PARTS\` dict mapping ref → \`{xy, cls, val, side}\` for every BOM part.
3. Build a \`STAGES\` list of cumulative ref lists from the plan JSON.
4. Write \`def build_board(refs)\` that creates a Board, places only listed refs from PARTS, then \`add_outline()\` + both GND \`fill_layer\` calls.
5. Loop: \`for i, refs in enumerate(STAGES): brd = build_board(refs); brd.save_svg(f"stage_{i}", in_subdir=True)\`
6. Then build the **final** board with **all** PARTS refs, add silk text, call \`save_svg("out", ...)\` then \`save("out", ..., centroids=True, ...)\`.

If a stage's refs list is empty, still emit that stage board (outline + GND pours only).

### Example C — multi-stage assembly export (MANDATORY pattern when stage plan is present)
\`\`\`python
${PCBFLOW_EXAMPLE_MULTISTAGE}
\`\`\`
`.trim();

const SYSTEM = `You write ONE complete Python 3 script for pcbflow (https://github.com/michaelgale/pcbflow).

${PCBFLOW_REFERENCE}

## Your task
- Read the **PCB specification** (board size, components, nets, context). Obey **DETAILED BUILD ORDER** and mirror **Example A/B** structure for single boards, or **Example C** structure when an ASSEMBLY STAGE PLAN is provided.
- Match board **width_mm × height_mm** from the spec. Map every BOM line to allowlisted classes using the mapping table (MCU→QFN64, 2PTH→SIL val=2, etc.).
- Output **ONLY** raw Python. No markdown fences, no commentary outside the script.
- Forbidden: os.system, subprocess, socket, urllib, requests, eval/exec of untrusted strings.

If the spec is overloaded, still produce a **runnable** board: QFN64 + R1206 + SIL placeholders + GND pour + both save calls.

## Visual quality (what users see in the app)
- The shipped artifact is **save_svg** output. It must look like a real 2-layer board: **filled** GND copper on GTL and GBL (not stroke-only outlines), a visible outline from **add_outline**, and silk labels where helpful.
- Always call **brd.fill_layer("GTL", "GND")** and **brd.fill_layer("GBL", "GND")** after **add_outline** so pours render as solid polygons in the SVG.
- **CRITICAL**: Do NOT stack components on top of each other! Ensure every component has distinct, non-overlapping (X,Y) coordinates.
- Distribute components reasonably across the full board area rather than bunching them all at the origin.
- Space parts >= 4mm apart; cluster decouplers near the MCU; place **SIL** / **SIL_2mm** connectors neatly along board edges.
- Add realistic details like mounting holes near the corners, logical component flow (Power -> MCU -> IO), and text labels.`;

function extractPythonSource(raw: string): string {
  const t = raw.trim();
  const fence = /^```(?:python)?\s*([\s\S]*?)```$/m.exec(t);
  if (fence) return fence[1].trim();
  const multi = t.match(/```(?:python)?\s*([\s\S]*?)```/);
  if (multi) return multi[1].trim();
  return t;
}

/** Part class tokens used as 2nd arg to brd.add_part((x,y), CLASS, ... */
function collectPartClassesFromAddPart(script: string): Set<string> {
  const used = new Set<string>();
  const re = /\.add_part\s*\(\s*\([^)]*\)\s*,\s*([A-Za-z_][A-Za-z0-9_]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(script)) !== null) {
    used.add(m[1]);
  }
  return used;
}

/** e.g. R0603(brd.DC((10, 5)), ... */
function collectPartClassesFromDCConstructor(script: string): Set<string> {
  const used = new Set<string>();
  const re = /=\s*([A-Z][A-Za-z0-9_]*)\s*\(\s*brd\.DC\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(script)) !== null) {
    used.add(m[1]);
  }
  return used;
}

function findDisallowedPartClasses(script: string): string[] {
  const used = new Set<string>([
    ...collectPartClassesFromAddPart(script),
    ...collectPartClassesFromDCConstructor(script),
  ]);
  return [...used].filter((name) => !ALLOWED_PART_CLASSES.has(name));
}

function hasStringAsAddPartFootprint(script: string): boolean {
  return /\.add_part\s*\(\s*\([^)]*\)\s*,\s*["']/m.test(script);
}

/** SIL as 2nd arg to add_part: val must be int, not a quoted description */
function hasSilWithNonNumericVal(script: string): boolean {
  return /\.add_part\s*\(\s*\([^)]*\)\s*,\s*SIL(?:_2mm)?\s*,\s*val\s*=\s*["']/m.test(
    script,
  );
}

/**
 * pcbflow save_bom → pretty_parts does int(nm[1:]) on ref designators.
 * Multi-char prefixes like SW1, LED1 crash: int("W1"), int("ED1") → ValueError.
 * Only single-letter prefix + digits are safe (R1, C2, U3, J1, L1, D1, Q1).
 */
function findMultiCharRefPrefixes(script: string): string[] {
  const refs = new Set<string>();
  const re = /\bref\s*=\s*["']([A-Za-z][A-Za-z0-9]*)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(script)) !== null) {
    refs.add(m[1]);
  }
  const bad: string[] = [];
  for (const r of refs) {
    const prefix = r.replace(/\d+$/, "");
    if (prefix.length > 1) bad.push(r);
  }
  return bad;
}

/** pcbflow TSSOP.place only keys N in {14, 20}; TSSOP16/24/28 raise KeyError */
function findBrokenTssopFootprints(script: string): string[] {
  const broken = ["TSSOP16", "TSSOP24", "TSSOP28"];
  const found: string[] = [];
  const used = new Set([
    ...collectPartClassesFromAddPart(script),
    ...collectPartClassesFromDCConstructor(script),
  ]);
  for (const name of broken) {
    if (used.has(name)) found.push(name);
  }
  return found;
}

/** pcbflow add_part passes val= from Board; DIP* also sets val → TypeError */
function hasDipViaAddPart(script: string): boolean {
  return /\.add_part\s*\(\s*[^,)]+\s*,\s*DIP\d*\b/.test(script);
}

/** Without pours the SVG looks like empty wireframe—unacceptable in-product. */
function missingGndFillLayers(script: string): boolean {
  const hasGtl = /fill_layer\s*\(\s*["']GTL["']\s*,\s*["']GND["']\s*\)/i.test(
    script,
  );
  const hasGbl = /fill_layer\s*\(\s*["']GBL["']\s*,\s*["']GND["']\s*\)/i.test(
    script,
  );
  return !hasGtl || !hasGbl;
}

/** 3D AR uses centroid CSV; silk is stroked geometry, not SVG <text> refs. */
function finalSaveMissingCentroidsTrue(script: string): boolean {
  const m = /\bbrd\.save\s*\(\s*["']out["']/.exec(script);
  if (!m) return true;
  const head = script.slice(m.index, m.index + 900);
  if (/centroids\s*=\s*False/.test(head)) return true;
  return !/centroids\s*=\s*True/.test(head);
}

function assemblyStageSnippet(plan: PcbAssemblyStagePlan): string {
  return (
    `\n--- ASSEMBLY STAGE PLAN (required multi-stage export) ---\n` +
    `${JSON.stringify(plan, null, 2)}\n--- END ASSEMBLY STAGE PLAN ---\n`
  );
}

/**
 * Accepts literal `save_svg("stage_0", ...)` *or* the documented loop pattern
 * `for i, refs in enumerate(STAGES): ... save_svg(f"stage_{i}", ...)` (no literal `stage_0` in source).
 */
function scriptDeclaresStageSvgSaves(script: string, stageCount: number): boolean {
  if (stageCount <= 0) return true;
  let literalsOk = true;
  for (let i = 0; i < stageCount; i++) {
    if (!script.includes(`stage_${i}`)) {
      literalsOk = false;
      break;
    }
  }
  if (literalsOk) return true;

  const hasStagesTable = /\bSTAGES\s*=/.test(script);
  const hasStagesLoop =
    /\benumerate\s*\(\s*STAGES\s*\)/.test(script) ||
    /\brange\s*\(\s*len\s*\(\s*STAGES\s*\)\s*\)/.test(script);
  const hasIndexedStageSave =
    /save_svg\s*\(\s*f["']stage_\{[a-zA-Z_]\w*\}["']/.test(script) ||
    /save_svg\s*\(\s*["']stage_["'][\s\n]*\+[\s\n]*str\s*\(/.test(script) ||
    /save_svg\s*\(\s*["']stage_%/.test(script) ||
    /save_svg\s*\(\s*["']stage_\{\}["'][\s\n]*\.[\s\n]*format\s*\(/.test(
      script,
    );

  return Boolean(hasStagesTable && hasStagesLoop && hasIndexedStageSave);
}

export type PcbflowScriptResult =
  | { ok: true; script: string; stagesFallback?: false }
  | { ok: true; script: string; stagesFallback: true; stagesFallbackReason: string }
  | { ok: false; error: string };

export async function generatePcbflowPythonScript(params: {
  openai: OpenAI;
  specification: string;
  projectName: string;
  assemblyPlan: PcbAssemblyStagePlan;
}): Promise<PcbflowScriptResult> {
  const model =
    process.env.NODE0_PCBFLOW_MODEL?.trim() || "gpt-4o";

  const multiStage = params.assemblyPlan.stages.length >= 2;

  const userContent = (fixHint: string | null, includeStages = true) =>
    `Project: ${params.projectName}

Implement this PCB specification exactly (board dimensions, components, nets). Follow the **DETAILED BUILD ORDER** and the **Example A / Example B** patterns in the system message${includeStages && multiStage ? ", or **Example C** when a stage plan is provided" : ""}. Use **only** allowlisted classes; map MCU→QFN64, 2PTH→SIL with val=2, LED_1206→R1206, etc.
${includeStages && multiStage ? assemblyStageSnippet(params.assemblyPlan) : ""}
--- SPECIFICATION ---
${params.specification}
--- END SPECIFICATION ---
${fixHint ? `\n--- FIX REQUIRED ---\n${fixHint}\n--- END FIX ---\n` : ""}
Generation nonce (each run must be a distinct valid layout — vary placement and routing while satisfying the spec; do not emit a generic boilerplate board): ${randomUUID()}
Generate the complete runnable Python script now.`;

  async function tryGenerate(opts: {
    requireStages: boolean;
    maxAttempts: number;
  }): Promise<PcbflowScriptResult> {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: SYSTEM },
      { role: "user", content: userContent(null, opts.requireStages) },
    ];

    for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
      const completion = await params.openai.chat.completions.create({
        model,
        temperature: 0.55,
        max_completion_tokens: 8192,
        messages,
      });

      const text = completion.choices[0]?.message?.content?.trim();
      if (!text) {
        return { ok: false, error: "OpenAI returned empty PCBFlow script." };
      }

      const script = extractPythonSource(text);
      if (!script.includes("pcbflow") && !script.includes("Board")) {
        return {
          ok: false,
          error: "Model output does not look like pcbflow Python (missing Board/pcbflow).",
        };
      }
      if (/os\.system|subprocess\.|import\s+subprocess|socket\.|urllib/u.test(script)) {
        return {
          ok: false,
          error: "Generated script contains disallowed imports or calls (os.system/subprocess/network).",
        };
      }
      if (hasStringAsAddPartFootprint(script)) {
        if (attempt < opts.maxAttempts - 1) {
          messages.push({ role: "assistant", content: text });
          messages.push({
            role: "user",
            content: userContent(
              "brd.add_part's second argument must be a class name (e.g. R0603), not a string. Regenerate the full script.",
              opts.requireStages,
            ),
          });
          continue;
        }
        return {
          ok: false,
          error: "Generated script passes a string as add_part footprint (invalid).",
        };
      }

      if (hasSilWithNonNumericVal(script)) {
        if (attempt < opts.maxAttempts - 1) {
          messages.push({ role: "assistant", content: text });
          messages.push({
            role: "user",
            content: userContent(
              "For SIL / SIL_2mm, val must be an integer pin count (e.g. val=2 for a 2-wire sensor), never a quoted description string. See Example A in the system message. Regenerate the full script.",
              opts.requireStages,
            ),
          });
          continue;
        }
        return {
          ok: false,
          error: "SIL used with string val= (must be integer pin count).",
        };
      }

      const brokenTssop = findBrokenTssopFootprints(script);
      if (brokenTssop.length > 0) {
        if (attempt < opts.maxAttempts - 1) {
          messages.push({ role: "assistant", content: text });
          messages.push({
            role: "user",
            content: userContent(
              `pcbflow raises KeyError when placing ${brokenTssop.join(", ")} (TSSOP.place only supports N=14 and N=20 in this library). ` +
                `Fix: SOT-223 LDOs → SOT223, not TSSOP*. 16-pin ICs → QFN64 + brd.add_text (never brd.add_part with DIP*). ` +
                `Only use TSSOP14 or TSSOP20 for actual 14/20-pin TSSOPs. Regenerate the full script.`,
              opts.requireStages,
            ),
          });
          continue;
        }
        return {
          ok: false,
          error: `pcbflow cannot place ${brokenTssop.join(", ")} (upstream TSSOP KeyError). Use TSSOP14/TSSOP20, SOT223 for LDOs, QFN64 for other ICs.`,
        };
      }

      if (hasDipViaAddPart(script)) {
        if (attempt < opts.maxAttempts - 1) {
          messages.push({ role: "assistant", content: text });
          messages.push({
            role: "user",
            content: userContent(
              "pcbflow: never use brd.add_part((x,y), DIP8|DIP14|DIP16|DIP20, ...) — Board.add_part always passes val=None, which collides with DIP's fixed pin count and raises TypeError (multiple values for keyword argument 'val'). " +
                "Use QFN64 + brd.add_text for multi-pin IC placeholders, SOT223 for SOT-223 regulators, SIL for headers. Regenerate the full script.",
              opts.requireStages,
            ),
          });
          continue;
        }
        return {
          ok: false,
          error:
            "pcbflow: DIP* cannot be used as the second argument to brd.add_part (val kwarg collision). Use QFN64, SOT223, SIL, passives, TSSOP14/TSSOP20, SOIC8 only.",
        };
      }

      const bad = findDisallowedPartClasses(script);
      if (bad.length > 0) {
        if (attempt < opts.maxAttempts - 1) {
          messages.push({ role: "assistant", content: text });
          messages.push({
            role: "user",
            content: userContent(
              `These footprint names are NOT defined in pcbflow and will crash: ${bad.join(", ")}. ` +
                `Replace each with an allowlisted class (e.g. QFN64 for MCUs, TSSOP14 or TSSOP20 only if pin count matches, SOT223 for SOT-223 LDOs, never DIP* with add_part, R0603/C0603 for passives, SIL for headers) and use brd.add_text for labels. Output the full corrected script.`,
              opts.requireStages,
            ),
          });
          continue;
        }
        return {
          ok: false,
          error: `Undefined pcbflow footprint class(es): ${bad.join(", ")}. Allowed: ${ALLOWLIST_DOC}`,
        };
      }

      const badRefs = findMultiCharRefPrefixes(script);
      if (badRefs.length > 0) {
        if (attempt < opts.maxAttempts - 1) {
          messages.push({ role: "assistant", content: text });
          messages.push({
            role: "user",
            content: userContent(
              `pcbflow save_bom crashes on ref designators with multi-letter prefixes (it does int(name[1:])). ` +
                `These refs are invalid: ${badRefs.join(", ")}. ` +
                `Fix: use SINGLE-letter prefix + number only: R1 (resistor), C1 (cap), U1 (IC), J1 (connector), L1 (inductor), D1 (diode/LED), Q1 (transistor), S1 (switch/sensor), X1 (crystal), T1 (transformer). ` +
                `Never SW1 (use S1), never LED1 (use D1), never MOT1 (use M1). Regenerate the full script.`,
              opts.requireStages,
            ),
          });
          continue;
        }
        return {
          ok: false,
          error: `pcbflow ref designators with multi-char prefix crash save_bom: ${badRefs.join(", ")}. Use single-letter prefix (R, C, U, J, L, D, Q, S, X, M) + number.`,
        };
      }

      if (missingGndFillLayers(script)) {
        if (attempt < opts.maxAttempts - 1) {
          messages.push({ role: "assistant", content: text });
          messages.push({
            role: "user",
            content: userContent(
              "The script must call brd.fill_layer(\"GTL\", \"GND\") and brd.fill_layer(\"GBL\", \"GND\") after brd.add_outline() so the SVG shows filled copper—not wireframe-only. Regenerate the full script with both pours and save_svg.",
              opts.requireStages,
            ),
          });
          continue;
        }
        return {
          ok: false,
          error:
            "Generated script missing GTL/GBL GND fill_layer calls (required for professional SVG output).",
        };
      }

      if (finalSaveMissingCentroidsTrue(script)) {
        if (attempt < opts.maxAttempts - 1) {
          messages.push({ role: "assistant", content: text });
          messages.push({
            role: "user",
            content: userContent(
              "The final brd.save(\"out\", ...) call must include centroids=True (not False). The host app reads out/out-centroids.csv for real part XY in mm; silk in the SVG is not parseable as <text> refs.",
              opts.requireStages,
            ),
          });
          continue;
        }
        return {
          ok: false,
          error:
            "Generated script must call brd.save(..., centroids=True) on the final \"out\" export.",
        };
      }

      if (opts.requireStages && multiStage) {
        const n = params.assemblyPlan.stages.length;
        if (!scriptDeclaresStageSvgSaves(script, n)) {
          if (attempt < opts.maxAttempts - 1) {
            messages.push({ role: "assistant", content: text });
            messages.push({
              role: "user",
              content: userContent(
                `Multi-stage export is required. Follow **Example C** exactly: define a PARTS dict, a STAGES list of cumulative ref lists from the plan, and a build_board(refs) helper. Then: for i, refs in enumerate(STAGES): brd = build_board(refs); brd.save_svg(f"stage_{i}", in_subdir=True). ` +
                  `The script must produce stage_0 through stage_${n - 1}. Every add_part must pass ref="DESIGNATOR". Regenerate the FULL script now.`,
                opts.requireStages,
              ),
            });
            continue;
          }
          return {
            ok: false,
            error: `Multi-stage pcbflow script missing stage_0…stage_${n - 1} save_svg exports.`,
          };
        }
      }

      return { ok: true, script };
    }

    return { ok: false, error: "PCBFlow codegen exhausted retries." };
  }

  try {
    if (multiStage) {
      const staged = await tryGenerate({ requireStages: true, maxAttempts: 3 });
      if (staged.ok) return staged;
      const fallback = await tryGenerate({ requireStages: false, maxAttempts: 2 });
      if (fallback.ok) {
        return {
          ok: true,
          script: fallback.script,
          stagesFallback: true,
          stagesFallbackReason: staged.error,
        };
      }
      return fallback;
    }
    return tryGenerate({ requireStages: false, maxAttempts: 3 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `PCBFlow codegen failed: ${msg}` };
  }
}
