# PRD.md

# Alpha-7 Tanks Arena — Product Requirements Document

## 1. Product Name

**Alpha-7 Tanks Arena**

## 2. One-Sentence Pitch

A mobile-first, browser-playable 3D battle royale tank arena where players instantly join a shared link, choose a tactical tank archetype, fight through procedural concrete mazes, collect pickups, survive a shrinking danger zone, and battle until the last tank remains.

## 3. Full Product Goal

Build a polished, full-featured multiplayer tank battler for live demos and public play sessions. The product must feel like a complete browser game, not a small prototype: it needs matchmaking, lobbies, room codes, mobile controls, desktop controls, procedural maps, safe-zone pressure, combat, pickups, abilities, spectator flow, results, rematch, deployment readiness, and an Alpha-7 visual identity driven by `DESIGN.md`.

The core game should recreate the useful gameplay foundation of the permitted Colyseus realtime tanks demo, then expand it into a modern Alpha-7 battle royale experience using a fresh repository, fresh git history, and new design implementation.

## 4. Live Demo Goal

Many people should be able to open one public link on their phones, enter a name, choose a tank, join quickly, and play together with stable real-time multiplayer.

A successful demo means:

- Players can join from iPhone Safari and Android Chrome.
- Players can use touch controls without explanation-heavy onboarding.
- The game starts quickly with random matchmaking or a lobby code.
- At least 8 players can play in one room for the recommended demo configuration.
- The HUD remains readable while preserving the center combat area.
- A complete match can progress from lobby to countdown to combat to danger zone to final winner to rematch.
- Deployment works with Railway for the server and Netlify for the client.

## 5. Target Users

| User | Need | Product Response |
|---|---|---|
| Live demo participants | Join fast from a phone and understand controls immediately. | Quick play, mobile-first controls, readable HUD, simple tank select. |
| Competitive casual players | Skillful real-time combat and fair battle royale pressure. | Authoritative movement/combat, procedural maps, safe zone, pickups, abilities. |
| Event host / presenter | Run a reliable room for many people without manual setup. | Public/private lobbies, join by code, demo cap, debug room/seed display. |
| Developers/designers | Iterate on maps, controls, visuals, and deployment quickly. | Monorepo, shared config, internal editor/viewer, tests, clear docs. |
| Desktop players | Play with familiar keyboard/mouse controls. | WASD/arrow movement, mouse aim, click fire, keyboard ability shortcuts. |

## 6. Target Devices

Mobile is mandatory and first-class.

| Device Class | Requirement |
|---|---|
| iPhone Safari | Required. Portrait and landscape must be playable. |
| Android Chrome | Required. Portrait and landscape must be playable. |
| Tablets | Required as a larger mobile layout. |
| Desktop Chrome/Edge/Firefox/Safari | Required for development and desktop play. |
| Low/mid-range phones | Must target stable 30 FPS with simple meshes/materials and a demo player cap of 8. |

## 7. Technology Decisions

| Area | Decision |
|---|---|
| Client rendering | **three.js + TypeScript + Vite** |
| Server | **Node.js + TypeScript + Colyseus** |
| Shared logic | Shared TypeScript package for schema, types, constants, game config, procedural generation, and deterministic helpers |
| Repository | Fresh monorepo with fresh git history |
| Package manager | Recommend **pnpm workspaces** |
| Deployment | Railway server, Netlify client |
| Multiplayer authority | Server authoritative; client sends input/intents only |
| Room name | `battle_royale` |
| Design source | `DESIGN.md` YAML tokens and markdown guidance, plus design kit/screenshots as visual references |

## 8. Design Direction

Alpha-7 Tanks Arena must feel like a quiet, high-end industrial instrument panel over a tactical concrete arena.

Use `DESIGN.md` as source of truth:

- Gameplay canvas fills the viewport.
- HUD floats over gameplay using translucent panels.
- Use warm concrete/slate palette.
- Use one high-salience orange accent for threat, active state, objective, selected state, urgent count, and key action.
- Use Rajdhani for display/headings, Inter for body, IBM Plex Mono for data/labels.
- Preserve center combat visibility.
- Use thin borders, soft blur, 8-point grid, compact hardware-like panels.
- Screenshots and design kit are visual examples; if they conflict with `DESIGN.md`, prefer `DESIGN.md` unless explicitly marked newer.

