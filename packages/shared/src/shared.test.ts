import { describe, expect, it } from "vitest";
import {
  ABILITY_CONFIG,
  ABILITY_TYPES,
  ARENA_CONFIG_VERSION,
  BATTLE_ROYALE_ROOM,
  CLIENT_MESSAGE_TYPES,
  clampToArena,
  createSeededRng,
  generateArenaConfig,
  isWallCollision,
  MATCH_STATES,
  planZonePhases,
  PICKUP_CONFIG,
  PICKUP_TYPES,
  SERVER_MESSAGE_TYPES,
  TANK_ARCHETYPE_CONFIG,
  TANK_ARCHETYPES,
  validateArenaConnectivity,
  WEAPON_CONFIG,
  WEAPON_TYPES,
  type ArenaPoint,
  type ClientToServerMessage,
  type ServerToClientMessage
} from "./index.js";
import {
  Alpha7StateSchema,
  PickupSchema,
  PlayerSchema,
  ProjectileSchema
} from "./schema.js";

describe("phase 2 shared constants", () => {
  it("keeps room and match state protocol values exact", () => {
    expect(BATTLE_ROYALE_ROOM).toBe("battle_royale");
    expect(MATCH_STATES).toEqual([
      "waiting",
      "countdown",
      "running",
      "danger",
      "final_zone",
      "finished"
    ]);
  });

  it("exposes exact tank archetype keys and sane configs", () => {
    expect(TANK_ARCHETYPES).toEqual(["nova", "atlas", "quill", "rook"]);
    expect(TANK_ARCHETYPES.map((id) => TANK_ARCHETYPE_CONFIG[id].name)).toEqual([
      "Nova",
      "Atlas",
      "Quill",
      "Rook"
    ]);

    for (const id of TANK_ARCHETYPES) {
      const config = TANK_ARCHETYPE_CONFIG[id];

      expect(config.id).toBe(id);
      expect(WEAPON_TYPES).toContain(config.primaryWeapon);
      expect(ABILITY_TYPES).toContain(config.ability);
      expect(config.maxHealth).toBeGreaterThan(0);
      expect(config.speed).toBeGreaterThan(0);
    }
  });

  it("keeps weapon, pickup, and ability configs deterministic", () => {
    expect(WEAPON_TYPES).toEqual(["cannon", "light_cannon", "machine_gun", "explosive"]);
    expect(PICKUP_TYPES).toEqual([
      "health_repair",
      "shield_armor",
      "ammo_rapid_fire",
      "speed_boost",
      "ability_charge",
      "smoke",
      "barrage_explosive"
    ]);
    expect(ABILITY_TYPES).toEqual(["smoke", "repair", "shield_pulse", "speed_burst", "barrage"]);

    for (const weaponType of WEAPON_TYPES) {
      const config = WEAPON_CONFIG[weaponType];

      expect(config.id).toBe(weaponType);
      expect(config.damage).toBeGreaterThan(0);
      expect(config.fireCooldownMs).toBeGreaterThan(0);
      expect(config.projectileSpeed).toBeGreaterThan(0);
    }

    for (const pickupType of PICKUP_TYPES) {
      const config = PICKUP_CONFIG[pickupType];

      expect(config.id).toBe(pickupType);
      expect(config.respawnMs).toBeGreaterThan(0);
    }

    for (const abilityType of ABILITY_TYPES) {
      const config = ABILITY_CONFIG[abilityType];

      expect(config.id).toBe(abilityType);
      expect(config.cooldownMs).toBeGreaterThan(0);
    }

    expect(WEAPON_CONFIG.explosive.enabledByDefault).toBe(false);
    expect(ABILITY_CONFIG.barrage.enabledByDefault).toBe(false);
  });
});

