import { ArraySchema, MapSchema, Schema, type } from "@colyseus/schema";
import {
  BATTLE_ROYALE_ROOM,
  DEFAULT_ABILITY_TYPE,
  DEFAULT_TANK_ARCHETYPE,
  DEFAULT_WEAPON_TYPE
} from "./constants.js";
import type { AbilityType, MatchState, PickupType, TankArchetypeId, WeaponType } from "./constants.js";

export class MatchCoreSchema extends Schema {
  @type("string") roomName = BATTLE_ROYALE_ROOM;
  @type("string") matchId = "";
  @type("number") tick = 0;
  @type("number") round = 1;
  @type("number") alivePlayers = 0;
  @type("number") stateStartedAt = 0;
  @type("number") countdownEndsAt = 0;
  @type("number") matchEndsAt = 0;
}

export class ZoneCoreSchema extends Schema {
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") radius = 0;
  @type("number") targetX = 0;
  @type("number") targetY = 0;
  @type("number") targetRadius = 0;
  @type("number") damagePerSecond = 0;
}

export class ZonePhaseSchema extends Schema {
  @type("number") index = 0;
  @type("string") matchState: MatchState = "waiting";
  @type("number") startsAt = 0;
  @type("number") warningAt = 0;
  @type("number") closesAt = 0;
}

export class PlayerSchema extends Schema {
  @type("string") id = "";
  @type("string") sessionId = "";
  @type("string") name = "";
  @type("string") archetypeId: TankArchetypeId = DEFAULT_TANK_ARCHETYPE;
  @type("string") weaponType: WeaponType = DEFAULT_WEAPON_TYPE;
  @type("string") abilityType: AbilityType = DEFAULT_ABILITY_TYPE;
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") rotation = 0;
  @type("number") turretRotation = 0;
  @type("number") velocityX = 0;
  @type("number") velocityY = 0;
  @type("number") health = 100;
  @type("number") maxHealth = 100;
  @type("number") armor = 0;
  @type("number") maxArmor = 0;
  @type("number") shield = 0;
  @type("number") ammo = 0;
  @type("number") abilityCharge = 0;
  @type("number") fireCooldownMs = 0;
  @type("number") abilityCooldownMs = 0;
  @type("number") score = 0;
  @type("number") kills = 0;
  @type("number") deaths = 0;
  @type("number") damageDealt = 0;
  @type("number") damageTaken = 0;
  @type("number") placement = 0;
  @type("number") survivalTimeMs = 0;
  @type("number") joinedAt = 0;
  @type("number") respawnAt = 0;
  @type("boolean") isConnected = true;
  @type("boolean") isReady = false;
  @type("boolean") isAlive = true;
  @type("boolean") isSpectator = false;
  @type("boolean") isHost = false;
}

export class ProjectileSchema extends Schema {
  @type("string") id = "";
  @type("string") ownerId = "";
  @type("string") weaponType: WeaponType = DEFAULT_WEAPON_TYPE;
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") velocityX = 0;
  @type("number") velocityY = 0;
  @type("number") rotation = 0;
  @type("number") damage = 0;
  @type("number") radius = 4;
  @type("number") splashRadius = 0;
  @type("number") spawnedAt = 0;
  @type("number") expiresAt = 0;
}

export class PickupSchema extends Schema {
  @type("string") id = "";
  @type("string") pickupType: PickupType = "health_repair";
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") radius = 24;
  @type("number") value = 0;
  @type("number") durationMs = 0;
  @type("number") spawnedAt = 0;
  @type("number") respawnsAt = 0;
  @type("boolean") isActive = true;
}

export class Alpha7StateSchema extends Schema {
  @type("string") matchState: MatchState = "waiting";
  @type("string") roomCode = "";
  @type("string") seed = "";
  @type("string") arenaConfigJson = "";
  @type("string") mapConfigJson = "";
  @type(MatchCoreSchema) match = new MatchCoreSchema();
  @type(ZoneCoreSchema) zone = new ZoneCoreSchema();
  @type(ZonePhaseSchema) zonePhase = new ZonePhaseSchema();
  @type({ map: PlayerSchema }) players = new MapSchema<PlayerSchema>();
  @type([ProjectileSchema]) projectiles = new ArraySchema<ProjectileSchema>();
  @type([PickupSchema]) pickups = new ArraySchema<PickupSchema>();

  setMatchState(matchState: MatchState): void {
    this.matchState = matchState;
    this.zonePhase.matchState = matchState;
  }
}
