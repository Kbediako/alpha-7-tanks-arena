You are Codex acting as a senior multiplayer game engineer, TypeScript technical lead, mobile-first web game UX implementer, three.js developer, Colyseus server architect, deployment engineer, and technical documentation maintainer.

Your goal is to build **Alpha-7 Tanks Arena**, a full-featured mobile-first browser-playable 3D battle royale tank game in a fresh empty folder.

This is a **Full Feature Target**, not a minimal MVP. Prioritize getting a playable vertical slice working early, then layer the complete systems until the game is suitable for a live phone-based multiplayer demo.

## Read These Files First

Before implementing, read:

1. `DESIGN.md`
2. The design kit folder:
   - likely `design-kit/`
   - or `assets/design-kit/`
3. The screenshots folder:
   - likely `design-kit/screens/`
   - or `assets/design-kit/screens/`
4. `PRD.md`
5. `SPEC.md`

Treat `DESIGN.md` as the visual source of truth:

- YAML front matter in `DESIGN.md` is normative design tokens.
- Markdown in `DESIGN.md` is implementation guidance.
- Screenshots are visual references.
- If screenshots conflict with `DESIGN.md`, prefer `DESIGN.md` unless a screenshot is explicitly marked newer/current.

## Reference Implementation Rules

Reference implementation:

- `https://github.com/colyseus/realtime-tanks-demo`

Permission exists to use it as a reference foundation.

Process rules:

- Work in this empty folder as a new project.
- Initialize a new git repo.
- Do not fork the Colyseus reference repo.
- Do not add the Colyseus reference repo as a git remote.
- Do not directly edit the reference repo.
- If inspecting the reference repo, inspect it outside this project folder.
- Recreate useful behavior through specs and a fresh implementation.
- Add `THIRD_PARTY_NOTICES.md` or `REFERENCES.md` documenting the reference, external assets, fonts, models, generated assets, licenses, permissions, and any adapted code/assets.

## Required Tech Stack

Use:

- Monorepo.
- TypeScript everywhere.
- Package manager: pnpm workspaces.
- Client: three.js + TypeScript + Vite.
- Server: Node.js + TypeScript + Colyseus.
- Shared package: schema/types/constants/game config/procedural generation.
- Deployment:
  - Railway for server.
  - Netlify for client.

Do not replace three.js with another renderer.

Do not make mobile optional.

## Product Goal

Build a full-featured browser multiplayer tank battle royale:

- Players open one link on phones or desktop.
- Players enter a name and choose a tank.
- Players can quick play, create public lobby, create private lobby, and join by room code.
- The match starts from lobby to countdown.
- Players fight in a seeded procedural maze.
- Server owns authoritative match state.
- Safe zone/danger zone shrinks over time.
- Pickups and abilities affect combat.
- Destroyed players spectate.
- Last tank standing wins.
- Results and rematch/play again are available.
- Mobile touch controls are mandatory.
- Desktop keyboard/mouse controls are mandatory.
- The HUD follows the Alpha-7 minimal industrial design system.

## Required Room and Match Details

Use Colyseus room name exactly:

```txt
battle_royale
```

Match states exactly:

```txt
waiting
countdown
running
danger
final_zone
finished
```

Player count:

- Minimum playable: 2.
- Default full game target: 2–12 players.
- Recommended demo cap: 8 players.
- Optional stretch cap: 16 players only if performance allows.

## Required Gameplay Features

Implement:

- Server-authoritative movement validation.
- Server-authoritative combat.
- Server-authoritative damage.
- Server-authoritative pickups.
- Server-authoritative zone damage.
- Server-authoritative death/winner logic.
- Client sends input/intents only.

Tank gameplay:

- Tanks move.
- Tanks rotate.
- Turrets aim independently.
- Tanks shoot.
- Health.
- Armor/shield.
- Ammo/cooldowns.
- Active weapon.
- Active ability.
- Kills.
- Damage dealt.
- Placement.
- Spectator state.