describe("phase 2 schemas", () => {
  it("provides room state defaults for server and client rendering", () => {
    const state = new Alpha7StateSchema();

    expect(state.match.roomName).toBe(BATTLE_ROYALE_ROOM);
    expect(state.matchState).toBe("waiting");
    expect(state.zonePhase.matchState).toBe("waiting");
    expect(state.roomCode).toBe("");
    expect(state.seed).toBe("");
    expect(state.arenaConfigJson).toBe("");
    expect(state.mapConfigJson).toBe("");
    expect(state.players.size).toBe(0);
    expect(state.projectiles.length).toBe(0);
    expect(state.pickups.length).toBe(0);
  });

  it("keeps state helper methods synchronized", () => {
    const state = new Alpha7StateSchema();

    state.setMatchState("danger");
    state.seed = "phase-2-seed";
    state.arenaConfigJson = "{\"seed\":\"phase-4-seed\"}";
    state.mapConfigJson = state.arenaConfigJson;

    expect(state.matchState).toBe("danger");
    expect(state.zonePhase.matchState).toBe("danger");
    expect(state.seed).toBe("phase-2-seed");
    expect(state.arenaConfigJson).toContain("phase-4-seed");
    expect(state.mapConfigJson).toContain("phase-4-seed");
  });

  it("provides player, projectile, and pickup defaults", () => {
    const player = new PlayerSchema();
    const projectile = new ProjectileSchema();
    const pickup = new PickupSchema();

    expect(player.archetypeId).toBe("atlas");
    expect(player.weaponType).toBe("cannon");
    expect(player.abilityType).toBe("smoke");
    expect(player.isAlive).toBe(true);
    expect(player.isSpectator).toBe(false);
    expect(player.placement).toBe(0);
    expect(player.damageDealt).toBe(0);
    expect(projectile.weaponType).toBe("cannon");
    expect(projectile.radius).toBeGreaterThan(0);
    expect(pickup.pickupType).toBe("health_repair");
    expect(pickup.isActive).toBe(true);
  });
});

const pointDistance = (a: ArenaPoint, b: ArenaPoint): number => Math.hypot(a.x - b.x, a.y - b.y);

describe("phase 4 seeded arena generation", () => {
  it("keeps seeded RNG streams deterministic and forkable", () => {
    const sequenceForSeed = () => {
      const rng = createSeededRng("alpha7-rng");
      return Array.from({ length: 8 }, () => rng.next());
    };
    const sequenceA = sequenceForSeed();
    const rngA = createSeededRng("alpha7-rng");
    const rngB = createSeededRng("alpha7-rng");

    expect(sequenceA).toEqual(sequenceForSeed());
    expect([rngA.int(1, 10), rngA.int(1, 10), rngA.bool(0.5)]).toEqual([
      rngB.int(1, 10),
      rngB.int(1, 10),
      rngB.bool(0.5)
    ]);
    expect(createSeededRng("alpha7-rng").shuffle([1, 2, 3, 4, 5])).toEqual(
      createSeededRng("alpha7-rng").shuffle([1, 2, 3, 4, 5])
    );
    expect(createSeededRng("alpha7-rng").fork("maze").next()).not.toBe(
      createSeededRng("alpha7-rng").fork("pickups").next()
    );
  });

  it("generates deterministic maze configs for a seed", () => {
    const arenaA = generateArenaConfig({ seed: "phase-4-maze", playerCount: 8 });
    const arenaB = generateArenaConfig({ seed: "phase-4-maze", playerCount: 8 });
    const arenaC = generateArenaConfig({ seed: "phase-4-maze-other", playerCount: 8 });

    expect(arenaA).toEqual(arenaB);
    expect(arenaA.version).toBe(ARENA_CONFIG_VERSION);
    expect(arenaA.grid.layout).not.toEqual(arenaC.grid.layout);
    expect(arenaA.wallRects.length).toBeGreaterThan(0);
    expect(arenaA.collisionRects.length).toBe(arenaA.wallRects.length);
    expect(arenaA.pockets.length).toBeGreaterThanOrEqual(3);
    expect(arenaA.chokePoints.length).toBeGreaterThan(0);
  });

  it("validates floor connectivity across maze pockets and loops", () => {
    const arena = generateArenaConfig({
      seed: "phase-4-connectivity",
      playerCount: 8,
      width: 2200,
      height: 1500
    });
    const connectivity = validateArenaConnectivity(arena);

    expect(connectivity.ok).toBe(true);
    expect(connectivity.reachableFloorCount).toBe(connectivity.floorCount);
    expect(connectivity.floorCount).toBe(arena.floorCells.length);

    const clamped = clampToArena(arena, -100, -100, arena.spawnPoints[0]?.radius ?? 20);
    expect(isWallCollision(arena, clamped.x, clamped.y, arena.spawnPoints[0]?.radius ?? 20)).toBe(false);
  });

  it("places fair spawn points on clear floor cells", () => {
    const arena = generateArenaConfig({ seed: "phase-4-spawns", playerCount: 8 });
    const minFairDistance = Math.min(arena.width, arena.height) * 0.13;

    expect(arena.spawnPoints).toHaveLength(8);

    for (const spawn of arena.spawnPoints) {
      expect(isWallCollision(arena, spawn.x, spawn.y, spawn.radius)).toBe(false);
      expect(Number.isFinite(spawn.rotation)).toBe(true);
    }

    for (let i = 0; i < arena.spawnPoints.length; i += 1) {
      const spawnA = arena.spawnPoints[i];
      if (!spawnA) continue;
      for (let j = i + 1; j < arena.spawnPoints.length; j += 1) {
        const spawnB = arena.spawnPoints[j];
        if (!spawnB) continue;
        expect(pointDistance(spawnA, spawnB)).toBeGreaterThan(minFairDistance);
      }
    }
  });

  it("places pickups on valid clear floor away from spawns and each other", () => {
    const arena = generateArenaConfig({ seed: "phase-4-pickups", playerCount: 8 });
    const pickupTypes = new Set(arena.pickupPlacements.map((pickup) => pickup.pickupType));

    expect(arena.pickupPlacements.length).toBeGreaterThanOrEqual(PICKUP_TYPES.length);
    expect(pickupTypes.size).toBeGreaterThan(3);

    for (const pickup of arena.pickupPlacements) {
      expect(PICKUP_TYPES).toContain(pickup.pickupType);
      expect(pickup.value).toBe(PICKUP_CONFIG[pickup.pickupType].value);
      expect(isWallCollision(arena, pickup.x, pickup.y, pickup.radius)).toBe(false);

      for (const spawn of arena.spawnPoints) {
        expect(pointDistance(pickup, spawn)).toBeGreaterThan(pickup.radius + spawn.radius);
      }
    }

    for (let i = 0; i < arena.pickupPlacements.length; i += 1) {
      const pickupA = arena.pickupPlacements[i];
      if (!pickupA) continue;
      for (let j = i + 1; j < arena.pickupPlacements.length; j += 1) {
        const pickupB = arena.pickupPlacements[j];
        if (!pickupB) continue;
        expect(pointDistance(pickupA, pickupB)).toBeGreaterThan(pickupA.radius + pickupB.radius);
      }
    }
  });

  it("plans deterministic shrinking zone phases with movable time origin", () => {
    const arena = generateArenaConfig({ seed: "phase-4-zones", playerCount: 6 });
    const zeroPlan = planZonePhases(arena, 0);
    const shiftedPlan = planZonePhases(arena, 12_345);

    expect(arena.zonePhases).toEqual(zeroPlan);
    expect(zeroPlan.map((phase) => phase.matchState)).toEqual(["running", "danger", "final_zone"]);
    expect(shiftedPlan[0]?.startsAt).toBe(12_345);

    for (let index = 0; index < zeroPlan.length; index += 1) {
      const phase = zeroPlan[index];
      if (!phase) continue;
      expect(phase.warningAt).toBeGreaterThanOrEqual(phase.startsAt);
      expect(phase.closesAt).toBeGreaterThan(phase.warningAt);
      expect(phase.targetRadius).toBeLessThan(phase.radius);
      expect(phase.x).toBeGreaterThanOrEqual(0);
      expect(phase.x).toBeLessThanOrEqual(arena.width);
      expect(phase.y).toBeGreaterThanOrEqual(0);
      expect(phase.y).toBeLessThanOrEqual(arena.height);
      if (index > 0) {
        const previous = zeroPlan[index - 1];
        if (previous) expect(phase.radius).toBeLessThan(previous.radius);
      }
    }
  });
});

