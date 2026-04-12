# Node0 (`biro-bun`)

Node0 is a Next.js workspace for **AI-assisted hardware projects**: mechanical CAD (OpenCSG / OpenSCAD), PCB artifacts (PCBFlow + optional Circuitron path), BOM, firmware drafts, and ordering hooks.

## Requirements

- **Node** 20+ (or Bun)
- **Python 3** with the PCBFlow venv when using `npm run test:pcbflow` (see `scripts/setup-pcbflow-venv.sh`)
- **Circuitron** (optional): Python package or `CIRCUITRON_BIN`, plus MCP / KiCad Docker as described in `src/lib/circuitron/config.ts`

## Environment

Copy and fill values your features need:

| Variable | Purpose |
|----------|---------|
| `OPENAI_API_KEY` | Agent + PCBFlow script generation |
| `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY`) | Auth + workspace sync |
| `STRIPE_SECRET_KEY` / related Stripe vars | Checkout + orders |
| `MCP_URL` or `CIRCUITRON_MCP_URL` | Circuitron MCP |
| `CIRCUITRON_SKIP_MCP_CHECK=1` | Skip MCP probe (local dev only) |

## Deploy (Vercel)

1. Import the repo; leave the default **Next.js** framework preset (build: `npm run build`, output: Next).
2. Set the environment variables your features need (see table above). For production, set `NEXT_PUBLIC_APP_URL` to your Vercel URL (used by Stripe return URLs when configured).
3. **Circuitron / PCBFlow**: serverless functions have no local Python venv or Docker. `/api/pcb/generate` and Circuitron routes need a compatible remote setup (MCP, `CIRCUITRON_BIN`, etc.) or they will fail at runtime despite a green build.
4. Long routes use `maxDuration` (up to 900s on Pro); Hobby plans enforce lower limits.

## Deploy (Render) — Next.js + Python (hackathons / judges)

Use this when you need **PCBFlow’s Python venv** in production (unlike Vercel serverless).

1. Push this repo to GitHub (or GitLab / Bitbucket Render supports).
2. In [Render](https://dashboard.render.com): **New → Blueprint** → select the repo → confirm `render.yaml` (or **New → Web Service**, connect repo, **Environment: Docker**, Dockerfile path `./Dockerfile`).
3. **Health check path:** `/` (fast static page). Avoid `/api/health` as the deploy health check if Circuitron isn’t configured—it runs extra probes.
4. Under **Environment**, add secrets your demo needs, for example:
   - `OPENAI_API_KEY`
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `NEXT_PUBLIC_APP_URL` → your Render URL, e.g. `https://node0.onrender.com` (Stripe return URLs if used)
   - Optional: `CIRCUITRON_SKIP_MCP_CHECK=1` only if you accept skipping MCP probe for a short demo
5. **Free tier:** service **spins down** after idle; first load after sleep can take **~30–60s**. Open the site once before judging or keep a tab open during the window.

**Local Docker (optional):**

```bash
docker build -t node0 .
docker run --rm -p 3000:3000 -e OPENAI_API_KEY=sk-... node0
```

## Commands

```bash
npm install
npm run dev
```

Diagnostic (no secrets returned):

```bash
curl -s http://localhost:3000/api/health | jq
```

Direct PCB probe (Circuitron subprocess):

```bash
curl -s -X POST http://localhost:3000/api/pcb/generate \
  -H 'content-type: application/json' \
  -d '{"prompt":"Simple 5V LED with resistor"}' | jq
```

## Architecture (short)

- `src/app/api/ai/chat` — streaming agent loop + tools (`update_cad`, `update_pcb`, …)
- `src/lib/pcbflow` — LLM-generated Python + local run, logical schematic SVG
- `src/lib/circuitron` — optional KiCad/SKiDL pipeline, **ERC report ingestion** (`designValidation` on responses)
- `src/components/retrowave-workspace.tsx` — dashboard shell, PCB viewer, validation banners

## ERC / electrical checks

When `.erc` artifacts exist, the API adds `designValidation` (pass / warn / fail / unknown) and the PCB panel surfaces a short summary—aimed at **real-world bring-up**, not just pretty previews.
