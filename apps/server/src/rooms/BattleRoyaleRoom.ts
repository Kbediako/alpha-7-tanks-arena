import {
  ErrorCode,
  Room,
  ServerError,
  type AuthContext,
  type Client,
  type Delayed
} from "colyseus";
import {
  ABILITY_CONFIG,
  BATTLE_ROYALE_ROOM,
  CLIENT_MESSAGE_TYPES,
  DEFAULT_TANK_ARCHETYPE,
  PICKUP_CONFIG,
  SERVER_MESSAGE_TYPES,
  TANK_ARCHETYPE_CONFIG,
  TANK_ARCHETYPES,
  WEAPON_CONFIG,
  clampToArena,
  generateArenaConfig,
  isWallCollision,
  type AbilityMessagePayload,
  type ArenaConfig,
  type ArenaPoint,
  type ErrorMessageCode,
  type FireMessagePayload,
  type InputMessagePayload,
  type JoinMessagePayload,
  type MatchState,
  type ReadyMessagePayload,
  type RematchMessagePayload,
  type StartMessagePayload,
  type SystemMessageCode,
  type TankArchetypeId
} from "@alpha7/shared";
import {
  Alpha7StateSchema,
  PickupSchema,
  PlayerSchema,
  ProjectileSchema
} from "@alpha7/shared/schema";
import type { ServerConfig } from "../config.js";

const MIN_PLAYERS_TO_START = 2;
const COUNTDOWN_MS = 5_000;
const DANGER_AFTER_RUNNING_MS = 90_000;
const FINAL_ZONE_AFTER_RUNNING_MS = 150_000;
const FINISHED_AFTER_RUNNING_MS = 210_000;
const MAX_DISPLAY_NAME_LENGTH = 18;
const DEFAULT_ARENA_SIZE = 2_200;
const TANK_COLLISION_RADIUS = 28;
const MAX_SIMULATION_DELTA_MS = 100;
const INPUT_INTENT_TTL_MS = 300;
const MAX_ABILITY_CHARGE = 100;
const ABILITY_CHARGE_PER_SECOND = 4;
const DAMAGE_TO_CHARGE_RATIO = 0.18;
const DAMAGE_TAKEN_CHARGE_RATIO = 0.1;
const REPAIR_HEALTH_AMOUNT = 28;
const REPAIR_ARMOR_AMOUNT = 12;
const SHIELD_PULSE_AMOUNT = 40;
const SPEED_BURST_MULTIPLIER = 1.55;
const SMOKE_DAMAGE_REDUCTION = 0.4;
const RAPID_FIRE_COOLDOWN_MULTIPLIER = 0.55;
const PROJECTILE_SPAWN_PADDING = 8;

const makeRoomCode = (): string => Math.random().toString(36).slice(2, 8).toUpperCase();

interface BattleRoyaleCreateOptions {
  config: ServerConfig;
  privateRoom?: unknown;
  private?: unknown;
  seed?: unknown;
}

interface BattleRoyaleRoomMetadata {
  roomName: typeof BATTLE_ROYALE_ROOM;
  roomCode: string;
  private: boolean;
  matchState: MatchState;
  playerCount: number;
  maxClients: number;
  seed: string;
}

interface StoredInputIntent extends InputMessagePayload {
  receivedAt: number;
}

interface StoredFireIntent extends Omit<FireMessagePayload, "weaponType"> {
  weaponType: PlayerSchema["weaponType"];
  receivedAt: number;
}

interface StoredAbilityIntent extends Required<Pick<AbilityMessagePayload, "sequence" | "abilityType">> {
  targetX?: number;
  targetY?: number;
  receivedAt: number;
}

interface ArenaBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width?: number;
  height?: number;
}

interface TimedShieldEffect {
  expiresAt: number;
  remaining: number;
}

interface TimedMultiplierEffect {
  expiresAt: number;
  multiplier: number;
}

interface TimedReductionEffect {
  expiresAt: number;
  reduction: number;
}

type MutableAlpha7StateSchema = Alpha7StateSchema & {
  arenaConfigJson?: string;
  mapConfigJson?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const positiveNumberOr = (value: number | undefined, fallback: number): number =>
  value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;

const angleTo = (fromX: number, fromY: number, toX: number, toY: number): number =>
  Math.atan2(toY - fromY, toX - fromX);

const lerp = (from: number, to: number, progress: number): number => from + (to - from) * progress;

const projectileRadius = (weaponType: PlayerSchema["weaponType"]): number => {
  switch (weaponType) {
    case "machine_gun":
      return 4;
    case "light_cannon":
      return 6;
    case "explosive":
      return 10;
    default:
      return 8;
  }
};

const totalDurability = (player: PlayerSchema): number => player.health + player.armor + player.shield;

const distanceToSegmentSquared = (
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number => {
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 && dy === 0) {
    return (px - ax) ** 2 + (py - ay) ** 2;
  }

  const t = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy), 0, 1);
  const nearestX = ax + dx * t;
  const nearestY = ay + dy * t;
  return (px - nearestX) ** 2 + (py - nearestY) ** 2;
};

const deterministicSpread = (sequence: number, spreadRadians: number): number => {
  if (spreadRadians <= 0) return 0;
  const normalized = Math.sin(sequence * 12.9898) * 43758.5453;
  const fraction = normalized - Math.floor(normalized);
  return (fraction * 2 - 1) * spreadRadians;
};

const getArenaBounds = (arena: ArenaConfig): ArenaBounds => {
  const compatibilityBounds = (arena as ArenaConfig & { bounds?: ArenaBounds }).bounds;
  if (compatibilityBounds) return compatibilityBounds;
  const width = positiveNumberOr(arena.width, DEFAULT_ARENA_SIZE);
  const height = positiveNumberOr(arena.height, DEFAULT_ARENA_SIZE);
  return {
    minX: 0,
    minY: 0,
    maxX: width,
    maxY: height,
    width,
    height
  };
};

const clampArenaBounds = (
  arena: ArenaConfig,
  x: number,
  y: number,
  radius: number
): ArenaPoint => {
  const bounds = getArenaBounds(arena);
  return {
    x: clamp(x, bounds.minX + radius, bounds.maxX - radius),
    y: clamp(y, bounds.minY + radius, bounds.maxY - radius)
  };
};

const intervalFromRate = (rate: number, fallback: number): number => {
  const safeRate = Number.isFinite(rate) && rate > 0 ? rate : fallback;
  return Math.max(1, Math.round(1_000 / safeRate));
};

const booleanOption = (value: unknown): boolean | undefined => {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return undefined;
};

const safeSeed = (value: unknown): string =>
  typeof value === "string" && value.trim()
    ? value.trim().slice(0, 64)
    : `alpha7-${Date.now().toString(36)}`;

const isTankArchetypeId = (value: unknown): value is TankArchetypeId =>
  typeof value === "string" && TANK_ARCHETYPES.includes(value as TankArchetypeId);

const sanitizeDisplayName = (value: unknown, fallback: string): string => {
  if (typeof value !== "string") return fallback;

  const sanitized = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[<>]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, MAX_DISPLAY_NAME_LENGTH);

  return sanitized || fallback;
};

const parseJoinPayload = (payload: unknown): JoinMessagePayload | undefined => {
  if (!isRecord(payload) || !isTankArchetypeId(payload.archetypeId)) return undefined;

  return {
    playerName: sanitizeDisplayName(payload.playerName, "Player"),
    archetypeId: payload.archetypeId,
    clientVersion: typeof payload.clientVersion === "string" ? payload.clientVersion.slice(0, 32) : undefined
  };
};

const parseReadyPayload = (payload: unknown): ReadyMessagePayload | undefined =>
  isRecord(payload) && isBoolean(payload.ready) ? { ready: payload.ready } : undefined;

const parseStartPayload = (payload: unknown): StartMessagePayload | undefined => {
  if (payload === undefined) return {};
  if (!isRecord(payload)) return undefined;
  if (payload.start === undefined || payload.start === true) return { start: true };
  return undefined;
};

const parseInputPayload = (payload: unknown): StoredInputIntent | undefined => {
  if (!isRecord(payload)) return undefined;
  const { sequence, tick, moveX, moveY, aimX, aimY, fire, ability } = payload;
  if (
    !Number.isSafeInteger(sequence) ||
    !Number.isSafeInteger(tick) ||
    !isFiniteNumber(moveX) ||
    !isFiniteNumber(moveY) ||
    !isFiniteNumber(aimX) ||
    !isFiniteNumber(aimY) ||
    !isBoolean(fire) ||
    !isBoolean(ability)
  ) {
    return undefined;
  }

  return {
    sequence: sequence as number,
    tick: tick as number,
    moveX: clamp(moveX, -1, 1),
    moveY: clamp(moveY, -1, 1),
    aimX,
    aimY,
    fire,
    ability,
    receivedAt: Date.now()
  };
};

