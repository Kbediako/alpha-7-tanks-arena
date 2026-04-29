import {
  ABILITY_CONFIG,
  DEFAULT_TANK_ARCHETYPE,
  TANK_ARCHETYPE_CONFIG,
  TANK_ARCHETYPES,
  WEAPON_CONFIG,
  type AbilityType,
  type MatchState,
  type PickupType,
  type TankArchetypeId,
  type WeaponType
} from "@alpha7/shared";
import type {
  Alpha7StateSchema,
  PickupSchema,
  PlayerSchema,
  ProjectileSchema
} from "@alpha7/shared/schema";

export type ConnectionStatus = "idle" | "connecting" | "connected" | "offline" | "error";
export type ScreenMode = "menu" | "lobby" | "playing";
export type JoinMode = "quick" | "public" | "private" | "code";

export interface ClientPlayer {
  id: string;
  sessionId: string;
  name: string;
  archetypeId: TankArchetypeId;
  weaponType: WeaponType;
  abilityType: AbilityType;
  x: number;
  y: number;
  rotation: number;
  turretRotation: number;
  velocityX: number;
  velocityY: number;
  health: number;
  maxHealth: number;
  armor: number;
  maxArmor: number;
  shield: number;
  ammo: number;
  abilityCharge: number;
  fireCooldownMs: number;
  abilityCooldownMs: number;
  score: number;
  kills: number;
  deaths: number;
  placement: number;
  isConnected: boolean;
  isReady: boolean;
  isAlive: boolean;
  isSpectator: boolean;
  isHost: boolean;
  isSelf: boolean;
}

export interface ClientProjectile {
  id: string;
  ownerId: string;
  weaponType: WeaponType;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  rotation: number;
  radius: number;
  expiresAt: number;
}

export interface ClientPickup {
  id: string;
  pickupType: PickupType;
  x: number;
  y: number;
  radius: number;
  isActive: boolean;
}

export interface ArenaWall {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
}

export interface ArenaSpawn {
  id: string;
  x: number;
  y: number;
}

export interface ArenaMapConfig {
  id: string;
  source: "server" | "fallback";
  width: number;
  height: number;
  walls: ArenaWall[];
  spawns: ArenaSpawn[];
}

export interface ClientSnapshot {
  roomId: string;
  roomCode: string;
  matchState: MatchState;
  seed: string;
  tick: number;
  alivePlayers: number;
  countdownEndsAt: number;
  matchEndsAt: number;
  stateStartedAt: number;
  zone: {
    x: number;
    y: number;
    radius: number;
    targetX: number;
    targetY: number;
    targetRadius: number;
    damagePerSecond: number;
  };
  players: ClientPlayer[];
  self: ClientPlayer | null;
  projectiles: ClientProjectile[];
  pickups: ClientPickup[];
  map: ArenaMapConfig;
}

export interface InputFrame {
  moveX: number;
  moveY: number;
  aimScreenX: number;
  aimScreenY: number;
  aimWorldX: number;
  aimWorldY: number;
  aimDirX: number;
  aimDirY: number;
  fire: boolean;
  ability: boolean;
}

type StateWithOptionalMap = Alpha7StateSchema & {
  arenaConfigJson?: unknown;
  mapConfig?: unknown;
  mapConfigJson?: unknown;
};

type UnknownRecord = Record<string, unknown>;

const DEFAULT_MAP_WIDTH = 1800;
const DEFAULT_MAP_HEIGHT = 1200;
const WALL_DEPTH = 118;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const numberValue = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const stringValue = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const tankArchetype = (value: string): TankArchetypeId =>
  TANK_ARCHETYPES.includes(value as TankArchetypeId)
    ? (value as TankArchetypeId)
    : DEFAULT_TANK_ARCHETYPE;

const weaponType = (value: string): WeaponType =>
  value in WEAPON_CONFIG ? (value as WeaponType) : TANK_ARCHETYPE_CONFIG[DEFAULT_TANK_ARCHETYPE].primaryWeapon;

const abilityType = (value: string): AbilityType =>
  value in ABILITY_CONFIG ? (value as AbilityType) : TANK_ARCHETYPE_CONFIG[DEFAULT_TANK_ARCHETYPE].ability;

export const isActiveMatchState = (matchState: MatchState): boolean =>
  matchState === "running" || matchState === "danger" || matchState === "final_zone";

export const isWaitingRoomState = (matchState: MatchState): boolean =>
  matchState === "waiting" || matchState === "countdown";