Canonical HUD components:

- `game-shell`
- `game-canvas`
- `hud-layer`
- `minimap-panel`
- `match-header`
- `scoreboard-panel`
- `tank-status-card`
- `weapon-strip`
- `ability-dock`
- Mobile compact variants

## 9. Core Gameplay Loop

1. Player opens public link.
2. Player enters display name.
3. Player selects a tank archetype:
   - Nova — assault
   - Atlas — balanced
   - Quill — skirmisher
   - Rook — support
4. Player chooses:
   - Quick Play
   - Create Public Lobby
   - Create Private Lobby
   - Join Lobby by Code
5. Lobby waiting room shows room code, players, selected tanks, ready state, and match settings.
6. Countdown starts when enough players are ready or host starts.
7. Players spawn into a seeded procedural maze arena.
8. Players move, aim turret, shoot, use abilities, collect pickups, and avoid danger zone.
9. Safe zone shrinks through timed phases.
10. Destroyed players enter spectator mode.
11. Last alive tank wins.
12. Results screen shows winner, placement, kills, damage, survival time, and rematch/play again options.

## 10. Full Feature Target Scope

This is a full feature-rich build, not a tiny demo slice. Implementation should still sequence work to reach playable vertical slices early, but the target scope is complete.

### 10.1 Multiplayer and Match Flow

Required:

- Random matchmaking / quick play.
- Public rooms.
- Private rooms.
- Join private lobby by room code.
- Lobby waiting room.
- Room code display.
- Match countdown.
- Server-owned match state.
- Server-owned seed/config.
- Match states:
  - `waiting`
  - `countdown`
  - `running`
  - `danger`
  - `final_zone`
  - `finished`
- Room locks once match starts.
- Spectator mode after death.
- Results and winner screen.
- Rematch / play again flow.
- Reconnect and error states.

### 10.2 Battle Royale Gameplay

Required:

- Last tank standing win condition.
- Procedural maze maps.
- Deterministic seeded generation.
- Server owns seed and map config.
- Client renders from synced map config.
- Safe zone / danger zone shrinks over time.
- Zone damage outside safe area.
- Sudden death / final zone.
- Pickups.
- Abilities.
- Multiple tank archetypes.

### 10.3 Tank Combat

Required:

- Tanks move and rotate.
- Turrets aim independently from hull.
- Cannon fire.
- Machine gun or light cannon fire.
- Projectile collisions.
- Health and damage.
- Armor/shield.
- Ammo and cooldowns.
- Active weapon.
- Active ability.
- Death and placement assignment.
- Kill credit and damage stats.

### 10.4 Tank Archetypes

Required:

| Tank | Role | Fantasy | Gameplay |
|---|---|---|---|
| Nova | Assault | Frontline brawler | High burst damage, moderate survivability, aggressive pressure. |
| Atlas | Balanced | Reliable baseline | Even firepower, armor, speed, and easy handling. |
| Quill | Skirmisher | Fast flanker | High speed, low profile, lower health, strong repositioning. |
| Rook | Support | Durable utility | Higher armor, repair/control tools, slower but stable. |

### 10.5 Pickups

Required:

- Health repair.
- Shield/armor.
- Ammo / rapid fire.
- Speed boost.
- Smoke.
- Barrage or explosive boost if feasible.
- Ability charge.

### 10.6 Abilities

Required:

- Smoke.
- Repair.
- Dash/speed burst or shield pulse.
- Barrage/area strike if feasible.

### 10.7 Input

Required:

Mobile:

- Left virtual joystick for movement.
- Right aim/fire control or drag-to-aim with fire button.
- Compact ability dock.
- Weapon switch/reload/ability controls.
- Tap target size >= 44px.
- Safe-area inset support.
- Orientation change support.
- Prevent page scroll/zoom while playing.
- HUD must avoid center combat area.