Tank archetypes:

- Nova: assault.
- Atlas: balanced.
- Quill: skirmisher.
- Rook: support.

Weapons:

- Cannon.
- Machine gun or light cannon.
- Explosive or charged shot if feasible after core combat.

Pickups:

- Health repair.
- Shield/armor.
- Ammo/rapid fire.
- Speed boost.
- Ability charge.
- Smoke pickup if useful.
- Barrage/explosive boost if feasible.

Abilities:

- Smoke.
- Repair.
- Shield pulse or speed burst.
- Barrage/area strike if feasible.

Battle royale:

- Procedural maze maps.
- Seeded RNG.
- Deterministic generation.
- Server owns seed/config.
- Client renders from synced map config.
- Connected playable paths.
- Open arena pockets.
- Choke points.
- Cover placement.
- Spawn placement.
- Pickup placement.
- Safe zone phases.
- Danger zone damage.
- Final zone/sudden death.

## Required Mobile Features

Mobile is mandatory and first-class.

Implement:

- Left virtual joystick for movement.
- Right aim/fire control or drag-to-aim with fire button.
- Compact ability dock.
- Weapon switch / reload / ability controls as tap targets.
- Tap targets >= 44px.
- Safe-area inset support.
- Orientation change support.
- Prevent page scroll/zoom while playing.
- Support iPhone Safari.
- Support Android Chrome.
- Target 30 FPS on common phones.
- Keep critical controls reachable by thumbs.
- Keep center combat area clear.
- Mobile compact HUD.

Use:

- `touch-action: none`
- `overscroll-behavior: none`
- fixed fullscreen game shell
- safe-area CSS env vars
- viewport fit cover meta tag

## Required Desktop Features

Implement:

- WASD and arrow key movement.
- Mouse aim.
- Click/tap fire.
- Keyboard ability shortcuts.
- Keyboard hints displayed in HUD per design system.
- Weapon switching keys.

## Required Screens

Implement these screens/routes/flows:

- Landing.
- Name/tank select.
- Quick play.
- Create lobby.
- Join lobby by code.
- Lobby waiting room.
- Loading/match starting.
- In-game HUD.
- Mobile compact HUD.
- Death/spectator.
- Results/winner.
- Rematch/play again.
- Error/reconnect states.
- Internal editor/viewer at `/editor`.

## Required HUD Components

Follow `DESIGN.md`.

Implement:

- Fullscreen `game-shell`.
- Fullscreen `game-canvas`.
- `hud-layer`.
- `minimap-panel`.
- `match-header`.
- `scoreboard-panel`.
- `tank-status-card`.
- `weapon-strip`.
- `ability-dock`.
- Mobile compact variants.

Design rules:

- Warm concrete/slate palette.
- Floating translucent HUD panels.
- One high-salience orange accent.
- Orange means threat, active, objective, selected, urgent, or primary action.
- Do not use orange as decoration.
- Use thin borders, subtle blur, 8-point grid.
- Keep center combat area unobstructed.
- Use Rajdhani, Inter, and IBM Plex Mono fallbacks as specified.
- If fonts are not installed yet, use CSS imports or fallbacks and document font sources.

## Required Internal Editor / Viewer

Create `/editor`.

It must visualize:

- Procedural maze seeds.
- Wall/floor layout.
- Spawn points.
- Pickup locations.
- Safe zone/danger zone phases.
- Tank model/skin previews.
- Collision/debug overlays.
- Mobile HUD safe zones.

It must allow:

- Enter seed.
- Reroll seed.
- Copy/export map config.
- Preview tank skins.
- Toggle overlays.
- Preview zone timeline.
- Simulate player count and spawn placement.

Keep it practical and shippable.

## Required Asset Pipeline

Create an asset pipeline and manifest.

Implement:

- `apps/client/public/assets/manifest.json`.
- Folders for UI icons, tank assets, map assets, textures, FX, generated assets.
- Fallback procedural assets if generated PNGs/models are missing.
- Clear replacement paths.
- `apps/client/public/assets/generated/README.md`.
- Documentation in README and notices.