export const endpointFromEnv = (): string => {
  const configured = import.meta.env.VITE_WS_URL;
  return typeof configured === "string" && configured.trim() ? configured.trim() : "ws://localhost:2567";
};

export const fallbackMapConfig = (seed = "local"): ArenaMapConfig => {
  const outerThickness = 72;
  const halfW = DEFAULT_MAP_WIDTH / 2;
  const halfH = DEFAULT_MAP_HEIGHT / 2;
  const centeredWalls: ArenaWall[] = [
    { id: "outer-n", x: 0, y: -halfH + outerThickness / 2, width: DEFAULT_MAP_WIDTH, height: outerThickness, depth: WALL_DEPTH },
    { id: "outer-s", x: 0, y: halfH - outerThickness / 2, width: DEFAULT_MAP_WIDTH, height: outerThickness, depth: WALL_DEPTH },
    { id: "outer-w", x: -halfW + outerThickness / 2, y: 0, width: outerThickness, height: DEFAULT_MAP_HEIGHT, depth: WALL_DEPTH },
    { id: "outer-e", x: halfW - outerThickness / 2, y: 0, width: outerThickness, height: DEFAULT_MAP_HEIGHT, depth: WALL_DEPTH },
    { id: "block-nw", x: -555, y: -338, width: 300, height: 80, depth: WALL_DEPTH },
    { id: "block-ne", x: 455, y: -330, width: 92, height: 326, depth: WALL_DEPTH },
    { id: "block-sw", x: -470, y: 305, width: 96, height: 280, depth: WALL_DEPTH },
    { id: "block-se", x: 488, y: 330, width: 360, height: 84, depth: WALL_DEPTH },
    { id: "maze-left-a", x: -240, y: -126, width: 88, height: 438, depth: WALL_DEPTH },
    { id: "maze-left-b", x: -128, y: -304, width: 308, height: 78, depth: WALL_DEPTH },
    { id: "maze-mid", x: 40, y: 88, width: 86, height: 314, depth: WALL_DEPTH },
    { id: "maze-right-a", x: 290, y: -86, width: 310, height: 78, depth: WALL_DEPTH },
    { id: "cover-1", x: -612, y: 96, width: 100, height: 100, depth: 88 },
    { id: "cover-2", x: -70, y: 338, width: 104, height: 104, depth: 88 },
    { id: "cover-3", x: 228, y: -398, width: 104, height: 104, depth: 88 },
    { id: "cover-4", x: 614, y: 74, width: 104, height: 104, depth: 88 }
  ];
  const walls = centeredWalls.map((wall) => ({
    ...wall,
    x: wall.x + halfW,
    y: wall.y + halfH
  }));
  const centeredSpawns = [
    { id: "spawn-w", x: -720, y: 0 },
    { id: "spawn-e", x: 720, y: 0 },
    { id: "spawn-n", x: 0, y: -460 },
    { id: "spawn-s", x: 0, y: 460 },
    { id: "spawn-nw", x: -650, y: -420 },
    { id: "spawn-se", x: 650, y: 420 },
    { id: "spawn-ne", x: 650, y: -420 },
    { id: "spawn-sw", x: -650, y: 420 }
  ];

  return {
    id: `fallback-${seed}`,
    source: "fallback",
    width: DEFAULT_MAP_WIDTH,
    height: DEFAULT_MAP_HEIGHT,
    walls,
    spawns: centeredSpawns.map((spawn) => ({
      ...spawn,
      x: spawn.x + halfW,
      y: spawn.y + halfH
    }))
  };
};

const wallFromRecord = (record: UnknownRecord, index: number): ArenaWall | undefined => {
  const rect = isRecord(record.rect) ? record.rect : record;
  const position = isRecord(record.position) ? record.position : {};
  const size = isRecord(record.size) ? record.size : {};
  const width = numberValue(rect.width) ?? numberValue(rect.w) ?? numberValue(size.width) ?? numberValue(size.x);
  const height = numberValue(rect.height) ?? numberValue(rect.h) ?? numberValue(size.height) ?? numberValue(size.y);
  const rawX =
    numberValue(rect.x) ??
    numberValue(rect.centerX) ??
    numberValue(position.x) ??
    numberValue(rect.left);
  const rawY =
    numberValue(rect.y) ??
    numberValue(rect.centerY) ??
    numberValue(position.y) ??
    numberValue(position.z) ??
    numberValue(rect.top);

  if (width === undefined || height === undefined || rawX === undefined || rawY === undefined) return undefined;

  const isTopLeftRect =
    typeof record.kind === "string" ||
    stringValue(record.id)?.startsWith("wall-") ||
    stringValue(record.id)?.startsWith("collision-") ||
    rect.left !== undefined ||
    rect.top !== undefined;
  const x = isTopLeftRect ? rawX + width / 2 : rawX;
  const y = isTopLeftRect ? rawY + height / 2 : rawY;

  return {
    id: stringValue(record.id) ?? stringValue(record.key) ?? `server-wall-${index}`,
    x,
    y,
    width: Math.max(8, width),
    height: Math.max(8, height),
    depth: Math.max(24, numberValue(record.depth) ?? numberValue(record.z) ?? WALL_DEPTH)
  };
};

