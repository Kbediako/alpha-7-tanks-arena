# Alpha-7 Tanks Arena

Alpha-7 Tanks Arena is a mobile-first browser multiplayer 3D battle royale tank game. Players choose a tank, join quick play or a coded lobby, fight in a seeded procedural concrete maze, survive the danger zone, collect pickups, and play until the last tank remains.

## Stack

- Monorepo: pnpm workspaces
- Client: Vite, React, TypeScript, three.js, Colyseus client
- Server: Node.js, TypeScript, Express, Colyseus
- Shared: TypeScript constants, schemas, procedural generation, gameplay config
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

Copy `.env.example` into the repo root for local development, or set the same variables in Railway/Netlify.

Server variables:

```txt
PORT
NODE_ENV
ALLOWED_ORIGINS
PUBLIC_CLIENT_URL
MAX_PLAYERS
DEMO_MAX_PLAYERS
ROOM_TICK_RATE
ROOM_PATCH_RATE
ROOM_AUTO_START_SECONDS
ENABLE_BOTS
LOG_LEVEL
```

Client variables:

```txt
VITE_WS_URL
VITE_HTTP_API_URL
VITE_BUILD_VERSION
VITE_DEBUG
```

## Running Locally

Use `pnpm dev` to run the server and client together. The client connects to `VITE_WS_URL`, which defaults to `ws://localhost:2567`.

To open on a phone locally:

1. Connect the phone and development machine to the same network.
2. Start with `pnpm dev`; the client is served with `--host 0.0.0.0`.
3. Find your machine LAN IP, then open `http://<LAN-IP>:5173` on the phone.
4. Set `PUBLIC_CLIENT_URL` and `ALLOWED_ORIGINS` to include that LAN URL if testing strict origin behavior.

## Game Flow

Quick play:

1. Enter a callsign.
2. Select Nova, Atlas, Quill, or Rook.
3. Tap Quick Play.
4. Ready up in the lobby and start the countdown when enough players are present.

Private room code:

1. Tap Private to create a coded lobby.
2. Copy/share the displayed room code.
3. Other players enter the code exactly as shown and tap Join.

Public lobby:

1. Tap Public to create a public room.
2. Share the displayed room ID if joining directly.
3. Quick Play can match players into public waiting rooms.

## Editor

The internal editor/viewer is served at `/editor` when the client editor route is enabled. It is intended for seeded arena inspection, spawn/pickup/zone overlays, tank preview checks, mobile safe-zone previews, and copying exported map config.

## Design Sources

Implementation follows `Docs/DESIGN.md` tokens and guidance, with visual reference from `Docs/Design Kit/*.png`. If PNG references conflict with `DESIGN.md`, `DESIGN.md` is treated as normative unless a PNG is explicitly marked newer.

## Asset Replacement

Asset manifest: `apps/client/public/assets/manifest.json`

Replacement folders:

- UI icons: `apps/client/public/assets/ui/icons/`
- Tank models/textures: `apps/client/public/assets/tanks/`
- Map materials: `apps/client/public/assets/maps/`
- Texture atlases: `apps/client/public/assets/textures/`
- FX sprites: `apps/client/public/assets/fx/`
- Audio: `apps/client/public/assets/audio/`
- Generated assets: `apps/client/public/assets/generated/`

Gameplay must keep working when assets are missing. The renderer uses procedural tank meshes, concrete materials, particles, and HUD symbols as fallbacks. Ambient music is loaded from the manifest and starts after the first user gesture so mobile browsers permit playback.

Generated asset notes belong in `apps/client/public/assets/generated/README.md` and `THIRD_PARTY_NOTICES.md`.

## Railway Deployment

Railway uses `railway.toml`.

Build command:

```bash
pnpm install --frozen-lockfile && pnpm build:shared && pnpm build:server
```

Start command:

```bash
pnpm --filter @alpha7/server start
```

Required Railway variables:

```txt
PORT
NODE_ENV=production
ALLOWED_ORIGINS=https://<your-netlify-site>
PUBLIC_CLIENT_URL=https://<your-netlify-site>
DEMO_MAX_PLAYERS=8
ROOM_TICK_RATE=30
ROOM_PATCH_RATE=20
ROOM_AUTO_START_SECONDS=12
ENABLE_BOTS=false
LOG_LEVEL=info
```

Healthcheck path: `/healthz`

## Netlify Deployment

Netlify uses `netlify.toml`.

Build command:

```bash
pnpm install --frozen-lockfile && pnpm build:shared && pnpm build:client
```

Publish directory:

```txt
apps/client/dist
```

Required Netlify variables:

```txt
VITE_WS_URL=wss://<your-railway-host>
VITE_HTTP_API_URL=https://<your-railway-host>
VITE_BUILD_VERSION=<release-or-commit-sha>
VITE_DEBUG=false
```

The Netlify config includes SPA fallback to `index.html`.

## Mobile Demo Checklist

- Open the public client link on iPhone Safari and Android Chrome.
- Confirm no page scroll, pull-to-refresh, pinch zoom, or address-bar layout jump during play.
- Confirm left joystick, right aim/fire, and ability controls are reachable by thumbs.
- Confirm touch targets are at least 44 px.
- Test portrait and landscape orientation changes.
- Confirm HUD panels avoid notches and home indicators via safe-area insets.
- Confirm the center combat area stays clear.
- Confirm the game remains readable at 30 FPS target on common phones.

## Multiplayer QA Checklist

- Two-browser local match: create lobby, join second client, ready/start, move both tanks.
- Private room code: create private lobby and join by exact code.
- Public/quick play: quick join into a public waiting room.
- Late join: verify locked active rooms reject active-player admission.
- Disconnect: close one client during an active match and verify alive count/state update.
- Reconnect/error: verify user-facing error message and recoverable leave/play-again path.
- Combat/endgame: verify projectile damage, death/spectate, winner, results, and rematch when those systems are enabled.
- Server authority: verify client sends intents only and server owns movement, damage, pickups, zone, death, and winner state.

## Known Limitations

- The current client production bundle emits a Vite warning because the main JS chunk exceeds 500 kB after minification; this is a performance follow-up for manual chunks/code splitting.
- Art is intentionally procedural/placeheld; replacement assets should be added through the manifest.
- `Docs/SPEC.md` is not present in this checkout, so implementation uses `Docs/PRD.md`, `Docs/DESIGN.md`, `Docs/prompt.md`, and the design-kit PNGs as authority.
- Mobile device testing has not been completed on physical phones in this environment unless noted in `progress.md`.

## Notices

Third-party references, fonts, placeholder assets, and the permitted realtime tanks reference are documented in `THIRD_PARTY_NOTICES.md` and `REFERENCES.md`.