Use procedural placeholders first when assets are missing.

Do not block gameplay on missing art.

## Required Deployment Config

Add:

- `railway.toml`
- `netlify.toml`
- `.env.example`
- server health endpoint `/healthz`
- README deployment instructions

Server env vars:

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

Client env vars:

```txt
VITE_WS_URL
VITE_HTTP_API_URL
VITE_BUILD_VERSION
VITE_DEBUG
```

Railway:

- Build shared + server.
- Start built server.
- Bind to `PORT`.
- Healthcheck `/healthz`.

Netlify:

- Build client.
- Publish `apps/client/dist`.
- SPA fallback to `index.html`.
- Use production WebSocket URL from env.

## Required Documentation

Create/update:

- `README.md`
- `THIRD_PARTY_NOTICES.md`
- `REFERENCES.md` if useful
- `.env.example`
- asset generated README
- deployment notes
- mobile demo checklist
- known limitations

README must include:

- Product summary.
- Stack.
- Local setup.
- Scripts.
- Env vars.
- How to run client/server.
- How to open on phone locally.
- Quick play flow.
- Private room code flow.
- `/editor` usage.
- Railway deployment.
- Netlify deployment.
- Asset replacement.
- Mobile demo checklist.
- Known limitations.

## Required Tests

Add tests where feasible.

At minimum, implement shared unit tests for:

- Seeded RNG determinism.
- Maze generation determinism.
- Map connectivity.
- Spawn fairness.
- Pickup placement validity.
- Zone phase planning.
- Combat damage/pickup basics.

Add server room smoke tests if feasible.

Always run relevant commands after each phase and fix errors.

## Implementation Phases

Implement in this order. After each stable milestone, run relevant commands and commit.

### Phase 1 — Repository Scaffolding

- Initialize git repo.
- Create pnpm workspace monorepo.
- Create root `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`.
- Create `apps/client`, `apps/server`, `packages/shared`.
- Set up Vite client.
- Set up Express + Colyseus server.
- Add `/healthz`.
- Add env parsing.
- Add root scripts:
  - `dev`
  - `dev:client`
  - `dev:server`
  - `build`
  - `build:client`
  - `build:server`
  - `start`
  - `test`
  - `typecheck`
  - `check`
- Add initial README, `.env.example`, `railway.toml`, `netlify.toml`.
- Run install/build/typecheck.
- Commit: `chore: scaffold alpha-7 monorepo`.

### Phase 2 — Shared Constants, Types, and Schema

- Add match state types.
- Add tank archetype constants.
- Add weapon constants.
- Add pickup constants.
- Add ability constants.
- Add Colyseus schema classes.
- Add message types.
- Export from shared package.
- Add basic tests.
- Run tests/typecheck.
- Commit: `feat(shared): add battle royale schema and configs`.

### Phase 3 — Colyseus Server Room and Match Lifecycle

- Implement `BattleRoyaleRoom`.
- Register room name `battle_royale`.
- Implement join/create options.
- Implement room metadata.
- Implement room code generation.
- Implement waiting/countdown/running/danger/final_zone/finished transitions.
- Implement room locking once match starts.
- Implement ready/start flow.
- Implement rematch vote skeleton.
- Run server and tests.
- Commit: `feat(server): implement battle royale room lifecycle`.

### Phase 4 — Procedural Maze Generation

- Implement seeded RNG.
- Implement map config types.
- Implement deterministic maze generation.
- Implement walls/floors/collision.
- Implement open pockets and chokes.
- Implement spawn placement.
- Implement pickup placement.
- Implement zone phase planning.
- Implement map validation.
- Add tests for determinism/connectivity/fairness.
- Run tests/typecheck.
- Commit: `feat(shared): add deterministic arena generation`.

### Phase 5 — Client Connection and Basic Rendering