const parseFirePayload = (
  payload: unknown,
  fallbackWeaponType: PlayerSchema["weaponType"]
): StoredFireIntent | undefined => {
  if (!isRecord(payload)) return undefined;
  const { sequence, weaponType, aimX, aimY, chargeMs } = payload;
  if (!Number.isSafeInteger(sequence) || !isFiniteNumber(aimX) || !isFiniteNumber(aimY)) {
    return undefined;
  }
  if (weaponType !== undefined && weaponType !== fallbackWeaponType) {
    return undefined;
  }
  if (chargeMs !== undefined && (!isFiniteNumber(chargeMs) || chargeMs < 0)) {
    return undefined;
  }

  return {
    sequence: sequence as number,
    weaponType: (weaponType as PlayerSchema["weaponType"] | undefined) ?? fallbackWeaponType,
    aimX,
    aimY,
    chargeMs: chargeMs === undefined ? undefined : clamp(chargeMs, 0, 5_000),
    receivedAt: Date.now()
  };
};

const parseAbilityPayload = (
  payload: unknown,
  fallbackAbilityType: PlayerSchema["abilityType"]
): StoredAbilityIntent | undefined => {
  if (!isRecord(payload)) return undefined;
  const { sequence, abilityType, targetX, targetY } = payload;
  if (!Number.isSafeInteger(sequence) || abilityType !== fallbackAbilityType) {
    return undefined;
  }
  if (targetX !== undefined && !isFiniteNumber(targetX)) return undefined;
  if (targetY !== undefined && !isFiniteNumber(targetY)) return undefined;

  return {
    sequence: sequence as number,
    abilityType: fallbackAbilityType,
    targetX: targetX as number | undefined,
    targetY: targetY as number | undefined,
    receivedAt: Date.now()
  };
};

const parseRematchPayload = (payload: unknown): RematchMessagePayload | undefined => {
  if (!isRecord(payload) || !isBoolean(payload.ready)) return undefined;
  if (payload.previousMatchId !== undefined && typeof payload.previousMatchId !== "string") {
    return undefined;
  }

  return {
    ready: payload.ready,
    previousMatchId:
      typeof payload.previousMatchId === "string" ? payload.previousMatchId.slice(0, 80) : undefined
  };
};

const applyTankConfig = (player: PlayerSchema, archetypeId: TankArchetypeId): void => {
  const tankConfig = TANK_ARCHETYPE_CONFIG[archetypeId];

  player.archetypeId = archetypeId;
  player.weaponType = tankConfig.primaryWeapon;
  player.abilityType = tankConfig.ability;
  player.maxHealth = tankConfig.maxHealth;
  player.health = tankConfig.maxHealth;
  player.maxArmor = tankConfig.maxArmor;
  player.armor = tankConfig.maxArmor;
};

const playerCount = (state: Alpha7StateSchema): number => {
  let count = 0;
  for (const player of state.players.values()) {
    if (!player.isSpectator) count += 1;
  }
  return count;
};

const connectedPlayerCount = (state: Alpha7StateSchema): number => {
  let count = 0;
  for (const player of state.players.values()) {
    if (!player.isSpectator && player.isConnected) count += 1;
  }
  return count;
};

const alivePlayerCount = (state: Alpha7StateSchema): number => {
  let count = 0;
  for (const player of state.players.values()) {
    if (!player.isSpectator && player.isConnected && player.isAlive) count += 1;
  }
  return count;
};

export class BattleRoyaleRoom extends Room<Alpha7StateSchema, BattleRoyaleRoomMetadata> {
  private config?: ServerConfig;
  private arena?: ArenaConfig;
  private isPrivateRoom = false;
  private autoStartTimer?: Delayed;
  private runningStartedAt = 0;
  private dangerStartsAt = 0;
  private finalZoneStartsAt = 0;
  private finishedAt = 0;
  private readonly inputIntents = new Map<string, StoredInputIntent>();
  private readonly fireIntents = new Map<string, StoredFireIntent>();
  private readonly abilityIntents = new Map<string, StoredAbilityIntent>();
  private readonly rematchVotes = new Map<string, RematchMessagePayload>();
  private readonly lastProcessedFireSequences = new Map<string, number>();
  private readonly lastProcessedAbilitySequences = new Map<string, number>();
  private readonly speedEffects = new Map<string, TimedMultiplierEffect>();
  private readonly rapidFireEffects = new Map<string, TimedMultiplierEffect>();
  private readonly shieldEffects = new Map<string, TimedShieldEffect>();
  private readonly smokeEffects = new Map<string, TimedReductionEffect>();
  private readonly zoneDamageRemainders = new Map<string, number>();
  private eliminationBatchPlacement: number | undefined;
  private projectileCounter = 0;

  async onCreate(options: BattleRoyaleCreateOptions) {
    const { config } = options;
    this.config = config;
    this.isPrivateRoom =
      booleanOption(options.privateRoom) ?? booleanOption(options.private) ?? false;
    this.maxClients = config.demoMaxPlayers;
    this.patchRate = intervalFromRate(config.roomPatchRate, 20);

    if (this.isPrivateRoom) {
      this.roomId = makeRoomCode();
    }

    const state = new Alpha7StateSchema();
    state.roomCode = this.roomId || makeRoomCode();
    state.seed = safeSeed(options.seed);
    state.match.matchId = `${state.roomCode}-${Date.now().toString(36)}`;
    state.match.stateStartedAt = Date.now();
    this.setState(state);
    this.arena = generateArenaConfig({
      seed: state.seed,
      playerCount: config.demoMaxPlayers
    });
    this.syncArenaConfig();
    this.initializePickups(state.match.stateStartedAt);
    this.applyZonePhase("waiting", state.match.stateStartedAt);

    await this.setPrivate(this.isPrivateRoom);
    await this.updateMetadata();
    this.registerMessageHandlers();
    this.setSimulationInterval(
      (deltaTime) => this.onSimulationTick(deltaTime),
      intervalFromRate(config.roomTickRate, 30)
    );
  }

  onAuth(_client: Client, _options: unknown, _context: AuthContext) {
    if (!this.canAcceptActiveJoin()) {
      throw new ServerError(ErrorCode.AUTH_FAILED, "room is locked");
    }

    return true;
  }

  onJoin(client: Client, options?: unknown) {
    if (!this.canAcceptActiveJoin()) {
      throw new ServerError(ErrorCode.AUTH_FAILED, "room is locked");
    }

    const player = this.createPlayer(client, options);
    this.state.players.set(client.sessionId, player);
    this.state.match.alivePlayers = alivePlayerCount(this.state);

    this.sendSystem(client, "player_joined", "joined");
    this.broadcastSystem("player_joined", `${player.name} joined`);
    void this.updateMetadata();
    this.ensureAutoStartTimer();
  }

  onLeave(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    const wasCountingDown = this.state.matchState === "countdown";
    const now = Date.now();

    this.clearPlayerRuntimeState(client.sessionId, player);
    this.rematchVotes.delete(client.sessionId);

    if (this.state.matchState === "waiting" || this.state.matchState === "countdown") {
      this.state.players.delete(client.sessionId);
    } else {
      if (player.isAlive && !player.isSpectator) {
        this.eliminatePlayer(player, undefined, now);
      }
      player.isConnected = false;
    }

    this.ensureHost();
    this.state.match.alivePlayers = alivePlayerCount(this.state);
    if (wasCountingDown && !this.hasMinimumPlayers()) {
      this.cancelCountdown();
    }
    this.checkForMatchConclusion(now);
    this.ensureAutoStartTimer();
    void this.updateMetadata();
  }

  onDispose() {
    this.autoStartTimer?.clear();
    this.autoStartTimer = undefined;
  }