Desktop:

- WASD/arrow key movement.
- Mouse aim.
- Click/tap fire.
- Keyboard shortcuts for abilities.
- Keyboard hints displayed in the UI.

### 10.8 Internal Editor / Viewer

Required practical tool route, not a massive custom engine editor:

- Route: `/editor`
- Enter seed.
- Reroll seed.
- Visualize procedural maze.
- Visualize wall/floor layout.
- Visualize spawn points.
- Visualize pickup locations.
- Visualize safe zone phases.
- Preview tank skins.
- Toggle collision/debug overlays.
- Preview mobile HUD safe zones.
- Simulate player count and spawn placement.
- Copy/export map config.

### 10.9 Deployment

Required:

- Railway server deployment.
- Netlify client deployment.
- Environment variables documented.
- Health endpoint.
- WebSocket URL configuration.
- CORS configuration.
- Production build scripts.
- Preview deployment checklist.

## 11. Optional Polish Scope

These are desirable after required Full Feature Target systems are stable:

| Polish Area | Examples |
|---|---|
| Presentation | Loading screen art, hero image, animated tank select, richer result screen. |
| VFX | Better muzzle flashes, projectile trails, impact sparks, smoke, track marks, damage states. |
| Audio | Cannon shots, MG fire, engine hum, pickup sounds, zone warning, UI ticks. |
| Social | Player emotes/pings, quick chat, host controls. |
| Match Tuning | Multiple map size presets, advanced zone curves, custom room settings. |
| Spectator | Follow target, free camera, minimap spectating. |
| Analytics | Room count, join success, average FPS/latency debug capture. |
| Accessibility | Reduced motion, scalable HUD, high contrast mode. |

## 12. Non-Goals

- No native mobile app build.
- No blockchain, accounts, inventory economy, or persistent progression for the demo build.
- No complex destruction physics.
- No client-authoritative combat or damage.
- No heavy cinematic menus that block gameplay visibility.
- No permanent center-screen HUD panels during active combat.
- No forked reference repository.
- No upstream remote pointing at the reference repo.
- No direct edits to the reference repo.
- No large bespoke map editor beyond the practical `/editor` viewer/tooling route.

## 13. User Stories

### 13.1 Player Stories

| Priority | Story | Acceptance |
|---|---|---|
| Required | As a phone player, I can open the game link, enter my name, choose a tank, and join a match. | Full flow works on iPhone Safari and Android Chrome. |
| Required | As a player, I can use touch controls to move, aim, fire, and activate abilities. | All critical controls are reachable by thumbs and have >= 44px targets. |
| Required | As a desktop player, I can use WASD/mouse to play. | Movement, aim, fire, weapon/ability shortcuts work. |
| Required | As a player, I can quick play into a room. | Client uses `joinOrCreate` for `battle_royale`. |
| Required | As a host, I can create a private room and share a code. | Other players can join by room code. |
| Required | As a player, I see a lobby before the match starts. | Lobby shows room code, player list, tank choices, ready/start state. |
| Required | As a player, I fight in a different arena each match. | Server sends deterministic seed/config; clients render same map. |
| Required | As a player, I understand zone pressure. | Safe/danger zone visible in world, minimap, and HUD warning. |
| Required | As a defeated player, I can spectate until results. | Death switches to spectator without breaking connection. |
| Required | As a winner, I see victory and stats. | Results screen shows winner, placement, kills, damage, and play again. |

### 13.2 Developer / Operator Stories

| Priority | Story | Acceptance |
|---|---|---|
| Required | As a developer, I can run server and client locally with one command. | `pnpm dev` starts both. |
| Required | As a developer, I can test procedural generation. | Unit tests cover connectivity, spawn fairness, zones, pickups. |
| Required | As a designer, I can preview maps by seed. | `/editor` allows seed input, reroll, overlays, and export. |
| Required | As a demo operator, I can deploy server and client separately. | Railway and Netlify configs exist with env examples. |
| Required | As a developer, I can replace generated assets cleanly. | Asset manifest and naming conventions exist. |

