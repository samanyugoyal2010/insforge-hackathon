# Node0 — Next.js + PCBFlow Python venv (Render, local Docker, etc.)
FROM node:22-bookworm-slim AS runner

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    python3 \
    python3-venv \
    python3-pip \
    git \
    ca-certificates \
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libgdk-pixbuf-2.0-0 \
    libffi8 \
    shared-mime-info \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json .npmrc ./

RUN npm ci

COPY requirements-pcbflow.txt ./

# Same stack as `npm run setup:pcbflow` — used by `/api/pcb/generate`
RUN python3 -m venv .venv-pcbflow \
  && .venv-pcbflow/bin/pip install --no-cache-dir -U pip wheel \
  && .venv-pcbflow/bin/pip install --no-cache-dir \
    "shapely>=2.0.1" \
    "git+https://github.com/michaelgale/pcbflow.git"

COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# NEXT_PUBLIC_* is inlined at build time. Defaults allow `docker build` without a .env;
# override on Render (dashboard env / build args) with your real Supabase project values.
ARG NEXT_PUBLIC_SUPABASE_URL=https://build-placeholder.supabase.co
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=build-placeholder-publishable-key
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

RUN npm run build \
  && npm prune --omit=dev

EXPOSE 3000

ENV NODE0_PYTHON=/app/.venv-pcbflow/bin/python3

CMD ["npm", "run", "start"]
