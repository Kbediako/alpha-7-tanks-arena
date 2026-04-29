Original prompt: Build Alpha-7 Tanks Arena from the requirements in Docs/prompt.md, Docs/PRD.md, Docs/DESIGN.md, and Docs/Design Kit/*.png.

# Progress

## Bootstrap notes
- Read Docs/PRD.md, Docs/DESIGN.md, Docs/prompt.md, and inspected Docs/Design Kit PNG references image.png through image8.png.
- No Docs/SPEC.md exists in this checkout; current implementation treats PRD + prompt as product/spec authority and DESIGN.md + Design Kit PNGs as visual authority.
- Pre-implementation standalone review found sequencing risks. Adjusted execution plan:
  - Pull minimal landing/name/tank/lobby flows earlier than the original Phase 10.
  - Add authoritative room tick, movement, and transform sync with the first playable slice.
  - Model HUD around battle royale alive count, placement, zone phase/timer, and room code instead of team-deathmatch score bars where examples conflict.
  - Keep noninteractive HUD panels pointer-passive; only buttons, forms, joysticks, and action controls opt into pointer events.
  - Choose late join after lock as spectator/rejected-by-flow depending on private/public state; active player join locks once countdown starts.
- Frontend design thesis: warm concrete tactical arena with light translucent instrument panels, compact mono data labels, modular concrete walls, and orange only for threat/action/selection.
- User provided a local realtime tanks reference at `/Users/kbediako/Code/realtime-tanks-demo`; inspect it read-only/outside this repo when server/client parity questions arise.

## Phase 1 scaffold checkpoint
- Created the pnpm workspace, TypeScript base config, Vite/React/three client shell, Express + Colyseus server shell, shared package exports, deployment stubs, env example, README, references, and third-party notices.
- Fixed Colyseus schema emit by disabling define-style class field output so schema accessors track state mutations.
- Standalone dev scripts build the shared package before starting client/server because ignored `dist/` outputs are required by package exports.
- Server startup awaits the Colyseus listen promise before logging readiness.
- Colyseus matchmaking CORS and WebSocket origin verification are bound to the same origin policy as Express instead of echoing arbitrary origins.
- `PUBLIC_CLIENT_URL` is automatically included in the server origin allowlist so matchmake and WebSocket policy cannot diverge in common deployment configs.
- Server config loads the repo-root `.env` by module location, so filtered pnpm server scripts honor the documented root `.env.example` flow.
- Private-room creation marks the Colyseus room listing private so quick play does not match into coded lobbies.
- Verification:
  - `pnpm install`
  - `pnpm check`
  - `pnpm start`
  - `curl http://localhost:2567/healthz`
  - Colyseus `joinOrCreate("battle_royale", { seed: "phase1-smoke" }, Alpha7StateSchema)` decoded synced state with `matchState`, `roomCode`, and `seed`.
  - CORS smoke on alternate port verified allowed matchmake origins are echoed and disallowed origins are not.
  - WebSocket handshake smoke verified disallowed origins receive `403 Origin not allowed`.
  - Deployment-origin smoke verified a `PUBLIC_CLIENT_URL` value not repeated in `ALLOWED_ORIGINS` can still matchmake and complete the WebSocket upgrade.
  - Temporary root `.env` probe verified `pnpm --filter @alpha7/server ...` reads root env values while running from `apps/server`.
  - Private-room smoke verified `create(..., { privateRoom: true })` stays separate from quick play.
- Post-fix `codex review --uncommitted` found no discrete correctness, security, or maintainability issues; its independent `pnpm check` also passed.
- Post-Phase-1 collab-deliberation recommended committing Phase 1 now, then keeping the next protocol contract work single-owned across shared/server until the first playable state contract is green.