## 14. Feature Priority Table

| Feature | Priority | Notes |
|---|---:|---|
| Fresh monorepo with TypeScript workspaces | Required | No fork, no upstream reference remote. |
| three.js fullscreen game client | Required | Vite + TypeScript. |
| Colyseus authoritative server | Required | Room name `battle_royale`. |
| Shared schema/types/config package | Required | Used by client and server. |
| Quick play | Required | `joinOrCreate`. |
| Create public lobby | Required | Listed in public lobby flow. |
| Create private lobby | Required | Room code required. |
| Join lobby by code | Required | Private room support. |
| Lobby waiting room | Required | Ready/start/countdown. |
| Mobile touch controls | Required | Mandatory, mobile first-class. |
| Desktop controls | Required | WASD/mouse/keyboard. |
| Procedural maze generation | Required | Seeded, deterministic, connected. |
| Safe zone / danger zone | Required | Server authoritative. |
| Tank archetypes | Required | Nova, Atlas, Quill, Rook. |
| Cannon weapon | Required | Primary weapon. |
| Machine gun / light cannon | Required | Secondary weapon. |
| Explosive/charged shot | Optional | Add if feasible after core weapons. |
| Pickups | Required | Health, shield, ammo/rapid fire, speed, ability charge. |
| Abilities | Required | Smoke, repair, shield/speed burst. |
| Barrage/area strike | Optional | Feasible after core ability system. |
| Spectator mode | Required | After death. |
| Results/winner/rematch | Required | Complete match loop. |
| Internal `/editor` | Required | Practical viewer/tool. |
| Debug overlays | Required | FPS, seed, room, collision toggles. |
| Generated replacement assets | Optional | Use placeholders first, then replace. |
| Audio | Polish | Add after gameplay stability. |
| Advanced effects | Polish | Damage states, smoke, trails, scorch decals. |
| Host settings | Optional | Map size, player cap, public/private. |
| Analytics | Polish | Useful for demo debugging. |

## 15. Mobile-First Demo Requirements

Mobile is not a secondary layout. It is the primary demo mode.

### 15.1 Control Requirements

- Left virtual joystick:
  - Default location: bottom-left.
  - Size: 120–144px base.
  - Thumb target: >= 44px.
  - Supports drag start inside joystick area.
  - Movement vector is normalized and sent as input intent.
- Right aim/fire:
  - Right thumb drag aims turret.
  - Dedicated fire button or press-and-hold fire zone.
  - Fire target size >= 56px recommended.
- Ability dock:
  - Bottom-right compact 2x2 grid or radial.
  - Each cell >= 44px.
  - Shows icon, cooldown/charge, and key hint where relevant.
- Weapon controls:
  - Tap weapon strip or compact weapon chips.
  - Active weapon indicated with orange.
- Browser behavior:
  - Prevent page scrolling during play.
  - Prevent pinch/zoom accidental scaling.
  - Use `touch-action: none` on gameplay shell.
  - Use safe-area insets for notches/home indicators.
- Orientation:
  - Portrait and landscape supported.
  - Landscape can show richer HUD.
  - Portrait must remain playable with compact HUD.

### 15.2 Mobile Acceptance Criteria

| Criterion | Pass Condition |
|---|---|
| iPhone Safari | Can join, play, fire, use ability, spectate, rematch. |
| Android Chrome | Can join, play, fire, use ability, spectate, rematch. |
| Readable HUD | Timer, health, ammo, zone warning, ability state readable. |
| No accidental page scroll | Game remains fixed during touch controls. |
| Stable WebSocket | No repeated disconnects during normal mobile play. |
| FPS | Targets 30 FPS on common phones in 8-player demo. |
| Thumb reach | Movement, fire, and ability controls reachable without hand repositioning. |
| Safe area | No critical controls under notch/home indicator. |
| Orientation change | Canvas and HUD re-layout without losing connection. |

## 16. Acceptance Criteria

### 16.1 Core Product