const wallFromArray = (value: unknown[], index: number): ArenaWall | undefined => {
  const x = numberValue(value[0]);
  const y = numberValue(value[1]);
  const width = numberValue(value[2]);
  const height = numberValue(value[3]);
  if (x === undefined || y === undefined || width === undefined || height === undefined) return undefined;
  return { id: `server-wall-${index}`, x, y, width, height, depth: WALL_DEPTH };
};

const spawnFromValue = (value: unknown, index: number): ArenaSpawn | undefined => {
  if (Array.isArray(value)) {
    const x = numberValue(value[0]);
    const y = numberValue(value[1]);
    return x === undefined || y === undefined ? undefined : { id: `server-spawn-${index}`, x, y };
  }
  if (!isRecord(value)) return undefined;
  const position = isRecord(value.position) ? value.position : value;
  const x = numberValue(position.x);
  const y = numberValue(position.y) ?? numberValue(position.z);
  return x === undefined || y === undefined
    ? undefined
    : { id: stringValue(value.id) ?? `server-spawn-${index}`, x, y };
};

export const parseMapConfig = (raw: unknown, seed?: string): ArenaMapConfig => {
  const fallback = fallbackMapConfig(seed);
  const parsed = typeof raw === "string" && raw.trim() ? safeJson(raw) : raw;
  if (!isRecord(parsed)) return fallback;

  const size = isRecord(parsed.size) ? parsed.size : {};
  const width = numberValue(parsed.width) ?? numberValue(parsed.arenaWidth) ?? numberValue(size.width);
  const height = numberValue(parsed.height) ?? numberValue(parsed.arenaHeight) ?? numberValue(size.height);
  const wallsRaw = Array.isArray(parsed.walls)
    ? parsed.walls
    : Array.isArray(parsed.wallRects)
      ? parsed.wallRects
      : Array.isArray(parsed.collisionRects)
        ? parsed.collisionRects
    : Array.isArray(parsed.obstacles)
      ? parsed.obstacles
      : [];

  const walls = wallsRaw
    .map((wall, index) =>
      Array.isArray(wall) ? wallFromArray(wall, index) : isRecord(wall) ? wallFromRecord(wall, index) : undefined
    )
    .filter((wall): wall is ArenaWall => Boolean(wall));

  if (width === undefined || height === undefined || walls.length === 0) return fallback;

  const spawnsRaw = Array.isArray(parsed.spawns)
    ? parsed.spawns
    : Array.isArray(parsed.spawnPoints)
      ? parsed.spawnPoints
      : [];
  const spawns = spawnsRaw
    .map((spawn, index) => spawnFromValue(spawn, index))
    .filter((spawn): spawn is ArenaSpawn => Boolean(spawn));

  return {
    id: stringValue(parsed.id) ?? stringValue(parsed.name) ?? `server-${seed ?? "arena"}`,
    source: "server",
    width,
    height,
    walls,
    spawns: spawns.length > 0 ? spawns : fallback.spawns
  };
};

const safeJson = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
};

const snapshotPlayer = (player: PlayerSchema, selfSessionId?: string): ClientPlayer => ({
  id: player.id || player.sessionId,
  sessionId: player.sessionId,
  name: player.name,
  archetypeId: tankArchetype(player.archetypeId),
  weaponType: weaponType(player.weaponType),
  abilityType: abilityType(player.abilityType),
  x: player.x,
  y: player.y,
  rotation: player.rotation,
  turretRotation: player.turretRotation,
  velocityX: player.velocityX,
  velocityY: player.velocityY,
  health: player.health,
  maxHealth: player.maxHealth,
  armor: player.armor,
  maxArmor: player.maxArmor,
  shield: player.shield,
  ammo: player.ammo,
  abilityCharge: player.abilityCharge,
  fireCooldownMs: player.fireCooldownMs,
  abilityCooldownMs: player.abilityCooldownMs,
  score: player.score,
  kills: player.kills,
  deaths: player.deaths,
  placement: player.placement,
  isConnected: player.isConnected,
  isReady: player.isReady,
  isAlive: player.isAlive,
  isSpectator: player.isSpectator,
  isHost: player.isHost,
  isSelf: player.sessionId === selfSessionId
});