  private registerMessageHandlers(): void {
    this.onMessage(CLIENT_MESSAGE_TYPES.JOIN, (client, payload) =>
      this.handleJoinMessage(client, payload)
    );
    this.onMessage(CLIENT_MESSAGE_TYPES.READY, (client, payload) =>
      this.handleReadyMessage(client, payload)
    );
    this.onMessage(CLIENT_MESSAGE_TYPES.START, (client, payload) =>
      this.handleStartMessage(client, payload)
    );
    this.onMessage(CLIENT_MESSAGE_TYPES.INPUT, (client, payload) =>
      this.handleInputMessage(client, payload)
    );
    this.onMessage(CLIENT_MESSAGE_TYPES.FIRE, (client, payload) =>
      this.handleFireMessage(client, payload)
    );
    this.onMessage(CLIENT_MESSAGE_TYPES.ABILITY, (client, payload) =>
      this.handleAbilityMessage(client, payload)
    );
    this.onMessage(CLIENT_MESSAGE_TYPES.REMATCH, (client, payload) =>
      this.handleRematchMessage(client, payload)
    );
  }

  private createPlayer(client: Client, options: unknown): PlayerSchema {
    const joinOptions = isRecord(options) ? options : {};
    const archetypeId = isTankArchetypeId(joinOptions.archetypeId)
      ? joinOptions.archetypeId
      : DEFAULT_TANK_ARCHETYPE;
    const player = new PlayerSchema();
    const fallbackName = `Player ${client.sessionId.slice(0, 4).toUpperCase()}`;

    player.id = client.sessionId;
    player.sessionId = client.sessionId;
    player.name = sanitizeDisplayName(joinOptions.playerName, fallbackName);
    applyTankConfig(player, archetypeId);
    player.fireCooldownMs = 0;
    player.abilityCooldownMs = 0;
    player.joinedAt = Date.now();
    player.isHost = this.state.players.size === 0;
    player.isReady = false;
    player.isAlive = true;
    player.isConnected = true;
    player.isSpectator = false;
    this.assignSpawnPosition(player, this.state.players.size);
    return player;
  }

  private handleJoinMessage(client: Client, payload: unknown): void {
    const parsed = parseJoinPayload(payload);
    const player = this.getPlayerOrError(client);
    if (!player) return;
    if (!parsed) {
      this.sendError(client, "invalid_payload", "Invalid join payload", false);
      return;
    }
    if (this.state.matchState !== "waiting") {
      this.sendError(client, "invalid_state", "Join updates are only accepted while waiting", false);
      return;
    }

    player.name = parsed.playerName;
    applyTankConfig(player, parsed.archetypeId);
    this.broadcastSystem("player_joined", `${player.name} joined`);
  }

  private handleReadyMessage(client: Client, payload: unknown): void {
    const parsed = parseReadyPayload(payload);
    const player = this.getPlayerOrError(client);
    if (!player) return;
    if (!parsed) {
      this.sendError(client, "invalid_payload", "Invalid ready payload", false, "ready");
      return;
    }
    if (this.state.matchState !== "waiting") {
      this.sendError(client, "invalid_state", "Ready changes are only accepted while waiting", false);
      return;
    }

    player.isReady = parsed.ready;
    this.broadcastSystem("player_ready", `${player.name} is ${parsed.ready ? "ready" : "not ready"}`);
    this.ensureAutoStartTimer();

    if (this.hasEnoughReadyPlayers()) {
      this.beginCountdown();
    }
  }

  private handleStartMessage(client: Client, payload: unknown): void {
    const parsed = parseStartPayload(payload);
    const player = this.getPlayerOrError(client);
    if (!player) return;
    if (!parsed) {
      this.sendError(client, "invalid_payload", "Invalid start payload", false);
      return;
    }
    if (!player.isHost) {
      this.sendError(client, "invalid_state", "Only the host can start the match", false);
      return;
    }
    if (this.state.matchState !== "waiting") {
      this.sendError(client, "invalid_state", "Match is not waiting", false);
      return;
    }
    if (!this.hasMinimumPlayers()) {
      this.sendError(client, "invalid_state", "At least two players are required to start", true);
      return;
    }

    this.beginCountdown();
  }

  private handleInputMessage(client: Client, payload: unknown): void {
    const player = this.getPlayerOrError(client);
    if (!player) return;
    if (!this.isActiveMatchState()) {
      this.sendError(client, "invalid_state", "Input is only accepted during active match states", false);
      return;
    }
    if (!this.canAcceptPlayerIntent(player)) {
      this.sendError(client, "invalid_state", "Only active players can send input", false);
      return;
    }

    const parsed = parseInputPayload(payload);
    if (!parsed) {
      this.sendError(client, "invalid_payload", "Invalid input payload", false);
      return;
    }

    const current = this.inputIntents.get(client.sessionId);
    if (current && parsed.sequence < current.sequence) return;
    this.inputIntents.set(client.sessionId, parsed);
  }

  private handleFireMessage(client: Client, payload: unknown): void {
    const player = this.getPlayerOrError(client);
    if (!player) return;
    if (!this.isActiveMatchState()) {
      this.sendError(client, "invalid_state", "Fire is only accepted during active match states", false);
      return;
    }
    if (!this.canAcceptPlayerIntent(player)) {
      this.sendError(client, "invalid_state", "Only active players can fire", false);
      return;
    }

    const parsed = parseFirePayload(payload, player.weaponType);
    if (!parsed) {
      this.sendError(client, "invalid_payload", "Invalid fire payload", false);
      return;
    }
    const lastProcessed = this.lastProcessedFireSequences.get(client.sessionId);
    if (lastProcessed !== undefined && parsed.sequence <= lastProcessed) return;
    const current = this.fireIntents.get(client.sessionId);
    if (current && parsed.sequence < current.sequence) return;
    if (player.fireCooldownMs > 0) {
      this.sendError(client, "rate_limited", "Weapon is cooling down", true, "fire");
      return;
    }

    this.fireIntents.set(client.sessionId, parsed);
  }

  private handleAbilityMessage(client: Client, payload: unknown): void {
    const player = this.getPlayerOrError(client);
    if (!player) return;
    if (!this.isActiveMatchState()) {
      this.sendError(client, "invalid_state", "Ability is only accepted during active match states", false);
      return;
    }
    if (!this.canAcceptPlayerIntent(player)) {
      this.sendError(client, "invalid_state", "Only active players can use abilities", false);
      return;
    }

    const parsed = parseAbilityPayload(payload, player.abilityType);
    if (!parsed) {
      this.sendError(client, "invalid_payload", "Invalid ability payload", false);
      return;
    }
    const lastProcessed = this.lastProcessedAbilitySequences.get(client.sessionId);
    if (lastProcessed !== undefined && parsed.sequence <= lastProcessed) return;
    const current = this.abilityIntents.get(client.sessionId);
    if (current && parsed.sequence < current.sequence) return;
    if (player.abilityCooldownMs > 0) {
      this.sendError(client, "rate_limited", "Ability is cooling down", true, "ability");
      return;
    }
    const abilityConfig = ABILITY_CONFIG[player.abilityType];
    if (player.abilityCharge < abilityConfig.chargeCost) {
      this.sendError(client, "rate_limited", "Ability is not charged", true, "ability");
      return;
    }

    this.abilityIntents.set(client.sessionId, parsed);
  }

  private handleRematchMessage(client: Client, payload: unknown): void {
    const player = this.getPlayerOrError(client);
    if (!player) return;
    const parsed = parseRematchPayload(payload);
    if (!parsed) {
      this.sendError(client, "invalid_payload", "Invalid rematch payload", false);
      return;
    }
    if (this.state.matchState !== "finished") {
      this.sendError(client, "invalid_state", "Rematch voting opens after the match finishes", false);
      return;
    }

    if (parsed.ready) {
      this.rematchVotes.set(client.sessionId, parsed);
    } else {
      this.rematchVotes.delete(client.sessionId);
    }
    player.isReady = parsed.ready;

    this.broadcastSystem("rematch", `${player.name} updated rematch vote`);
    this.resolveRematchVotes(Date.now());
  }

  private onSimulationTick(deltaTime: number): void {
    const now = Date.now();
    this.state.match.tick += 1;
    this.advanceTimedLifecycle(now);
    if (this.isActiveMatchState()) {
      this.runAuthoritativeSimulation(deltaTime, now);
    }
  }

  private advanceTimedLifecycle(now: number): void {
    if (this.state.matchState === "countdown" && now >= this.state.match.countdownEndsAt) {
      this.startRunning(now);
      return;
    }

    if (this.state.matchState === "running" && now >= this.dangerStartsAt) {
      this.transitionTo("danger", now);
      return;
    }

    if (this.state.matchState === "danger" && now >= this.finalZoneStartsAt) {
      this.transitionTo("final_zone", now);
      return;
    }

    if (this.state.matchState === "final_zone" && now >= this.finishedAt) {
      this.finishMatch(now);
    }
  }