- Fresh repository initialized in empty folder.
- No fork relationship.
- No reference repo remote.
- Monorepo uses TypeScript.
- `pnpm dev` runs client and server locally.
- `pnpm build` builds all packages.
- `pnpm test` runs available tests.
- Client uses three.js.
- Server uses Colyseus.
- Shared package exports types/schema/constants/config.
- Room name is exactly `battle_royale`.
- Server authoritative for movement validation, combat, damage, pickups, zone damage, death, match state, and win condition.
- Client sends input/intents only.

### 16.2 Multiplayer

- Quick Play joins or creates a room.
- Public room creation works.
- Private room creation works.
- Join private lobby by code works.
- Room locks after match start.
- Late joiners are rejected or added as spectators according to final implementation.
- Reconnect/error states are shown.
- Match completes and returns to results.
- Rematch/play again works.

### 16.3 Gameplay

- 2–12 default full game target supported.
- Recommended demo cap of 8 players supported.
- Optional 16-player cap can be enabled only if performance allows.
- Procedural map is deterministic by seed.
- All clients render the same map from server config.
- Map has connected traversable space.
- Spawn placement avoids immediate unfair overlap.
- Pickups spawn at valid positions.
- Safe zone shrinks and damages players outside.
- Final zone/sudden death resolves match.
- Tanks have distinct stats and roles.
- Health, armor/shield, ammo, cooldowns, active weapon, active ability, kills, damage, and placement are tracked.

### 16.4 UI / Design

- `DESIGN.md` tokens are implemented as CSS variables or token module.
- Game canvas is fullscreen.
- HUD floats over gameplay.
- Center 40% of active combat area remains unobstructed by persistent panels.
- Desktop HUD includes minimap, match header, scoreboard, tank card, weapon strip, ability dock.
- Mobile compact HUD exists.
- Orange accent is reserved for meaningful gameplay/action states.
- Typography follows design tokens as closely as possible.
- Tap targets are >= 44px on mobile.

### 16.5 Editor

- `/editor` route exists.
- Seed input and reroll work.
- Map preview renders layout.
- Overlays for collision, spawns, pickups, zones, and mobile safe zones work.
- Tank skin preview exists or uses placeholders.
- Export/copy map config works.

### 16.6 Deployment

- Railway server deployment documented and configured.
- Netlify client deployment documented and configured.
- Health endpoint exists.
- Env examples exist.
- Production client points at production WebSocket URL.
- CORS is configured using env allowlist.
- README explains local and production setup.

## 17. Success Criteria for Live Demo

| Success Metric | Target |
|---|---|
| Join success | 90%+ of participants can join from phone without developer help. |
| Time to first match | Under 2 minutes from opening link to countdown. |
| Demo room stability | 8-player room completes at least 3 full matches without server restart. |
| Mobile playability | Players can move, aim, fire, and use abilities within first 30 seconds. |
| Match clarity | Players understand winner, deaths, zone warning, and their own health/ammo. |
| Performance | Common phones target 30 FPS in recommended demo cap. |
| Recovery | Disconnect/reconnect/error states do not leave players stuck on blank screens. |
| Presentation | Visual identity matches Alpha-7 minimal industrial design direction. |

## 18. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Mobile WebGL performance drops below target. | Poor demo experience. | Simple meshes/materials, instancing, cap demo room at 8, limit particles, debug FPS. |
| Touch controls feel awkward. | Players cannot compete. | Implement early, test on phones, keep large tap targets, use left joystick + right aim/fire. |
| WebSocket disconnects on mobile networks. | Demo instability. | Reconnection state, lightweight messages, health endpoint, Railway single region near event if possible. |
| Procedural maps create unfair or disconnected layouts. | Bad gameplay. | Deterministic generator tests: connectivity, spawn distance, pickup validity, choke/open area constraints. |
| Safe zone feels confusing. | Players die without understanding. | World ring, minimap ring, HUD warning, countdown text/audio if feasible. |
| Scope is broad. | Incomplete game loop. | Phase implementation: playable vertical slice early, then layer features; always keep game runnable. |
| Reference implementation inspection turns into direct copying. | Process violation. | Fresh repo, no remote, no direct edits, implement from specs and document any adapted materials. |
| Asset generation not ready. | Visual inconsistency. | Use procedural placeholders and asset manifest with clear replacement paths. |
| Deployment CORS/WS misconfiguration. | Client cannot connect. | Env examples, health endpoint, preview checklist, explicit `VITE_WS_URL` and `ALLOWED_ORIGINS`. |
| Too many players overload server. | Lag or crashes. | Default target 2–12, demo cap 8, optional 16 only after performance validation. |