const snapshotProjectile = (projectile: ProjectileSchema): ClientProjectile => ({
  id: projectile.id,
  ownerId: projectile.ownerId,
  weaponType: weaponType(projectile.weaponType),
  x: projectile.x,
  y: projectile.y,
  velocityX: projectile.velocityX,
  velocityY: projectile.velocityY,
  rotation: projectile.rotation,
  radius: projectile.radius,
  expiresAt: projectile.expiresAt
});

const snapshotPickup = (pickup: PickupSchema): ClientPickup => ({
  id: pickup.id,
  pickupType: pickup.pickupType,
  x: pickup.x,
  y: pickup.y,
  radius: pickup.radius,
  isActive: pickup.isActive
});

export const snapshotFromState = (
  state: Alpha7StateSchema,
  roomId: string,
  selfSessionId?: string
): ClientSnapshot => {
  const extendedState = state as StateWithOptionalMap;
  const players = Array.from(state.players.values()).map((player) =>
    snapshotPlayer(player, selfSessionId)
  );
  const self = players.find((player) => player.isSelf) ?? null;

  return {
    roomId,
    roomCode: state.roomCode || roomId,
    matchState: state.matchState,
    seed: state.seed,
    tick: state.match.tick,
    alivePlayers: state.match.alivePlayers,
    countdownEndsAt: state.match.countdownEndsAt,
    matchEndsAt: state.match.matchEndsAt,
    stateStartedAt: state.match.stateStartedAt,
    zone: {
      x: state.zone.x,
      y: state.zone.y,
      radius: state.zone.radius,
      targetX: state.zone.targetX,
      targetY: state.zone.targetY,
      targetRadius: state.zone.targetRadius,
      damagePerSecond: state.zone.damagePerSecond
    },
    players,
    self,
    projectiles: Array.from(state.projectiles.values()).map(snapshotProjectile),
    pickups: Array.from(state.pickups.values()).map(snapshotPickup),
    map: parseMapConfig(
      extendedState.arenaConfigJson ?? extendedState.mapConfigJson ?? extendedState.mapConfig,
      state.seed
    )
  };
};

export const previewSnapshot = (
  selectedTank: TankArchetypeId,
  playerName: string,
  seed = "preview"
): ClientSnapshot => {
  const config = TANK_ARCHETYPE_CONFIG[selectedTank];
  const map = fallbackMapConfig(seed);
  const spawn = map.spawns[0] ?? { x: map.width / 2, y: map.height / 2 };
  const player: ClientPlayer = {
    id: "local-preview",
    sessionId: "local-preview",
    name: playerName.trim() || "Operator",
    archetypeId: selectedTank,
    weaponType: config.primaryWeapon,
    abilityType: config.ability,
    x: spawn.x,
    y: spawn.y,
    rotation: 0,
    turretRotation: 0,
    velocityX: 0,
    velocityY: 0,
    health: config.maxHealth,
    maxHealth: config.maxHealth,
    armor: config.maxArmor,
    maxArmor: config.maxArmor,
    shield: 0,
    ammo: 24,
    abilityCharge: 65,
    fireCooldownMs: 0,
    abilityCooldownMs: 0,
    score: 0,
    kills: 0,
    deaths: 0,
    placement: 0,
    isConnected: true,
    isReady: false,
    isAlive: true,
    isSpectator: false,
    isHost: true,
    isSelf: true
  };

  return {
    roomId: "local",
    roomCode: "LOCAL",
    matchState: "waiting",
    seed,
    tick: 0,
    alivePlayers: 1,
    countdownEndsAt: 0,
    matchEndsAt: 0,
    stateStartedAt: Date.now(),
    zone: {
      x: 0,
      y: 0,
      radius: 0,
      targetX: 0,
      targetY: 0,
      targetRadius: 0,
      damagePerSecond: 0
    },
    players: [player],
    self: player,
    projectiles: [],
    pickups: [],
    map
  };
};