  private beginCountdown(): void {
    if (this.state.matchState !== "waiting" || !this.hasMinimumPlayers()) return;

    this.autoStartTimer?.clear();
    this.autoStartTimer = undefined;
    void this.lock();

    const now = Date.now();
    this.state.match.countdownEndsAt = now + COUNTDOWN_MS;
    this.transitionTo("countdown", now);
  }

  private cancelCountdown(): void {
    if (this.state.matchState !== "countdown") return;

    this.state.match.countdownEndsAt = 0;
    void this.unlock();
    this.transitionTo("waiting", Date.now());
  }

  private startRunning(now: number): void {
    this.runningStartedAt = now;
    this.dangerStartsAt = this.zonePhaseStartAt("danger", now, DANGER_AFTER_RUNNING_MS);
    this.finalZoneStartsAt = this.zonePhaseStartAt("final_zone", now, FINAL_ZONE_AFTER_RUNNING_MS);
    this.finishedAt = this.zoneFinishAt(now, FINISHED_AFTER_RUNNING_MS);
    this.state.match.countdownEndsAt = 0;
    this.state.match.matchEndsAt = this.finishedAt;
    this.rematchVotes.clear();
    this.resetPlayersForMatchStart();
    this.initializePickups(now);
    this.state.match.alivePlayers = alivePlayerCount(this.state);
    this.transitionTo("running", now);
  }

  private transitionTo(matchState: MatchState, at: number): void {
    this.state.setMatchState(matchState);
    this.state.match.stateStartedAt = at;
    this.applyZonePhase(matchState, at);
    this.broadcastSystem("match_state", `Match state changed to ${matchState}`);
    void this.updateMetadata();
  }

  private syncArenaConfig(): void {
    if (!this.arena) return;
    const arenaConfigJson = JSON.stringify(this.arena);
    const state = this.state as MutableAlpha7StateSchema;
    state.arenaConfigJson = arenaConfigJson;
    state.mapConfigJson = arenaConfigJson;
  }

  private assignSpawnPosition(player: PlayerSchema, index: number): void {
    const spawnPoints = this.arena?.spawnPoints;
    const spawn = spawnPoints?.[index % spawnPoints.length];
    if (!spawn) return;

    player.x = spawn.x;
    player.y = spawn.y;
    player.rotation = spawn.rotation ?? player.rotation;
    player.turretRotation = player.rotation;
    player.velocityX = 0;
    player.velocityY = 0;
  }

  private resetPlayersForMatchStart(): void {
    let spawnIndex = 0;
    this.inputIntents.clear();
    this.fireIntents.clear();
    this.abilityIntents.clear();
    this.state.projectiles.splice(0, this.state.projectiles.length);
    this.lastProcessedFireSequences.clear();
    this.lastProcessedAbilitySequences.clear();
    this.speedEffects.clear();
    this.rapidFireEffects.clear();
    this.shieldEffects.clear();
    this.smokeEffects.clear();
    this.zoneDamageRemainders.clear();

    for (const player of this.state.players.values()) {
      if (!player.isConnected) continue;

      applyTankConfig(player, player.archetypeId);
      this.assignSpawnPosition(player, spawnIndex);
      player.shield = 0;
      player.ammo = 0;
      player.abilityCharge = MAX_ABILITY_CHARGE;
      player.fireCooldownMs = 0;
      player.abilityCooldownMs = 0;
      player.score = 0;
      player.kills = 0;
      player.deaths = 0;
      player.damageDealt = 0;
      player.damageTaken = 0;
      player.placement = 0;
      player.respawnAt = 0;
      player.survivalTimeMs = 0;
      player.isAlive = true;
      player.isReady = false;
      player.isSpectator = false;
      spawnIndex += 1;
    }
  }

  private initializePickups(now: number): void {
    this.state.pickups.splice(0, this.state.pickups.length);

    for (const placement of this.arena?.pickupPlacements ?? []) {
      const pickup = new PickupSchema();
      pickup.id = placement.id;
      pickup.pickupType = placement.pickupType;
      pickup.x = placement.x;
      pickup.y = placement.y;
      pickup.radius = placement.radius;
      pickup.value = placement.value;
      pickup.durationMs = placement.durationMs;
      pickup.spawnedAt = now;
      pickup.respawnsAt = 0;
      pickup.isActive = true;
      this.state.pickups.push(pickup);
    }
  }

  private runAuthoritativeSimulation(deltaTime: number, now: number): void {
    const deltaMs = clamp(deltaTime, 0, MAX_SIMULATION_DELTA_MS);

    this.updateZoneState(now);
    this.updateCombatState(deltaMs, now);
    this.applyAuthoritativeMovement(deltaMs, now);
    this.processAbilityIntents(now);
    this.processFireIntents(now);
    this.simulateProjectiles(deltaMs, now);
    this.collectPickups(now);
    this.applyZoneDamage(deltaMs, now);
    this.respawnPickups(now);
    this.state.match.alivePlayers = alivePlayerCount(this.state);
    this.checkForMatchConclusion(now);
  }

  private updateCombatState(deltaMs: number, now: number): void {
    const deltaCharge = (deltaMs / 1_000) * ABILITY_CHARGE_PER_SECOND;

    for (const player of this.state.players.values()) {
      player.fireCooldownMs = Math.max(0, player.fireCooldownMs - deltaMs);
      player.abilityCooldownMs = Math.max(0, player.abilityCooldownMs - deltaMs);

      if (this.canAcceptPlayerIntent(player)) {
        player.abilityCharge = clamp(player.abilityCharge + deltaCharge, 0, MAX_ABILITY_CHARGE);
        player.survivalTimeMs = Math.max(0, now - this.runningStartedAt);
      }
    }

    for (const [sessionId, effect] of this.shieldEffects.entries()) {
      if (effect.expiresAt > now) continue;
      const player = this.state.players.get(sessionId);
      if (player) {
        player.shield = Math.max(0, player.shield - effect.remaining);
      }
      this.shieldEffects.delete(sessionId);
    }

    for (const [sessionId, effect] of this.speedEffects.entries()) {
      if (effect.expiresAt <= now) this.speedEffects.delete(sessionId);
    }
    for (const [sessionId, effect] of this.rapidFireEffects.entries()) {
      if (effect.expiresAt > now) continue;
      const player = this.state.players.get(sessionId);
      if (player && player.weaponType !== "explosive") {
        player.ammo = 0;
      }
      this.rapidFireEffects.delete(sessionId);
    }
    for (const [sessionId, effect] of this.smokeEffects.entries()) {
      if (effect.expiresAt <= now) this.smokeEffects.delete(sessionId);
    }

    for (const player of this.state.players.values()) {
      this.restoreBaseWeaponIfNeeded(player);
    }
  }

  private applyAuthoritativeMovement(deltaTime: number, now: number): void {
    const arena = this.arena;
    if (!arena) return;
    const deltaSeconds = clamp(deltaTime, 0, MAX_SIMULATION_DELTA_MS) / 1_000;
    if (deltaSeconds <= 0) return;

    for (const [sessionId, player] of this.state.players.entries()) {
      if (!this.canAcceptPlayerIntent(player)) {
        player.velocityX = 0;
        player.velocityY = 0;
        continue;
      }

      const intent = this.inputIntents.get(sessionId);
      if (!intent) {
        player.velocityX = 0;
        player.velocityY = 0;
        continue;
      }
      if (now - intent.receivedAt > INPUT_INTENT_TTL_MS) {
        this.inputIntents.delete(sessionId);
        player.velocityX = 0;
        player.velocityY = 0;
        continue;
      }

      this.applyPlayerMovement(arena, player, intent, deltaSeconds);
    }
  }

  private applyPlayerMovement(
    arena: ArenaConfig,
    player: PlayerSchema,
    intent: StoredInputIntent,
    deltaSeconds: number
  ): void {
    const moveLength = Math.hypot(intent.moveX, intent.moveY);
    const moveX = moveLength > 1 ? intent.moveX / moveLength : intent.moveX;
    const moveY = moveLength > 1 ? intent.moveY / moveLength : intent.moveY;
    const tankConfig = TANK_ARCHETYPE_CONFIG[player.archetypeId];
    const speed = tankConfig.speed * this.speedMultiplierFor(player);
    const desiredX = player.x + moveX * speed * deltaSeconds;
    const desiredY = player.y + moveY * speed * deltaSeconds;
    const next = this.resolveArenaMovement(
      arena,
      player.x,
      player.y,
      desiredX,
      desiredY,
      this.playerCollisionRadius()
    );

    player.velocityX = (next.x - player.x) / deltaSeconds;
    player.velocityY = (next.y - player.y) / deltaSeconds;
    player.x = next.x;
    player.y = next.y;

    if (moveLength > 0.001 && (player.velocityX !== 0 || player.velocityY !== 0)) {
      player.rotation = Math.atan2(moveY, moveX);
    }
    if (Number.isFinite(intent.aimX) && Number.isFinite(intent.aimY)) {
      player.turretRotation = angleTo(player.x, player.y, intent.aimX, intent.aimY);
    }
  }