- Implement Colyseus client wrapper.
- Implement quick play join.
- Implement three.js renderer.
- Render floor.
- Render maze walls from map config.
- Render tanks as procedural placeholder meshes.
- Render remote tanks.
- Add basic interpolation.
- Add debug overlay with room code, seed, state, FPS.
- Run local server/client.
- Commit: `feat(client): render synced arena and tanks`.

### Phase 6 — Mobile and Desktop Input

- Implement desktop WASD/arrow movement.
- Implement mouse aim.
- Implement click fire.
- Implement keyboard ability shortcuts.
- Implement mobile virtual joystick.
- Implement mobile aim/fire.
- Implement touch ability dock.
- Implement safe-area handling.
- Implement no-scroll/no-zoom CSS.
- Implement input throttling.
- Send input intents only.
- Server validates/clamps movement.
- Test in browser and phone if available.
- Commit: `feat(input): add mobile and desktop controls`.

### Phase 7 — Combat, Health, Death, Winner Logic

- Implement cannon.
- Implement MG/light cannon.
- Implement projectile schema/simulation/rendering.
- Implement projectile collision with walls/tanks.
- Implement health/armor/shield.
- Implement damage and kill credit.
- Implement death.
- Implement spectator transition.
- Implement placement.
- Implement winner.
- Add tests for combat rules.
- Commit: `feat(gameplay): implement combat and win condition`.

### Phase 8 — Safe Zone / Danger Zone

- Implement zone phases.
- Implement shrinking safe zone.
- Implement damage outside zone.
- Implement final zone.
- Render zone in world.
- Render zone on minimap.
- Add mobile HUD warning.
- Add zone tests.
- Commit: `feat(gameplay): add battle royale danger zone`.

### Phase 9 — Pickups and Abilities

- Implement health pickup.
- Implement shield pickup.
- Implement ammo/rapid fire pickup.
- Implement speed boost pickup.
- Implement ability charge pickup.
- Implement smoke ability.
- Implement repair ability.
- Implement shield pulse or speed burst.
- Implement barrage/area strike if feasible.
- Render pickup/ability effects.
- Update HUD cooldowns/charges.
- Add tests.
- Commit: `feat(gameplay): add pickups and abilities`.

### Phase 10 — Lobby, Quick Play, Private Room Codes

- Implement landing screen.
- Implement name/tank select.
- Implement quick play.
- Implement create public lobby.
- Implement create private lobby.
- Implement join by code.
- Implement public room list API if feasible.
- Implement lobby waiting room.
- Implement copy room code.
- Implement ready/start/countdown UI.
- Implement room full/locked/not found errors.
- Commit: `feat(lobby): add matchmaking and room codes`.

### Phase 11 — Full Alpha-7 HUD

- Convert `DESIGN.md` tokens to CSS variables.
- Implement `.game-shell`, `.game-canvas`, `.hud-layer`, `.hud-panel`.
- Implement minimap panel.
- Implement match header.
- Implement scoreboard.
- Implement tank status card.
- Implement weapon strip.
- Implement ability dock.
- Implement health pips/ammo dots.
- Implement reticles/in-world labels.
- Implement desktop HUD layout.
- Verify center combat area is clear.
- Commit: `feat(ui): implement alpha-7 hud system`.

### Phase 12 — Mobile Compact HUD

- Implement responsive mobile HUD.
- Compact minimap.
- Compact match header.
- Collapse scoreboard.
- Health/ammo chips.
- Compact ability dock.
- Integrate touch controls with HUD.
- Support portrait and landscape.
- Verify safe-area insets.
- Verify tap targets >= 44px.
- Commit: `feat(ui): add mobile compact hud`.

### Phase 13 — Editor / Viewer

- Create `/editor` route.
- Implement seed input.
- Implement reroll seed.
- Implement map preview.
- Implement wall/floor overlay.
- Implement collision overlay.
- Implement spawn overlay.
- Implement pickup overlay.
- Implement safe zone phase overlay.
- Implement tank skin preview.
- Implement mobile HUD safe-zone preview.
- Implement simulated player count.
- Implement export/copy config.
- Commit: `feat(editor): add arena seed viewer`.

