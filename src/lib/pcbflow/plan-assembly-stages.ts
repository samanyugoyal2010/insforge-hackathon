import type OpenAI from "openai";

export type PcbAssemblyStagePlan = {
  stages: Array<{ label: string; refs: string[] }>;
};

const PLANNER_SYSTEM = `You are a PCB assembly planning assistant. Given a PCB specification (with BOM / component list), split the build into 4–6 **cumulative** assembly stages for teaching and AR previews.

Output **only** valid JSON (no markdown) with this exact shape:
{"stages":[{"label":"short human label","refs":["R1","C2"]}]}

Rules:
- **4 to 6** stages when the BOM has enough parts; if only 1–3 parts, use that many stages (each cumulative).
- Prefer more granular stages so each step adds 1–3 components — this makes the AR assembly guide easier to follow.
- **Cumulative**: stages[0].refs is the first batch only; stages[1].refs includes every ref from stages[0] plus new ones; … the **last** stage’s refs must list **every** component designator that appears in the BOM (same spelling as in the spec: R1, C3, U2, LED1, J1, etc.).
- Order stages in a natural solder order: passives and small parts first, then ICs, then connectors/mechanical last (when possible).
- If the spec lists no discrete parts, return {"stages":[{"label":"Board","refs":[]}]}.
`.trim();

function parseStagePlan(raw: string): PcbAssemblyStagePlan | null {
  const t = raw.trim();
  const tryParse = (s: string): PcbAssemblyStagePlan | null => {
    try {
      const j = JSON.parse(s) as unknown;
      if (!j || typeof j !== "object" || !Array.isArray((j as PcbAssemblyStagePlan).stages)) {
        return null;
      }
      const stages = (j as PcbAssemblyStagePlan).stages
        .filter((st) => st && typeof st === "object")
        .map((st) => ({
          label: typeof st.label === "string" ? st.label : "Stage",
          refs: Array.isArray(st.refs)
            ? st.refs.filter((r): r is string => typeof r === "string" && r.trim().length > 0)
            : [],
        }));
      if (stages.length === 0) return null;
      return { stages };
    } catch {
      return null;
    }
  };
  const direct = tryParse(t);
  if (direct) return direct;
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  return tryParse(t.slice(start, end + 1));
}

/**
 * Plans 4–6 cumulative assembly ref sets **before** pcbflow Python codegen so the
 * generated script can export distinct SVGs per stage (different visible models).
 */
export async function planPcbAssemblyStages(params: {
  openai: OpenAI;
  specification: string;
  projectName: string;
}): Promise<{ ok: true; plan: PcbAssemblyStagePlan } | { ok: false; error: string }> {
  const model =
    process.env.NODE0_PCBFLOW_STAGE_PLAN_MODEL?.trim() ||
    process.env.NODE0_PCBFLOW_MODEL?.trim() ||
    "gpt-4o";

  try {
    const completion = await params.openai.chat.completions.create({
      model,
      temperature: 0.35,
      max_completion_tokens: 2048,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: PLANNER_SYSTEM },
        {
          role: "user",
          content: `Project: ${params.projectName}

--- PCB SPECIFICATION ---
${params.specification}
--- END ---

Return JSON only: {"stages":[{"label":"...","refs":["R1"]}]}`,
        },
      ],
    });

    const text = completion.choices[0]?.message?.content?.trim();
    if (!text) {
      return { ok: false, error: "Stage planner returned empty output." };
    }
    const plan = parseStagePlan(text);
    if (!plan) {
      return { ok: false, error: "Stage planner returned invalid JSON." };
    }
    return { ok: true, plan };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
