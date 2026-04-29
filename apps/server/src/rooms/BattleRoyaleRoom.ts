import {
  ErrorCode,
  Room,
  ServerError,
  type AuthContext,
  type Client,
  type Delayed
} from "colyseus";
import {
  BATTLE_ROYALE_ROOM,
  CLIENT_MESSAGE_TYPES,
  DEFAULT_TANK_ARCHETYPE,
  SERVER_MESSAGE_TYPES,
  TANK_ARCHETYPE_CONFIG,
  TANK_ARCHETYPES,
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
import { Alpha7StateSchema, PlayerSchema } from "@alpha7/shared/schema";
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

    this.inputIntents.delete(client.sessionId);
    this.fireIntents.delete(client.sessionId);
    this.abilityIntents.delete(client.sessionId);
    this.rematchVotes.delete(client.sessionId);

    if (this.state.matchState === "waiting" || this.state.matchState === "countdown") {
      this.state.players.delete(client.sessionId);
    } else {
      player.isConnected = false;
      player.isAlive = false;
    }

    this.ensureHost();
    this.state.match.alivePlayers = alivePlayerCount(this.state);
    if (wasCountingDown && !this.hasMinimumPlayers()) {
      this.cancelCountdown();
    }
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

    this.broadcastSystem("rematch", `${player.name} updated rematch vote`);
  }

  private onSimulationTick(deltaTime: number): void {
    const now = Date.now();
    this.state.match.tick += 1;
    this.advanceTimedLifecycle(now);
    if (this.isActiveMatchState()) {
      this.applyAuthoritativeMovement(deltaTime, now);
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
      this.transitionTo("finished", now);
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
    this.resetPlayersForMatchStart();
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

    for (const player of this.state.players.values()) {
      if (!player.isConnected || player.isSpectator) continue;

      applyTankConfig(player, player.archetypeId);
      this.assignSpawnPosition(player, spawnIndex);
      player.shield = 0;
      player.ammo = 0;
      player.abilityCharge = 0;
      player.fireCooldownMs = 0;
      player.abilityCooldownMs = 0;
      player.placement = 0;
      player.respawnAt = 0;
      player.survivalTimeMs = 0;
      player.isAlive = true;
      player.isReady = false;
      spawnIndex += 1;
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
    const speed = tankConfig.speed;
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