  private updateZoneState(now: number): void {
    const phase = this.getZonePhase(this.state.matchState);
    if (!phase) return;

    const duration = this.state.zonePhase.closesAt - this.state.zonePhase.startsAt;
    const progress =
      duration > 0
        ? clamp((now - this.state.zonePhase.startsAt) / duration, 0, 1)
        : 0;

    this.state.zone.x = lerp(phase.x, phase.targetX, progress);
    this.state.zone.y = lerp(phase.y, phase.targetY, progress);
    this.state.zone.radius = lerp(phase.radius, phase.targetRadius, progress);
    this.state.zone.damagePerSecond = phase.damagePerSecond;
  }

  private speedMultiplierFor(player: PlayerSchema): number {
    const effect = this.speedEffects.get(player.sessionId);
    return effect?.multiplier ?? 1;
  }

  private processAbilityIntents(now: number): void {
    for (const [sessionId, intent] of this.abilityIntents.entries()) {
      this.abilityIntents.delete(sessionId);
      const player = this.state.players.get(sessionId);
      if (!player || !this.canAcceptPlayerIntent(player)) continue;
      if (now - intent.receivedAt > INPUT_INTENT_TTL_MS) continue;
      if ((this.lastProcessedAbilitySequences.get(sessionId) ?? -1) >= intent.sequence) continue;

      const abilityConfig = ABILITY_CONFIG[player.abilityType];
      if (player.abilityCooldownMs > 0 || player.abilityCharge < abilityConfig.chargeCost) continue;
      if (!this.activateAbility(player, abilityConfig.id, now)) continue;

      player.abilityCharge = clamp(
        player.abilityCharge - abilityConfig.chargeCost,
        0,
        MAX_ABILITY_CHARGE
      );
      player.abilityCooldownMs = abilityConfig.cooldownMs;
      this.lastProcessedAbilitySequences.set(sessionId, intent.sequence);
    }
  }

  private activateAbility(
    player: PlayerSchema,
    abilityType: PlayerSchema["abilityType"],
    now: number
  ): boolean {
    switch (abilityType) {
      case "repair":
        player.health = clamp(player.health + REPAIR_HEALTH_AMOUNT, 0, player.maxHealth);
        player.armor = clamp(player.armor + REPAIR_ARMOR_AMOUNT, 0, player.maxArmor);
        return true;
      case "shield_pulse":
        this.grantShield(player, SHIELD_PULSE_AMOUNT, ABILITY_CONFIG.shield_pulse.durationMs, now);
        return true;
      case "speed_burst":
        this.applyMultiplierEffect(
          this.speedEffects,
          player.sessionId,
          SPEED_BURST_MULTIPLIER,
          now + ABILITY_CONFIG.speed_burst.durationMs
        );
        return true;
      case "smoke":
        this.applyReductionEffect(
          player.sessionId,
          SMOKE_DAMAGE_REDUCTION,
          now + ABILITY_CONFIG.smoke.durationMs
        );
        return true;
      case "barrage":
        this.enableExplosiveWeapon(player, WEAPON_CONFIG.explosive.ammoCost * 3);
        return true;
      default:
        return false;
    }
  }

  private processFireIntents(now: number): void {
    for (const [sessionId, intent] of this.fireIntents.entries()) {
      this.fireIntents.delete(sessionId);
      const player = this.state.players.get(sessionId);
      if (!player || !this.canAcceptPlayerIntent(player)) continue;
      if (now - intent.receivedAt > INPUT_INTENT_TTL_MS) continue;
      if ((this.lastProcessedFireSequences.get(sessionId) ?? -1) >= intent.sequence) continue;

      const weaponConfig = WEAPON_CONFIG[player.weaponType];
      if (player.fireCooldownMs > 0) continue;
      if (player.weaponType === "explosive" && player.ammo < weaponConfig.ammoCost) {
        this.restoreBaseWeaponIfNeeded(player);
        continue;
      }

      if (!this.spawnProjectile(player, intent, weaponConfig, now)) continue;

      const rapidFireActive =
        player.weaponType !== "explosive" && this.isRapidFireActive(player, now);
      if (player.weaponType === "explosive") {
        player.ammo = Math.max(0, player.ammo - weaponConfig.ammoCost);
      } else if (rapidFireActive && player.ammo > 0) {
        player.ammo = Math.max(0, player.ammo - weaponConfig.ammoCost);
        if (player.ammo === 0) {
          this.rapidFireEffects.delete(sessionId);
        }
      }

      player.fireCooldownMs =
        rapidFireActive && weaponConfig.category !== "explosive"
          ? Math.max(1, Math.round(weaponConfig.fireCooldownMs * RAPID_FIRE_COOLDOWN_MULTIPLIER))
          : weaponConfig.fireCooldownMs;
      this.lastProcessedFireSequences.set(sessionId, intent.sequence);
      this.restoreBaseWeaponIfNeeded(player);
    }
  }

  private isRapidFireActive(player: PlayerSchema, now: number): boolean {
    const effect = this.rapidFireEffects.get(player.sessionId);
    return Boolean(effect && effect.expiresAt > now && player.ammo > 0);
  }

  private spawnProjectile(
    player: PlayerSchema,
    intent: StoredFireIntent,
    weaponConfig: (typeof WEAPON_CONFIG)[PlayerSchema["weaponType"]],
    now: number
  ): boolean {
    const baseAngle =
      Number.isFinite(intent.aimX) && Number.isFinite(intent.aimY)
        ? angleTo(player.x, player.y, intent.aimX, intent.aimY)
        : player.turretRotation;
    const angle = baseAngle + deterministicSpread(intent.sequence, weaponConfig.spreadRadians);
    const radius = projectileRadius(player.weaponType);
    const spawnDistance = this.playerCollisionRadius() + radius + PROJECTILE_SPAWN_PADDING;
    const spawnX = player.x + Math.cos(angle) * spawnDistance;
    const spawnY = player.y + Math.sin(angle) * spawnDistance;

    if (this.arena && isWallCollision(this.arena, spawnX, spawnY, radius)) {
      return false;
    }

    const projectile = new ProjectileSchema();
    projectile.id = `${this.state.match.matchId}-p${++this.projectileCounter}`;
    projectile.ownerId = player.sessionId;
    projectile.weaponType = player.weaponType;
    projectile.x = spawnX;
    projectile.y = spawnY;
    projectile.velocityX = Math.cos(angle) * weaponConfig.projectileSpeed;
    projectile.velocityY = Math.sin(angle) * weaponConfig.projectileSpeed;
    projectile.rotation = angle;
    projectile.damage = weaponConfig.damage;
    projectile.radius = radius;
    projectile.splashRadius = weaponConfig.splashRadius;
    projectile.spawnedAt = now;
    projectile.expiresAt = now + weaponConfig.projectileLifetimeMs;
    player.turretRotation = angle;
    this.state.projectiles.push(projectile);
    return true;
  }

