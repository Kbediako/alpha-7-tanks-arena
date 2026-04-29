import { describe, expect, it } from "vitest";
import {
  ABILITY_CONFIG,
  ABILITY_TYPES,
  BATTLE_ROYALE_ROOM,
  CLIENT_MESSAGE_TYPES,
  MATCH_STATES,
  PICKUP_CONFIG,
  PICKUP_TYPES,
  SERVER_MESSAGE_TYPES,
  TANK_ARCHETYPE_CONFIG,
  TANK_ARCHETYPES,
  WEAPON_CONFIG,
  WEAPON_TYPES,
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
    expect(state.players.size).toBe(0);
    expect(state.projectiles.length).toBe(0);
    expect(state.pickups.length).toBe(0);
  });

  it("keeps state helper methods synchronized", () => {
    const state = new Alpha7StateSchema();

    state.setMatchState("danger");
    state.seed = "phase-2-seed";

    expect(state.matchState).toBe("danger");
    expect(state.zonePhase.matchState).toBe("danger");
    expect(state.seed).toBe("phase-2-seed");
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
