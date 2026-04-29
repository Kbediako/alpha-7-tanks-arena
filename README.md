# Alpha-7 Tanks Arena

Alpha-7 Tanks Arena is a mobile-first browser multiplayer 3D battle royale tank game. Players choose a tank, join quick play or a coded lobby, fight in a seeded procedural concrete maze, survive the danger zone, collect pickups, and play until the last tank remains.

## Stack

- Monorepo: pnpm workspaces
- Client: Vite, React, TypeScript, three.js, Colyseus client
- Server: Node.js, TypeScript, Express, Colyseus
- Shared: TypeScript constants, schemas, procedural generation, gameplay rules
- Deployment: Railway server, Netlify client

## Local Setup

```bash
pnpm install
pnpm dev
```

Client: http://localhost:5173  
Server health: http://localhost:2567/healthz

## Scripts

```bash
pnpm dev
pnpm dev:client
pnpm dev:server
pnpm build
pnpm build:client
pnpm build:server
pnpm typecheck
pnpm test
pnpm check
pnpm start
```

## Environment

Copy `.env.example` into the appropriate local or hosting environment. Client variables must be prefixed with `VITE_`.

## Design Sources

Implementation follows `Docs/DESIGN.md` tokens and guidance, with visual reference from `Docs/Design Kit/*.png`. If PNG references conflict with `DESIGN.md`, `DESIGN.md` is treated as normative unless a PNG is explicitly marked newer.

## Deployment

Railway builds shared + server and runs `pnpm --filter @alpha7/server start`. Netlify builds shared + client and publishes `apps/client/dist` with SPA fallback to `index.html`.

## Known Limitations

This repository is being built in phased checkpoints. The first scaffold only proves the workspace, health endpoint, and client shell; gameplay, lobby flow, editor, assets, and QA coverage are layered in later commits.

