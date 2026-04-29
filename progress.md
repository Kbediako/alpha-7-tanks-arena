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

## Phase 2 shared contract checkpoint
- Added shared gameplay constants/config for weapons, pickups, abilities, tank archetypes, defaults, and exact match state/room protocol values.
- Added Colyseus schema classes for match core state, zone state, players, projectiles, pickups, and the Alpha-7 room state; schemas stay exported from `@alpha7/shared/schema`.
- Added typed client/server room message payloads for join, ready, input, fire, ability, rematch, system, and error channels from the shared root package.
- Added focused shared tests for protocol values, gameplay config sanity, schema defaults, synchronized match-state helper behavior, and message payload typing.
- Kept the root barrel free of schema runtime exports so client bundles can import lightweight constants/messages without pulling schema classes unless needed.
- Post-implementation elegance pass removed a no-op seed setter and duplicate state schema alias before commit.
- Verification:
  - `pnpm --filter @alpha7/shared typecheck`
  - `pnpm --filter @alpha7/shared test` (7 tests)
  - `pnpm check`
  - `codex review --uncommitted` found no actionable correctness issues before the elegance trim.
  - Post-Phase-2 collab-deliberation recommended committing the shared contract and implementing Phase 3 with `BattleRoyaleRoom` as the single server owner for admission, ready/start, transitions, locking, and late-join policy.

## Phase 3 server lifecycle checkpoint
- Implemented `BattleRoyaleRoom` lifecycle for `battle_royale`: waiting lobby admission, sanitized join/tank updates, host assignment, ready flow, host start, countdown, room lock/unlock, timed `running -> danger -> final_zone -> finished` transitions, metadata updates, and rematch-vote skeleton.
- Added defensive server-side parsing for join, ready, start, input, fire, ability, and rematch messages. Active input/fire/ability messages are stored as intents only and are rejected unless the room is active and the player is alive, connected, and not spectating.
- Added `CLIENT_MESSAGE_TYPES.START` and `StartMessagePayload` to the shared protocol so host start is not server-local.
- Private rooms still use generated room codes and `setPrivate`; public rooms keep matchmaking metadata for later lobby/client flows.
- Rematch votes are gated to `finished` and cleared for active-match disconnects so stale votes cannot leak into the future rematch implementation.
- Added server room lifecycle tests covering metadata/private rooms, sanitized players, host reassignment, auto-locked final seats, ready countdown, lock/unlock late-join rejection, host-only start, timed state transitions, defensive intents, server-owned weapon validation, rematch gating, and inactive-player intent rejection.
- Standalone review found and parent fixed final-seat auto-lock admission and client-selected weapon override risks; elegance review then removed dead lifecycle state, a fake countdown trigger parameter, and duplicated tank config application.
- Verification:
  - `pnpm --filter @alpha7/shared typecheck`
  - `pnpm --filter @alpha7/shared test` (7 tests)
  - `pnpm --filter @alpha7/server typecheck`
  - `pnpm --filter @alpha7/server test` (9 tests)
  - `pnpm check`
