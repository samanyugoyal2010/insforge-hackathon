# VirtualStage

iPhone-powered virtual tours for real estate. Walk through a property, upload panorama photos, get a shareable 360° tour with furniture staging.

## Stack
- Next.js 16 (App Router)
- @insforge/sdk — database, storage
- Three.js + @react-three/fiber + @react-three/drei — panorama viewer
- Tailwind CSS

## InsForge Project
- Host: https://xi93yn8k.us-east.insforge.app
- Linked via: `.insforge/project.json`

## Dev
```bash
npm run dev     # localhost:3000
npm run build   # verify before deploy
```

## Key Routes
- `/` — landing page
- `/capture` — mobile iPhone upload flow
- `/tour/[id]` — 360° panorama viewer
- `/tour/[id]/stage` — furniture staging editor

## Backend CLI Tasks
```bash
npx @insforge/cli db migrations up --all   # apply schema changes
npx @insforge/cli storage buckets          # list storage buckets
npx @insforge/cli db tables               # inspect schema
npx @insforge/cli diagnose                 # health check
```