describe("phase 2 messages", () => {
  it("provides typed client and server message payloads", () => {
    const join: ClientToServerMessage<"join"> = {
      playerName: "Nova Pilot",
      archetypeId: "nova",
      clientVersion: "test"
    };
    const input: ClientToServerMessage<typeof CLIENT_MESSAGE_TYPES.INPUT> = {
      sequence: 1,
      tick: 10,
      moveX: 1,
      moveY: 0,
      aimX: 10,
      aimY: 20,
      fire: true,
      ability: false
    };
    const start: ClientToServerMessage<typeof CLIENT_MESSAGE_TYPES.START> = {
      start: true
    };
    const system: ServerToClientMessage<typeof SERVER_MESSAGE_TYPES.SYSTEM> = {
      code: "match_state",
      message: "Match running",
      matchState: "running",
      at: 123
    };
    const joined: ServerToClientMessage<"system"> = {
      message: "joined",
      roomCode: "ABC123",
      matchState: "waiting",
      seed: "phase-2-seed"
    };
    const error: ServerToClientMessage<typeof SERVER_MESSAGE_TYPES.ERROR> = {
      code: "invalid_payload",
      message: "Bad input",
      retryable: false,
      field: "moveX"
    };

    expect(CLIENT_MESSAGE_TYPES.JOIN).toBe("join");
    expect(CLIENT_MESSAGE_TYPES.START).toBe("start");
    expect(start.start).toBe(true);
    expect(input.sequence).toBe(1);
    expect(system.matchState).toBe("running");
    expect(joined.roomCode).toBe("ABC123");
    expect(error.retryable).toBe(false);
  });
});