## 19. Permissions and Reference Implementation

The project has permission to use the Colyseus realtime tanks demo as a reference foundation.

Process requirements:

- Use a fresh empty repository.
- Initialize fresh git history.
- Do not fork the reference repo.
- Do not add the reference repo as a git remote.
- Do not directly edit the reference repo.
- Codex may inspect the reference repo outside the project folder to understand behavior, architecture, server/client patterns, and gameplay parity.
- The new project should be a clean rebuild that recreates the useful gameplay foundation and then expands into Alpha-7 Tanks Arena.
- Because permission exists, the target may pursue functional 1:1 parity with the reference foundation where useful before expanding.

Documentation requirements:

- Add `THIRD_PARTY_NOTICES.md` or `REFERENCES.md`.
- Document reference materials.
- Document external assets.
- Document fonts.
- Document models.
- Document generated assets.
- Document any adapted code/assets.
- Document licenses and permissions pragmatically.

## 20. Deployment Requirements

### 20.1 Server — Railway

Required:

- Node.js TypeScript server builds to JavaScript.
- Railway start command runs built server.
- Server binds to `process.env.PORT`.
- Health endpoint: `GET /healthz`.
- WebSocket endpoint supports Colyseus.
- CORS allowlist via env.
- Logs include room creation, joins, leaves, errors, match start/end.

Required server env vars:

| Env Var | Purpose |
|---|---|
| `PORT` | Railway-provided port. |
| `NODE_ENV` | `development` or `production`. |
| `ALLOWED_ORIGINS` | Comma-separated client origins. |
| `PUBLIC_CLIENT_URL` | Deployed Netlify URL. |
| `MAX_PLAYERS` | Default full game cap, recommended `12`. |
| `DEMO_MAX_PLAYERS` | Demo cap, recommended `8`. |
| `ROOM_TICK_RATE` | Simulation tick rate, recommended `30`. |
| `ROOM_PATCH_RATE` | Colyseus patch rate, recommended `20`. |
| `ROOM_AUTO_START_SECONDS` | Optional lobby auto-start countdown. |

### 20.2 Client — Netlify

Required:

- Vite production build.
- Netlify publish directory: `apps/client/dist`.
- Client uses env-driven server URLs.
- SPA fallback configured for `/editor` and game routes.

Required client env vars:

| Env Var | Purpose |
|---|---|
| `VITE_WS_URL` | Production Colyseus WebSocket URL, e.g. `wss://server.example.up.railway.app`. |
| `VITE_HTTP_API_URL` | Production HTTP API URL, e.g. `https://server.example.up.railway.app`. |
| `VITE_BUILD_VERSION` | Optional build/version label. |
| `VITE_DEBUG` | Enables debug overlays when `true`. |

## 21. Visual / UX Acceptance

The finished game should read as:

- Minimal.
- Industrial.
- Functional.
- Mobile-friendly.
- Tactical.
- Premium but restrained.
- Fullscreen gameplay-first.
- HUD as instruments, not decoration.

The game should not read as:

- Neon sci-fi.
- Cartoon arcade.
- Heavy chrome.
- Dense dashboard.
- Menu-first.
- Desktop-only.
- Prototype-only.

## 22. Final Product Statement

Alpha-7 Tanks Arena is a complete mobile-first web battle royale tank game: quick to join, easy to demo, server-authoritative, visually polished, and grounded in a coherent design system. The implementation should prioritize fast full-game functionality, stable multiplayer, and playable mobile UX while leaving clear paths for richer art, VFX, and tuning.