### Phase 14 — Asset Pipeline and Design Pass

- Create asset folders.
- Create `manifest.json`.
- Create fallback procedural assets.
- Create placeholder SVG/icons as needed.
- Create generated asset README.
- Make renderer load from manifest where available and fallback otherwise.
- Apply Alpha-7 visual design pass.
- Document replacement paths.
- Commit: `feat(assets): add asset manifest and placeholders`.

### Phase 15 — Deployment Config

- Finalize `railway.toml`.
- Finalize `netlify.toml`.
- Ensure server builds and starts from root.
- Ensure client builds and publishes.
- Ensure `/healthz` works.
- Ensure CORS uses env.
- Add production env docs.
- Run production build locally.
- Commit: `chore(deploy): configure railway and netlify`.

### Phase 16 — Tests and QA

- Add or complete shared tests.
- Add server smoke tests if feasible.
- Add client build validation.
- Run `pnpm check`.
- Fix errors.
- Add mobile manual QA checklist to README or docs.
- Add multiplayer manual QA checklist.
- Commit: `test: add gameplay and deployment qa coverage`.

### Phase 17 — Final Polish and Demo Checklist

- Polish visuals.
- Polish loading/results screens.
- Polish errors/reconnect.
- Tune combat and zone values.
- Tune mobile HUD.
- Add known limitations.
- Complete `THIRD_PARTY_NOTICES.md`.
- Complete README.
- Run final `pnpm check`.
- Test two-browser local match.
- Test phone join if available.
- Commit: `chore: finalize alpha-7 live demo build`.

## Development Rules

- Keep the project runnable after each phase.
- Prefer working full-game functionality over over-engineered abstractions.
- Use simple procedural placeholders when art is missing.
- Do not block gameplay on missing assets.
- Avoid heavy dependencies unless clearly justified.
- Keep server authoritative.
- Keep client messages small.
- Keep map generation deterministic.
- Keep mobile performance in mind at all times.
- Use object pooling for projectiles/effects if needed.
- Use instancing for repeated wall/cover meshes.
- Cap mobile renderer pixel ratio.
- Avoid dense particles and expensive postprocessing.
- Sanitize display names.
- Validate all server messages.
- Rate-limit input/fire/ability messages.
- Document known limitations honestly.

## Commands to Run

After scaffolding:

```bash
pnpm install
pnpm dev
pnpm typecheck
pnpm test
pnpm build
```

Before final:

```bash
pnpm check
pnpm --filter @alpha7/server start
pnpm --filter @alpha7/client preview
```

## Git Commit Expectations

Commit after stable milestones.

Use clear commit messages like:

```txt
chore: scaffold alpha-7 monorepo
feat(shared): add battle royale schema and configs
feat(server): implement battle royale room lifecycle
feat(shared): add deterministic arena generation
feat(client): render synced arena and tanks
feat(input): add mobile and desktop controls
feat(gameplay): implement combat and win condition
feat(gameplay): add battle royale danger zone
feat(gameplay): add pickups and abilities
feat(lobby): add matchmaking and room codes
feat(ui): implement alpha-7 hud system
feat(ui): add mobile compact hud
feat(editor): add arena seed viewer
feat(assets): add asset manifest and placeholders
chore(deploy): configure railway and netlify
test: add gameplay and deployment qa coverage
chore: finalize alpha-7 live demo build
```

## Final Response Required From Codex

When done, provide:

1. Summary of implemented features.
2. Commands to run locally.
3. Commands/config needed for Railway.
4. Commands/config needed for Netlify.
5. Mobile demo checklist.
6. Multiplayer QA checklist.
7. Known limitations.
8. Any failed checks or unresolved issues.
9. Where assets can be replaced.
10. Where third-party notices are documented.

Do not claim something works unless it has been implemented or tested. Be specific about any limitations.