  private simulateProjectiles(deltaMs: number, now: number): void {
    const arena = this.arena;
    if (!arena || deltaMs <= 0) return;

    const deltaSeconds = deltaMs / 1_000;
    const collisionRadius = this.playerCollisionRadius();

    for (let index = this.state.projectiles.length - 1; index >= 0; index -= 1) {
      const projectile = this.state.projectiles[index];
      if (!projectile) continue;

      if (now >= projectile.expiresAt) {
        if (projectile.splashRadius > 0) {
          this.applyExplosionDamage(projectile, projectile.x, projectile.y, undefined, now);
        }
        this.state.projectiles.splice(index, 1);
        continue;
      }

      const nextX = projectile.x + projectile.velocityX * deltaSeconds;
      const nextY = projectile.y + projectile.velocityY * deltaSeconds;

      const wallCollision =
        isWallCollision(arena, nextX, nextY, projectile.radius) ||
        clampArenaBounds(arena, nextX, nextY, projectile.radius).x !== nextX ||
        clampArenaBounds(arena, nextX, nextY, projectile.radius).y !== nextY;
      if (wallCollision) {
        if (projectile.splashRadius > 0) {
          this.applyExplosionDamage(projectile, nextX, nextY, undefined, now);
        }
        this.state.projectiles.splice(index, 1);
        continue;
      }

      let hitTarget: PlayerSchema | undefined;
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (const target of this.state.players.values()) {
        if (!this.canAcceptPlayerIntent(target) || target.sessionId === projectile.ownerId) continue;

        const hitRadius = collisionRadius + projectile.radius;
        const distanceSquared = distanceToSegmentSquared(
          target.x,
          target.y,
          projectile.x,
          projectile.y,
          nextX,
          nextY
        );
        if (distanceSquared > hitRadius * hitRadius) continue;

        const distance = Math.hypot(target.x - projectile.x, target.y - projectile.y);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          hitTarget = target;
        }
      }

      if (hitTarget) {
        const owner = this.state.players.get(projectile.ownerId);
        this.applyDamage(hitTarget, owner, projectile.damage, now);
        if (projectile.splashRadius > 0) {
          this.applyExplosionDamage(projectile, hitTarget.x, hitTarget.y, hitTarget.sessionId, now);
        }
        this.state.projectiles.splice(index, 1);
        continue;
      }

      projectile.x = nextX;
      projectile.y = nextY;
    }
  }

  private applyExplosionDamage(
    projectile: ProjectileSchema,
    centerX: number,
    centerY: number,
    excludedSessionId: string | undefined,
    now: number
  ): void {
    if (projectile.splashRadius <= 0) return;

    const owner = this.state.players.get(projectile.ownerId);
    const collisionRadius = this.playerCollisionRadius();
    for (const target of this.state.players.values()) {
      if (!this.canAcceptPlayerIntent(target)) continue;
      if (target.sessionId === projectile.ownerId || target.sessionId === excludedSessionId) continue;

      const distance = Math.hypot(target.x - centerX, target.y - centerY);
      const reach = projectile.splashRadius + collisionRadius;
      if (distance > reach) continue;

      const falloff = 1 - distance / reach;
      const splashDamage = Math.max(1, Math.round(projectile.damage * 0.65 * falloff));
      this.applyDamage(target, owner, splashDamage, now);
    }
  }

  private collectPickups(now: number): void {
    const collectionRadius = this.playerCollisionRadius();

    for (const pickup of this.state.pickups) {
      if (!pickup?.isActive) continue;

      for (const player of this.state.players.values()) {
        if (!this.canAcceptPlayerIntent(player)) continue;
        const distance = Math.hypot(player.x - pickup.x, player.y - pickup.y);
        if (distance > collectionRadius + pickup.radius) continue;

        this.applyPickupEffect(player, pickup, now);
        pickup.isActive = false;
        pickup.respawnsAt = now + PICKUP_CONFIG[pickup.pickupType].respawnMs;
        this.broadcastSystem("pickup_collected", `${player.name} collected ${pickup.pickupType}`);
        break;
      }
    }
  }

  private applyPickupEffect(player: PlayerSchema, pickup: PickupSchema, now: number): void {
    switch (pickup.pickupType) {
      case "health_repair":
        player.health = clamp(player.health + pickup.value, 0, player.maxHealth);
        break;
      case "shield_armor":
        player.armor = clamp(player.armor + pickup.value, 0, player.maxArmor);
        this.grantShield(player, Math.round(pickup.value / 2), pickup.durationMs, now);
        break;
      case "ammo_rapid_fire":
        player.ammo += pickup.value;
        this.applyMultiplierEffect(
          this.rapidFireEffects,
          player.sessionId,
          RAPID_FIRE_COOLDOWN_MULTIPLIER,
          now + pickup.durationMs
        );
        break;
      case "speed_boost":
        this.applyMultiplierEffect(
          this.speedEffects,
          player.sessionId,
          pickup.value,
          now + pickup.durationMs
        );
        break;
      case "ability_charge":
        player.abilityCharge = clamp(player.abilityCharge + pickup.value, 0, MAX_ABILITY_CHARGE);
        break;
      case "smoke":
        this.applyReductionEffect(player.sessionId, SMOKE_DAMAGE_REDUCTION, now + pickup.durationMs);
        break;
      case "barrage_explosive":
        this.enableExplosiveWeapon(player, WEAPON_CONFIG.explosive.ammoCost * 3);
        break;
    }
  }

  private respawnPickups(now: number): void {
    for (const pickup of this.state.pickups) {
      if (!pickup || pickup.isActive || pickup.respawnsAt <= 0 || pickup.respawnsAt > now) continue;
      pickup.isActive = true;
      pickup.spawnedAt = now;
      pickup.respawnsAt = 0;
    }
  }

  private applyZoneDamage(deltaMs: number, now: number): void {
    if (deltaMs <= 0 || this.state.zone.damagePerSecond <= 0) return;

    const rawDamage = (this.state.zone.damagePerSecond * deltaMs) / 1_000;
    const exposedPlayers = Array.from(this.state.players.values()).filter((player) => {
      if (!this.canAcceptPlayerIntent(player)) {
        this.zoneDamageRemainders.delete(player.sessionId);
        return false;
      }

      const distance = Math.hypot(player.x - this.state.zone.x, player.y - this.state.zone.y);
      if (distance <= this.state.zone.radius) {
        this.zoneDamageRemainders.delete(player.sessionId);
        return false;
      }

      return true;
    });
    const previousBatchPlacement = this.eliminationBatchPlacement;
    this.eliminationBatchPlacement =
      exposedPlayers.length > 1 ? Math.max(2, alivePlayerCount(this.state)) : undefined;

    try {
      for (const player of exposedPlayers) {
        const pendingDamage = (this.zoneDamageRemainders.get(player.sessionId) ?? 0) + rawDamage;
        const wholeDamage = Math.floor(pendingDamage);
        this.zoneDamageRemainders.set(player.sessionId, pendingDamage - wholeDamage);
        if (wholeDamage > 0) {
          this.applyDamage(player, undefined, wholeDamage, now);
        }
      }
    } finally {
      this.eliminationBatchPlacement = previousBatchPlacement;
    }
  }

  private applyDamage(
    target: PlayerSchema,
    source: PlayerSchema | undefined,
    rawDamage: number,
    now: number
  ): number {
    if (!this.canAcceptPlayerIntent(target) || rawDamage <= 0) return 0;

    const smokeEffect = this.smokeEffects.get(target.sessionId);
    const reducedDamage =
      smokeEffect && smokeEffect.expiresAt > now
        ? rawDamage * (1 - smokeEffect.reduction)
        : rawDamage;
    let remaining = Math.max(1, Math.round(reducedDamage));
    let applied = 0;

    if (target.shield > 0 && remaining > 0) {
      const absorbed = Math.min(target.shield, remaining);
      target.shield -= absorbed;
      remaining -= absorbed;
      applied += absorbed;
      this.consumeShieldEffect(target.sessionId, absorbed);
    }
    if (target.armor > 0 && remaining > 0) {
      const absorbed = Math.min(target.armor, remaining);
      target.armor -= absorbed;
      remaining -= absorbed;
      applied += absorbed;
    }
    if (target.health > 0 && remaining > 0) {
      const absorbed = Math.min(target.health, remaining);
      target.health -= absorbed;
      remaining -= absorbed;
      applied += absorbed;
    }
    if (applied <= 0) return 0;

    target.damageTaken += applied;
    target.abilityCharge = clamp(
      target.abilityCharge + applied * DAMAGE_TAKEN_CHARGE_RATIO,
      0,
      MAX_ABILITY_CHARGE
    );

    if (source && source.sessionId !== target.sessionId) {
      source.damageDealt += applied;
      source.abilityCharge = clamp(
        source.abilityCharge + applied * DAMAGE_TO_CHARGE_RATIO,
        0,
        MAX_ABILITY_CHARGE
      );
    }

    if (target.health <= 0) {
      this.eliminatePlayer(
        target,
        source && source.sessionId !== target.sessionId ? source : undefined,
        now
      );
    }

    return applied;
  }

  private eliminatePlayer(
    player: PlayerSchema,
    killer: PlayerSchema | undefined,
    now: number
  ): void {
    if (!player.isAlive) return;
    const placement =
      player.placement || this.eliminationBatchPlacement || Math.max(2, alivePlayerCount(this.state));

    player.health = 0;
    player.shield = 0;
    player.velocityX = 0;
    player.velocityY = 0;
    player.fireCooldownMs = 0;
    player.abilityCooldownMs = 0;
    player.isAlive = false;
    player.isSpectator = true;
    player.deaths += 1;
    player.survivalTimeMs = Math.max(0, now - this.runningStartedAt);
    player.placement = placement;
    this.clearPlayerRuntimeState(player.sessionId, player);

    if (killer) {
      killer.kills += 1;
      killer.score += 100;
    }
  }

  private checkForMatchConclusion(now: number): void {
    if (!this.isActiveMatchState()) return;

    const alivePlayers = Array.from(this.state.players.values()).filter((player) =>
      this.canAcceptPlayerIntent(player)
    );
    if (alivePlayers.length > 1) return;

    const winner = alivePlayers[0];
    if (winner) {
      winner.placement = 1;
      winner.score += 250;
      winner.survivalTimeMs = Math.max(0, now - this.runningStartedAt);
    }

    this.finishMatch(now, winner);
  }

  private finishMatch(now: number, winner?: PlayerSchema): void {
    if (this.state.matchState === "finished") return;

    const rankedSurvivors = Array.from(this.state.players.values())
      .filter((player) => player.isConnected && player.isAlive)
      .sort((left, right) => this.compareWinnerCandidates(left, right));
    const resolvedWinner = winner ?? rankedSurvivors[0] ?? this.resolveWinnerCandidate();
    let placement = resolvedWinner ? 2 : 1;

    if (resolvedWinner) {
      resolvedWinner.placement = 1;
      resolvedWinner.score += winner ? 0 : 250;
      resolvedWinner.survivalTimeMs = Math.max(
        resolvedWinner.survivalTimeMs,
        now - this.runningStartedAt
      );
      if (!resolvedWinner.isAlive) {
        resolvedWinner.health = Math.max(1, resolvedWinner.health);
        resolvedWinner.isAlive = true;
        resolvedWinner.isSpectator = false;
        resolvedWinner.deaths = Math.max(0, resolvedWinner.deaths - 1);
      }
    }

    for (const survivor of rankedSurvivors) {
      if (survivor.sessionId === resolvedWinner?.sessionId) continue;
      survivor.placement = survivor.placement || placement++;
      survivor.isAlive = false;
      survivor.isSpectator = true;
      survivor.deaths += 1;
      this.clearPlayerRuntimeState(survivor.sessionId, survivor);
    }

    this.inputIntents.clear();
    this.fireIntents.clear();
    this.abilityIntents.clear();
    this.state.projectiles.splice(0, this.state.projectiles.length);
    for (const player of this.state.players.values()) {
      if (player.isConnected) player.isReady = false;
    }
    this.state.match.alivePlayers = alivePlayerCount(this.state);
    this.state.match.matchEndsAt = now;
    this.transitionTo("finished", now);
  }

  private resolveWinnerCandidate(): PlayerSchema | undefined {
    return Array.from(this.state.players.values())
      .filter((player) => player.isConnected)
      .sort((left, right) => this.compareWinnerCandidates(left, right))[0];
  }

  private compareWinnerCandidates(left: PlayerSchema, right: PlayerSchema): number {
    const leftPlacement = left.placement > 0 ? left.placement : Number.MAX_SAFE_INTEGER;
    const rightPlacement = right.placement > 0 ? right.placement : Number.MAX_SAFE_INTEGER;
    if (left.isAlive !== right.isAlive) return Number(right.isAlive) - Number(left.isAlive);
    if (leftPlacement !== rightPlacement) return leftPlacement - rightPlacement;
    if (left.survivalTimeMs !== right.survivalTimeMs) {
      return right.survivalTimeMs - left.survivalTimeMs;
    }
    if (left.kills !== right.kills) return right.kills - left.kills;
    if (left.damageDealt !== right.damageDealt) return right.damageDealt - left.damageDealt;
    if (left.score !== right.score) return right.score - left.score;
    return left.sessionId.localeCompare(right.sessionId);
  }

  private resolveRematchVotes(now: number): void {
    if (this.state.matchState !== "finished") return;

    const connectedPlayers = Array.from(this.state.players.values()).filter((player) => player.isConnected);
    if (connectedPlayers.length === 0) return;
    if (connectedPlayers.some((player) => !this.rematchVotes.get(player.sessionId)?.ready)) return;

    this.resetForRematch(now);
  }

  private resetForRematch(now: number): void {
    void this.unlock();
    this.runningStartedAt = 0;
    this.dangerStartsAt = 0;
    this.finalZoneStartsAt = 0;
    this.finishedAt = 0;
    this.rematchVotes.clear();
    this.inputIntents.clear();
    this.fireIntents.clear();
    this.abilityIntents.clear();
    this.lastProcessedFireSequences.clear();
    this.lastProcessedAbilitySequences.clear();
    this.speedEffects.clear();
    this.rapidFireEffects.clear();
    this.shieldEffects.clear();
    this.smokeEffects.clear();
    this.zoneDamageRemainders.clear();
    this.state.projectiles.splice(0, this.state.projectiles.length);
    this.state.match.round += 1;
    this.state.match.matchId = `${this.state.roomCode}-r${this.state.match.round}-${now.toString(36)}`;
    this.state.match.stateStartedAt = now;
    this.state.match.countdownEndsAt = 0;
    this.state.match.matchEndsAt = 0;

    let spawnIndex = 0;
    for (const player of this.state.players.values()) {
      this.clearPlayerRuntimeState(player.sessionId, player);
      if (!player.isConnected) continue;

      applyTankConfig(player, player.archetypeId);
      this.assignSpawnPosition(player, spawnIndex);
      player.shield = 0;
      player.ammo = 0;
      player.abilityCharge = MAX_ABILITY_CHARGE;
      player.fireCooldownMs = 0;
      player.abilityCooldownMs = 0;
      player.score = 0;
      player.kills = 0;
      player.deaths = 0;
      player.damageDealt = 0;
      player.damageTaken = 0;
      player.placement = 0;
      player.survivalTimeMs = 0;
      player.respawnAt = 0;
      player.isAlive = true;
      player.isReady = true;
      player.isSpectator = false;
      spawnIndex += 1;
    }

    this.initializePickups(now);
    this.ensureHost();
    this.state.match.alivePlayers = alivePlayerCount(this.state);
    this.transitionTo("waiting", now);
    if (this.hasEnoughReadyPlayers()) {
      this.beginCountdown();
      return;
    }
    this.ensureAutoStartTimer();
  }

  private clearPlayerRuntimeState(
    sessionId: string,
    player?: PlayerSchema
  ): void {
    this.inputIntents.delete(sessionId);
    this.fireIntents.delete(sessionId);
    this.abilityIntents.delete(sessionId);
    this.lastProcessedFireSequences.delete(sessionId);
    this.lastProcessedAbilitySequences.delete(sessionId);
    this.speedEffects.delete(sessionId);
    this.rapidFireEffects.delete(sessionId);
    this.shieldEffects.delete(sessionId);
    this.smokeEffects.delete(sessionId);
    this.zoneDamageRemainders.delete(sessionId);

    if (player) {
      player.fireCooldownMs = 0;
      player.abilityCooldownMs = 0;
      player.velocityX = 0;
      player.velocityY = 0;
      this.restoreBaseWeaponIfNeeded(player, true);
    }
  }

  private restoreBaseWeaponIfNeeded(player: PlayerSchema, force = false): void {
    if (!force && player.weaponType !== "explosive") return;
    if (!force && player.ammo >= WEAPON_CONFIG.explosive.ammoCost) return;

    player.weaponType = TANK_ARCHETYPE_CONFIG[player.archetypeId].primaryWeapon;
    if (!this.isRapidFireActive(player, Date.now())) {
      player.ammo = 0;
    }
  }

  private enableExplosiveWeapon(player: PlayerSchema, ammo: number): void {
    this.rapidFireEffects.delete(player.sessionId);
    player.weaponType = "explosive";
    player.ammo = ammo;
  }

  private applyMultiplierEffect(
    store: Map<string, TimedMultiplierEffect>,
    sessionId: string,
    multiplier: number,
    expiresAt: number
  ): void {
    const current = store.get(sessionId);
    store.set(sessionId, {
      expiresAt: Math.max(current?.expiresAt ?? 0, expiresAt),
      multiplier:
        current === undefined
          ? multiplier
          : store === this.rapidFireEffects
            ? Math.min(current.multiplier, multiplier)
            : Math.max(current.multiplier, multiplier)
    });
  }

  private applyReductionEffect(sessionId: string, reduction: number, expiresAt: number): void {
    const current = this.smokeEffects.get(sessionId);
    this.smokeEffects.set(sessionId, {
      expiresAt: Math.max(current?.expiresAt ?? 0, expiresAt),
      reduction: Math.max(current?.reduction ?? 0, reduction)
    });
  }

  private grantShield(player: PlayerSchema, amount: number, durationMs: number, now: number): void {
    player.shield += amount;
    if (durationMs <= 0) return;

    const current = this.shieldEffects.get(player.sessionId);
    this.shieldEffects.set(player.sessionId, {
      expiresAt: Math.max(current?.expiresAt ?? 0, now + durationMs),
      remaining: (current?.remaining ?? 0) + amount
    });
  }

  private consumeShieldEffect(sessionId: string, amount: number): void {
    const effect = this.shieldEffects.get(sessionId);
    if (!effect) return;
    effect.remaining = Math.max(0, effect.remaining - amount);
  }

  private resolveArenaMovement(
    arena: ArenaConfig,
    currentX: number,
    currentY: number,
    desiredX: number,
    desiredY: number,
    radius: number
  ): ArenaPoint {
    const desired = clampArenaBounds(arena, desiredX, desiredY, radius);
    if (!isWallCollision(arena, desired.x, desired.y, radius)) {
      return desired;
    }

    const slideX = clampArenaBounds(arena, desiredX, currentY, radius);
    if (!isWallCollision(arena, slideX.x, slideX.y, radius)) {
      return slideX;
    }

    const slideY = clampArenaBounds(arena, currentX, desiredY, radius);
    if (!isWallCollision(arena, slideY.x, slideY.y, radius)) {
      return slideY;
    }

    const current = clampArenaBounds(arena, currentX, currentY, radius);
    if (!isWallCollision(arena, current.x, current.y, radius)) {
      return current;
    }

    return clampToArena(arena, currentX, currentY, radius);
  }

  private playerCollisionRadius(): number {
    return positiveNumberOr(this.arena?.spawnPoints[0]?.radius, TANK_COLLISION_RADIUS);
  }

  private zonePhaseStartAt(
    matchState: MatchState,
    runningStartedAt: number,
    fallbackOffsetMs: number
  ): number {
    const phase = this.getZonePhase(matchState);
    const offset = phase?.startsAt;
    return runningStartedAt + (isFiniteNumber(offset) && offset >= 0 ? offset : fallbackOffsetMs);
  }

  private zoneFinishAt(runningStartedAt: number, fallbackOffsetMs: number): number {
    const finalPhase = this.getZonePhase("final_zone");
    const offset = finalPhase?.closesAt;
    return runningStartedAt + (isFiniteNumber(offset) && offset > 0 ? offset : fallbackOffsetMs);
  }

  private applyZonePhase(matchState: MatchState, at: number): void {
    const phase = this.getZonePhase(matchState) ?? this.getZonePhase("running");
    const bounds = this.arena ? getArenaBounds(this.arena) : undefined;
    const centerX = bounds ? (bounds.minX + bounds.maxX) / 2 : 0;
    const centerY = bounds ? (bounds.minY + bounds.maxY) / 2 : 0;
    const arenaRadius = bounds
      ? Math.min(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) / 2
      : DEFAULT_ARENA_SIZE / 2;
    const runningStartedAt = this.runningStartedAt || at;
    const absoluteFromRunning = (value: number | undefined, fallback: number): number =>
      isFiniteNumber(value) && value >= 0 ? runningStartedAt + value : fallback;

    this.state.zone.x = phase?.x ?? centerX;
    this.state.zone.y = phase?.y ?? centerY;
    this.state.zone.radius = positiveNumberOr(phase?.radius, arenaRadius);
    this.state.zone.targetX = phase?.targetX ?? this.state.zone.x;
    this.state.zone.targetY = phase?.targetY ?? this.state.zone.y;
    this.state.zone.targetRadius = positiveNumberOr(phase?.targetRadius, this.state.zone.radius);
    this.state.zone.damagePerSecond = phase?.damagePerSecond ?? 0;
    this.state.zonePhase.index = phase?.index ?? 0;
    this.state.zonePhase.startsAt =
      matchState === "waiting" || matchState === "countdown"
        ? at
        : absoluteFromRunning(phase?.startsAt, at);
    this.state.zonePhase.warningAt =
      matchState === "waiting" || matchState === "countdown"
        ? 0
        : absoluteFromRunning(phase?.warningAt, this.state.zonePhase.startsAt);
    this.state.zonePhase.closesAt =
      matchState === "waiting" || matchState === "countdown"
        ? 0
        : absoluteFromRunning(phase?.closesAt, this.state.zonePhase.startsAt);
  }

  private getZonePhase(matchState: MatchState): ArenaConfig["zonePhases"][number] | undefined {
    const phases = this.arena?.zonePhases;
    if (!phases?.length) return undefined;
    const matched = phases.find((phase) => phase.matchState === matchState);
    if (matched) return matched;

    const indexByState: Partial<Record<MatchState, number>> = {
      waiting: 0,
      countdown: 0,
      running: 0,
      danger: 1,
      final_zone: 2,
      finished: phases.length - 1
    };
    const index = indexByState[matchState] ?? 0;
    return phases[Math.min(index, phases.length - 1)];
  }

  private ensureAutoStartTimer(): void {
    if (!this.config || this.state.matchState !== "waiting" || !this.hasMinimumPlayers()) {
      this.autoStartTimer?.clear();
      this.autoStartTimer = undefined;
      return;
    }
    if (this.autoStartTimer?.active) return;

    const delay = Math.max(0, this.config.roomAutoStartSeconds) * 1_000;
    this.autoStartTimer = this.clock.setTimeout(() => {
      if (this.state.matchState === "waiting" && this.hasMinimumPlayers()) {
        this.beginCountdown();
      }
    }, delay);
  }

  private hasMinimumPlayers(): boolean {
    return connectedPlayerCount(this.state) >= MIN_PLAYERS_TO_START;
  }

  private hasEnoughReadyPlayers(): boolean {
    if (!this.hasMinimumPlayers()) return false;

    for (const player of this.state.players.values()) {
      if (!player.isSpectator && player.isConnected && !player.isReady) return false;
    }

    return true;
  }

  private isActiveMatchState(): boolean {
    return (
      this.state.matchState === "running" ||
      this.state.matchState === "danger" ||
      this.state.matchState === "final_zone"
    );
  }

  private canAcceptPlayerIntent(player: PlayerSchema): boolean {
    return player.isConnected && player.isAlive && !player.isSpectator;
  }

  private canAcceptActiveJoin(): boolean {
    return this.state?.matchState === "waiting";
  }

  private getPlayerOrError(client: Client): PlayerSchema | undefined {
    const player = this.state.players.get(client.sessionId);
    if (!player) {
      this.sendError(client, "not_joined", "Player is not joined", false);
      return undefined;
    }
    return player;
  }

  private ensureHost(): void {
    let hostAssigned = false;
    for (const player of this.state.players.values()) {
      if (player.isHost && player.isConnected && !player.isSpectator) {
        hostAssigned = true;
        continue;
      }
      if (!hostAssigned || player.isHost) {
        player.isHost = false;
      }
    }
    if (hostAssigned) return;

    for (const player of this.state.players.values()) {
      if (player.isConnected && !player.isSpectator) {
        player.isHost = true;
        break;
      }
    }
  }

  private sendSystem(
    client: Client,
    code: SystemMessageCode,
    message: string
  ): void {
    client.send(SERVER_MESSAGE_TYPES.SYSTEM, {
      code,
      message,
      roomCode: this.state.roomCode,
      matchState: this.state.matchState,
      seed: this.state.seed,
      at: Date.now()
    });
  }

  private broadcastSystem(code: SystemMessageCode, message: string): void {
    this.broadcast(SERVER_MESSAGE_TYPES.SYSTEM, {
      code,
      message,
      roomCode: this.state.roomCode,
      matchState: this.state.matchState,
      seed: this.state.seed,
      at: Date.now()
    });
  }

  private sendError(
    client: Client,
    code: ErrorMessageCode,
    message: string,
    retryable: boolean,
    field?: string
  ): void {
    client.send(SERVER_MESSAGE_TYPES.ERROR, {
      code,
      message,
      retryable,
      field
    });
  }

  private async updateMetadata(): Promise<void> {
    await this.setMetadata({
      roomName: BATTLE_ROYALE_ROOM,
      roomCode: this.state.roomCode,
      private: this.isPrivateRoom,
      matchState: this.state.matchState,
      playerCount: playerCount(this.state),
      maxClients: this.maxClients,
      seed: this.state.seed
    });
  }
}
